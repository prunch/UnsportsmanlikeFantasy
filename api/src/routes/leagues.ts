import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';
import { resolveAutoPick } from '../services/autoPick';

const router = Router();

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const createLeagueSchema = z.object({
  name: z.string().min(3).max(100),
  maxTeams: z.number().int().min(10).max(12).default(10),
  draftType: z.enum(['snake']).default('snake'),
  draftTimerSeconds: z.number().int().min(60).max(120).default(90),
  tradeDeadlineWeek: z.number().int().min(1).max(17).default(11)
});

const joinLeagueSchema = z.object({
  inviteCode: z.string().min(6).max(20),
  teamName: z.string().min(2).max(50)
});

const rosterUpdateSchema = z.object({
  playerId: z.string(),
  slot: z.enum(['QB', 'RB', 'RB2', 'WR', 'WR2', 'TE', 'FLEX', 'K', 'DEF',
    'BN1', 'BN2', 'BN3', 'BN4', 'BN5', 'BN6', 'IR1', 'IR2'])
});

const draftPickSchema = z.object({
  playerId: z.string()
});

const waiverClaimSchema = z.object({
  addPlayerId: z.string(),
  dropPlayerId: z.string().optional()
});

// ============================================================
// HELPERS
// ============================================================

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

/** Returns the team_id of the current user in a given league, or throws 403. */
async function requireMembership(leagueId: string, userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single();
  if (error || !data) throw new AppError('Not a member of this league', 403);
  return data.id;
}

/** Snake draft: given pick number (1-based) and team count, return team index (0-based). */
function snakeDraftTeamIndex(pickNumber: number, teamCount: number): number {
  const round = Math.ceil(pickNumber / teamCount);
  const positionInRound = ((pickNumber - 1) % teamCount);
  if (round % 2 === 0) {
    return teamCount - 1 - positionInRound;
  }
  return positionInRound;
}

// ============================================================
// LEAGUE CRUD
// ============================================================

// GET /api/leagues — List leagues for current user
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select(`
        league:leagues(
          id, name, status, season, max_teams, current_week, invite_code, commissioner_id,
          created_at
        )
      `)
      .eq('user_id', req.user!.id);

    if (error) throw new AppError('Failed to fetch leagues', 500);
    res.json(data?.map((d: { league: unknown }) => d.league).filter(Boolean) || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues — Create league
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = createLeagueSchema.parse(req.body);
    const leagueId = uuidv4();
    const inviteCode = generateInviteCode();

    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .insert({
        id: leagueId,
        name: body.name,
        commissioner_id: req.user!.id,
        max_teams: body.maxTeams,
        draft_type: body.draftType,
        draft_timer_seconds: body.draftTimerSeconds,
        trade_deadline_week: body.tradeDeadlineWeek,
        invite_code: inviteCode,
        status: 'setup',
        season: new Date().getFullYear(),
        current_week: 0
      })
      .select()
      .single();

    if (leagueError) throw new AppError(`Failed to create league: ${leagueError.message}`, 500);

    // Create commissioner's team
    const { error: teamError } = await supabaseAdmin
      .from('teams')
      .insert({
        league_id: leagueId,
        user_id: req.user!.id,
        team_name: `${req.user!.email}'s Team`
      });

    if (teamError) {
      await supabaseAdmin.from('leagues').delete().eq('id', leagueId);
      throw new AppError('Failed to create team', 500);
    }

    res.status(201).json(league);
  } catch (err) {
    next(err);
  }
});

// GET /api/leagues/:id — Get league detail
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireMembership(id, req.user!.id);

    const { data: league, error } = await supabaseAdmin
      .from('leagues')
      .select(`
        *,
        teams(
          id, team_name, wins, losses, ties, points_for, points_against,
          waiver_priority, draft_position,
          user:users(id, display_name, avatar_url)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !league) throw new AppError('League not found', 404);
    res.json(league);
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/join — Join by invite code
router.post('/join', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = joinLeagueSchema.parse(req.body);

    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('invite_code', body.inviteCode.toUpperCase())
      .single();

    if (leagueError || !league) throw new AppError('Invalid invite code', 404);
    if (league.status !== 'setup') throw new AppError('League is not accepting new members', 400);

    const { count } = await supabaseAdmin
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league.id);

    if ((count || 0) >= league.max_teams) throw new AppError('League is full', 400);

    const { data: existing } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('league_id', league.id)
      .eq('user_id', req.user!.id)
      .single();

    if (existing) throw new AppError('Already a member of this league', 409);

    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .insert({
        league_id: league.id,
        user_id: req.user!.id,
        team_name: body.teamName
      })
      .select()
      .single();

    if (teamError) throw new AppError('Failed to join league', 500);
    res.status(201).json({ league, team });
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/join — Alternate join by league ID (still needs invite code)
router.post('/:id/join', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const body = joinLeagueSchema.parse(req.body);

    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('id', id)
      .single();

    if (leagueError || !league) throw new AppError('League not found', 404);
    if (league.invite_code !== body.inviteCode.toUpperCase()) throw new AppError('Invalid invite code', 403);
    if (league.status !== 'setup') throw new AppError('League is not accepting new members', 400);

    const { count } = await supabaseAdmin
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', id);

    if ((count || 0) >= league.max_teams) throw new AppError('League is full', 400);

    const { data: existing } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('league_id', id)
      .eq('user_id', req.user!.id)
      .single();

    if (existing) throw new AppError('Already a member of this league', 409);

    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .insert({
        league_id: id,
        user_id: req.user!.id,
        team_name: body.teamName
      })
      .select()
      .single();

    if (teamError) throw new AppError('Failed to join league', 500);
    res.status(201).json({ league, team });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// ROSTERS
// ============================================================

// GET /api/leagues/:id/rosters — All rosters in the league
router.get('/:id/rosters', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireMembership(id, req.user!.id);

    const { data: teams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('id, team_name, user:users(id, display_name)')
      .eq('league_id', id);

    if (teamsError) throw new AppError('Failed to fetch teams', 500);

    const teamIds = (teams || []).map((t: { id: string }) => t.id);

    const { data: rosters, error: rostersError } = await supabaseAdmin
      .from('rosters')
      .select(`
        id, team_id, slot, week, acquired_via,
        player:players(id, name, position, nfl_team, status, adp, headshot_url)
      `)
      .in('team_id', teamIds)
      .eq('week', 0);

    if (rostersError) throw new AppError('Failed to fetch rosters', 500);

    // Group by team
    const rostersByTeam: Record<string, typeof rosters> = {};
    for (const entry of rosters || []) {
      const r = entry as { team_id: string };
      if (!rostersByTeam[r.team_id]) rostersByTeam[r.team_id] = [];
      rostersByTeam[r.team_id]!.push(entry);
    }

    const result = (teams || []).map((team: { id: string; team_name: string; user: unknown }) => ({
      ...team,
      roster: rostersByTeam[team.id] || []
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/leagues/:id/roster/mine — Current user's roster
router.get('/:id/roster/mine', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const teamId = await requireMembership(id, req.user!.id);

    const { data, error } = await supabaseAdmin
      .from('rosters')
      .select(`
        id, slot, week, acquired_via,
        player:players(id, name, position, nfl_team, status, adp, headshot_url)
      `)
      .eq('team_id', teamId)
      .eq('week', 0)
      .order('slot');

    if (error) throw new AppError('Failed to fetch roster', 500);
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/roster — Move player to a different slot
router.post('/:id/roster', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const teamId = await requireMembership(id, req.user!.id);
    const body = rosterUpdateSchema.parse(req.body);

    // Check player is on team
    const { data: currentEntry, error: fetchError } = await supabaseAdmin
      .from('rosters')
      .select('id, slot')
      .eq('team_id', teamId)
      .eq('player_id', body.playerId)
      .eq('week', 0)
      .single();

    if (fetchError || !currentEntry) throw new AppError('Player not on your roster', 404);

    // Check if target slot is occupied
    const { data: occupant } = await supabaseAdmin
      .from('rosters')
      .select('id, player_id')
      .eq('team_id', teamId)
      .eq('slot', body.slot)
      .eq('week', 0)
      .single();

    if (occupant) {
      // Swap slots
      await supabaseAdmin
        .from('rosters')
        .update({ slot: currentEntry.slot })
        .eq('id', (occupant as { id: string }).id);
    }

    // Move player to target slot
    await supabaseAdmin
      .from('rosters')
      .update({ slot: body.slot })
      .eq('id', (currentEntry as { id: string }).id);

    res.json({ success: true, message: `Moved player to ${body.slot}` });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// DRAFT
// ============================================================

// GET /api/leagues/:id/draft — Get draft state
router.get('/:id/draft', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireMembership(id, req.user!.id);

    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('id, name, status, max_teams, draft_type, draft_timer_seconds, draft_current_pick, draft_started_at')
      .eq('id', id)
      .single();

    if (leagueError || !league) throw new AppError('League not found', 404);

    const { data: teams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('id, team_name, draft_position, user:users(id, display_name, avatar_url)')
      .eq('league_id', id)
      .order('draft_position', { ascending: true });

    if (teamsError) throw new AppError('Failed to fetch teams', 500);

    const { data: picks, error: picksError } = await supabaseAdmin
      .from('draft_picks')
      .select(`
        id, round, pick, is_auto, picked_at,
        team:teams(id, team_name),
        player:players(id, name, position, nfl_team, status, adp)
      `)
      .eq('league_id', id)
      .order('pick', { ascending: true });

    if (picksError) throw new AppError('Failed to fetch picks', 500);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draftedPlayerIds = (picks || []).reduce((acc: string[], p: any) => {
      const pl = Array.isArray(p.player) ? p.player[0] : p.player;
      if (pl?.id) acc.push(pl.id);
      return acc;
    }, []);

    // Determine whose pick it is
    const currentPickNumber = (league as { draft_current_pick: number }).draft_current_pick || 0;
    const teamCount = (teams || []).length;
    let currentTeam = null;
    if (league.status === 'draft' && teamCount > 0 && currentPickNumber >= 0) {
      const idx = snakeDraftTeamIndex(currentPickNumber + 1, teamCount);
      const sortedTeams = [...(teams || [])].sort(
        (a: { draft_position: number }, b: { draft_position: number }) => a.draft_position - b.draft_position
      );
      currentTeam = sortedTeams[idx] || null;
    }

    res.json({
      league,
      teams: teams || [],
      picks: picks || [],
      draftedPlayerIds,
      currentPickNumber,
      currentTeam,
      totalPicks: teamCount * 15 // 15 rounds
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/draft/start — Commissioner starts draft
router.post('/:id/draft/start', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('id', id)
      .single();

    if (leagueError || !league) throw new AppError('League not found', 404);
    if (league.commissioner_id !== req.user!.id) throw new AppError('Only the commissioner can start the draft', 403);
    if (league.status !== 'setup') throw new AppError('League is not in setup mode', 400);

    // Count teams
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('league_id', id);

    const teamCount = (teams || []).length;
    if (teamCount < 2) throw new AppError('Need at least 2 teams to start draft', 400);

    // Randomize draft order
    const shuffled = [...(teams || [])].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      await supabaseAdmin
        .from('teams')
        .update({ draft_position: i + 1, waiver_priority: shuffled.length - i })
        .eq('id', (shuffled[i] as { id: string }).id);
    }

    // Update league status
    await supabaseAdmin
      .from('leagues')
      .update({ status: 'draft', draft_current_pick: 0, draft_started_at: new Date().toISOString() })
      .eq('id', id);

    res.json({ success: true, message: 'Draft started! Draft order has been randomized.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/draft/pick — Make a draft pick
router.post('/:id/draft/pick', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const teamId = await requireMembership(id, req.user!.id);
    const body = draftPickSchema.parse(req.body);

    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('id', id)
      .single();

    if (leagueError || !league) throw new AppError('League not found', 404);
    if (league.status !== 'draft') throw new AppError('League is not in draft mode', 400);

    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, draft_position')
      .eq('league_id', id)
      .order('draft_position');

    const teamCount = (teams || []).length;
    const currentPickNumber = league.draft_current_pick || 0;
    const nextPickIndex = snakeDraftTeamIndex(currentPickNumber + 1, teamCount);
    const sortedTeams = [...(teams || [])].sort(
      (a: { draft_position: number }, b: { draft_position: number }) => a.draft_position - b.draft_position
    );
    const expectedTeam = sortedTeams[nextPickIndex];

    if (!expectedTeam || (expectedTeam as { id: string }).id !== teamId) {
      throw new AppError('It is not your turn to pick', 403);
    }

    // Check player available
    const { data: alreadyPicked } = await supabaseAdmin
      .from('draft_picks')
      .select('id')
      .eq('league_id', id)
      .eq('player_id', body.playerId)
      .single();

    if (alreadyPicked) throw new AppError('Player already drafted', 409);

    // Check player exists
    const { data: player, error: playerError } = await supabaseAdmin
      .from('players')
      .select('id, position')
      .eq('id', body.playerId)
      .single();

    if (playerError || !player) throw new AppError('Player not found', 404);

    const round = Math.ceil((currentPickNumber + 1) / teamCount);
    const pickInRound = ((currentPickNumber) % teamCount) + 1;

    // Insert draft pick
    const { data: pick, error: pickError } = await supabaseAdmin
      .from('draft_picks')
      .insert({
        league_id: id,
        team_id: teamId,
        player_id: body.playerId,
        round,
        pick: currentPickNumber + 1
      })
      .select()
      .single();

    if (pickError) throw new AppError(`Failed to record pick: ${pickError.message}`, 500);

    // Add player to roster — find first available bench slot
    const { data: existingRoster } = await supabaseAdmin
      .from('rosters')
      .select('slot')
      .eq('team_id', teamId)
      .eq('week', 0);

    const usedSlots = new Set((existingRoster || []).map((r: { slot: string }) => r.slot));
    const pos = (player as { position: string }).position;

    // Try to place in starting slot first, then bench
    const slotPriority: string[] = [];
    if (pos === 'QB') slotPriority.push('QB');
    if (pos === 'RB') slotPriority.push('RB', 'RB2', 'FLEX');
    if (pos === 'WR') slotPriority.push('WR', 'WR2', 'FLEX');
    if (pos === 'TE') slotPriority.push('TE', 'FLEX');
    if (pos === 'K') slotPriority.push('K');
    if (pos === 'DEF') slotPriority.push('DEF');
    slotPriority.push('BN1', 'BN2', 'BN3', 'BN4', 'BN5', 'BN6');

    const targetSlot = slotPriority.find(s => !usedSlots.has(s)) || 'BN6';

    await supabaseAdmin
      .from('rosters')
      .insert({
        team_id: teamId,
        player_id: body.playerId,
        slot: targetSlot,
        week: 0,
        acquired_via: 'draft'
      });

    // Advance pick counter
    const newPickNumber = currentPickNumber + 1;
    const totalPicks = teamCount * 15;

    if (newPickNumber >= totalPicks) {
      // Draft complete
      await supabaseAdmin
        .from('leagues')
        .update({ draft_current_pick: newPickNumber, status: 'active', current_week: 1 })
        .eq('id', id);
    } else {
      await supabaseAdmin
        .from('leagues')
        .update({ draft_current_pick: newPickNumber })
        .eq('id', id);
    }

    res.status(201).json({
      pick,
      round,
      pickInRound,
      slot: targetSlot,
      draftComplete: newPickNumber >= totalPicks
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/leagues/:id/draft/available — Available (undrafted) players
router.get('/:id/draft/available', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireMembership(id, req.user!.id);

    const { search, position } = req.query;

    const { data: draftedPicks } = await supabaseAdmin
      .from('draft_picks')
      .select('player_id')
      .eq('league_id', id);

    const draftedIds = (draftedPicks || []).map((p: { player_id: string }) => p.player_id);

    let query = supabaseAdmin
      .from('players')
      .select('id, name, position, nfl_team, status, adp, headshot_url')
      .eq('status', 'active')
      .order('adp', { ascending: true })
      .limit(100);

    if (draftedIds.length > 0) {
      query = query.not('id', 'in', `(${draftedIds.join(',')})`);
    }

    if (position && typeof position === 'string' && position !== 'ALL') {
      query = query.eq('position', position);
    }

    if (search && typeof search === 'string') {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch available players', 500);
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// WAIVER WIRE
// ============================================================

// GET /api/leagues/:id/waivers — List waiver claims
router.get('/:id/waivers', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireMembership(id, req.user!.id);

    const { data, error } = await supabaseAdmin
      .from('waiver_claims')
      .select(`
        id, priority, status, week, created_at, processed_at, failure_reason,
        team:teams(id, team_name),
        add_player:players!waiver_claims_add_player_id_fkey(id, name, position, nfl_team, status),
        drop_player:players!waiver_claims_drop_player_id_fkey(id, name, position, nfl_team, status)
      `)
      .eq('league_id', id)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new AppError('Failed to fetch waiver claims', 500);
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/waiver — Submit waiver claim
router.post('/:id/waiver', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const teamId = await requireMembership(id, req.user!.id);
    const body = waiverClaimSchema.parse(req.body);

    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('status, current_week')
      .eq('id', id)
      .single();

    if (leagueError || !league) throw new AppError('League not found', 404);
    if (!['active', 'playoffs'].includes(league.status)) {
      throw new AppError('Waivers are only available during the active season', 400);
    }

    // Check player not already on a roster
    const { data: onRoster } = await supabaseAdmin
      .from('rosters')
      .select('id, team:teams!inner(league_id)')
      .eq('player_id', body.addPlayerId)
      .eq('teams.league_id', id)
      .single();

    if (onRoster) throw new AppError('Player is already on a roster', 409);

    // Check no duplicate pending claim
    const { data: existing } = await supabaseAdmin
      .from('waiver_claims')
      .select('id')
      .eq('league_id', id)
      .eq('team_id', teamId)
      .eq('add_player_id', body.addPlayerId)
      .eq('status', 'pending')
      .single();

    if (existing) throw new AppError('You already have a pending claim for this player', 409);

    // Get team's waiver priority
    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('waiver_priority')
      .eq('id', teamId)
      .single();

    const priority = (team as { waiver_priority: number } | null)?.waiver_priority ?? 999;

    const { data: claim, error: claimError } = await supabaseAdmin
      .from('waiver_claims')
      .insert({
        league_id: id,
        team_id: teamId,
        add_player_id: body.addPlayerId,
        drop_player_id: body.dropPlayerId || null,
        priority,
        week: league.current_week,
        status: 'pending'
      })
      .select()
      .single();

    if (claimError) throw new AppError(`Failed to submit waiver claim: ${claimError.message}`, 500);
    res.status(201).json(claim);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/leagues/:id/waiver/:claimId — Cancel a waiver claim
router.delete('/:id/waiver/:claimId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id, claimId } = req.params;
    const teamId = await requireMembership(id, req.user!.id);

    const { data: claim, error } = await supabaseAdmin
      .from('waiver_claims')
      .select('id, status, team_id')
      .eq('id', claimId)
      .single();

    if (error || !claim) throw new AppError('Claim not found', 404);
    if ((claim as { team_id: string }).team_id !== teamId) throw new AppError('Not your claim', 403);
    if ((claim as { status: string }).status !== 'pending') throw new AppError('Claim is no longer pending', 400);

    await supabaseAdmin
      .from('waiver_claims')
      .update({ status: 'cancelled' })
      .eq('id', claimId);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/leagues/:id/free-agents — Players not on any roster
router.get('/:id/free-agents', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireMembership(id, req.user!.id);

    const { search, position } = req.query;

    // Get all rostered players in this league
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('league_id', id);

    const teamIds = (teams || []).map((t: { id: string }) => t.id);

    const { data: rostered } = teamIds.length > 0
      ? await supabaseAdmin
          .from('rosters')
          .select('player_id')
          .in('team_id', teamIds)
          .eq('week', 0)
      : { data: [] };

    const rosteredIds = (rostered || []).map((r: { player_id: string }) => r.player_id);

    let query = supabaseAdmin
      .from('players')
      .select('id, name, position, nfl_team, status, adp, headshot_url')
      .order('adp', { ascending: true })
      .limit(100);

    if (rosteredIds.length > 0) {
      query = query.not('id', 'in', `(${rosteredIds.join(',')})`);
    }

    if (position && typeof position === 'string' && position !== 'ALL') {
      query = query.eq('position', position);
    }

    if (search && typeof search === 'string') {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch free agents', 500);
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/roster/drop — Drop a player (free agency release)
router.post('/:id/roster/drop', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const teamId = await requireMembership(id, req.user!.id);
    const { playerId } = z.object({ playerId: z.string() }).parse(req.body);

    const { error } = await supabaseAdmin
      .from('rosters')
      .delete()
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .eq('week', 0);

    if (error) throw new AppError('Failed to drop player', 500);

    // Log transaction
    await supabaseAdmin.from('transactions').insert({
      league_id: id,
      type: 'drop',
      team_id: teamId,
      player_id: playerId,
      status: 'complete',
      week: 0
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// AUTO-PICK
// ============================================================

/**
 * POST /api/leagues/:id/draft/auto-pick
 *
 * Triggered by the frontend when the draft timer expires (or when the user
 * has enabled "always auto-pick").  The server uses the current team's
 * saved draft-order preferences to select the best available player and
 * records the pick exactly like a manual pick would be recorded.
 *
 * The caller must be authenticated; the endpoint verifies it is actually
 * the correct team's turn before acting.
 */
router.post('/:id/draft/auto-pick', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Load league
    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('id', id)
      .single();

    if (leagueError || !league) throw new AppError('League not found', 404);
    if (league.status !== 'draft') throw new AppError('League is not in draft mode', 400);

    // Load teams sorted by draft position
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, draft_position, user_id')
      .eq('league_id', id)
      .order('draft_position');

    const teamCount = (teams || []).length;
    if (teamCount === 0) throw new AppError('No teams in league', 400);

    const currentPickNumber = league.draft_current_pick || 0;
    const nextPickIndex = snakeDraftTeamIndex(currentPickNumber + 1, teamCount);
    const sortedTeams = [...(teams || [])].sort(
      (a: { draft_position: number }, b: { draft_position: number }) => a.draft_position - b.draft_position
    );
    const pickingTeam = sortedTeams[nextPickIndex];

    if (!pickingTeam) throw new AppError('Could not determine picking team', 500);

    // Only the user whose turn it is (or any authenticated user on behalf of the timer)
    // can trigger auto-pick. We allow any league member to call this so the frontend
    // timer on any connected client can fire it, but we never allow skipping someone
    // else's turn to pick for them maliciously — the pick is always for the CURRENT team.
    await requireMembership(id, req.user!.id);

    // Resolve best available player using draft preferences
    const autoPick = await resolveAutoPick(id, (pickingTeam as { id: string }).id);
    if (!autoPick) throw new AppError('No available players to auto-pick', 400);

    // Check player is still available (race-condition guard)
    const { data: alreadyPicked } = await supabaseAdmin
      .from('draft_picks')
      .select('id')
      .eq('league_id', id)
      .eq('player_id', autoPick.playerId)
      .single();

    if (alreadyPicked) throw new AppError('Auto-pick target already drafted, please retry', 409);

    // Fetch full player record for slot assignment
    const { data: player } = await supabaseAdmin
      .from('players')
      .select('id, position')
      .eq('id', autoPick.playerId)
      .single();

    if (!player) throw new AppError('Player not found', 404);

    const round = Math.ceil((currentPickNumber + 1) / teamCount);
    const pickInRound = ((currentPickNumber) % teamCount) + 1;

    // Insert draft pick (marked as auto)
    const { data: pick, error: pickError } = await supabaseAdmin
      .from('draft_picks')
      .insert({
        league_id: id,
        team_id: (pickingTeam as { id: string }).id,
        player_id: autoPick.playerId,
        round,
        pick: currentPickNumber + 1,
        is_auto: true
      })
      .select()
      .single();

    if (pickError) throw new AppError(`Failed to record auto-pick: ${pickError.message}`, 500);

    // Place player on roster
    const { data: existingRoster } = await supabaseAdmin
      .from('rosters')
      .select('slot')
      .eq('team_id', (pickingTeam as { id: string }).id)
      .eq('week', 0);

    const usedSlots = new Set((existingRoster || []).map((r: { slot: string }) => r.slot));
    const pos = (player as { position: string }).position;

    const slotPriority: string[] = [];
    if (pos === 'QB') slotPriority.push('QB');
    if (pos === 'RB') slotPriority.push('RB', 'RB2', 'FLEX');
    if (pos === 'WR') slotPriority.push('WR', 'WR2', 'FLEX');
    if (pos === 'TE') slotPriority.push('TE', 'FLEX');
    if (pos === 'K') slotPriority.push('K');
    if (pos === 'DEF') slotPriority.push('DEF');
    slotPriority.push('BN1', 'BN2', 'BN3', 'BN4', 'BN5', 'BN6');

    const targetSlot = slotPriority.find(s => !usedSlots.has(s)) || 'BN6';

    await supabaseAdmin.from('rosters').insert({
      team_id: (pickingTeam as { id: string }).id,
      player_id: autoPick.playerId,
      slot: targetSlot,
      week: 0,
      acquired_via: 'draft'
    });

    // Advance pick counter
    const newPickNumber = currentPickNumber + 1;
    const totalPicks = teamCount * 15;

    if (newPickNumber >= totalPicks) {
      await supabaseAdmin
        .from('leagues')
        .update({ draft_current_pick: newPickNumber, status: 'active', current_week: 1 })
        .eq('id', id);
    } else {
      await supabaseAdmin
        .from('leagues')
        .update({ draft_current_pick: newPickNumber })
        .eq('id', id);
    }

    res.status(201).json({
      pick,
      round,
      pickInRound,
      slot: targetSlot,
      autoPickReason: autoPick.reason,
      playerName: autoPick.playerName,
      position: autoPick.position,
      draftComplete: newPickNumber >= totalPicks
    });
  } catch (err) {
    next(err);
  }
});

export default router;

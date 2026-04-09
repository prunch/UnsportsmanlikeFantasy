import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

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
  logger.debug('[leagues] requireMembership — checking', { leagueId, userId });
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    logger.warn('[leagues] requireMembership — not a member', { leagueId, userId, dbError: error });
    throw new AppError('Not a member of this league', 403);
  }

  logger.debug('[leagues] requireMembership — ok', { leagueId, userId, teamId: (data as { id: string }).id });
  return (data as { id: string }).id;
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

// ── GET /api/leagues — List leagues for current user ─────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  logger.info('[leagues] GET / — list user leagues', { userId: uid });
  try {
    logger.debug('[leagues] GET / — querying teams JOIN leagues', { userId: uid });
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select(`
        league:leagues(
          id, name, status, season, max_teams, current_week, invite_code, commissioner_id,
          created_at
        )
      `)
      .eq('user_id', uid);

    if (error) {
      logger.error('[leagues] GET / — DB error fetching leagues', { userId: uid, dbError: error });
      throw new AppError('Failed to fetch leagues', 500);
    }

    const leagues = data?.map((d: { league: unknown }) => d.league).filter(Boolean) || [];
    logger.info('[leagues] GET / — success', { userId: uid, count: leagues.length });
    res.json(leagues);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] GET / — unexpected error', { userId: uid, error: err });
    next(err);
  }
});

// ── POST /api/leagues — Create league ────────────────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  logger.info('[leagues] POST / — create league', { userId: uid, body: req.body });
  try {
    const body = createLeagueSchema.parse(req.body);
    const leagueId = uuidv4();
    const inviteCode = generateInviteCode();

    logger.debug('[leagues] POST / — inserting league', { leagueId, name: body.name, userId: uid });
    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .insert({
        id: leagueId,
        name: body.name,
        commissioner_id: uid,
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

    if (leagueError) {
      logger.error('[leagues] POST / — failed to insert league', { userId: uid, dbError: leagueError });
      throw new AppError(`Failed to create league: ${leagueError.message}`, 500);
    }

    logger.debug('[leagues] POST / — league created, inserting commissioner team', {
      leagueId,
      userId: uid
    });

    const { error: teamError } = await supabaseAdmin
      .from('teams')
      .insert({
        league_id: leagueId,
        user_id: uid,
        team_name: `${req.user!.email}'s Team`
      });

    if (teamError) {
      logger.error('[leagues] POST / — failed to create commissioner team, rolling back league', {
        leagueId,
        userId: uid,
        dbError: teamError
      });
      await supabaseAdmin.from('leagues').delete().eq('id', leagueId);
      throw new AppError('Failed to create team', 500);
    }

    logger.info('[leagues] POST / — success', { leagueId, name: body.name, userId: uid, inviteCode });
    res.status(201).json(league);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] POST / — unexpected error', { userId: uid, error: err });
    next(err);
  }
});

// ── GET /api/leagues/:id — Get league detail ─────────────────────────────────
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  logger.info('[leagues] GET /:id', { userId: uid, leagueId: id });
  try {
    await requireMembership(id, uid);

    logger.debug('[leagues] GET /:id — fetching league with teams', { leagueId: id });
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

    if (error || !league) {
      logger.warn('[leagues] GET /:id — league not found', { leagueId: id, dbError: error });
      throw new AppError('League not found', 404);
    }

    logger.info('[leagues] GET /:id — success', { leagueId: id, userId: uid });
    res.json(league);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] GET /:id — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ── POST /api/leagues/join — Join by invite code ─────────────────────────────
router.post('/join', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  logger.info('[leagues] POST /join', { userId: uid, body: req.body });
  try {
    const body = joinLeagueSchema.parse(req.body);
    const code = body.inviteCode.toUpperCase();

    logger.debug('[leagues] POST /join — looking up invite code', { inviteCode: code });
    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('invite_code', code)
      .single();

    if (leagueError || !league) {
      logger.warn('[leagues] POST /join — invalid invite code', { inviteCode: code, dbError: leagueError });
      throw new AppError('Invalid invite code', 404);
    }

    if (league.status !== 'setup') {
      logger.warn('[leagues] POST /join — league not in setup', { leagueId: league.id, status: league.status });
      throw new AppError('League is not accepting new members', 400);
    }

    const { count } = await supabaseAdmin
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league.id);

    logger.debug('[leagues] POST /join — team count', { leagueId: league.id, count, max: league.max_teams });
    if ((count || 0) >= league.max_teams) throw new AppError('League is full', 400);

    const { data: existing } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('league_id', league.id)
      .eq('user_id', uid)
      .single();

    if (existing) {
      logger.warn('[leagues] POST /join — user already in league', { leagueId: league.id, userId: uid });
      throw new AppError('Already a member of this league', 409);
    }

    logger.debug('[leagues] POST /join — inserting team', { leagueId: league.id, userId: uid });
    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .insert({ league_id: league.id, user_id: uid, team_name: body.teamName })
      .select()
      .single();

    if (teamError) {
      logger.error('[leagues] POST /join — failed to insert team', { leagueId: league.id, userId: uid, dbError: teamError });
      throw new AppError('Failed to join league', 500);
    }

    logger.info('[leagues] POST /join — success', { leagueId: league.id, userId: uid, teamName: body.teamName });
    res.status(201).json({ league, team });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] POST /join — unexpected error', { userId: uid, error: err });
    next(err);
  }
});

// ── POST /api/leagues/:id/join — Alternate join by league ID ─────────────────
router.post('/:id/join', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  logger.info('[leagues] POST /:id/join', { userId: uid, leagueId: id, body: req.body });
  try {
    const body = joinLeagueSchema.parse(req.body);

    logger.debug('[leagues] POST /:id/join — fetching league', { leagueId: id });
    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('id', id)
      .single();

    if (leagueError || !league) {
      logger.warn('[leagues] POST /:id/join — league not found', { leagueId: id, dbError: leagueError });
      throw new AppError('League not found', 404);
    }
    if (league.invite_code !== body.inviteCode.toUpperCase()) {
      logger.warn('[leagues] POST /:id/join — wrong invite code', { leagueId: id, userId: uid });
      throw new AppError('Invalid invite code', 403);
    }
    if (league.status !== 'setup') {
      logger.warn('[leagues] POST /:id/join — not in setup', { leagueId: id, status: league.status });
      throw new AppError('League is not accepting new members', 400);
    }

    const { count } = await supabaseAdmin
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', id);

    if ((count || 0) >= league.max_teams) throw new AppError('League is full', 400);

    const { data: existing } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('league_id', id)
      .eq('user_id', uid)
      .single();

    if (existing) throw new AppError('Already a member of this league', 409);

    logger.debug('[leagues] POST /:id/join — inserting team', { leagueId: id, userId: uid });
    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .insert({ league_id: id, user_id: uid, team_name: body.teamName })
      .select()
      .single();

    if (teamError) {
      logger.error('[leagues] POST /:id/join — team insert failed', { leagueId: id, userId: uid, dbError: teamError });
      throw new AppError('Failed to join league', 500);
    }

    logger.info('[leagues] POST /:id/join — success', { leagueId: id, userId: uid });
    res.status(201).json({ league, team });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] POST /:id/join — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ============================================================
// ROSTERS
// ============================================================

// ── GET /api/leagues/:id/rosters — All rosters in the league ─────────────────
router.get('/:id/rosters', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  logger.info('[leagues] GET /:id/rosters', { userId: uid, leagueId: id });
  try {
    await requireMembership(id, uid);

    logger.debug('[leagues] GET /:id/rosters — fetching teams', { leagueId: id });
    const { data: teams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('id, team_name, user:users(id, display_name)')
      .eq('league_id', id);

    if (teamsError) {
      logger.error('[leagues] GET /:id/rosters — teams DB error', { leagueId: id, dbError: teamsError });
      throw new AppError('Failed to fetch teams', 500);
    }

    const teamIds = (teams || []).map((t: { id: string }) => t.id);
    logger.debug('[leagues] GET /:id/rosters — fetching rosters', { leagueId: id, teamCount: teamIds.length });

    const { data: rosters, error: rostersError } = await supabaseAdmin
      .from('rosters')
      .select(`
        id, team_id, slot, week, acquired_via,
        player:players(id, name, position, nfl_team, status, adp, headshot_url)
      `)
      .in('team_id', teamIds)
      .eq('week', 0);

    if (rostersError) {
      logger.error('[leagues] GET /:id/rosters — rosters DB error', { leagueId: id, dbError: rostersError });
      throw new AppError('Failed to fetch rosters', 500);
    }

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

    logger.info('[leagues] GET /:id/rosters — success', { leagueId: id, teamCount: result.length });
    res.json(result);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] GET /:id/rosters — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ── GET /api/leagues/:id/roster/mine ─────────────────────────────────────────
router.get('/:id/roster/mine', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  logger.info('[leagues] GET /:id/roster/mine', { userId: uid, leagueId: id });
  try {
    const teamId = await requireMembership(id, uid);

    logger.debug('[leagues] GET /:id/roster/mine — fetching roster', { teamId, leagueId: id });
    const { data, error } = await supabaseAdmin
      .from('rosters')
      .select(`
        id, slot, week, acquired_via,
        player:players(id, name, position, nfl_team, status, adp, headshot_url)
      `)
      .eq('team_id', teamId)
      .eq('week', 0)
      .order('slot');

    if (error) {
      logger.error('[leagues] GET /:id/roster/mine — DB error', { teamId, dbError: error });
      throw new AppError('Failed to fetch roster', 500);
    }

    logger.info('[leagues] GET /:id/roster/mine — success', { teamId, slots: data?.length });
    res.json(data || []);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] GET /:id/roster/mine — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ── POST /api/leagues/:id/roster — Move player to a different slot ────────────
router.post('/:id/roster', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  logger.info('[leagues] POST /:id/roster — slot move', { userId: uid, leagueId: id, body: req.body });
  try {
    const teamId = await requireMembership(id, uid);
    const body = rosterUpdateSchema.parse(req.body);

    logger.debug('[leagues] POST /:id/roster — checking player on team', { teamId, playerId: body.playerId });
    const { data: currentEntry, error: fetchError } = await supabaseAdmin
      .from('rosters')
      .select('id, slot')
      .eq('team_id', teamId)
      .eq('player_id', body.playerId)
      .eq('week', 0)
      .single();

    if (fetchError || !currentEntry) {
      logger.warn('[leagues] POST /:id/roster — player not on roster', { teamId, playerId: body.playerId, dbError: fetchError });
      throw new AppError('Player not on your roster', 404);
    }

    logger.debug('[leagues] POST /:id/roster — checking target slot occupant', { teamId, targetSlot: body.slot });
    const { data: occupant } = await supabaseAdmin
      .from('rosters')
      .select('id, player_id')
      .eq('team_id', teamId)
      .eq('slot', body.slot)
      .eq('week', 0)
      .single();

    if (occupant) {
      logger.debug('[leagues] POST /:id/roster — swapping slots', {
        teamId,
        fromSlot: (currentEntry as { slot: string }).slot,
        toSlot: body.slot
      });
      await supabaseAdmin
        .from('rosters')
        .update({ slot: (currentEntry as { slot: string }).slot })
        .eq('id', (occupant as { id: string }).id);
    }

    await supabaseAdmin
      .from('rosters')
      .update({ slot: body.slot })
      .eq('id', (currentEntry as { id: string }).id);

    logger.info('[leagues] POST /:id/roster — success', { teamId, playerId: body.playerId, newSlot: body.slot });
    res.json({ success: true, message: `Moved player to ${body.slot}` });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] POST /:id/roster — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ============================================================
// DRAFT
// ============================================================

// ── GET /api/leagues/:id/draft — Get draft state ──────────────────────────────
router.get('/:id/draft', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  logger.info('[leagues] GET /:id/draft', { userId: uid, leagueId: id });
  try {
    await requireMembership(id, uid);

    logger.debug('[leagues] GET /:id/draft — fetching league state', { leagueId: id });
    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('id, name, status, max_teams, draft_type, draft_timer_seconds, draft_current_pick, draft_started_at')
      .eq('id', id)
      .single();

    if (leagueError || !league) {
      logger.warn('[leagues] GET /:id/draft — league not found', { leagueId: id, dbError: leagueError });
      throw new AppError('League not found', 404);
    }

    const { data: teams, error: teamsError } = await supabaseAdmin
      .from('teams')
      .select('id, team_name, draft_position, user:users(id, display_name, avatar_url)')
      .eq('league_id', id)
      .order('draft_position', { ascending: true });

    if (teamsError) {
      logger.error('[leagues] GET /:id/draft — teams DB error', { leagueId: id, dbError: teamsError });
      throw new AppError('Failed to fetch teams', 500);
    }

    const { data: picks, error: picksError } = await supabaseAdmin
      .from('draft_picks')
      .select(`
        id, round, pick, is_auto, picked_at,
        team:teams(id, team_name),
        player:players(id, name, position, nfl_team, status, adp)
      `)
      .eq('league_id', id)
      .order('pick', { ascending: true });

    if (picksError) {
      logger.error('[leagues] GET /:id/draft — picks DB error', { leagueId: id, dbError: picksError });
      throw new AppError('Failed to fetch picks', 500);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draftedPlayerIds = (picks || []).reduce((acc: string[], p: any) => {
      const pl = Array.isArray(p.player) ? p.player[0] : p.player;
      if (pl?.id) acc.push(pl.id);
      return acc;
    }, []);

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

    logger.info('[leagues] GET /:id/draft — success', {
      leagueId: id,
      status: league.status,
      currentPick: currentPickNumber,
      picksRecorded: picks?.length,
      teamCount
    });

    res.json({
      league,
      teams: teams || [],
      picks: picks || [],
      draftedPlayerIds,
      currentPickNumber,
      currentTeam,
      totalPicks: teamCount * 15
    });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] GET /:id/draft — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ── POST /api/leagues/:id/draft/start — Commissioner starts draft ─────────────
router.post('/:id/draft/start', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  logger.info('[leagues] POST /:id/draft/start', { userId: uid, leagueId: id });
  try {
    logger.debug('[leagues] POST /:id/draft/start — fetching league', { leagueId: id });
    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('id', id)
      .single();

    if (leagueError || !league) {
      logger.warn('[leagues] POST /:id/draft/start — league not found', { leagueId: id, dbError: leagueError });
      throw new AppError('League not found', 404);
    }
    if (league.commissioner_id !== uid) {
      logger.warn('[leagues] POST /:id/draft/start — not commissioner', { leagueId: id, userId: uid });
      throw new AppError('Only the commissioner can start the draft', 403);
    }
    if (league.status !== 'setup') {
      logger.warn('[leagues] POST /:id/draft/start — wrong status', { leagueId: id, status: league.status });
      throw new AppError('League is not in setup mode', 400);
    }

    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('league_id', id);

    const teamCount = (teams || []).length;
    logger.debug('[leagues] POST /:id/draft/start — team count', { leagueId: id, teamCount });

    if (teamCount < 2) throw new AppError('Need at least 2 teams to start draft', 400);

    // Randomize draft order
    const shuffled = [...(teams || [])].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      await supabaseAdmin
        .from('teams')
        .update({ draft_position: i + 1, waiver_priority: shuffled.length - i })
        .eq('id', (shuffled[i] as { id: string }).id);
    }

    logger.debug('[leagues] POST /:id/draft/start — updating league status to draft', { leagueId: id });
    await supabaseAdmin
      .from('leagues')
      .update({ status: 'draft', draft_current_pick: 0, draft_started_at: new Date().toISOString() })
      .eq('id', id);

    logger.info('[leagues] POST /:id/draft/start — draft started!', { leagueId: id, teamCount });
    res.json({ success: true, message: 'Draft started! Draft order has been randomized.' });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] POST /:id/draft/start — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ── POST /api/leagues/:id/draft/pick — Make a draft pick ─────────────────────
router.post('/:id/draft/pick', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  logger.info('[leagues] POST /:id/draft/pick', { userId: uid, leagueId: id, body: req.body });
  try {
    const teamId = await requireMembership(id, uid);
    const body = draftPickSchema.parse(req.body);

    logger.debug('[leagues] POST /:id/draft/pick — fetching league state', { leagueId: id });
    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('id', id)
      .single();

    if (leagueError || !league) throw new AppError('League not found', 404);
    if (league.status !== 'draft') {
      logger.warn('[leagues] POST /:id/draft/pick — not in draft', { leagueId: id, status: league.status });
      throw new AppError('League is not in draft mode', 400);
    }

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

    logger.debug('[leagues] POST /:id/draft/pick — turn check', {
      currentPick: currentPickNumber,
      expectedTeamId: (expectedTeam as { id: string } | undefined)?.id,
      pickingTeamId: teamId
    });

    if (!expectedTeam || (expectedTeam as { id: string }).id !== teamId) {
      logger.warn('[leagues] POST /:id/draft/pick — wrong team', {
        leagueId: id, userId: uid, teamId,
        expectedTeamId: (expectedTeam as { id: string } | undefined)?.id
      });
      throw new AppError('It is not your turn to pick', 403);
    }

    // Check player available
    const { data: alreadyPicked } = await supabaseAdmin
      .from('draft_picks')
      .select('id')
      .eq('league_id', id)
      .eq('player_id', body.playerId)
      .single();

    if (alreadyPicked) {
      logger.warn('[leagues] POST /:id/draft/pick — player already drafted', { playerId: body.playerId });
      throw new AppError('Player already drafted', 409);
    }

    const { data: player, error: playerError } = await supabaseAdmin
      .from('players')
      .select('id, position')
      .eq('id', body.playerId)
      .single();

    if (playerError || !player) {
      logger.warn('[leagues] POST /:id/draft/pick — player not found', { playerId: body.playerId, dbError: playerError });
      throw new AppError('Player not found', 404);
    }

    const round = Math.ceil((currentPickNumber + 1) / teamCount);
    const pickInRound = ((currentPickNumber) % teamCount) + 1;

    logger.debug('[leagues] POST /:id/draft/pick — recording pick', {
      leagueId: id, teamId, playerId: body.playerId, round, pickInRound
    });

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

    if (pickError) {
      logger.error('[leagues] POST /:id/draft/pick — failed to record pick', { dbError: pickError });
      throw new AppError(`Failed to record pick: ${pickError.message}`, 500);
    }

    // Find roster slot
    const { data: existingRoster } = await supabaseAdmin
      .from('rosters')
      .select('slot')
      .eq('team_id', teamId)
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
    logger.debug('[leagues] POST /:id/draft/pick — placing in slot', { teamId, playerId: body.playerId, targetSlot });

    await supabaseAdmin
      .from('rosters')
      .insert({
        team_id: teamId,
        player_id: body.playerId,
        slot: targetSlot,
        week: 0,
        acquired_via: 'draft'
      });

    const newPickNumber = currentPickNumber + 1;
    const totalPicks = teamCount * 15;
    const draftComplete = newPickNumber >= totalPicks;

    if (draftComplete) {
      logger.info('[leagues] POST /:id/draft/pick — DRAFT COMPLETE', { leagueId: id, totalPicks });
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

    logger.info('[leagues] POST /:id/draft/pick — pick recorded', {
      leagueId: id, teamId, playerId: body.playerId, pickNumber: newPickNumber, slot: targetSlot, draftComplete
    });

    res.status(201).json({ pick, round, pickInRound, slot: targetSlot, draftComplete });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] POST /:id/draft/pick — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ── GET /api/leagues/:id/draft/available — Undrafted players ─────────────────
router.get('/:id/draft/available', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  const { search, position } = req.query;
  logger.info('[leagues] GET /:id/draft/available', { userId: uid, leagueId: id, search, position });
  try {
    await requireMembership(id, uid);

    const { data: draftedPicks } = await supabaseAdmin
      .from('draft_picks')
      .select('player_id')
      .eq('league_id', id);

    const draftedIds = (draftedPicks || []).map((p: { player_id: string }) => p.player_id);
    logger.debug('[leagues] GET /:id/draft/available — drafted count', { leagueId: id, drafted: draftedIds.length });

    let query = supabaseAdmin
      .from('players')
      .select('id, name, position, nfl_team, status, adp, headshot_url')
      .eq('status', 'active')
      .order('adp', { ascending: true })
      .limit(100);

    if (draftedIds.length > 0) query = query.not('id', 'in', `(${draftedIds.join(',')})`);
    if (position && typeof position === 'string' && position !== 'ALL') query = query.eq('position', position);
    if (search && typeof search === 'string') query = query.ilike('name', `%${search}%`);

    const { data, error } = await query;
    if (error) {
      logger.error('[leagues] GET /:id/draft/available — DB error', { leagueId: id, dbError: error });
      throw new AppError('Failed to fetch available players', 500);
    }

    logger.debug('[leagues] GET /:id/draft/available — success', { leagueId: id, returned: data?.length });
    res.json(data || []);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] GET /:id/draft/available — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ============================================================
// WAIVER WIRE
// ============================================================

// ── GET /api/leagues/:id/waivers ─────────────────────────────────────────────
router.get('/:id/waivers', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  logger.info('[leagues] GET /:id/waivers', { userId: uid, leagueId: id });
  try {
    await requireMembership(id, uid);

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

    if (error) {
      logger.error('[leagues] GET /:id/waivers — DB error', { leagueId: id, dbError: error });
      throw new AppError('Failed to fetch waiver claims', 500);
    }

    logger.info('[leagues] GET /:id/waivers — success', { leagueId: id, count: data?.length });
    res.json(data || []);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] GET /:id/waivers — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ── POST /api/leagues/:id/waiver — Submit waiver claim ───────────────────────
router.post('/:id/waiver', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  logger.info('[leagues] POST /:id/waiver — submit claim', { userId: uid, leagueId: id, body: req.body });
  try {
    const teamId = await requireMembership(id, uid);
    const body = waiverClaimSchema.parse(req.body);

    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('status, current_week')
      .eq('id', id)
      .single();

    if (leagueError || !league) {
      logger.warn('[leagues] POST /:id/waiver — league not found', { leagueId: id, dbError: leagueError });
      throw new AppError('League not found', 404);
    }
    if (!['active', 'playoffs'].includes(league.status)) {
      logger.warn('[leagues] POST /:id/waiver — waivers not available', { leagueId: id, status: league.status });
      throw new AppError('Waivers are only available during the active season', 400);
    }

    const { data: onRoster } = await supabaseAdmin
      .from('rosters')
      .select('id, team:teams!inner(league_id)')
      .eq('player_id', body.addPlayerId)
      .eq('teams.league_id', id)
      .single();

    if (onRoster) {
      logger.warn('[leagues] POST /:id/waiver — player already rostered', {
        leagueId: id, playerId: body.addPlayerId
      });
      throw new AppError('Player is already on a roster', 409);
    }

    const { data: existing } = await supabaseAdmin
      .from('waiver_claims')
      .select('id')
      .eq('league_id', id)
      .eq('team_id', teamId)
      .eq('add_player_id', body.addPlayerId)
      .eq('status', 'pending')
      .single();

    if (existing) throw new AppError('You already have a pending claim for this player', 409);

    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('waiver_priority')
      .eq('id', teamId)
      .single();

    const priority = (team as { waiver_priority: number } | null)?.waiver_priority ?? 999;

    logger.debug('[leagues] POST /:id/waiver — inserting claim', {
      leagueId: id, teamId, addPlayer: body.addPlayerId, priority
    });

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

    if (claimError) {
      logger.error('[leagues] POST /:id/waiver — insert failed', { leagueId: id, dbError: claimError });
      throw new AppError(`Failed to submit waiver claim: ${claimError.message}`, 500);
    }

    logger.info('[leagues] POST /:id/waiver — success', { leagueId: id, teamId, claimId: (claim as { id: string }).id });
    res.status(201).json(claim);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] POST /:id/waiver — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ── DELETE /api/leagues/:id/waiver/:claimId — Cancel waiver claim ────────────
router.delete('/:id/waiver/:claimId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id, claimId } = req.params;
  logger.info('[leagues] DELETE /:id/waiver/:claimId', { userId: uid, leagueId: id, claimId });
  try {
    const teamId = await requireMembership(id, uid);

    const { data: claim, error } = await supabaseAdmin
      .from('waiver_claims')
      .select('id, status, team_id')
      .eq('id', claimId)
      .single();

    if (error || !claim) {
      logger.warn('[leagues] DELETE waiver — claim not found', { claimId, dbError: error });
      throw new AppError('Claim not found', 404);
    }
    if ((claim as { team_id: string }).team_id !== teamId) {
      logger.warn('[leagues] DELETE waiver — not your claim', { claimId, teamId });
      throw new AppError('Not your claim', 403);
    }
    if ((claim as { status: string }).status !== 'pending') {
      logger.warn('[leagues] DELETE waiver — claim not pending', { claimId, status: (claim as { status: string }).status });
      throw new AppError('Claim is no longer pending', 400);
    }

    await supabaseAdmin
      .from('waiver_claims')
      .update({ status: 'cancelled' })
      .eq('id', claimId);

    logger.info('[leagues] DELETE waiver — cancelled', { claimId, teamId });
    res.json({ success: true });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] DELETE waiver — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ── GET /api/leagues/:id/free-agents ─────────────────────────────────────────
router.get('/:id/free-agents', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  const { search, position } = req.query;
  logger.info('[leagues] GET /:id/free-agents', { userId: uid, leagueId: id, search, position });
  try {
    await requireMembership(id, uid);

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
    logger.debug('[leagues] GET /:id/free-agents — rostered count', { leagueId: id, rostered: rosteredIds.length });

    let query = supabaseAdmin
      .from('players')
      .select('id, name, position, nfl_team, status, adp, headshot_url')
      .order('adp', { ascending: true })
      .limit(100);

    if (rosteredIds.length > 0) query = query.not('id', 'in', `(${rosteredIds.join(',')})`);
    if (position && typeof position === 'string' && position !== 'ALL') query = query.eq('position', position);
    if (search && typeof search === 'string') query = query.ilike('name', `%${search}%`);

    const { data, error } = await query;
    if (error) {
      logger.error('[leagues] GET /:id/free-agents — DB error', { leagueId: id, dbError: error });
      throw new AppError('Failed to fetch free agents', 500);
    }

    logger.info('[leagues] GET /:id/free-agents — success', { leagueId: id, returned: data?.length });
    res.json(data || []);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] GET /:id/free-agents — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

// ── POST /api/leagues/:id/roster/drop — Drop a player ────────────────────────
router.post('/:id/roster/drop', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  const { id } = req.params;
  logger.info('[leagues] POST /:id/roster/drop', { userId: uid, leagueId: id, body: req.body });
  try {
    const teamId = await requireMembership(id, uid);
    const { playerId } = z.object({ playerId: z.string() }).parse(req.body);

    logger.debug('[leagues] POST /:id/roster/drop — deleting roster entry', { teamId, playerId });
    const { error } = await supabaseAdmin
      .from('rosters')
      .delete()
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .eq('week', 0);

    if (error) {
      logger.error('[leagues] POST /:id/roster/drop — DB error', { teamId, playerId, dbError: error });
      throw new AppError('Failed to drop player', 500);
    }

    logger.debug('[leagues] POST /:id/roster/drop — logging transaction', { teamId, playerId });
    await supabaseAdmin.from('transactions').insert({
      league_id: id,
      type: 'drop',
      team_id: teamId,
      player_id: playerId,
      status: 'complete',
      week: 0
    });

    logger.info('[leagues] POST /:id/roster/drop — success', { teamId, playerId });
    res.json({ success: true });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[leagues] POST /:id/roster/drop — unexpected error', { leagueId: id, userId: uid, error: err });
    next(err);
  }
});

export default router;

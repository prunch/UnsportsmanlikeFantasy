// DEBUG-ONLY: REMOVE FOR PROD
// This file contains debug/testing routes for the fantasy football draft system.
// Enabled only when DEBUG_DRAFT=true in environment.

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';

const router = Router();

// ============================================================
// HELPERS (DEBUG-ONLY)
// ============================================================

// DEBUG-ONLY: REMOVE FOR PROD
function generateInviteCode(): string {
  return 'DBG' + Math.random().toString(36).substring(2, 7).toUpperCase();
}

// DEBUG-ONLY: REMOVE FOR PROD
/** Snake draft: given pick number (1-based) and team count, return team index (0-based). */
function snakeDraftTeamIndex(pickNumber: number, teamCount: number): number {
  const round = Math.ceil(pickNumber / teamCount);
  const positionInRound = (pickNumber - 1) % teamCount;
  if (round % 2 === 0) {
    return teamCount - 1 - positionInRound;
  }
  return positionInRound;
}

// DEBUG-ONLY: REMOVE FOR PROD
/** Need-based position priority for bot draft picks. */
function getBotPickPosition(
  picksByTeam: Record<string, string[]>
): string[] {
  // Returns ordered list of desired positions
  const qbCount = picksByTeam['QB']?.length || 0;
  const rbCount = picksByTeam['RB']?.length || 0;
  const wrCount = picksByTeam['WR']?.length || 0;
  const teCount = picksByTeam['TE']?.length || 0;
  const kCount = picksByTeam['K']?.length || 0;
  const defCount = picksByTeam['DEF']?.length || 0;

  const positions: string[] = [];
  if (qbCount < 1) positions.push('QB');
  if (rbCount < 2) positions.push('RB');
  if (wrCount < 2) positions.push('WR');
  if (teCount < 1) positions.push('TE');
  if (kCount < 1) positions.push('K');
  if (defCount < 1) positions.push('DEF');
  // Fill bench with balanced needs
  if (rbCount < 4) positions.push('RB');
  if (wrCount < 4) positions.push('WR');
  if (qbCount < 2) positions.push('QB');
  // Fallback: any position
  positions.push('QB', 'RB', 'WR', 'TE', 'K', 'DEF');
  return positions;
}

// ============================================================
// ROUTES (DEBUG-ONLY)
// ============================================================

// DEBUG-ONLY: REMOVE FOR PROD
// POST /api/debug/create-dummy-league
// Body: { userId?: string, leagueName?: string }
// Creates a league with one real user + 9 bot teams, puts it in draft status.
router.post('/create-dummy-league', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, leagueName } = req.body as { userId?: string; leagueName?: string };
    const leagueId = uuidv4();
    const inviteCode = generateInviteCode();
    const name = leagueName || `Debug League ${Date.now()}`;

    logger.info(`[DEBUG] Creating dummy league: ${name}`);

    // Create league
    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .insert({
        id: leagueId,
        name,
        commissioner_id: userId || '00000000-0000-0000-0000-000000000001',
        max_teams: 10,
        draft_type: 'snake',
        draft_timer_seconds: 90,
        trade_deadline_week: 11,
        invite_code: inviteCode,
        status: 'draft',
        season: new Date().getFullYear(),
        current_week: 0,
        draft_current_pick: 0,
        draft_started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (leagueError) {
      throw new Error(`Failed to create league: ${leagueError.message}`);
    }

    const botNames = [
      'Alpha Wolves', 'Beta Bears', 'Gamma Gorillas',
      'Delta Dolphins', 'Epsilon Eagles', 'Zeta Zebras',
      'Eta Hamsters', 'Theta Thunderbirds', 'Iota Iguanas'
    ];

    const teamInserts = [];

    // Real user team (pick position 1)
    if (userId) {
      teamInserts.push({
        id: uuidv4(),
        league_id: leagueId,
        user_id: userId,
        team_name: 'My Team',
        draft_position: 1,
        waiver_priority: 10
      });
    }

    // Bot teams
    for (let i = 0; i < 9; i++) {
      const botUserId = `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`;
      teamInserts.push({
        id: uuidv4(),
        league_id: leagueId,
        user_id: botUserId,
        team_name: botNames[i] || `Bot Team ${i + 1}`,
        draft_position: userId ? i + 2 : i + 1,
        waiver_priority: userId ? 9 - i : 10 - i
      });
    }

    const { error: teamsError } = await supabaseAdmin
      .from('teams')
      .insert(teamInserts);

    if (teamsError) {
      // Rollback league
      await supabaseAdmin.from('leagues').delete().eq('id', leagueId);
      throw new Error(`Failed to create teams: ${teamsError.message}`);
    }

    logger.info(`[DEBUG] Created dummy league ${leagueId} with ${teamInserts.length} teams`);

    res.status(201).json({
      success: true,
      league,
      teamCount: teamInserts.length,
      message: `Created "${name}" with ${teamInserts.length} teams (${userId ? '1 real + 9 bots' : '10 bots'})`
    });
  } catch (err) {
    next(err);
  }
});

// DEBUG-ONLY: REMOVE FOR PROD
// POST /api/debug/reset-draft/:id
// Clears all draft picks and rosters, resets pick counter to 0
router.post('/reset-draft/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    logger.info(`[DEBUG] Resetting draft for league ${id}`);

    // Get all teams in league
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('league_id', id);

    const teamIds = (teams || []).map((t: { id: string }) => t.id);

    // Delete all draft picks
    const { error: picksError } = await supabaseAdmin
      .from('draft_picks')
      .delete()
      .eq('league_id', id);

    if (picksError) throw new Error(`Failed to delete picks: ${picksError.message}`);

    // Delete all rosters for these teams
    if (teamIds.length > 0) {
      const { error: rostersError } = await supabaseAdmin
        .from('rosters')
        .delete()
        .in('team_id', teamIds);

      if (rostersError) throw new Error(`Failed to delete rosters: ${rostersError.message}`);
    }

    // Reset pick counter on league, keep status as draft
    const { error: leagueError } = await supabaseAdmin
      .from('leagues')
      .update({ draft_current_pick: 0, draft_started_at: new Date().toISOString() })
      .eq('id', id);

    if (leagueError) throw new Error(`Failed to reset league: ${leagueError.message}`);

    logger.info(`[DEBUG] Draft reset for league ${id}`);

    res.json({ success: true, message: `Draft reset for league ${id}. All picks cleared.` });
  } catch (err) {
    next(err);
  }
});

// DEBUG-ONLY: REMOVE FOR PROD
// POST /api/debug/force-pick/:id
// Forces the current team (bot) to make a need-based pick.
// Uses snake draft order and need-based position priority: QB→RB→WR→TE→K→DEF
router.post('/force-pick/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Get league state
    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('id', id)
      .single();

    if (leagueError || !league) {
      return res.status(404).json({ error: 'League not found' });
    }

    const typedLeague = league as {
      status: string;
      max_teams: number;
      draft_current_pick: number;
    };

    if (typedLeague.status !== 'draft') {
      return res.status(400).json({ error: `League is not in draft mode (status: ${typedLeague.status})` });
    }

    // Get all teams sorted by draft position
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, team_name, draft_position')
      .eq('league_id', id)
      .order('draft_position', { ascending: true });

    if (!teams || teams.length === 0) {
      return res.status(400).json({ error: 'No teams found in league' });
    }

    const teamCount = teams.length;
    const currentPickNumber = typedLeague.draft_current_pick || 0;
    const totalPicks = teamCount * 15;

    if (currentPickNumber >= totalPicks) {
      return res.status(400).json({ error: 'Draft is already complete' });
    }

    // Determine which team picks next
    const nextPickIdx = snakeDraftTeamIndex(currentPickNumber + 1, teamCount);
    const pickingTeam = (teams as Array<{ id: string; team_name: string; draft_position: number }>)[nextPickIdx];

    if (!pickingTeam) {
      return res.status(400).json({ error: 'Could not determine picking team' });
    }

    // Get already drafted player IDs
    const { data: existingPicks } = await supabaseAdmin
      .from('draft_picks')
      .select('player_id, team_id, player:players(position)')
      .eq('league_id', id);

    const draftedPlayerIds = (existingPicks || []).map((p: { player_id: string }) => p.player_id);

    // Count positions already drafted by this team
    const positionCounts: Record<string, string[]> = {
      QB: [], RB: [], WR: [], TE: [], K: [], DEF: []
    };

    for (const pick of (existingPicks || []) as Array<{ team_id: string; player: unknown }>) {
      const pickPlayer = Array.isArray(pick.player) ? pick.player[0] : pick.player;
      if (pick.team_id === pickingTeam.id && pickPlayer && typeof pickPlayer === 'object') {
        const pos = (pickPlayer as { position: string }).position;
        if (!positionCounts[pos]) positionCounts[pos] = [];
        positionCounts[pos]!.push(pos);
      }
    }

    // Determine desired positions in priority order
    const desiredPositions = getBotPickPosition(positionCounts);

    // Try each desired position until we find an available player
    let chosenPlayer: { id: string; name: string; position: string } | null = null;

    for (const pos of desiredPositions) {
      if (chosenPlayer) break;

      let query = supabaseAdmin
        .from('players')
        .select('id, name, position, adp')
        .eq('position', pos)
        .order('adp', { ascending: true })
        .limit(50);

      if (draftedPlayerIds.length > 0) {
        // Filter out already drafted players
        query = query.not('id', 'in', `(${draftedPlayerIds.map(id => `"${id}"`).join(',')})`);
      }

      const { data: players } = await query;

      if (players && players.length > 0) {
        chosenPlayer = (players as Array<{ id: string; name: string; position: string }>)[0];
      }
    }

    if (!chosenPlayer) {
      return res.status(400).json({ error: 'No available players found to pick' });
    }

    // Determine round and pick in round
    const round = Math.ceil((currentPickNumber + 1) / teamCount);

    // Insert draft pick
    const { data: pick, error: pickError } = await supabaseAdmin
      .from('draft_picks')
      .insert({
        league_id: id,
        team_id: pickingTeam.id,
        player_id: chosenPlayer.id,
        round,
        pick: currentPickNumber + 1,
        is_auto: true,
        picked_at: new Date().toISOString()
      })
      .select()
      .single();

    if (pickError) {
      throw new Error(`Failed to record pick: ${pickError.message}`);
    }

    // Add to roster
    const { data: existingRoster } = await supabaseAdmin
      .from('rosters')
      .select('slot')
      .eq('team_id', pickingTeam.id)
      .eq('week', 0);

    const usedSlots = new Set((existingRoster || []).map((r: { slot: string }) => r.slot));
    const pos = chosenPlayer.position;

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
        team_id: pickingTeam.id,
        player_id: chosenPlayer.id,
        slot: targetSlot,
        week: 0,
        acquired_via: 'draft'
      });

    // Advance pick counter
    const newPickNumber = currentPickNumber + 1;
    const draftComplete = newPickNumber >= totalPicks;

    if (draftComplete) {
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

    logger.info(`[DEBUG] Force pick: ${pickingTeam.team_name} drafted ${chosenPlayer.name} (${chosenPlayer.position}) pick #${newPickNumber}`);

    res.json({
      success: true,
      pick,
      team: pickingTeam,
      player: chosenPlayer,
      pickNumber: newPickNumber,
      round,
      slot: targetSlot,
      draftComplete,
      remainingPicks: totalPicks - newPickNumber
    });
  } catch (err) {
    next(err);
  }
});

// DEBUG-ONLY: REMOVE FOR PROD
// GET /api/debug/league-state/:id
// Returns full state of the league including teams, picks, and roster counts.
router.get('/league-state/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('id', id)
      .single();

    if (leagueError || !league) {
      return res.status(404).json({ error: 'League not found' });
    }

    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, team_name, draft_position, waiver_priority, user_id')
      .eq('league_id', id)
      .order('draft_position', { ascending: true });

    const { data: picks } = await supabaseAdmin
      .from('draft_picks')
      .select('id, team_id, player_id, round, pick, is_auto, picked_at, player:players(name, position)')
      .eq('league_id', id)
      .order('pick', { ascending: true });

    const { data: rosterCounts } = await supabaseAdmin
      .from('rosters')
      .select('team_id')
      .in('team_id', (teams || []).map((t: { id: string }) => t.id))
      .eq('week', 0);

    // Count roster entries per team
    const rosterByTeam: Record<string, number> = {};
    for (const r of (rosterCounts || []) as Array<{ team_id: string }>) {
      rosterByTeam[r.team_id] = (rosterByTeam[r.team_id] || 0) + 1;
    }

    const teamCount = (teams || []).length;
    const totalPicks = teamCount * 15;
    const typedLeague = league as { draft_current_pick: number; status: string };
    const currentPick = typedLeague.draft_current_pick || 0;

    res.json({
      league,
      teams: (teams || []).map((t: { id: string; team_name: string; draft_position: number; waiver_priority: number; user_id: string }) => ({
        ...t,
        rosterCount: rosterByTeam[t.id] || 0,
        pickCount: (picks || []).filter((p: { team_id: string }) => p.team_id === t.id).length
      })),
      picks: picks || [],
      summary: {
        totalPicks,
        completedPicks: currentPick,
        remainingPicks: totalPicks - currentPick,
        draftComplete: typedLeague.status === 'active' || currentPick >= totalPicks,
        currentPickNumber: currentPick + 1
      }
    });
  } catch (err) {
    next(err);
  }
});

// DEBUG-ONLY: REMOVE FOR PROD
// DELETE /api/debug/cleanup/:id
// Completely deletes a debug league and all associated data.
router.delete('/cleanup/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    logger.info(`[DEBUG] Cleaning up league ${id}`);

    // Get teams first
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('league_id', id);

    const teamIds = (teams || []).map((t: { id: string }) => t.id);

    // Delete in order: rosters, draft_picks, waiver_claims, transactions, teams, league
    if (teamIds.length > 0) {
      await supabaseAdmin.from('rosters').delete().in('team_id', teamIds);
      await supabaseAdmin.from('waiver_claims').delete().eq('league_id', id);
      await supabaseAdmin.from('transactions').delete().eq('league_id', id);
    }

    await supabaseAdmin.from('draft_picks').delete().eq('league_id', id);
    await supabaseAdmin.from('teams').delete().eq('league_id', id);

    const { error: leagueError } = await supabaseAdmin
      .from('leagues')
      .delete()
      .eq('id', id);

    if (leagueError) throw new Error(`Failed to delete league: ${leagueError.message}`);

    logger.info(`[DEBUG] League ${id} deleted`);

    res.json({ success: true, message: `League ${id} and all associated data deleted.` });
  } catch (err) {
    next(err);
  }
});

export default router; // DEBUG-ONLY: REMOVE FOR PROD

import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// ============================================================
// HELPERS
// ============================================================

async function requireMembership(leagueId: string, userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single();
  if (error || !data) throw new AppError('Not a member of this league', 403);
}

const STARTING_SLOTS = ['QB', 'RB', 'RB2', 'WR', 'WR2', 'WR3', 'TE', 'FLEX', 'K', 'DEF'];

type RosterEntry = {
  id: string;
  team_id: string;
  slot: string;
  player: {
    id: string;
    name: string;
    position: string;
    nfl_team: string | null;
    status: string | null;
    headshot_url: string | null;
  } | null;
};

type ProjectionRow = {
  player_id: string;
  season: number;
  proj_fantasy_pts_ppr: number | null;
  proj_ppg_ppr: number | null;
  bye_week: number | null;
};

/** Fetch starters + projections for a list of team IDs in one league. */
async function loadLineups(leagueId: string, teamIds: string[], season: number) {
  // 1) rosters, starters only (week=0 is the active roster)
  const { data: rosters, error: rostersError } = await supabaseAdmin
    .from('rosters')
    .select(`
      id, team_id, slot,
      player:players(id, name, position, nfl_team, status, headshot_url)
    `)
    .in('team_id', teamIds)
    .eq('week', 0)
    .in('slot', STARTING_SLOTS);

  if (rostersError) throw new AppError('Failed to fetch starters', 500);

  const rows = (rosters || []) as unknown as RosterEntry[];
  const playerIds = rows
    .map((r) => (r.player ? r.player.id : null))
    .filter((id): id is string => !!id);

  // 2) projections for those players, this season
  const projectionsById: Record<string, ProjectionRow> = {};
  if (playerIds.length > 0) {
    const { data: projections } = await supabaseAdmin
      .from('player_projections')
      .select('player_id, season, proj_fantasy_pts_ppr, proj_ppg_ppr, bye_week')
      .in('player_id', playerIds)
      .eq('season', season);

    for (const proj of (projections || []) as ProjectionRow[]) {
      projectionsById[proj.player_id] = proj;
    }
  }

  // 3) group rosters by team, attach projection, compute total
  const lineupByTeam: Record<string, {
    starters: Array<{
      roster_id: string;
      slot: string;
      player: RosterEntry['player'];
      projection: ProjectionRow | null;
    }>;
    projected_total: number;
  }> = {};

  for (const teamId of teamIds) {
    lineupByTeam[teamId] = { starters: [], projected_total: 0 };
  }

  for (const row of rows) {
    const teamLineup = lineupByTeam[row.team_id];
    if (!teamLineup) continue;
    const projection = row.player ? projectionsById[row.player.id] || null : null;
    teamLineup.starters.push({
      roster_id: row.id,
      slot: row.slot,
      player: row.player,
      projection,
    });
    if (projection?.proj_ppg_ppr != null) {
      teamLineup.projected_total += Number(projection.proj_ppg_ppr) || 0;
    }
  }

  // Sort each team's lineup by the canonical slot order
  const slotOrder: Record<string, number> = {};
  STARTING_SLOTS.forEach((s, i) => { slotOrder[s] = i; });
  for (const teamId of teamIds) {
    const lineup = lineupByTeam[teamId];
    if (lineup) {
      lineup.starters.sort((a, b) => (slotOrder[a.slot] ?? 99) - (slotOrder[b.slot] ?? 99));
      // round projected_total to 1 decimal
      lineup.projected_total = Math.round(lineup.projected_total * 10) / 10;
    }
  }

  return lineupByTeam;
}

// ============================================================
// GET /api/leagues/:id/matchups/current
//   List of current-week matchups with projected totals.
//   Primary data source for the new "This Week's Matchups" page.
// ============================================================
router.get('/:id/matchups/current', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: leagueId } = req.params;
    await requireMembership(leagueId, req.user!.id);

    const weekParam = req.query.week as string | undefined;

    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('current_week, season, status')
      .eq('id', leagueId)
      .single();

    if (leagueError || !league) throw new AppError('League not found', 404);

    const week = weekParam ? parseInt(weekParam, 10) : (league.current_week || 1);

    const { data: matchups, error: matchupsError } = await supabaseAdmin
      .from('matchups')
      .select(`
        id, week, home_score, away_score, is_final, is_playoff, is_consolation,
        winner_team_id,
        home_team:teams!matchups_home_team_id_fkey(
          id, team_name, wins, losses, ties,
          user:users(id, display_name, avatar_url)
        ),
        away_team:teams!matchups_away_team_id_fkey(
          id, team_name, wins, losses, ties,
          user:users(id, display_name, avatar_url)
        )
      `)
      .eq('league_id', leagueId)
      .eq('week', week)
      .order('created_at', { ascending: true });

    if (matchupsError) throw new AppError('Failed to fetch matchups', 500);

    // Collect all team IDs so we can load projections in one batch
    const teamIds: string[] = [];
    for (const m of matchups || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mu = m as any;
      const home = Array.isArray(mu.home_team) ? mu.home_team[0] : mu.home_team;
      const away = Array.isArray(mu.away_team) ? mu.away_team[0] : mu.away_team;
      if (home?.id) teamIds.push(home.id);
      if (away?.id) teamIds.push(away.id);
    }

    const lineupByTeam = teamIds.length > 0
      ? await loadLineups(leagueId, teamIds, league.season)
      : {};

    const enriched = (matchups || []).map((m) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mu = m as any;
      const home = Array.isArray(mu.home_team) ? mu.home_team[0] : mu.home_team;
      const away = Array.isArray(mu.away_team) ? mu.away_team[0] : mu.away_team;
      return {
        ...mu,
        home_team: home,
        away_team: away,
        home_projected_total: home?.id ? (lineupByTeam[home.id]?.projected_total ?? 0) : 0,
        away_projected_total: away?.id ? (lineupByTeam[away.id]?.projected_total ?? 0) : 0,
      };
    });

    res.json({
      week,
      season: league.season,
      league_status: league.status,
      matchups: enriched,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/leagues/:id/matchups/:matchupId
//   One matchup, both teams' starting lineups with projections.
//   Used by MatchupDetailPage, which is the card-play surface.
// ============================================================
router.get('/:id/matchups/:matchupId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id: leagueId, matchupId } = req.params;
    await requireMembership(leagueId, req.user!.id);

    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('current_week, season, status')
      .eq('id', leagueId)
      .single();

    if (leagueError || !league) throw new AppError('League not found', 404);

    const { data: matchup, error: matchupError } = await supabaseAdmin
      .from('matchups')
      .select(`
        id, league_id, week, home_score, away_score, is_final, is_playoff, is_consolation,
        winner_team_id,
        home_team:teams!matchups_home_team_id_fkey(
          id, team_name, wins, losses, ties, points_for,
          user:users(id, display_name, avatar_url)
        ),
        away_team:teams!matchups_away_team_id_fkey(
          id, team_name, wins, losses, ties, points_for,
          user:users(id, display_name, avatar_url)
        )
      `)
      .eq('id', matchupId)
      .single();

    if (matchupError || !matchup) throw new AppError('Matchup not found', 404);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mu = matchup as any;
    if (mu.league_id !== leagueId) throw new AppError('Matchup not in this league', 403);

    const home = Array.isArray(mu.home_team) ? mu.home_team[0] : mu.home_team;
    const away = Array.isArray(mu.away_team) ? mu.away_team[0] : mu.away_team;

    const teamIds: string[] = [];
    if (home?.id) teamIds.push(home.id);
    if (away?.id) teamIds.push(away.id);

    const lineupByTeam = teamIds.length > 0
      ? await loadLineups(leagueId, teamIds, league.season)
      : {};

    res.json({
      week: mu.week,
      season: league.season,
      league_status: league.status,
      matchup: {
        ...mu,
        home_team: home,
        away_team: away,
      },
      home_lineup: home?.id ? lineupByTeam[home.id] : null,
      away_lineup: away?.id ? lineupByTeam[away.id] : null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

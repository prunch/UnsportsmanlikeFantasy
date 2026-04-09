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

// ============================================================
// SCOREBOARD ROUTES
// ============================================================

// GET /api/leagues/:id/scoreboard — Current week matchups with scores
router.get('/:id/scoreboard', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireMembership(id, req.user!.id);

    const weekParam = req.query.week as string | undefined;

    // Get league for current week
    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('current_week, season, status')
      .eq('id', id)
      .single();

    if (leagueError || !league) throw new AppError('League not found', 404);

    const week = weekParam ? parseInt(weekParam, 10) : (league.current_week || 1);

    // Get matchups for this week
    const { data: matchups, error: matchupsError } = await supabaseAdmin
      .from('matchups')
      .select(`
        id, week, home_score, away_score, is_final, is_playoff, is_consolation,
        winner_team_id,
        home_team:teams!matchups_home_team_id_fkey(
          id, team_name,
          user:users(id, display_name, avatar_url)
        ),
        away_team:teams!matchups_away_team_id_fkey(
          id, team_name,
          user:users(id, display_name, avatar_url)
        )
      `)
      .eq('league_id', id)
      .eq('week', week)
      .order('created_at', { ascending: true });

    if (matchupsError) throw new AppError('Failed to fetch matchups', 500);

    // Get live scores for each team this week
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('league_id', id);

    const teamIds = (teams || []).map((t: { id: string }) => t.id);

    // Get live player scores for this week — for active rosters
    const playerScoresByTeam: Record<string, number> = {};

    if (teamIds.length > 0 && league.current_week === week) {
      // Get starting lineup for each team
      const { data: rosters } = await supabaseAdmin
        .from('rosters')
        .select('team_id, player_id, slot')
        .in('team_id', teamIds)
        .eq('week', 0)
        .not('slot', 'in', '(BN1,BN2,BN3,BN4,BN5,BN6,IR1,IR2)');

      if (rosters && rosters.length > 0) {
        const playerIds = rosters.map((r: { player_id: string }) => r.player_id);

        // Get live scores from scores table
        const { data: scores } = await supabaseAdmin
          .from('scores')
          .select('player_id, final_points, base_points, card_modifier, is_live, is_final')
          .in('player_id', playerIds)
          .eq('league_id', id)
          .eq('week', week)
          .eq('season', league.season);

        const scoreMap: Record<string, number> = {};
        for (const score of scores || []) {
          const s = score as { player_id: string; final_points: number };
          scoreMap[s.player_id] = s.final_points || 0;
        }

        // Sum up scores per team (starting lineup only)
        for (const roster of rosters) {
          const r = roster as { team_id: string; player_id: string };
          if (!playerScoresByTeam[r.team_id]) playerScoresByTeam[r.team_id] = 0;
          playerScoresByTeam[r.team_id] += scoreMap[r.player_id] || 0;
        }
      }
    }

    // Enrich matchups with live scores if it's the current week
    const enrichedMatchups = (matchups || []).map((m) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matchup = m as any;

      const homeTeamId = Array.isArray(matchup.home_team) ? matchup.home_team[0]?.id : matchup.home_team?.id;
      const awayTeamId = Array.isArray(matchup.away_team) ? matchup.away_team[0]?.id : matchup.away_team?.id;

      const liveHomeScore = playerScoresByTeam[homeTeamId] ?? matchup.home_score ?? 0;
      const liveAwayScore = playerScoresByTeam[awayTeamId] ?? matchup.away_score ?? 0;

      return {
        ...m,
        live_home_score: matchup.is_final ? matchup.home_score : liveHomeScore,
        live_away_score: matchup.is_final ? matchup.away_score : liveAwayScore,
        is_live: !matchup.is_final && league.status === 'active'
      };
    });

    res.json({
      week,
      season: league.season,
      leagueStatus: league.status,
      matchups: enrichedMatchups
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/leagues/:id/scoreboard/standings — Full standings
router.get('/:id/scoreboard/standings', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireMembership(id, req.user!.id);

    const { data: teams, error } = await supabaseAdmin
      .from('teams')
      .select(`
        id, team_name, wins, losses, ties, points_for, points_against,
        waiver_priority,
        user:users(id, display_name, avatar_url)
      `)
      .eq('league_id', id)
      .order('wins', { ascending: false })
      .order('points_for', { ascending: false });

    if (error) throw new AppError('Failed to fetch standings', 500);
    res.json(teams || []);
  } catch (err) {
    next(err);
  }
});

// GET /api/leagues/:id/scoreboard/live-players — Live player scores for current week
router.get('/:id/scoreboard/live-players', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireMembership(id, req.user!.id);

    const { data: league } = await supabaseAdmin
      .from('leagues')
      .select('current_week, season')
      .eq('id', id)
      .single();

    if (!league) throw new AppError('League not found', 404);

    const { data: scores, error } = await supabaseAdmin
      .from('scores')
      .select(`
        player_id, base_points, card_modifier, final_points, is_live, is_final, stats_json, updated_at,
        player:players(id, name, position, nfl_team)
      `)
      .eq('league_id', id)
      .eq('week', league.current_week)
      .eq('season', league.season)
      .order('final_points', { ascending: false });

    if (error) throw new AppError('Failed to fetch live scores', 500);
    res.json(scores || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/scoreboard/update-score — Internal: update a player's score (from Tank01 sync)
router.post('/:id/scoreboard/update-score', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'admin') throw new AppError('Admin only', 403);

    const { id } = req.params;
    const { playerId, week, season, basePoints, cardModifier, isFinal, statsJson } = req.body;

    if (!playerId || week === undefined || season === undefined || basePoints === undefined) {
      throw new AppError('Missing required fields: playerId, week, season, basePoints', 400);
    }

    const finalPoints = (parseFloat(basePoints) || 0) + (parseFloat(cardModifier) || 0);

    const { error } = await supabaseAdmin
      .from('scores')
      .upsert({
        player_id: playerId,
        league_id: id,
        week,
        season,
        base_points: parseFloat(basePoints) || 0,
        card_modifier: parseFloat(cardModifier) || 0,
        final_points: finalPoints,
        is_live: !isFinal,
        is_final: isFinal || false,
        stats_json: statsJson || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'player_id,league_id,week,season'
      });

    if (error) throw new AppError(`Failed to update score: ${error.message}`, 500);
    res.json({ success: true, finalPoints });
  } catch (err) {
    next(err);
  }
});

export default router;

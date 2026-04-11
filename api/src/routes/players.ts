import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

// ── GET /api/players ──────────────────────────────────────────────────────────
// Query params:
//   limit         — page size, max 2500, default 50
//   offset        — pagination offset
//   position      — QB/RB/WR/TE/K/DEF or ALL
//   q             — case-insensitive name search
//   sortBy        — "adp" (default) | "value_rank"
//   rankedOnly    — "true" filters to rows with a non-null value_rank
//   withStats     — "true" joins season totals + projections for the Player Stats Grid
//   statsSeason   — integer season to pick season_stats from (default: currentYear-1)
//   projSeason    — integer season to pick projection from (default: currentYear)
//   season        — legacy alias: sets both statsSeason and projSeason to the same year
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const limit = Math.min(parseInt(String(req.query.limit || '50'), 10), 2500);
  const offset = parseInt(String(req.query.offset || '0'), 10);
  const position = req.query.position as string | undefined;
  const q = req.query.q as string | undefined;
  const sortBy = (req.query.sortBy as string | undefined) === 'value_rank' ? 'value_rank' : 'adp';
  const rankedOnly = req.query.rankedOnly === 'true';
  const withStats = req.query.withStats === 'true';
  const now = new Date().getFullYear();
  // Legacy `season` param wins if provided; otherwise stats = last year, proj = this year.
  const legacySeason = req.query.season != null ? parseInt(String(req.query.season), 10) : null;
  const statsSeason = legacySeason ?? parseInt(String(req.query.statsSeason || now - 1), 10);
  const projSeason = legacySeason ?? parseInt(String(req.query.projSeason || now), 10);

  logger.info('[players] GET / — list', { limit, offset, position, q, sortBy, rankedOnly, withStats, statsSeason, projSeason });
  try {
    // Base select — when withStats is set we embed the two new tables via the
    // PostgREST relationship syntax. We alias the joined selects with
    // `!inner`-style filters so we can scope them to the requested season
    // without exploding into multiple rows per player.
    const selectCols = withStats
      ? `id, name, position, nfl_team, status, adp, value_rank, headshot_url, updated_at,
         season_stats:player_season_stats(
           season, games_played, fantasy_points_ppr, fantasy_points_std,
           pass_yds, pass_td, pass_int,
           rush_yds, rush_td,
           targets, rec, rec_yds, rec_td,
           fumbles_lost,
           fg_made, fg_att, fg_long, xp_made, xp_att,
           sacks, def_int, fumbles_recovered, def_td, safeties, points_allowed, yards_allowed
         ),
         projection:player_projections(
           season, proj_fantasy_pts_ppr, proj_fantasy_pts_std,
           proj_games, proj_ppg_ppr, tier, bye_week
         )`
      : 'id, name, position, nfl_team, status, adp, value_rank, headshot_url, updated_at';

    let query = supabaseAdmin
      .from('players')
      .select(selectCols, { count: 'exact' })
      .order(sortBy, { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (position && position !== 'ALL') query = query.eq('position', position);
    if (q) query = query.ilike('name', `%${q}%`);
    if (rankedOnly) query = query.not('value_rank', 'is', null);

    const { data, error, count } = await query;

    if (error) {
      logger.error('[players] GET / — DB error', { dbError: error, limit, offset, position, q });
      throw new AppError('Failed to fetch players', 500);
    }

    // When withStats is set, collapse the embedded arrays into single objects
    // for the requested seasons. PostgREST returns each embed as an array even
    // when we expect at most one row (because there's no FK-declared uniqueness
    // PostgREST can prove at query time). The frontend wants `season_stats` and
    // `projection` as flat objects or null — with stats defaulting to last year
    // and projections defaulting to this year.
    const players = withStats
      ? (data || []).map((row: Record<string, unknown>) => {
          const statsArr = (row.season_stats as Array<Record<string, unknown>> | null) || [];
          const projArr = (row.projection as Array<Record<string, unknown>> | null) || [];
          return {
            ...row,
            season_stats: statsArr.find((s) => s.season === statsSeason) || null,
            projection: projArr.find((p) => p.season === projSeason) || null,
          };
        })
      : data || [];

    logger.debug('[players] GET / — success', { returned: players.length, total: count });
    res.json({ players, total: count ?? 0, limit, offset });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[players] GET / — unexpected error', { error: err });
    next(err);
  }
});

// ── GET /api/players/search ───────────────────────────────────────────────────
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  const q = req.query.q as string | undefined;
  const limit = Math.min(parseInt(String(req.query.limit || '25'), 10), 100);
  const position = req.query.position as string | undefined;

  logger.info('[players] GET /search', { q, limit, position });
  try {
    if (!q || q.trim().length < 2) {
      logger.debug('[players] GET /search — query too short, returning empty');
      return res.json({ players: [] });
    }

    let query = supabaseAdmin
      .from('players')
      .select('id, name, position, nfl_team, status, adp, headshot_url')
      .ilike('name', `%${q.trim()}%`)
      .order('adp', { ascending: true, nullsFirst: false })
      .limit(limit);

    if (position && position !== 'ALL') query = query.eq('position', position);

    const { data, error } = await query;

    if (error) {
      logger.error('[players] GET /search — DB error', { dbError: error, q });
      throw new AppError('Search failed', 500);
    }

    logger.debug('[players] GET /search — success', { q, returned: data?.length });
    res.json({ players: data || [] });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[players] GET /search — unexpected error', { error: err });
    next(err);
  }
});

// ── GET /api/players/available ────────────────────────────────────────────────
router.get('/available', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const leagueId = req.query.leagueId as string | undefined;
  const position = req.query.position as string | undefined;
  const q = req.query.q as string | undefined;
  const limit = Math.min(parseInt(String(req.query.limit || '100'), 10), 200);
  const offset = parseInt(String(req.query.offset || '0'), 10);

  logger.info('[players] GET /available', { userId: req.user!.id, leagueId, position, q, limit, offset });
  try {
    let rosteredIds: string[] = [];

    if (leagueId) {
      logger.debug('[players] GET /available — fetching teams for league', { leagueId });
      const { data: teams, error: teamsError } = await supabaseAdmin
        .from('teams')
        .select('id')
        .eq('league_id', leagueId);

      if (teamsError) {
        logger.error('[players] GET /available — failed to fetch teams', { leagueId, dbError: teamsError });
      }

      const teamIds = (teams || []).map((t: { id: string }) => t.id);
      logger.debug('[players] GET /available — found teams', { leagueId, teamCount: teamIds.length });

      if (teamIds.length > 0) {
        const { data: rostered, error: rosteredError } = await supabaseAdmin
          .from('rosters')
          .select('player_id')
          .in('team_id', teamIds)
          .eq('week', 0);

        if (rosteredError) {
          logger.error('[players] GET /available — failed to fetch rosters', { dbError: rosteredError });
        }

        rosteredIds = (rostered || []).map((r: { player_id: string }) => r.player_id);
        logger.debug('[players] GET /available — rostered player count', { count: rosteredIds.length });
      }
    }

    let query = supabaseAdmin
      .from('players')
      .select('id, name, position, nfl_team, status, adp, headshot_url', { count: 'exact' })
      .order('adp', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (rosteredIds.length > 0) query = query.not('id', 'in', `(${rosteredIds.join(',')})`);
    if (position && position !== 'ALL') query = query.eq('position', position);
    if (q) query = query.ilike('name', `%${q}%`);

    const { data, error, count } = await query;

    if (error) {
      logger.error('[players] GET /available — DB query error', { dbError: error });
      throw new AppError('Failed to fetch available players', 500);
    }

    logger.debug('[players] GET /available — success', { returned: data?.length, total: count });
    res.json({ players: data || [], total: count ?? 0, limit, offset });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[players] GET /available — unexpected error', { error: err });
    next(err);
  }
});

// ── GET /api/players/count ────────────────────────────────────────────────────
router.get('/count', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('[players] GET /count');
  try {
    const { count, error } = await supabaseAdmin
      .from('players')
      .select('*', { count: 'exact', head: true });

    if (error) {
      logger.error('[players] GET /count — DB error', { dbError: error });
      throw new AppError('Failed to count players', 500);
    }

    logger.debug('[players] GET /count — success', { count });
    res.json({ count: count ?? 0 });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[players] GET /count — unexpected error', { error: err });
    next(err);
  }
});

// ── GET /api/players/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  logger.info('[players] GET /:id', { playerId: id });
  try {
    const { data, error } = await supabaseAdmin
      .from('players')
      .select('id, name, position, nfl_team, status, adp, headshot_url, jersey_number, updated_at')
      .eq('id', id)
      .single();

    if (error || !data) {
      logger.warn('[players] GET /:id — player not found', { playerId: id, dbError: error });
      throw new AppError('Player not found', 404);
    }

    logger.debug('[players] GET /:id — success', { playerId: id, name: (data as { name: string }).name });
    res.json(data);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[players] GET /:id — unexpected error', { playerId: id, error: err });
    next(err);
  }
});

export default router;

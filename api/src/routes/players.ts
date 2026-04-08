import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// ============================================================
// GET /api/players
// List all players with optional pagination, position filter, and search
// Query params: limit, offset, position, q
// ============================================================
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10), 200);
    const offset = parseInt(String(req.query.offset || '0'), 10);
    const position = req.query.position as string | undefined;
    const q = req.query.q as string | undefined;

    let query = supabaseAdmin
      .from('players')
      .select('id, name, position, nfl_team, status, adp, headshot_url, updated_at', { count: 'exact' })
      .order('adp', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (position && position !== 'ALL') {
      query = query.eq('position', position);
    }

    if (q) {
      query = query.ilike('name', `%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new AppError('Failed to fetch players', 500);

    res.json({
      players: data || [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/players/search?q=patrick
// Search players by name (convenience endpoint)
// ============================================================
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query.q as string | undefined;
    if (!q || q.trim().length < 2) {
      return res.json({ players: [] });
    }

    const limit = Math.min(parseInt(String(req.query.limit || '25'), 10), 100);
    const position = req.query.position as string | undefined;

    let query = supabaseAdmin
      .from('players')
      .select('id, name, position, nfl_team, status, adp, headshot_url')
      .ilike('name', `%${q.trim()}%`)
      .order('adp', { ascending: true, nullsFirst: false })
      .limit(limit);

    if (position && position !== 'ALL') {
      query = query.eq('position', position);
    }

    const { data, error } = await query;
    if (error) throw new AppError('Search failed', 500);

    res.json({ players: data || [] });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/players/available?leagueId=xxx
// Players not on any roster in the given league
// Optional: position, q (name search), limit, offset
// ============================================================
router.get('/available', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const leagueId = req.query.leagueId as string | undefined;
    const position = req.query.position as string | undefined;
    const q = req.query.q as string | undefined;
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10), 200);
    const offset = parseInt(String(req.query.offset || '0'), 10);

    let rosteredIds: string[] = [];

    if (leagueId) {
      // Get all teams in the league
      const { data: teams } = await supabaseAdmin
        .from('teams')
        .select('id')
        .eq('league_id', leagueId);

      const teamIds = (teams || []).map((t: { id: string }) => t.id);

      if (teamIds.length > 0) {
        const { data: rostered } = await supabaseAdmin
          .from('rosters')
          .select('player_id')
          .in('team_id', teamIds)
          .eq('week', 0);

        rosteredIds = (rostered || []).map((r: { player_id: string }) => r.player_id);
      }
    }

    let query = supabaseAdmin
      .from('players')
      .select('id, name, position, nfl_team, status, adp, headshot_url', { count: 'exact' })
      .order('adp', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (rosteredIds.length > 0) {
      query = query.not('id', 'in', `(${rosteredIds.join(',')})`);
    }

    if (position && position !== 'ALL') {
      query = query.eq('position', position);
    }

    if (q) {
      query = query.ilike('name', `%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new AppError('Failed to fetch available players', 500);

    res.json({
      players: data || [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/players/count
// Returns total player count in the database
// ============================================================
router.get('/count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count, error } = await supabaseAdmin
      .from('players')
      .select('*', { count: 'exact', head: true });

    if (error) throw new AppError('Failed to count players', 500);
    res.json({ count: count ?? 0 });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/players/:id
// Get a single player by ID
// ============================================================
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('players')
      .select('id, name, position, nfl_team, status, adp, headshot_url, jersey_number, updated_at')
      .eq('id', id)
      .single();

    if (error || !data) throw new AppError('Player not found', 404);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;

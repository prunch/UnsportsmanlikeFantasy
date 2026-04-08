import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';

const router = Router();

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

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// GET /api/leagues
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
    res.json(data?.map(d => d.league) || []);
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

    // Create league
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

// GET /api/leagues/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Check membership
    const { data: membership } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('league_id', id)
      .eq('user_id', req.user!.id)
      .single();

    if (!membership) throw new AppError('Not a member of this league', 403);

    const { data: league, error } = await supabaseAdmin
      .from('leagues')
      .select(`
        *,
        teams(
          id, team_name, wins, losses, points_for, points_against,
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

// POST /api/leagues/:id/join — Join by ID (with invite code)
router.post('/join', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = joinLeagueSchema.parse(req.body);

    // Find league by invite code
    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('invite_code', body.inviteCode.toUpperCase())
      .single();

    if (leagueError || !league) throw new AppError('Invalid invite code', 404);
    if (league.status !== 'setup') throw new AppError('League is not accepting new members', 400);

    // Count current teams
    const { count } = await supabaseAdmin
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league.id);

    if ((count || 0) >= league.max_teams) throw new AppError('League is full', 400);

    // Check already joined
    const { data: existing } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('league_id', league.id)
      .eq('user_id', req.user!.id)
      .single();

    if (existing) throw new AppError('Already a member of this league', 409);

    // Create team
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

export default router;

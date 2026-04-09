import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  teamName: z.string().min(2).max(50).optional(),
  avatarUrl: z.string().url().optional()
});

// GET /api/users/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, display_name, team_name, avatar_url, role, created_at')
      .eq('id', req.user!.id)
      .single();

    if (error || !data) throw new AppError('User not found', 404);

    res.json({
      id: data.id,
      email: data.email,
      displayName: data.display_name,
      teamName: data.team_name,
      avatarUrl: data.avatar_url,
      role: data.role,
      createdAt: data.created_at
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/me
router.patch('/me', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = updateProfileSchema.parse(req.body);
    const updates: Record<string, unknown> = {};

    if (body.displayName) updates.display_name = body.displayName;
    if (body.teamName) updates.team_name = body.teamName;
    if (body.avatarUrl) updates.avatar_url = body.avatarUrl;

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', req.user!.id)
      .select()
      .single();

    if (error) throw new AppError('Failed to update profile', 500);

    res.json({
      id: data.id,
      email: data.email,
      displayName: data.display_name,
      teamName: data.team_name,
      avatarUrl: data.avatar_url
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/me/leagues
router.get('/me/leagues', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select(`
        id,
        team_name,
        league:leagues(
          id,
          name,
          status,
          season,
          max_teams,
          current_week,
          commissioner_id
        )
      `)
      .eq('user_id', req.user!.id);

    if (error) throw new AppError('Failed to fetch leagues', 500);

    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// DRAFT ORDER PREFERENCES
// ============================================================

const VALID_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;

const draftOrderSchema = z.object({
  draftOrder: z
    .array(z.enum(VALID_POSITIONS))
    .length(6, 'Must include all 6 positions exactly once')
    .refine(
      (arr) => new Set(arr).size === arr.length,
      'Each position must appear exactly once'
    ),
  autoPickEnabled: z.boolean().optional()
});

/**
 * GET /api/users/me/draft-order/:leagueId
 * Returns the user's draft order preferences for a specific league team.
 */
router.get(
  '/me/draft-order/:leagueId',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { leagueId } = req.params;

      const { data: team, error } = await supabaseAdmin
        .from('teams')
        .select('id, draft_order, auto_pick_enabled')
        .eq('league_id', leagueId)
        .eq('user_id', req.user!.id)
        .single();

      if (error || !team) throw new AppError('Team not found in this league', 404);

      res.json({
        teamId: team.id,
        draftOrder: team.draft_order ?? ['RB', 'WR', 'QB', 'TE', 'K', 'DEF'],
        autoPickEnabled: team.auto_pick_enabled ?? false
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/users/me/draft-order/:leagueId
 * Saves the user's draft order preferences for a specific league team.
 *
 * Body: { draftOrder: string[], autoPickEnabled?: boolean }
 */
router.put(
  '/me/draft-order/:leagueId',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { leagueId } = req.params;
      const body = draftOrderSchema.parse(req.body);

      // Verify the user has a team in this league
      const { data: existingTeam, error: lookupErr } = await supabaseAdmin
        .from('teams')
        .select('id')
        .eq('league_id', leagueId)
        .eq('user_id', req.user!.id)
        .single();

      if (lookupErr || !existingTeam) {
        throw new AppError('Team not found in this league', 404);
      }

      const updates: Record<string, unknown> = {
        draft_order: body.draftOrder
      };
      if (body.autoPickEnabled !== undefined) {
        updates.auto_pick_enabled = body.autoPickEnabled;
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('teams')
        .update(updates)
        .eq('id', existingTeam.id)
        .select('id, draft_order, auto_pick_enabled')
        .single();

      if (updateErr || !updated) throw new AppError('Failed to save draft order', 500);

      res.json({
        teamId: updated.id,
        draftOrder: updated.draft_order,
        autoPickEnabled: updated.auto_pick_enabled
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  teamName: z.string().min(2).max(50).optional(),
  avatarUrl: z.string().url().optional()
});

// ── GET /api/users/me ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  logger.info('[users] GET /me', { userId: uid });
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, display_name, team_name, avatar_url, role, created_at')
      .eq('id', uid)
      .single();

    if (error || !data) {
      logger.error('[users] GET /me — user not found in DB', { userId: uid, dbError: error });
      throw new AppError('User not found', 404);
    }

    logger.debug('[users] GET /me — success', { userId: uid });
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
    if (!(err instanceof AppError)) logger.error('[users] GET /me — unexpected error', { userId: uid, error: err });
    next(err);
  }
});

// ── PATCH /api/users/me ───────────────────────────────────────────────────────
router.patch('/me', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  logger.info('[users] PATCH /me', { userId: uid, body: req.body });
  try {
    const body = updateProfileSchema.parse(req.body);
    const updates: Record<string, unknown> = {};

    if (body.displayName) updates.display_name = body.displayName;
    if (body.teamName) updates.team_name = body.teamName;
    if (body.avatarUrl) updates.avatar_url = body.avatarUrl;

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    logger.debug('[users] PATCH /me — updating', { userId: uid, updates });
    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', uid)
      .select()
      .single();

    if (error) {
      logger.error('[users] PATCH /me — DB update failed', { userId: uid, dbError: error });
      throw new AppError('Failed to update profile', 500);
    }

    logger.info('[users] PATCH /me — success', { userId: uid });
    res.json({
      id: data.id,
      email: data.email,
      displayName: data.display_name,
      teamName: data.team_name,
      avatarUrl: data.avatar_url
    });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[users] PATCH /me — unexpected error', { userId: uid, error: err });
    next(err);
  }
});

// ── GET /api/users/me/leagues ─────────────────────────────────────────────────
router.get('/me/leagues', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const uid = req.user!.id;
  logger.info('[users] GET /me/leagues', { userId: uid });
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
      .eq('user_id', uid);

    if (error) {
      logger.error('[users] GET /me/leagues — DB error', { userId: uid, dbError: error });
      throw new AppError('Failed to fetch leagues', 500);
    }

    logger.debug('[users] GET /me/leagues — success', { userId: uid, count: data?.length });
    res.json(data || []);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[users] GET /me/leagues — unexpected error', { userId: uid, error: err });
    next(err);
  }
});

export default router;

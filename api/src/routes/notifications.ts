import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  leagueId: z.string().uuid().optional(),
  type: z.enum([
    'trade_offer',
    'waiver_result',
    'card_played',
    'lineup_reminder',
    'draft_starting',
    'general'
  ]),
  title: z.string().min(1).max(200),
  body: z.string().max(500).optional()
});

// ============================================================
// USER NOTIFICATION ROUTES
// ============================================================

// GET /api/notifications — Get current user's notifications
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 100);
    const unreadOnly = req.query.unread === 'true';

    let query = supabaseAdmin
      .from('notifications')
      .select('id, type, title, body, is_read, league_id, created_at')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch notifications', 500);
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// GET /api/notifications/unread-count — Quick badge count
router.get('/unread-count', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { count, error } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user!.id)
      .eq('is_read', false);

    if (error) throw new AppError('Failed to count notifications', 500);
    res.json({ count: count || 0 });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/:id/read — Mark a notification read
router.post('/:id/read', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', req.user!.id);

    if (error) throw new AppError('Failed to mark notification as read', 500);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/read-all — Mark all read
router.post('/read-all', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user!.id)
      .eq('is_read', false);

    if (error) throw new AppError('Failed to mark all as read', 500);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notifications/:id — Dismiss a notification
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user!.id);

    if (error) throw new AppError('Failed to dismiss notification', 500);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notifications — Clear all notifications
router.delete('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('user_id', req.user!.id);

    if (error) throw new AppError('Failed to clear notifications', 500);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// INTERNAL — Create notifications (called by other routes)
// ============================================================

export async function createNotification(params: {
  userId: string;
  leagueId?: string;
  type: string;
  title: string;
  body?: string;
}): Promise<void> {
  await supabaseAdmin.from('notifications').insert({
    user_id: params.userId,
    league_id: params.leagueId || null,
    type: params.type,
    title: params.title,
    body: params.body || null
  });
}

// POST /api/notifications/internal/create — Admin-only endpoint to create notifications
router.post('/internal/create', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'admin') throw new AppError('Admin only', 403);
    const body = createNotificationSchema.parse(req.body);

    const { error } = await supabaseAdmin.from('notifications').insert({
      user_id: body.userId,
      league_id: body.leagueId || null,
      type: body.type,
      title: body.title,
      body: body.body || null
    });

    if (error) throw new AppError(`Failed to create notification: ${error.message}`, 500);
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const sendMessageSchema = z.object({
  message: z.string().min(1).max(1000)
});

// ============================================================
// HELPERS
// ============================================================

async function requireMembership(leagueId: string, userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single();
  if (error || !data) throw new AppError('Not a member of this league', 403);
  return data.id;
}

async function requireCommissioner(leagueId: string, userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single();
  if (error || !data) throw new AppError('League not found', 404);
  if (data.commissioner_id !== userId) throw new AppError('Only the commissioner can do this', 403);
}

// ============================================================
// CHAT ROUTES
// ============================================================

// GET /api/leagues/:id/chat — Get chat messages (last 100)
router.get('/:id/chat', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireMembership(id, req.user!.id);

    const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 200);
    const before = req.query.before as string | undefined;

    let query = supabaseAdmin
      .from('chat_messages')
      .select(`
        id, message, created_at,
        user:users(id, display_name, avatar_url)
      `)
      .eq('league_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;
    if (error) throw new AppError('Failed to fetch messages', 500);

    // Return in chronological order
    res.json((data || []).reverse());
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/chat — Send a message
router.post('/:id/chat', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireMembership(id, req.user!.id);

    const body = sendMessageSchema.parse(req.body);

    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        league_id: id,
        user_id: req.user!.id,
        message: body.message.trim()
      })
      .select(`
        id, message, created_at,
        user:users(id, display_name, avatar_url)
      `)
      .single();

    if (error) throw new AppError(`Failed to send message: ${error.message}`, 500);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/leagues/:id/chat/:messageId — Commissioner deletes a message
router.delete('/:id/chat/:messageId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id, messageId } = req.params;
    await requireMembership(id, req.user!.id);
    await requireCommissioner(id, req.user!.id);

    const { error } = await supabaseAdmin
      .from('chat_messages')
      .update({ is_deleted: true })
      .eq('id', messageId)
      .eq('league_id', id);

    if (error) throw new AppError('Failed to delete message', 500);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/leagues/:id/chat/:messageId/own — User deletes their own message
router.delete('/:id/chat/:messageId/own', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id, messageId } = req.params;
    await requireMembership(id, req.user!.id);

    const { data: msg, error: fetchError } = await supabaseAdmin
      .from('chat_messages')
      .select('user_id')
      .eq('id', messageId)
      .eq('league_id', id)
      .single();

    if (fetchError || !msg) throw new AppError('Message not found', 404);
    if ((msg as { user_id: string }).user_id !== req.user!.id) throw new AppError('Not your message', 403);

    const { error } = await supabaseAdmin
      .from('chat_messages')
      .update({ is_deleted: true })
      .eq('id', messageId);

    if (error) throw new AppError('Failed to delete message', 500);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;

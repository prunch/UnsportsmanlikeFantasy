import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';
import { runPlayerSync, runDefenseSync } from '../utils/syncPlayersUtil';

const router = Router();

// All admin routes require admin auth
router.use(requireAdmin);

// GET /api/admin/users
router.get('/users', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string || '1');
    const limit = parseInt(req.query.limit as string || '20');
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin
      .from('users')
      .select('id, email, display_name, role, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new AppError('Failed to fetch users', 500);

    res.json({ users: data, total: count, page, limit });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { role, displayName } = req.body;
    const updates: Record<string, unknown> = {};

    if (role) updates.role = role;
    if (displayName) updates.display_name = displayName;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new AppError('Failed to update user', 500);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.auth.admin.deleteUser(id);
    await supabaseAdmin.from('users').delete().eq('id', id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/leagues
router.get('/leagues', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { data, error, count } = await supabaseAdmin
      .from('leagues')
      .select('*, teams(count)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (error) throw new AppError('Failed to fetch leagues', 500);
    res.json({ leagues: data, total: count });
  } catch (err) {
    next(err);
  }
});

// --- CARD MANAGEMENT ---

const cardSchema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().min(10).max(500),
  target_type: z.enum(['player', 'position', 'all']),
  target_position: z.enum(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'All']).optional(),
  effect_type: z.enum(['buff', 'debuff']),
  modifier_type: z.enum(['absolute', 'percentage']),
  modifier_value: z.number(),
  rarity: z.enum(['common', 'uncommon', 'rare']).default('common'),
  is_active: z.boolean().default(true)
});

// Format a Supabase PostgrestError into a single diagnostic string for the
// AppError message + log the structured error so we can see code/hint/details
// in Render logs when something goes wrong on /admin/cards.
function describeDbError(prefix: string, err: { message?: string; code?: string; hint?: string; details?: string } | null): string {
  if (!err) return prefix;
  console.error(`[admin/cards] ${prefix}`, err);
  const parts = [err.message];
  if (err.code) parts.push(`code=${err.code}`);
  if (err.hint) parts.push(`hint=${err.hint}`);
  return `${prefix}: ${parts.filter(Boolean).join(' | ')}`;
}

// GET /api/admin/cards
router.get('/cards', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('cards')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new AppError(describeDbError('Failed to fetch cards', error), 500);
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/cards
router.post('/cards', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = cardSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('cards')
      .insert(body)
      .select()
      .single();

    if (error) throw new AppError(describeDbError('Failed to create card', error), 500);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/cards/:id (partial update)
router.patch('/cards/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const body = cardSchema.partial().parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('cards')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new AppError(describeDbError('Failed to update card', error), 500);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/cards/:id (full replace)
router.put('/cards/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const body = cardSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('cards')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new AppError(describeDbError('Failed to update card', error), 500);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/cards/:id
router.delete('/cards/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('cards').delete().eq('id', id);
    if (error) throw new AppError(describeDbError('Failed to delete card', error), 500);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// --- API CONFIG ---

// GET /api/admin/config
router.get('/config', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('api_config')
      .select('key, updated_at')  // Never return values
      .order('key');

    if (error) throw new AppError('Failed to fetch config', 500);
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/config/:key
router.put('/config/:key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!value) throw new AppError('Value is required', 400);

    const allowed = ['tank01_api_key', 'admin_password'];
    if (!allowed.includes(key)) throw new AppError('Unknown config key', 400);

    const { error } = await supabaseAdmin
      .from('api_config')
      .upsert({ key, value }, { onConflict: 'key' });

    if (error) throw new AppError('Failed to save config', 500);
    res.json({ success: true, key });
  } catch (err) {
    next(err);
  }
});

// --- PLAYER / DEFENSE SYNC ---
//
// These endpoints hit Tank01 and refresh the `players` table. They're exposed
// as admin HTTP endpoints rather than a CLI script because the canonical
// workflow is "commissioner clicks a button in the admin panel" — there's no
// local Node setup in this deployment.
//
// Player sync takes ~15s (1 API call) and upserts all ~1800 offensive players.
// Defense sync is near-instant (1 API call, 32 rows).
// Both are idempotent — running them twice is safe.

// POST /api/admin/sync-players
router.post('/sync-players', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await runPlayerSync();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[admin/sync-players]', err);
    next(err instanceof Error ? new AppError(`Player sync failed: ${err.message}`, 500) : err);
  }
});

// POST /api/admin/sync-defenses
router.post('/sync-defenses', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await runDefenseSync();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[admin/sync-defenses]', err);
    next(err instanceof Error ? new AppError(`Defense sync failed: ${err.message}`, 500) : err);
  }
});

// GET /api/admin/stats
router.get('/stats', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [users, leagues, cards] = await Promise.all([
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('leagues').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('cards').select('*', { count: 'exact', head: true })
    ]);

    res.json({
      users: users.count || 0,
      leagues: leagues.count || 0,
      cards: cards.count || 0
    });
  } catch (err) {
    next(err);
  }
});

export default router;

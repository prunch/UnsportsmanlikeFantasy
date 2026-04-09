import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { runPlayerSync, runDefenseSync } from '../utils/syncPlayersUtil';

const router = Router();

// All admin routes require admin role
router.use(requireAdmin);

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req: AuthRequest, res: Response, next: NextFunction) => {
  const page = parseInt(req.query.page as string || '1');
  const limit = parseInt(req.query.limit as string || '20');
  const offset = (page - 1) * limit;
  logger.info('[admin] GET /users', { userId: req.user?.id, page, limit });
  try {
    const { data, error, count } = await supabaseAdmin
      .from('users')
      .select('id, email, display_name, role, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('[admin] GET /users — DB error', { dbError: error });
      throw new AppError('Failed to fetch users', 500);
    }

    logger.info('[admin] GET /users — success', { count, page });
    res.json({ users: data, total: count, page, limit });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[admin] GET /users — unexpected error', { error: err });
    next(err);
  }
});

// ── PATCH /api/admin/users/:id ────────────────────────────────────────────────
router.patch('/users/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  logger.info('[admin] PATCH /users/:id', { userId: req.user?.id, targetId: id, body: req.body });
  try {
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

    if (error) {
      logger.error('[admin] PATCH /users/:id — DB error', { targetId: id, dbError: error });
      throw new AppError('Failed to update user', 500);
    }

    logger.info('[admin] PATCH /users/:id — success', { targetId: id, updates });
    res.json(data);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[admin] PATCH /users/:id — unexpected error', { targetId: id, error: err });
    next(err);
  }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
router.delete('/users/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  logger.info('[admin] DELETE /users/:id', { userId: req.user?.id, targetId: id });
  try {
    logger.debug('[admin] DELETE /users/:id — deleting from auth + DB', { targetId: id });
    await supabaseAdmin.auth.admin.deleteUser(id);
    await supabaseAdmin.from('users').delete().eq('id', id);
    logger.info('[admin] DELETE /users/:id — success', { targetId: id });
    res.json({ success: true });
  } catch (err) {
    logger.error('[admin] DELETE /users/:id — error', { targetId: id, error: err });
    next(err);
  }
});

// ── GET /api/admin/leagues ────────────────────────────────────────────────────
router.get('/leagues', async (req: AuthRequest, res: Response, next: NextFunction) => {
  logger.info('[admin] GET /leagues', { userId: req.user?.id });
  try {
    const { data, error, count } = await supabaseAdmin
      .from('leagues')
      .select('*, teams(count)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[admin] GET /leagues — DB error', { dbError: error });
      throw new AppError('Failed to fetch leagues', 500);
    }

    logger.info('[admin] GET /leagues — success', { total: count });
    res.json({ leagues: data, total: count });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[admin] GET /leagues — unexpected error', { error: err });
    next(err);
  }
});

// ── CARD MANAGEMENT ───────────────────────────────────────────────────────────

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

// ── GET /api/admin/cards ──────────────────────────────────────────────────────
router.get('/cards', async (req: AuthRequest, res: Response, next: NextFunction) => {
  logger.info('[admin] GET /cards', { userId: req.user?.id });
  try {
    const { data, error } = await supabaseAdmin
      .from('cards')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[admin] GET /cards — DB error', { dbError: error });
      throw new AppError('Failed to fetch cards', 500);
    }

    logger.info('[admin] GET /cards — success', { count: data?.length });
    res.json(data || []);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[admin] GET /cards — unexpected error', { error: err });
    next(err);
  }
});

// ── POST /api/admin/cards ─────────────────────────────────────────────────────
router.post('/cards', async (req: AuthRequest, res: Response, next: NextFunction) => {
  logger.info('[admin] POST /cards', { userId: req.user?.id, body: req.body });
  try {
    const body = cardSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('cards')
      .insert(body)
      .select()
      .single();

    if (error) {
      logger.error('[admin] POST /cards — DB error', { dbError: error });
      throw new AppError(`Failed to create card: ${error.message}`, 500);
    }

    logger.info('[admin] POST /cards — success', { cardId: (data as { id: string }).id });
    res.status(201).json(data);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[admin] POST /cards — unexpected error', { error: err });
    next(err);
  }
});

// ── PATCH /api/admin/cards/:id ────────────────────────────────────────────────
router.patch('/cards/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  logger.info('[admin] PATCH /cards/:id', { userId: req.user?.id, cardId: id });
  try {
    const body = cardSchema.partial().parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('cards')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('[admin] PATCH /cards/:id — DB error', { cardId: id, dbError: error });
      throw new AppError('Failed to update card', 500);
    }

    logger.info('[admin] PATCH /cards/:id — success', { cardId: id });
    res.json(data);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[admin] PATCH /cards/:id — unexpected error', { cardId: id, error: err });
    next(err);
  }
});

// ── DELETE /api/admin/cards/:id ───────────────────────────────────────────────
router.delete('/cards/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  logger.info('[admin] DELETE /cards/:id', { userId: req.user?.id, cardId: id });
  try {
    const { error } = await supabaseAdmin.from('cards').delete().eq('id', id);
    if (error) {
      logger.error('[admin] DELETE /cards/:id — DB error', { cardId: id, dbError: error });
      throw new AppError('Failed to delete card', 500);
    }
    logger.info('[admin] DELETE /cards/:id — success', { cardId: id });
    res.json({ success: true });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[admin] DELETE /cards/:id — unexpected error', { cardId: id, error: err });
    next(err);
  }
});

// ── API CONFIG ────────────────────────────────────────────────────────────────

// ── GET /api/admin/config ─────────────────────────────────────────────────────
router.get('/config', async (req: AuthRequest, res: Response, next: NextFunction) => {
  logger.info('[admin] GET /config', { userId: req.user?.id });
  try {
    const { data, error } = await supabaseAdmin
      .from('api_config')
      .select('key, updated_at') // Never return values
      .order('key');

    if (error) {
      logger.error('[admin] GET /config — DB error', { dbError: error });
      throw new AppError('Failed to fetch config', 500);
    }

    logger.info('[admin] GET /config — success', { keys: data?.map((d: { key: string }) => d.key) });
    res.json(data || []);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[admin] GET /config — unexpected error', { error: err });
    next(err);
  }
});

// ── PUT /api/admin/config/:key ────────────────────────────────────────────────
router.put('/config/:key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { key } = req.params;
  logger.info('[admin] PUT /config/:key', { userId: req.user?.id, key });
  try {
    const { value } = req.body;
    if (!value) throw new AppError('Value is required', 400);

    const allowed = ['tank01_api_key', 'admin_password'];
    if (!allowed.includes(key)) {
      logger.warn('[admin] PUT /config/:key — unknown key', { key });
      throw new AppError('Unknown config key', 400);
    }

    const { error } = await supabaseAdmin
      .from('api_config')
      .upsert({ key, value }, { onConflict: 'key' });

    if (error) {
      logger.error('[admin] PUT /config/:key — DB error', { key, dbError: error });
      throw new AppError('Failed to save config', 500);
    }

    logger.info('[admin] PUT /config/:key — success', { key });
    res.json({ success: true, key });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[admin] PUT /config/:key — unexpected error', { key, error: err });
    next(err);
  }
});

// ── PLAYER SYNC ───────────────────────────────────────────────────────────────

let lastSyncTime: number | null = null;
const SYNC_COOLDOWN_MS = 60 * 1000;

// ── POST /api/admin/sync-players ──────────────────────────────────────────────
router.post('/sync-players', async (req: AuthRequest, res: Response, next: NextFunction) => {
  logger.info('[admin] POST /sync-players', { userId: req.user?.id });
  try {
    const now = Date.now();
    if (lastSyncTime && now - lastSyncTime < SYNC_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((SYNC_COOLDOWN_MS - (now - lastSyncTime)) / 1000);
      logger.warn('[admin] POST /sync-players — rate limited', { secondsLeft });
      throw new AppError(`Sync is rate-limited. Try again in ${secondsLeft} seconds.`, 429);
    }

    lastSyncTime = now;
    logger.debug('[admin] POST /sync-players — starting player + defense sync');

    const [{ playersSynced, skipped }, { defensesSynced }] = await Promise.all([
      runPlayerSync(),
      runDefenseSync(),
    ]);

    logger.info('[admin] POST /sync-players — complete', { playersSynced, defensesSynced, skipped });
    res.json({
      success: true,
      playersSynced,
      defensesSynced,
      skipped,
      message: 'Players and defenses synced successfully',
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    lastSyncTime = null; // reset on error so admin can retry
    if (!(err instanceof AppError)) logger.error('[admin] POST /sync-players — unexpected error', { error: err });
    next(err);
  }
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', async (req: AuthRequest, res: Response, next: NextFunction) => {
  logger.info('[admin] GET /stats', { userId: req.user?.id });
  try {
    const [users, leagues, cards] = await Promise.all([
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('leagues').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('cards').select('*', { count: 'exact', head: true })
    ]);

    const stats = {
      users: users.count || 0,
      leagues: leagues.count || 0,
      cards: cards.count || 0
    };

    logger.info('[admin] GET /stats — success', stats);
    res.json(stats);
  } catch (err) {
    logger.error('[admin] GET /stats — unexpected error', { error: err });
    next(err);
  }
});

export default router;

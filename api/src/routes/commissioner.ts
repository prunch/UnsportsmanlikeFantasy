import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';
import { createNotification } from './notifications';

const router = Router();

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const updateSettingsSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  tradeDeadlineWeek: z.number().int().min(1).max(17).optional(),
  tradeReviewEnabled: z.boolean().optional(),
  draftTimerSeconds: z.number().int().min(60).max(120).optional(),
  maxTeams: z.number().int().min(10).max(12).optional()
});

const tradeReviewSchema = z.object({
  action: z.enum(['approve', 'veto']),
  reason: z.string().max(500).optional()
});

const rosterOverrideSchema = z.object({
  action: z.enum(['add', 'drop']),
  teamId: z.string().uuid(),
  playerId: z.string(),
  slot: z.enum(['QB', 'RB', 'RB2', 'WR', 'WR2', 'TE', 'FLEX', 'K', 'DEF',
    'BN1', 'BN2', 'BN3', 'BN4', 'BN5', 'BN6', 'IR1', 'IR2']).optional()
});

// ============================================================
// HELPERS
// ============================================================

async function requireCommissioner(leagueId: string, userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single();
  if (error || !data) throw new AppError('League not found', 404);
  if ((data as { commissioner_id: string }).commissioner_id !== userId) {
    throw new AppError('Only the commissioner can do this', 403);
  }
}

// ============================================================
// COMMISSIONER ROUTES (all under /api/leagues/:id/commissioner)
// ============================================================

// GET /api/leagues/:id/commissioner/overview — Commissioner dashboard data
router.get('/:id/commissioner/overview', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireCommissioner(id, req.user!.id);

    const { data: league, error: leagueError } = await supabaseAdmin
      .from('leagues')
      .select('*')
      .eq('id', id)
      .single();

    if (leagueError || !league) throw new AppError('League not found', 404);

    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, team_name, wins, losses, ties, points_for, waiver_priority, user:users(id, display_name, email)')
      .eq('league_id', id)
      .order('wins', { ascending: false });

    const { data: pendingTrades } = await supabaseAdmin
      .from('transactions')
      .select('id, type, status, week, created_at, notes, team:teams(id, team_name), player:players(id, name, position)')
      .eq('league_id', id)
      .eq('type', 'trade')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const { count: chatCount } = await supabaseAdmin
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', id)
      .eq('is_deleted', false);

    res.json({
      league,
      teams: teams || [],
      pendingTrades: pendingTrades || [],
      chatMessageCount: chatCount || 0
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leagues/:id/commissioner/settings — Update league settings
router.patch('/:id/commissioner/settings', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireCommissioner(id, req.user!.id);

    const body = updateSettingsSchema.parse(req.body);
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.tradeDeadlineWeek !== undefined) updates.trade_deadline_week = body.tradeDeadlineWeek;
    if (body.draftTimerSeconds !== undefined) updates.draft_timer_seconds = body.draftTimerSeconds;

    if (Object.keys(updates).length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    const { data, error } = await supabaseAdmin
      .from('leagues')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new AppError(`Failed to update settings: ${error.message}`, 500);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/commissioner/pause — Pause/resume the season
router.post('/:id/commissioner/pause', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireCommissioner(id, req.user!.id);

    const { data: league } = await supabaseAdmin
      .from('leagues')
      .select('status')
      .eq('id', id)
      .single();

    if (!league) throw new AppError('League not found', 404);

    const currentStatus = (league as { status: string }).status;

    if (currentStatus !== 'active' && currentStatus !== 'paused') {
      throw new AppError('Can only pause/resume an active league', 400);
    }

    const newStatus = currentStatus === 'active' ? 'paused' : 'active';

    await supabaseAdmin
      .from('leagues')
      .update({ status: newStatus })
      .eq('id', id);

    res.json({
      success: true,
      status: newStatus,
      message: newStatus === 'paused' ? 'Season paused' : 'Season resumed'
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/commissioner/reset-waivers — Reset waiver priority order
router.post('/:id/commissioner/reset-waivers', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireCommissioner(id, req.user!.id);

    const { data: teams, error } = await supabaseAdmin
      .from('teams')
      .select('id, wins, points_for')
      .eq('league_id', id);

    if (error) throw new AppError('Failed to fetch teams', 500);

    // Sort by worst record first (fewest wins, lowest points)
    const sorted = [...(teams || [])].sort((a, b) => {
      const ta = a as { wins: number; points_for: number };
      const tb = b as { wins: number; points_for: number };
      if (ta.wins !== tb.wins) return ta.wins - tb.wins;
      return ta.points_for - tb.points_for;
    });

    // Update waiver priority (1 = highest priority = worst record)
    for (let i = 0; i < sorted.length; i++) {
      await supabaseAdmin
        .from('teams')
        .update({ waiver_priority: i + 1 })
        .eq('id', (sorted[i] as { id: string }).id);
    }

    res.json({ success: true, message: `Waiver priority reset for ${sorted.length} teams` });
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/commissioner/roster-override — Emergency add/drop
router.post('/:id/commissioner/roster-override', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireCommissioner(id, req.user!.id);

    const body = rosterOverrideSchema.parse(req.body);

    // Verify the team belongs to this league
    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id, user_id, team_name')
      .eq('id', body.teamId)
      .eq('league_id', id)
      .single();

    if (teamError || !team) throw new AppError('Team not found in this league', 404);

    if (body.action === 'drop') {
      const { error } = await supabaseAdmin
        .from('rosters')
        .delete()
        .eq('team_id', body.teamId)
        .eq('player_id', body.playerId)
        .eq('week', 0);

      if (error) throw new AppError(`Failed to drop player: ${error.message}`, 500);

      await supabaseAdmin.from('transactions').insert({
        league_id: id,
        type: 'drop',
        team_id: body.teamId,
        player_id: body.playerId,
        status: 'complete',
        notes: 'Commissioner emergency drop',
        week: 0
      });

      // Notify the affected user
      const t = team as { user_id: string; team_name: string };
      await createNotification({
        userId: t.user_id,
        leagueId: id,
        type: 'general',
        title: 'Roster Update',
        body: 'The commissioner has removed a player from your roster.'
      });
    } else {
      // Add player — need a slot
      if (!body.slot) throw new AppError('Slot required for add action', 400);

      // Check player not already on a roster in this league
      const { data: teams } = await supabaseAdmin
        .from('teams')
        .select('id')
        .eq('league_id', id);

      const teamIds = (teams || []).map((t: { id: string }) => t.id);

      const { data: onRoster } = teamIds.length > 0
        ? await supabaseAdmin
            .from('rosters')
            .select('id')
            .in('team_id', teamIds)
            .eq('player_id', body.playerId)
            .eq('week', 0)
            .single()
        : { data: null };

      if (onRoster) throw new AppError('Player is already on a roster', 409);

      // Check if slot is occupied — if so, remove occupant first
      await supabaseAdmin
        .from('rosters')
        .delete()
        .eq('team_id', body.teamId)
        .eq('slot', body.slot)
        .eq('week', 0);

      const { error } = await supabaseAdmin.from('rosters').insert({
        team_id: body.teamId,
        player_id: body.playerId,
        slot: body.slot,
        week: 0,
        acquired_via: 'waiver'
      });

      if (error) throw new AppError(`Failed to add player: ${error.message}`, 500);

      await supabaseAdmin.from('transactions').insert({
        league_id: id,
        type: 'add',
        team_id: body.teamId,
        player_id: body.playerId,
        status: 'complete',
        notes: 'Commissioner emergency add',
        week: 0
      });

      const t = team as { user_id: string };
      await createNotification({
        userId: t.user_id,
        leagueId: id,
        type: 'general',
        title: 'Roster Update',
        body: 'The commissioner has added a player to your roster.'
      });
    }

    res.json({ success: true, action: body.action });
  } catch (err) {
    next(err);
  }
});

// POST /api/leagues/:id/commissioner/trade-review/:tradeId — Approve or veto a trade
router.post('/:id/commissioner/trade-review/:tradeId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id, tradeId } = req.params;
    await requireCommissioner(id, req.user!.id);

    const body = tradeReviewSchema.parse(req.body);

    const { data: trade, error: fetchError } = await supabaseAdmin
      .from('transactions')
      .select('id, status, team_id, related_team_id, type')
      .eq('id', tradeId)
      .eq('league_id', id)
      .single();

    if (fetchError || !trade) throw new AppError('Trade not found', 404);
    const t = trade as { status: string; type: string; team_id: string; related_team_id: string };
    if (t.type !== 'trade') throw new AppError('This is not a trade transaction', 400);
    if (t.status !== 'pending') throw new AppError('Trade is not pending', 400);

    const newStatus = body.action === 'approve' ? 'complete' : 'vetoed';

    const { error: updateError } = await supabaseAdmin
      .from('transactions')
      .update({
        status: newStatus,
        notes: body.reason || null
      })
      .eq('id', tradeId);

    if (updateError) throw new AppError('Failed to update trade', 500);

    // Notify both teams
    const { data: proposingTeam } = await supabaseAdmin
      .from('teams')
      .select('user_id')
      .eq('id', t.team_id)
      .single();

    if (proposingTeam) {
      await createNotification({
        userId: (proposingTeam as { user_id: string }).user_id,
        leagueId: id,
        type: 'trade_offer',
        title: body.action === 'approve' ? 'Trade Approved ✅' : 'Trade Vetoed ❌',
        body: body.reason || `The commissioner has ${body.action === 'approve' ? 'approved' : 'vetoed'} your trade.`
      });
    }

    if (t.related_team_id) {
      const { data: relatedTeam } = await supabaseAdmin
        .from('teams')
        .select('user_id')
        .eq('id', t.related_team_id)
        .single();

      if (relatedTeam) {
        await createNotification({
          userId: (relatedTeam as { user_id: string }).user_id,
          leagueId: id,
          type: 'trade_offer',
          title: body.action === 'approve' ? 'Trade Approved ✅' : 'Trade Vetoed ❌',
          body: body.reason || `The commissioner has ${body.action === 'approve' ? 'approved' : 'vetoed'} a trade involving your team.`
        });
      }
    }

    res.json({ success: true, status: newStatus });
  } catch (err) {
    next(err);
  }
});

// GET /api/leagues/:id/commissioner/pending-trades — List trades awaiting review
router.get('/:id/commissioner/pending-trades', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireCommissioner(id, req.user!.id);

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select(`
        id, type, status, week, created_at, notes,
        team:teams!transactions_team_id_fkey(id, team_name, user:users(display_name)),
        related_team:teams!transactions_related_team_id_fkey(id, team_name, user:users(display_name)),
        player:players(id, name, position, nfl_team)
      `)
      .eq('league_id', id)
      .eq('type', 'trade')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw new AppError('Failed to fetch pending trades', 500);
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// GET /api/leagues/:id/commissioner/chat — Commissioner view of chat (includes deleted flag)
router.get('/:id/commissioner/chat', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await requireCommissioner(id, req.user!.id);

    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select(`
        id, message, is_deleted, created_at,
        user:users(id, display_name, avatar_url)
      `)
      .eq('league_id', id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw new AppError('Failed to fetch chat', 500);
    res.json((data || []).reverse());
  } catch (err) {
    next(err);
  }
});

export default router;

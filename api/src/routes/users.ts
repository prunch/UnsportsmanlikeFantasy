import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';
import multer from 'multer';

const router = Router();

// ── Multer for avatar uploads (2MB, images only) ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only JPEG, PNG, WebP, and GIF images are allowed', 400) as any);
    }
  }
});

// ── Ephemeral auth client for password operations ──
function makeAuthClient() {
  return createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_ANON_KEY || 'placeholder',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  teamName: z.string().min(2).max(50).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,24}$/, 'Username must be 3-24 alphanumeric characters or underscores').optional().nullable(),
  bio: z.string().max(500).optional(),
  notifyMatchupResults: z.boolean().optional(),
  notifyTradeOffers: z.boolean().optional(),
  notifyLeagueChat: z.boolean().optional(),
  notifyCardEvents: z.boolean().optional(),
  isProfilePublic: z.boolean().optional()
});

// ============================================================
// GET /api/users/me — full private profile
// ============================================================
router.get('/me', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, display_name, team_name, avatar_url, username, bio, role, created_at, notify_matchup_results, notify_trade_offers, notify_league_chat, notify_card_events, is_profile_public')
      .eq('id', req.user!.id)
      .single();

    if (error || !data) throw new AppError('User not found', 404);

    res.json({
      id: data.id,
      email: data.email,
      displayName: data.display_name,
      teamName: data.team_name,
      avatarUrl: data.avatar_url,
      username: data.username,
      bio: data.bio || '',
      role: data.role,
      createdAt: data.created_at,
      notifyMatchupResults: data.notify_matchup_results,
      notifyTradeOffers: data.notify_trade_offers,
      notifyLeagueChat: data.notify_league_chat,
      notifyCardEvents: data.notify_card_events,
      isProfilePublic: data.is_profile_public
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PATCH /api/users/me — update profile
// ============================================================
router.patch('/me', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = updateProfileSchema.parse(req.body);
    const updates: Record<string, unknown> = {};

    if (body.displayName !== undefined) updates.display_name = body.displayName;
    if (body.teamName !== undefined) updates.team_name = body.teamName;
    if (body.avatarUrl !== undefined) updates.avatar_url = body.avatarUrl;
    if (body.username !== undefined) updates.username = body.username;
    if (body.bio !== undefined) updates.bio = body.bio;
    if (body.notifyMatchupResults !== undefined) updates.notify_matchup_results = body.notifyMatchupResults;
    if (body.notifyTradeOffers !== undefined) updates.notify_trade_offers = body.notifyTradeOffers;
    if (body.notifyLeagueChat !== undefined) updates.notify_league_chat = body.notifyLeagueChat;
    if (body.notifyCardEvents !== undefined) updates.notify_card_events = body.notifyCardEvents;
    if (body.isProfilePublic !== undefined) updates.is_profile_public = body.isProfilePublic;

    if (Object.keys(updates).length === 0) {
      throw new AppError('No fields to update', 400);
    }

    // Check username uniqueness
    if (updates.username) {
      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('username', updates.username)
        .neq('id', req.user!.id)
        .single();
      if (existing) throw new AppError('Username already taken', 409);
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', req.user!.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') throw new AppError('Username already taken', 409);
      throw new AppError('Failed to update profile', 500);
    }

    res.json({
      id: data.id,
      email: data.email,
      displayName: data.display_name,
      teamName: data.team_name,
      avatarUrl: data.avatar_url,
      username: data.username,
      bio: data.bio || '',
      notifyMatchupResults: data.notify_matchup_results,
      notifyTradeOffers: data.notify_trade_offers,
      notifyLeagueChat: data.notify_league_chat,
      notifyCardEvents: data.notify_card_events,
      isProfilePublic: data.is_profile_public
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/users/me/avatar — upload avatar image
// ============================================================
router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError('No image file provided', 400);

    const userId = req.user!.id;
    const ext = req.file.mimetype.split('/')[1] === 'jpeg' ? 'jpg' : req.file.mimetype.split('/')[1];
    const filePath = `${userId}/avatar.${ext}`;

    // Delete any existing avatar files for this user
    const { data: existingFiles } = await supabaseAdmin.storage
      .from('avatars')
      .list(userId);
    if (existingFiles && existingFiles.length > 0) {
      await supabaseAdmin.storage
        .from('avatars')
        .remove(existingFiles.map(f => `${userId}/${f.name}`));
    }

    // Upload the new avatar
    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });

    if (uploadError) throw new AppError('Failed to upload avatar', 500);

    // Get the public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = urlData.publicUrl;

    // Update user record
    await supabaseAdmin
      .from('users')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', userId);

    res.json({ avatarUrl });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// DELETE /api/users/me/avatar — reset to default
// ============================================================
router.delete('/me/avatar', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    // Remove files from storage
    const { data: existingFiles } = await supabaseAdmin.storage
      .from('avatars')
      .list(userId);
    if (existingFiles && existingFiles.length > 0) {
      await supabaseAdmin.storage
        .from('avatars')
        .remove(existingFiles.map(f => `${userId}/${f.name}`));
    }

    // Clear avatar_url
    await supabaseAdmin
      .from('users')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', userId);

    res.json({ avatarUrl: null });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /api/users/me/change-password
// ============================================================
router.post('/me/change-password', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8, 'New password must be at least 8 characters')
    });
    const { currentPassword, newPassword } = schema.parse(req.body);

    // Verify current password by attempting sign-in
    const { error: signInError } = await makeAuthClient().auth.signInWithPassword({
      email: req.user!.email,
      password: currentPassword
    });
    if (signInError) throw new AppError('Current password is incorrect', 401);

    // Update via admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      req.user!.id,
      { password: newPassword }
    );
    if (updateError) throw new AppError('Failed to update password', 500);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// DELETE /api/users/me — deactivate account
// ============================================================
router.delete('/me', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      password: z.string()
    });
    const { password } = schema.parse(req.body);

    // Verify password
    const { error: signInError } = await makeAuthClient().auth.signInWithPassword({
      email: req.user!.email,
      password
    });
    if (signInError) throw new AppError('Password is incorrect', 401);

    const userId = req.user!.id;

    // Clean up avatar storage
    const { data: existingFiles } = await supabaseAdmin.storage
      .from('avatars')
      .list(userId);
    if (existingFiles && existingFiles.length > 0) {
      await supabaseAdmin.storage
        .from('avatars')
        .remove(existingFiles.map(f => `${userId}/${f.name}`));
    }

    // Delete from Supabase Auth (cascades to users table via FK)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) throw new AppError('Failed to delete account', 500);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /api/users/:userId/profile — public profile
// ============================================================
router.get('/:userId/profile', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const isOwnProfile = userId === req.user!.id;

    // Fetch user
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, display_name, username, bio, avatar_url, team_name, is_profile_public, created_at')
      .eq('id', userId)
      .single();

    if (userError || !userData) throw new AppError('User not found', 404);
    if (!isOwnProfile && !userData.is_profile_public) {
      throw new AppError('This profile is private', 403);
    }

    // Fetch their teams with W/L and league info
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select(`
        id, team_name, wins, losses, ties, points_for, points_against,
        league:leagues(id, name, status, season)
      `)
      .eq('user_id', userId);

    // Aggregate stats
    const allTeams = teams || [];
    const totalWins = allTeams.reduce((s, t) => s + (t.wins || 0), 0);
    const totalLosses = allTeams.reduce((s, t) => s + (t.losses || 0), 0);
    const totalTies = allTeams.reduce((s, t) => s + (t.ties || 0), 0);
    const totalPointsFor = allTeams.reduce((s, t) => s + Number(t.points_for || 0), 0);

    res.json({
      id: userData.id,
      displayName: userData.display_name,
      username: userData.username,
      bio: userData.bio || '',
      avatarUrl: userData.avatar_url,
      teamName: userData.team_name,
      isProfilePublic: userData.is_profile_public,
      memberSince: userData.created_at,
      stats: {
        totalWins,
        totalLosses,
        totalTies,
        totalPointsFor: Math.round(totalPointsFor * 10) / 10,
        leagueCount: allTeams.length
      },
      leagues: allTeams.map(t => ({
        teamId: t.id,
        teamName: t.team_name,
        wins: t.wins || 0,
        losses: t.losses || 0,
        ties: t.ties || 0,
        pointsFor: Number(t.points_for || 0),
        league: Array.isArray(t.league) ? t.league[0] : t.league
      }))
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

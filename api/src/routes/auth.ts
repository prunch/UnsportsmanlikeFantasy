import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { supabaseAdmin, supabase } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(2).max(50)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

function signToken(payload: { id: string; email: string; role: string }): string {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('[auth] POST /register — attempt', { email: req.body?.email });
  try {
    const body = registerSchema.parse(req.body);

    logger.debug('[auth] /register — calling supabase auth.admin.createUser', { email: body.email });
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { display_name: body.displayName }
    });

    if (authError) {
      logger.warn('[auth] /register — supabase auth error', { email: body.email, error: authError.message });
      if (authError.message.includes('already registered')) {
        throw new AppError('Email already in use', 409);
      }
      throw new AppError(authError.message, 400);
    }

    logger.debug('[auth] /register — supabase user created', { userId: authData.user.id });

    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authData.user.id,
        email: body.email,
        display_name: body.displayName,
        role: 'user'
      });

    if (profileError) {
      logger.error('[auth] /register — failed to insert user profile, rolling back', {
        userId: authData.user.id,
        dbError: profileError
      });
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw new AppError('Failed to create user profile', 500);
    }

    const token = signToken({ id: authData.user.id, email: body.email, role: 'user' });
    logger.info('[auth] /register — success', { userId: authData.user.id, email: body.email });

    res.status(201).json({
      token,
      user: {
        id: authData.user.id,
        email: body.email,
        displayName: body.displayName,
        role: 'user'
      }
    });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[auth] /register — unexpected error', { error: err });
    next(err);
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('[auth] POST /login — attempt', { email: req.body?.email });
  try {
    const body = loginSchema.parse(req.body);

    // Use the PUBLIC client for signInWithPassword — using supabaseAdmin here
    // causes it to cache a user session on the shared admin client, which then
    // pollutes subsequent DB queries (they run as the user instead of service_role).
    logger.debug('[auth] /login — calling supabase.auth.signInWithPassword', { email: body.email });
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password
    });

    if (authError || !authData.user) {
      logger.warn('[auth] /login — invalid credentials', {
        email: body.email,
        error: authError?.message
      });
      throw new AppError('Invalid email or password', 401);
    }

    logger.debug('[auth] /login — fetching user profile', { userId: authData.user.id });
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      logger.warn('[auth] /login — profile fetch error (non-fatal)', {
        userId: authData.user.id,
        error: profileError
      });
    }

    const role = profile?.role || 'user';
    const token = signToken({ id: authData.user.id, email: body.email, role });
    logger.info('[auth] /login — success', { userId: authData.user.id, email: body.email, role });

    res.json({
      token,
      user: {
        id: authData.user.id,
        email: body.email,
        displayName: profile?.display_name || body.email,
        role,
        avatarUrl: profile?.avatar_url
      }
    });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[auth] /login — unexpected error', { error: err });
    next(err);
  }
});

// ── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  logger.info('[auth] POST /refresh — attempt');
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token required', 400);

    // Use public client for session refresh (same reason as login — avoid polluting admin client)
    logger.debug('[auth] /refresh — calling supabase.auth.refreshSession');
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.user) {
      logger.warn('[auth] /refresh — invalid refresh token', { error: error?.message });
      throw new AppError('Invalid refresh token', 401);
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single();

    const role = profile?.role || 'user';
    const token = signToken({ id: data.user.id, email: data.user.email!, role });
    logger.info('[auth] /refresh — success', { userId: data.user.id });

    res.json({ token });
  } catch (err) {
    if (!(err instanceof AppError)) logger.error('[auth] /refresh — unexpected error', { error: err });
    next(err);
  }
});

export default router;

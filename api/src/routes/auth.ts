import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';

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

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = registerSchema.parse(req.body);

    // Register user via Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { display_name: body.displayName }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        throw new AppError('Email already in use', 409);
      }
      throw new AppError(authError.message, 400);
    }

    // Insert user profile
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authData.user.id,
        email: body.email,
        display_name: body.displayName,
        role: 'user'
      });

    if (profileError) {
      // Attempt cleanup
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw new AppError('Failed to create user profile', 500);
    }

    const token = signToken({ id: authData.user.id, email: body.email, role: 'user' });

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
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);

    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email: body.email,
      password: body.password
    });

    if (authError || !authData.user) {
      throw new AppError('Invalid email or password', 401);
    }

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    const role = profile?.role || 'user';
    const token = signToken({ id: authData.user.id, email: body.email, role });

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
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token required', 400);

    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.user) throw new AppError('Invalid refresh token', 401);

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single();

    const role = profile?.role || 'user';
    const token = signToken({ id: data.user.id, email: data.user.email!, role });

    res.json({ token });
  } catch (err) {
    next(err);
  }
});

export default router;

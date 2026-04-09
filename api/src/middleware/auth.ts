import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    logger.warn(`[auth] requireAuth — no token provided`, {
      method: req.method,
      path: req.path,
      ip: req.ip
    });
    return next(new AppError('Authentication required', 401));
  }

  try {
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const payload = jwt.verify(token, secret) as { id: string; email: string; role: string };
    req.user = payload;
    logger.debug(`[auth] requireAuth — token valid`, {
      userId: payload.id,
      email: payload.email,
      role: payload.role,
      method: req.method,
      path: req.path
    });
    next();
  } catch (err) {
    logger.warn(`[auth] requireAuth — token invalid or expired`, {
      method: req.method,
      path: req.path,
      error: err instanceof Error ? err.message : String(err)
    });
    next(new AppError('Invalid or expired token', 401));
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== 'admin') {
      logger.warn(`[auth] requireAdmin — access denied`, {
        userId: req.user?.id,
        role: req.user?.role,
        method: req.method,
        path: req.path
      });
      return next(new AppError('Admin access required', 403));
    }
    logger.debug(`[auth] requireAdmin — admin access granted`, {
      userId: req.user?.id,
      method: req.method,
      path: req.path
    });
    next();
  });
}

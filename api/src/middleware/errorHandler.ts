import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    const details = err.errors.map(e => ({ path: e.path.join('.'), message: e.message }));
    logger.warn(`[errorHandler] Validation error — ${req.method} ${req.path}`, {
      details,
      body: req.body
    });
    res.status(400).json({ error: 'Validation error', details });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`[errorHandler] AppError ${err.statusCode} — ${req.method} ${req.path}`, {
        message: err.message,
        stack: err.stack,
        body: req.body,
        params: req.params,
        query: req.query
      });
    } else {
      logger.warn(`[errorHandler] AppError ${err.statusCode} — ${req.method} ${req.path}: ${err.message}`);
    }
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Unexpected / unhandled error
  logger.error(`[errorHandler] UNHANDLED ERROR — ${req.method} ${req.path}`, {
    message: err.message,
    stack: err.stack,
    body: req.body,
    params: req.params,
    query: req.query
  });
  res.status(500).json({ error: 'Internal server error' });
}

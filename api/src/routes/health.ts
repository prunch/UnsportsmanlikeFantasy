import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const status = {
    status: 'ok',
    app: 'Gridiron Cards API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    supabase: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrl: process.env.SUPABASE_URL ? '✓ set' : '✗ missing',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ set' : '✗ missing',
    jwtSecret: process.env.JWT_SECRET ? '✓ set' : '✗ missing (using dev-secret!)',
    tank01: !!process.env.TANK01_API_KEY,
    nodeEnv: process.env.NODE_ENV || 'development'
  };
  logger.debug('[health] GET / — health check', status);
  res.json(status);
});

export default router;

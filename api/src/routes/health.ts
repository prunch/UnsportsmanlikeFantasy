import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Gridiron Cards API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    supabase: !!process.env.SUPABASE_URL,
    tank01: !!process.env.TANK01_API_KEY
  });
});

export default router;

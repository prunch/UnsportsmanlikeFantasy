import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { supabaseAdmin } from '../utils/supabase';

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
    jwtSecret: process.env.JWT_SECRET ? '✓ set' : '✗ missing',
    tank01: !!process.env.TANK01_API_KEY,
    nodeEnv: process.env.NODE_ENV || 'development'
  };
  logger.debug('[health] GET / — health check', status);
  res.json(status);
});

// Deep diagnostic — runs the EXACT queries the leagues routes use
// Keep until leagues issue fully resolved, then remove
router.get('/db-diag', async (req: Request, res: Response) => {
  logger.info('[health] GET /db-diag — running deep DB diagnostics');

  const serviceKeyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const FRANK_ID = '9bb71524-f0f2-493a-8071-8c83d9186398';

  const results: Record<string, unknown> = {
    supabaseUrl: process.env.SUPABASE_URL || 'NOT SET',
    serviceKeyPrefix: serviceKeyRaw.substring(0, 30) + '...',
    serviceKeyLength: serviceKeyRaw.length,
    serviceKeyIsJwt: serviceKeyRaw.startsWith('eyJ'),
  };

  // Test 1: exact GET /leagues query (teams JOIN leagues for user)
  try {
    const { data, error } = await supabaseAdmin
      .from('teams')
      .select(`league:leagues(id, name, status, season, max_teams, current_week, invite_code, commissioner_id, created_at)`)
      .eq('user_id', FRANK_ID);
    results['get_leagues_query'] = error
      ? { ok: false, error: error.message, code: error.code, hint: error.hint, details: error.details }
      : { ok: true, count: data?.length, sample: data?.[0] };
  } catch (e) {
    results['get_leagues_query'] = { ok: false, threw: String(e) };
  }

  // Test 2: exact POST /leagues insert (with Frank's real commissioner_id)
  try {
    const { v4: uuidv4 } = await import('uuid');
    const testId = uuidv4();
    const { data, error } = await supabaseAdmin
      .from('leagues')
      .insert({
        id: testId,
        name: '__diag_insert_test__',
        commissioner_id: FRANK_ID,
        max_teams: 10,
        draft_type: 'snake',
        draft_timer_seconds: 90,
        trade_deadline_week: 11,
        invite_code: 'DIAGZZ99',
        status: 'setup',
        season: 2026,
        current_week: 0
      })
      .select()
      .single();

    if (error) {
      results['post_leagues_insert'] = { ok: false, error: error.message, code: error.code, hint: error.hint, details: error.details };
    } else {
      // Clean up
      await supabaseAdmin.from('leagues').delete().eq('id', testId);
      results['post_leagues_insert'] = { ok: true, insertedId: (data as { id: string }).id };
    }
  } catch (e) {
    results['post_leagues_insert'] = { ok: false, threw: String(e) };
  }

  // Test 3: plain leagues count (service role sanity check)
  try {
    const { count, error } = await supabaseAdmin
      .from('leagues')
      .select('*', { count: 'exact', head: true });
    results['leagues_count'] = error
      ? { ok: false, error: error.message }
      : { ok: true, count };
  } catch (e) {
    results['leagues_count'] = { ok: false, threw: String(e) };
  }

  logger.info('[health] GET /db-diag — complete', results);
  res.json(results);
});

export default router;

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
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ set' : '✗ missing (using dev-secret!)',
    jwtSecret: process.env.JWT_SECRET ? '✓ set' : '✗ missing',
    tank01: !!process.env.TANK01_API_KEY,
    nodeEnv: process.env.NODE_ENV || 'development'
  };
  logger.debug('[health] GET / — health check', status);
  res.json(status);
});

// Diagnostic endpoint — tests actual DB connectivity per table
// Remove this in Phase 4+ once all issues are resolved
router.get('/db-diag', async (req: Request, res: Response) => {
  logger.info('[health] GET /db-diag — running DB diagnostics');

  const serviceKeyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKeyRaw = process.env.SUPABASE_ANON_KEY || '';

  const results: Record<string, unknown> = {
    supabaseUrl: process.env.SUPABASE_URL || 'NOT SET',
    serviceKeyPrefix: serviceKeyRaw.substring(0, 30) + (serviceKeyRaw.length > 30 ? '...' : ''),
    serviceKeyLength: serviceKeyRaw.length,
    serviceKeyIsJwt: serviceKeyRaw.startsWith('eyJ'),
    anonKeyPrefix: anonKeyRaw.substring(0, 30) + (anonKeyRaw.length > 30 ? '...' : ''),
    anonKeyIsJwt: anonKeyRaw.startsWith('eyJ'),
  };

  // Test each table
  const tables = ['users', 'players', 'leagues', 'teams'] as const;
  for (const table of tables) {
    try {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true });
      results[`table_${table}`] = error
        ? { ok: false, error: error.message, code: error.code, hint: error.hint }
        : { ok: true };
    } catch (e) {
      results[`table_${table}`] = { ok: false, threw: String(e) };
    }
  }

  // Test a leagues INSERT (dry run — insert then immediately delete)
  try {
    const testId = '00000000-0000-0000-0000-000000000001';
    const { error: insertError } = await supabaseAdmin
      .from('leagues')
      .insert({
        id: testId,
        name: '__diag_test__',
        commissioner_id: '00000000-0000-0000-0000-000000000000',
        max_teams: 10,
        draft_type: 'snake',
        invite_code: 'DIAGTEST',
        status: 'setup',
        season: 2026,
        current_week: 0
      });

    if (insertError) {
      results['leagues_insert_test'] = { ok: false, error: insertError.message, code: insertError.code };
    } else {
      await supabaseAdmin.from('leagues').delete().eq('id', testId);
      results['leagues_insert_test'] = { ok: true };
    }
  } catch (e) {
    results['leagues_insert_test'] = { ok: false, threw: String(e) };
  }

  logger.info('[health] GET /db-diag — results', results);
  res.json(results);
});

export default router;

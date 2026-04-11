import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.warn('⚠️  Supabase environment variables not set. Database features will not work.');
}

// Startup diagnostic: identify what KIND of Supabase key is in each env var.
// Supabase supports two key formats:
//   1. Legacy JWT keys — `eyJ...` — role is encoded in the payload claim
//   2. New API keys — `sb_secret_...` (service role) or `sb_publishable_...` (anon)
// A very common failure mode is pasting the wrong key into the wrong env var
// (e.g. anon key into SUPABASE_SERVICE_ROLE_KEY). Postgres then returns
// confusing "permission denied for table X" errors because the grants only
// cover service_role. Logging what we got on boot makes that obvious.
function identifyKey(key: string | undefined, label: string, expected: 'service_role' | 'anon'): void {
  if (!key || key === 'placeholder') {
    console.warn(`⚠️  ${label}: no key provided`);
    return;
  }

  // --- New API key format ---
  if (key.startsWith('sb_secret_')) {
    const marker = `sb_secret_…${key.slice(-6)}`;
    if (expected === 'service_role') {
      console.info(`✅ ${label}: new-format SERVICE_ROLE key (${marker})`);
    } else {
      console.error(`🚨 ${label}: new-format SERVICE_ROLE key (${marker}) — but this env var should hold an ANON/publishable key!`);
    }
    return;
  }
  if (key.startsWith('sb_publishable_')) {
    const marker = `sb_publishable_…${key.slice(-6)}`;
    if (expected === 'anon') {
      console.info(`✅ ${label}: new-format PUBLISHABLE (anon) key (${marker})`);
    } else {
      console.error(
        `🚨 ${label}: new-format PUBLISHABLE (anon) key (${marker}) — but this env var should hold a SERVICE_ROLE key! ` +
        `This will cause "permission denied for table X" errors on admin routes. Fix the env var.`
      );
    }
    return;
  }

  // --- Legacy JWT format ---
  if (key.startsWith('eyJ')) {
    try {
      const payload = key.split('.')[1];
      if (!payload) throw new Error('not a JWT');
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
      const role = decoded.role || 'unknown';
      const ref = decoded.ref || 'unknown';
      if (role !== expected) {
        console.error(
          `🚨 ${label}: legacy JWT with role="${role}" but expected "${expected}". ` +
          `This will cause auth/permission errors. Fix the env var.`
        );
      } else {
        console.info(`✅ ${label}: legacy JWT role="${role}" ref="${ref}"`);
        if (expected === 'service_role') {
          console.warn(
            `   ⚠️  Note: this project may have been migrated to the new API key system. ` +
            `If "permission denied" errors persist, switch to an sb_secret_* key from the Supabase dashboard.`
          );
        }
      }
    } catch (err) {
      console.warn(`⚠️  ${label}: could not decode JWT — ${err instanceof Error ? err.message : 'unknown'}`);
    }
    return;
  }

  console.warn(`⚠️  ${label}: unrecognized key format (first 8 chars: "${key.slice(0, 8)}…")`);
}

identifyKey(supabaseServiceKey, 'SUPABASE_SERVICE_ROLE_KEY', 'service_role');
identifyKey(supabaseAnonKey, 'SUPABASE_ANON_KEY', 'anon');

// Admin client — bypasses RLS (for server-side operations)
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceKey || 'placeholder',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Public client — respects RLS (for user-facing operations)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

// Live startup probe: exercise the exact set of tables + operations the
// admin routes use and log pass/fail for each one. This is the authoritative
// answer to "what can my current SUPABASE_SERVICE_ROLE_KEY actually touch?".
//
// Supabase's new API key system (sb_secret_*) allows restricting a secret
// key to specific schemas/tables. A key that's been scoped down will
// successfully authenticate as service_role but only have access to the
// tables it was granted — producing a confusing split where one admin
// endpoint works and another returns 42501. Probing each table up-front
// tells us exactly which routes will break and why, before users hit them.
async function probeAdminAccess(): Promise<void> {
  if (!supabaseUrl || !supabaseServiceKey || supabaseServiceKey === 'placeholder') {
    console.warn('⚠️  [probe] skipping — SUPABASE_SERVICE_ROLE_KEY not configured');
    return;
  }

  type ProbeOp = 'SELECT' | 'UPDATE-noop';
  interface ProbeSpec {
    table: string;
    op: ProbeOp;
  }

  // Every (table, op) the admin surface actually uses
  const probes: ProbeSpec[] = [
    { table: 'cards', op: 'SELECT' },
    { table: 'cards', op: 'UPDATE-noop' },
    { table: 'players', op: 'SELECT' },
    { table: 'players', op: 'UPDATE-noop' },
    { table: 'users', op: 'SELECT' },
    { table: 'leagues', op: 'SELECT' },
  ];

  const IMPOSSIBLE_ID = '00000000-0000-0000-0000-000000000000';
  const results: string[] = [];

  for (const { table, op } of probes) {
    try {
      let errObj: { message: string; code?: string; hint?: string } | null = null;

      if (op === 'SELECT') {
        const { error } = await supabaseAdmin
          .from(table)
          .select('*', { count: 'exact', head: true });
        errObj = error ?? null;
      } else {
        // Match-zero-rows UPDATE: can't touch any real data, but Postgres
        // still evaluates grants/RLS, so it surfaces 42501 the same way a
        // real write would.
        const { error } = await supabaseAdmin
          .from(table)
          .update({ updated_at: new Date().toISOString() })
          .eq('id', IMPOSSIBLE_ID);
        errObj = error ?? null;
      }

      if (errObj) {
        results.push(
          `  🚨 ${table.padEnd(8)} ${op.padEnd(12)} ${errObj.message}` +
          `${errObj.code ? ` (code=${errObj.code})` : ''}`
        );
      } else {
        results.push(`  ✅ ${table.padEnd(8)} ${op.padEnd(12)} ok`);
      }
    } catch (err) {
      results.push(
        `  🚨 ${table.padEnd(8)} ${op.padEnd(12)} threw: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.info('── [probe] supabaseAdmin access matrix ──────────────');
  for (const r of results) console.info(r);
  console.info('─────────────────────────────────────────────────────');

  const anyFailed = results.some((r) => r.includes('🚨'));
  if (anyFailed) {
    console.error(
      `🚨 [probe] At least one operation is denied. If cards is OK but players is not, ` +
      `your sb_secret_* key is likely SCOPED to specific tables. Regenerate it in the ` +
      `Supabase dashboard (Settings → API Keys) WITHOUT any "Restrict to..." scoping, ` +
      `or widen the restriction to cover the tables shown above.`
    );
  } else {
    console.info('✅ [probe] all probes passed — supabaseAdmin has full access');
  }
}

// Fire and forget — don't block module init
void probeAdminAccess();

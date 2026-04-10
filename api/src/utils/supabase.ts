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

// Live startup probe: try a trivial query against `cards` using the admin
// client. This is the authoritative answer to "does my key actually have
// service_role grants right now?". If it fails with 42501 here, it will
// definitely fail in /api/admin/cards — and we'll see it in Render's boot
// logs instead of only at the moment a user hits the page.
async function probeAdminAccess(): Promise<void> {
  if (!supabaseUrl || !supabaseServiceKey || supabaseServiceKey === 'placeholder') {
    console.warn('⚠️  [probe] skipping — SUPABASE_SERVICE_ROLE_KEY not configured');
    return;
  }
  try {
    const { error } = await supabaseAdmin
      .from('cards')
      .select('id', { count: 'exact', head: true });
    if (error) {
      console.error(
        `🚨 [probe] supabaseAdmin cannot read \`cards\`: ` +
        `${error.message}${error.code ? ` (code=${error.code})` : ''}${error.hint ? ` hint="${error.hint}"` : ''}`
      );
      console.error(
        `🚨 [probe] This means the current SUPABASE_SERVICE_ROLE_KEY is NOT ` +
        `authorized as service_role. All /api/admin/cards requests will fail ` +
        `until you replace it with a valid sb_secret_* (or legacy service_role JWT) key in Render env vars.`
      );
    } else {
      console.info('✅ [probe] supabaseAdmin can read `cards` — service_role grants are active');
    }
  } catch (err) {
    console.error(`🚨 [probe] unexpected failure: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Fire and forget — don't block module init
void probeAdminAccess();

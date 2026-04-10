import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.warn('⚠️  Supabase environment variables not set. Database features will not work.');
}

// Decode the middle segment of the supplied "service role" JWT and log the
// embedded role claim. This exists because a misconfigured env var
// (e.g. pasting the anon key into SUPABASE_SERVICE_ROLE_KEY) authenticates
// successfully but authorizes as `anon`, which then blows up later with
// confusing "permission denied for table X" errors from Postgres. Logging
// the role on boot makes that failure mode obvious instead of silent.
function identifySupabaseRole(jwt: string | undefined, label: string): void {
  if (!jwt || jwt === 'placeholder') {
    console.warn(`⚠️  ${label}: no key provided`);
    return;
  }
  try {
    const payload = jwt.split('.')[1];
    if (!payload) throw new Error('not a JWT');
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
    const role = decoded.role || 'unknown';
    if (label === 'SUPABASE_SERVICE_ROLE_KEY' && role !== 'service_role') {
      console.error(
        `🚨 ${label} is NOT a service_role key — it claims role="${role}". ` +
        `This will cause "permission denied" errors on tables that only ` +
        `grant access to service_role. Fix the env var.`
      );
    } else {
      console.info(`✅ ${label} authenticates as role="${role}"`);
    }
  } catch (err) {
    console.warn(`⚠️  ${label}: could not decode JWT — ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

identifySupabaseRole(supabaseServiceKey, 'SUPABASE_SERVICE_ROLE_KEY');
identifySupabaseRole(supabaseAnonKey, 'SUPABASE_ANON_KEY');

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

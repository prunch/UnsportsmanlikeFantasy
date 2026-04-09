import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Log env var status at startup so we can see it in Render logs
logger.info('[supabase] Initialising clients', {
  hasUrl: !!supabaseUrl,
  url: supabaseUrl || '⚠ NOT SET',
  hasServiceKey: !!supabaseServiceKey,
  serviceKeyPrefix: supabaseServiceKey ? supabaseServiceKey.substring(0, 20) + '...' : '⚠ NOT SET',
  hasAnonKey: !!supabaseAnonKey,
  anonKeyPrefix: supabaseAnonKey ? supabaseAnonKey.substring(0, 20) + '...' : '⚠ NOT SET'
});

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  logger.warn('[supabase] ⚠  One or more Supabase env vars are missing — database features will be broken!', {
    SUPABASE_URL: supabaseUrl ? 'ok' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey ? 'ok' : 'MISSING',
    SUPABASE_ANON_KEY: supabaseAnonKey ? 'ok' : 'MISSING'
  });
}

// Admin client — bypasses RLS (for all server-side operations)
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

// Public client — respects RLS (available for future use)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

logger.info('[supabase] Clients ready');

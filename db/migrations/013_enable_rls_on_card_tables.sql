-- Migration 013: Enable RLS on card-related tables (defense in depth)
--
-- STATUS: DRAFT — NOT YET APPLIED. Review before running.
--
-- Context:
--   Six tables currently have RLS DISABLED:
--     cards, played_cards, user_cards, switcheroo_log, user_switcheroo, weekly_card_picks
--
--   Three of them (cards, played_cards, user_cards) have orphaned policies left
--   over from earlier migrations — policies exist but RLS is off, so they're
--   inert. The Supabase advisor flags this as an ERROR:
--     policy_exists_rls_disabled on public.cards
--     policy_exists_rls_disabled on public.played_cards
--     policy_exists_rls_disabled on public.user_cards
--
--   Verified facts about how these tables are used (grep results as of 2026-04-10):
--     1. The frontend NEVER queries Supabase directly. src/src/utils/api.ts is
--        a pure fetch wrapper against /api/*. Zero imports of @supabase/supabase-js.
--     2. The backend uses `supabaseAdmin` (service_role) exclusively for all 19
--        .from() calls across api/src/routes/. The anon client exported from
--        api/src/utils/supabase.ts is never imported anywhere.
--     3. GRANT audit confirms only `service_role` has table privileges on these
--        six tables. Neither `anon` nor `authenticated` has any grants.
--
--   Conclusion: No live application traffic evaluates RLS on these tables.
--   Enabling RLS is pure defense-in-depth — it guarantees that IF someone later
--   adds authenticated grants (accidentally or otherwise), client REST access
--   will still be blocked by the absence of policies.
--
-- Strategy:
--   1. Drop the orphaned policies that reference auth.uid(). They were written
--      assuming authenticated users would query these tables directly, which
--      the current architecture doesn't do. Keeping them would be misleading.
--   2. Enable RLS on all six tables.
--   3. Create NO policies. service_role bypasses RLS by design, so the backend
--      continues to work exactly as it does today. anon and authenticated have
--      no grants AND no policies, so they're double-locked out.
--
-- Risk assessment:
--   * Backend impact: ZERO. service_role bypasses RLS, so every existing query
--     in api/src/routes/cards.ts, admin.ts, and elsewhere continues to work.
--   * Frontend impact: ZERO. Frontend never queries these tables directly.
--   * Future-proofing: if someone adds `GRANT ... TO authenticated` on these
--     tables down the road, RLS will still block client access instead of
--     silently exposing data.
--
-- If you decide you WANT authenticated users to read some of these tables
-- directly (e.g., let a user query their own user_cards without going through
-- the backend), do NOT apply this migration as-is — instead add explicit
-- SELECT policies alongside the RLS ENABLE.
--
-- To apply:
--   Review this file, then run via Supabase MCP or psql.

-- Step 1: Drop orphaned policies
DROP POLICY IF EXISTS cards_all_admin ON public.cards;
DROP POLICY IF EXISTS cards_select_authenticated ON public.cards;
DROP POLICY IF EXISTS played_cards_select ON public.played_cards;
DROP POLICY IF EXISTS user_cards_select_own ON public.user_cards;

-- Step 2: Enable RLS (with no policies → locks out anon/authenticated entirely)
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.played_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.switcheroo_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_switcheroo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_card_picks ENABLE ROW LEVEL SECURITY;

-- Step 3 (optional hygiene): force RLS even for table owner. Not strictly needed
-- since we don't grant on these tables except to service_role, but belt-and-suspenders.
-- Uncomment if desired:
-- ALTER TABLE public.cards FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.played_cards FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.user_cards FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.switcheroo_log FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.user_switcheroo FORCE ROW LEVEL SECURITY;
-- ALTER TABLE public.weekly_card_picks FORCE ROW LEVEL SECURITY;

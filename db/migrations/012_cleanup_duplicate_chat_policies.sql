-- Migration 012: Clean up duplicate RLS policies on chat_messages
--
-- Context:
--   Migration 002_rls_policies.sql created two policies:
--     - chat_select_member (SELECT): is_league_member(league_id) AND is_deleted = false
--     - chat_insert_member (INSERT): is_league_member(league_id) AND user_id = auth.uid()
--
--   Migration 008_phase4_polish.sql then created two MORE policies doing the
--   same thing with an inline subquery instead of the is_league_member() helper:
--     - chat_messages_select (SELECT): same logic, inline teams subquery
--     - chat_messages_insert (INSERT): same logic, inline teams subquery
--
--   is_league_member() is defined in 002 as:
--     SELECT EXISTS(SELECT 1 FROM teams WHERE league_id = p_league_id AND user_id = auth.uid());
--   ...which is identical to the inline subquery in the 008 policies, so they
--   are semantically duplicates.
--
-- Decision:
--   Keep the helper-function versions (chat_select_member, chat_insert_member)
--   because they're cleaner, use a single source of truth for membership, and
--   benefit from is_league_member() being SECURITY DEFINER.
--   Drop the inline duplicates from 008.
--
-- Risk: None. Dropping duplicates with identical semantics is a no-op.

DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;

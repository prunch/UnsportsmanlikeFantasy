-- Migration 010: Fix RLS policy column references
-- Fixes incorrect column references introduced in 002_rls_policies.sql:
--   user_cards.team_id  → user_cards.user_id / user_cards.league_id (table has no team_id)
--   played_cards.team_id → played_cards.user_id (table has no team_id)
--   played_cards.is_revealed → played_cards.revealed_at IS NOT NULL
--
-- Do NOT edit 002 — add fix policies here instead.

-- ============================================================
-- USER CARDS — drop broken policy, add correct one
-- ============================================================
DROP POLICY IF EXISTS user_cards_select_own ON user_cards;

-- user_cards has user_id and league_id columns (no team_id)
-- Users can see their own cards directly via user_id
CREATE POLICY user_cards_select_own ON user_cards
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- PLAYED CARDS — drop broken policy, add correct one
-- ============================================================
DROP POLICY IF EXISTS played_cards_select ON played_cards;

-- played_cards has user_id (not team_id) and revealed_at (not is_revealed)
CREATE POLICY played_cards_select ON played_cards
  FOR SELECT USING (
    is_league_member(league_id) AND (
      revealed_at IS NOT NULL OR
      user_id = auth.uid()
    )
  );

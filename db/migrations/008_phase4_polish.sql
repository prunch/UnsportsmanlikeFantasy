-- Gridiron Cards — Phase 4 Migration
-- Migration 008: Polish & Live Features
-- Run this in your Supabase SQL editor AFTER migrations 001-007

-- ============================================================
-- LEAGUES: Add 'paused' to status enum and trade_review_enabled
-- ============================================================

-- Add paused status to leagues check constraint
ALTER TABLE leagues
  DROP CONSTRAINT IF EXISTS leagues_status_check;

ALTER TABLE leagues
  ADD CONSTRAINT leagues_status_check
  CHECK (status IN ('setup', 'draft', 'active', 'paused', 'playoffs', 'complete'));

-- Add trade_review_enabled column (commissioner can require approval before trades execute)
ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS trade_review_enabled BOOLEAN DEFAULT FALSE;

-- ============================================================
-- CHAT MESSAGES: Ensure RLS is set up for Supabase Realtime
-- ============================================================

-- Enable Realtime on chat_messages (run in Supabase dashboard under Database > Replication if not already enabled)
-- ALTER TABLE chat_messages REPLICA IDENTITY FULL;

-- ============================================================
-- NOTIFICATIONS: Add index for faster unread count queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- SCORES: Add index for faster league+week queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_scores_league_week_season
  ON scores(league_id, week, season);

-- ============================================================
-- CHAT: Add index for faster message queries by league
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_chat_messages_league_active
  ON chat_messages(league_id, created_at DESC)
  WHERE is_deleted = FALSE;

-- ============================================================
-- MATCHUPS: Ensure indexes exist for scoreboard queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_matchups_league_week_final
  ON matchups(league_id, week, is_final);

-- ============================================================
-- RLS POLICIES FOR NEW TABLES (if not already set)
-- ============================================================

-- Chat Messages RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_messages_select ON chat_messages;
CREATE POLICY chat_messages_select ON chat_messages
  FOR SELECT USING (
    is_deleted = FALSE AND
    league_id IN (
      SELECT t.league_id FROM teams t WHERE t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_messages_insert ON chat_messages;
CREATE POLICY chat_messages_insert ON chat_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    league_id IN (
      SELECT t.league_id FROM teams t WHERE t.user_id = auth.uid()
    )
  );

-- Notifications RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete ON notifications;
CREATE POLICY notifications_delete ON notifications
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- SAMPLE NOTIFICATION TYPES (documentation comment)
-- ============================================================
-- Notification types used in the app:
--   'trade_offer'       — Trade proposal received
--   'waiver_result'     — Waiver claim result (approved/denied)
--   'card_played'       — Card was played against you (revealed at kickoff)
--   'lineup_reminder'   — Lineup reminder (Friday 6PM if empty slots)
--   'draft_starting'    — Draft starting soon
--   'general'           — Generic commissioner or system message

COMMENT ON COLUMN notifications.type IS 'trade_offer | waiver_result | card_played | lineup_reminder | draft_starting | general';

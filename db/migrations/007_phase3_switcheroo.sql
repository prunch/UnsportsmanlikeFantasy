-- Gridiron Cards — Phase 3: Card System
-- Migration 007: Switcheroo permanent card tracking
-- Run AFTER 006_phase3_played_cards.sql

-- ============================================================
-- USER_SWITCHEROO (tracks each user's Switcheroo state per league)
-- One row per user per league — upserted each time they update protection
-- ============================================================
CREATE TABLE IF NOT EXISTS user_switcheroo (
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id          UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  protected_player_id TEXT,          -- references players.id (Tank01 player ID), NULL = not protected
  last_used_week     INTEGER,        -- week number when Switcheroo was last played
  last_player_id     TEXT,           -- player_id used last time (prevents same player 2 weeks in a row)
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, league_id)
);

CREATE INDEX IF NOT EXISTS idx_switcheroo_league ON user_switcheroo(league_id);

-- ============================================================
-- SWITCHEROO_LOG (audit trail of every Switcheroo play)
-- ============================================================
CREATE TABLE IF NOT EXISTS switcheroo_log (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id        UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  protected_player_id TEXT NOT NULL,
  week             INTEGER NOT NULL,
  season           INTEGER NOT NULL,
  played_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_switcheroo_log_user_league ON switcheroo_log(user_id, league_id, week, season);

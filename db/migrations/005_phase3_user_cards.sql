-- Gridiron Cards — Phase 3: Card System
-- Migration 005: User card stacks (each user's hand of cards per league)
-- Run AFTER 004_phase3_cards.sql

-- ============================================================
-- USER_CARDS (a user's card stack in a specific league)
-- Each row = one card instance in a user's hand
-- ============================================================
CREATE TABLE IF NOT EXISTS user_cards (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  card_id     UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  obtained_at TIMESTAMPTZ DEFAULT NOW(),
  played_at   TIMESTAMPTZ  -- NULL = unplayed, set when card is played from hand
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_cards_user_league ON user_cards(user_id, league_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_league      ON user_cards(league_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_unplayed    ON user_cards(user_id, league_id) WHERE played_at IS NULL;

-- ============================================================
-- WEEKLY_CARD_PICKS (12-card pick session per user per week)
-- Tracks which 12 cards were presented and which 3 were chosen
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_card_picks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week        INTEGER NOT NULL,
  season      INTEGER NOT NULL,
  card_pool   JSONB NOT NULL DEFAULT '[]',  -- array of 12 card IDs presented
  picked_ids  JSONB NOT NULL DEFAULT '[]',  -- array of up to 3 chosen card IDs
  completed_at TIMESTAMPTZ,                -- NULL = still picking
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, league_id, week, season)
);

CREATE INDEX IF NOT EXISTS idx_weekly_picks_user_league ON weekly_card_picks(user_id, league_id, week, season);

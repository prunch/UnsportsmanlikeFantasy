-- Gridiron Cards — Phase 3: Card System
-- Migration 006: Played cards log
-- Run AFTER 005_phase3_user_cards.sql

-- ============================================================
-- PLAYED_CARDS (cards actually played in a given week)
-- Each row = one card play action
-- ============================================================
CREATE TABLE IF NOT EXISTS played_cards (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id        UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  card_id          UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_card_id     UUID REFERENCES user_cards(id) ON DELETE SET NULL,

  -- Target (one of these will be set depending on target_type)
  target_player_id TEXT,      -- references players.id (Tank01 player ID)
  target_team_id   UUID REFERENCES teams(id) ON DELETE CASCADE,

  -- Which play slot was used (controls who can target what)
  play_slot        TEXT NOT NULL CHECK (play_slot IN ('own_team', 'opponent', 'any_team')),

  -- Timing
  played_at        TIMESTAMPTZ DEFAULT NOW(),
  week             INTEGER NOT NULL,
  season           INTEGER NOT NULL,

  -- Reveal tracking
  revealed_at      TIMESTAMPTZ,   -- set at Sunday 1PM ET kickoff

  -- Score resolution
  resolved         BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at      TIMESTAMPTZ,
  score_delta      NUMERIC(8, 2)  -- actual points added/subtracted after resolution
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_played_cards_league_week ON played_cards(league_id, week, season);
CREATE INDEX IF NOT EXISTS idx_played_cards_user        ON played_cards(user_id, week, season);
CREATE INDEX IF NOT EXISTS idx_played_cards_target      ON played_cards(target_player_id) WHERE target_player_id IS NOT NULL;

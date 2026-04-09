-- ============================================================
-- Migration 004: Add value_rank to players table
-- Run this in the Supabase SQL editor
-- ============================================================

-- Add the value_rank column (nullable integer — null means unranked)
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS value_rank INTEGER DEFAULT NULL;

-- Index makes ORDER BY value_rank fast on the draft board
CREATE INDEX IF NOT EXISTS idx_players_value_rank ON players (value_rank)
  WHERE value_rank IS NOT NULL;

-- Comment for clarity
COMMENT ON COLUMN players.value_rank IS
  'Expert consensus ranking imported from CSV (Google Sheets export). Lower = more valuable.';

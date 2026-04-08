-- Migration 003: Phase 2 - Waiver Claims table
-- The core schema (leagues, teams, rosters, draft_picks) is already in 001_initial_schema.sql
-- This adds the waiver_claims table that was missing

-- ============================================================
-- WAIVER CLAIMS
-- ============================================================
CREATE TABLE IF NOT EXISTS waiver_claims (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id         UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  add_player_id     TEXT NOT NULL REFERENCES players(id),
  drop_player_id    TEXT REFERENCES players(id),
  priority          INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'cancelled')),
  processed_at      TIMESTAMPTZ,
  failure_reason    TEXT,
  week              INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waiver_claims_league ON waiver_claims(league_id, status);
CREATE INDEX IF NOT EXISTS idx_waiver_claims_team ON waiver_claims(team_id);

-- Enable RLS
ALTER TABLE waiver_claims ENABLE ROW LEVEL SECURITY;

-- League members can see waiver claims in their league
CREATE POLICY waiver_claims_select_member ON waiver_claims
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.league_id = waiver_claims.league_id AND t.user_id = auth.uid())
  );

-- Users can manage their own waiver claims
CREATE POLICY waiver_claims_own ON waiver_claims
  FOR ALL USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = waiver_claims.team_id AND t.user_id = auth.uid())
  );

-- ============================================================
-- ADD draft_state column to leagues (tracks current draft pick)
-- ============================================================
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_current_pick INTEGER DEFAULT 0;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_started_at TIMESTAMPTZ;

-- ============================================================
-- PERMISSIONS (run these in Supabase SQL editor)
-- ============================================================
GRANT ALL PRIVILEGES ON TABLE waiver_claims TO anon, authenticated, service_role;

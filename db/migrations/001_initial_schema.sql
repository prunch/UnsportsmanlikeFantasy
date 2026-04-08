-- Gridiron Cards — Initial Schema
-- Migration 001: Core tables
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  team_name   TEXT,
  avatar_url  TEXT,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LEAGUES
-- ============================================================
CREATE TABLE IF NOT EXISTS leagues (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT NOT NULL,
  commissioner_id     UUID NOT NULL REFERENCES users(id),
  max_teams           INTEGER NOT NULL DEFAULT 10 CHECK (max_teams BETWEEN 10 AND 12),
  draft_type          TEXT NOT NULL DEFAULT 'snake',
  draft_timer_seconds INTEGER NOT NULL DEFAULT 90,
  trade_deadline_week INTEGER NOT NULL DEFAULT 11,
  invite_code         TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'draft', 'active', 'playoffs', 'complete')),
  season              INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  current_week        INTEGER NOT NULL DEFAULT 0,
  scoring_type        TEXT NOT NULL DEFAULT 'ppr',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TEAMS (one per user per league)
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  team_name       TEXT NOT NULL,
  wins            INTEGER NOT NULL DEFAULT 0,
  losses          INTEGER NOT NULL DEFAULT 0,
  ties            INTEGER NOT NULL DEFAULT 0,
  points_for      NUMERIC(10,2) NOT NULL DEFAULT 0,
  points_against  NUMERIC(10,2) NOT NULL DEFAULT 0,
  waiver_priority INTEGER,
  draft_position  INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, user_id)
);

-- ============================================================
-- PLAYERS (NFL player registry, synced from Tank01)
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
  id              TEXT PRIMARY KEY,  -- Tank01 player ID
  name            TEXT NOT NULL,
  position        TEXT NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF')),
  nfl_team        TEXT NOT NULL,
  jersey_number   TEXT,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'ir', 'out', 'questionable', 'doubtful')),
  adp             NUMERIC(6,2),
  headshot_url    TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROSTERS (player slots per team per week)
-- ============================================================
CREATE TABLE IF NOT EXISTS rosters (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id   TEXT NOT NULL REFERENCES players(id),
  slot        TEXT NOT NULL CHECK (slot IN ('QB', 'RB', 'RB2', 'WR', 'WR2', 'TE', 'FLEX', 'K', 'DEF', 'BN1', 'BN2', 'BN3', 'BN4', 'BN5', 'BN6', 'IR1', 'IR2')),
  week        INTEGER NOT NULL DEFAULT 0,  -- 0 = current roster
  acquired_via TEXT DEFAULT 'draft' CHECK (acquired_via IN ('draft', 'waiver', 'trade', 'free_agent')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, week, slot)
);

-- ============================================================
-- MATCHUPS (weekly head-to-head)
-- ============================================================
CREATE TABLE IF NOT EXISTS matchups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week            INTEGER NOT NULL,
  home_team_id    UUID NOT NULL REFERENCES teams(id),
  away_team_id    UUID NOT NULL REFERENCES teams(id),
  home_score      NUMERIC(10,2) DEFAULT 0,
  away_score      NUMERIC(10,2) DEFAULT 0,
  winner_team_id  UUID REFERENCES teams(id),
  is_playoff      BOOLEAN DEFAULT FALSE,
  is_consolation  BOOLEAN DEFAULT FALSE,
  is_final        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCORES (live + final per player per week)
-- ============================================================
CREATE TABLE IF NOT EXISTS scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id       TEXT NOT NULL REFERENCES players(id),
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week            INTEGER NOT NULL,
  season          INTEGER NOT NULL,
  base_points     NUMERIC(10,2) DEFAULT 0,
  card_modifier   NUMERIC(10,2) DEFAULT 0,
  final_points    NUMERIC(10,2) DEFAULT 0,
  is_live         BOOLEAN DEFAULT FALSE,
  is_final        BOOLEAN DEFAULT FALSE,
  stats_json      JSONB,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, league_id, week, season)
);

-- ============================================================
-- TRANSACTIONS (add/drop/trade/waiver log)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id     UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('add', 'drop', 'trade', 'waiver_claim', 'ir_move')),
  team_id       UUID NOT NULL REFERENCES teams(id),
  player_id     TEXT REFERENCES players(id),
  related_team_id UUID REFERENCES teams(id),
  notes         TEXT,
  status        TEXT DEFAULT 'complete' CHECK (status IN ('pending', 'complete', 'rejected', 'vetoed')),
  week          INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DRAFT PICKS
-- ============================================================
CREATE TABLE IF NOT EXISTS draft_picks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id     UUID NOT NULL REFERENCES teams(id),
  player_id   TEXT REFERENCES players(id),
  round       INTEGER NOT NULL,
  pick        INTEGER NOT NULL,
  is_auto     BOOLEAN DEFAULT FALSE,
  picked_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, round, pick)
);

-- ============================================================
-- CARDS (pool managed by admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS cards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  target_type     TEXT NOT NULL CHECK (target_type IN ('player', 'position', 'all')),
  target_position TEXT CHECK (target_position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'All')),
  effect_type     TEXT NOT NULL CHECK (effect_type IN ('buff', 'debuff')),
  modifier_type   TEXT NOT NULL CHECK (modifier_type IN ('absolute', 'percentage')),
  modifier_value  NUMERIC(10,2) NOT NULL,
  rarity          TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare')),
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USER CARDS (each user's current stack)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_cards (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  card_id     UUID NOT NULL REFERENCES cards(id),
  week_acquired INTEGER NOT NULL,
  is_switcheroo BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PLAYED CARDS (cards played per week)
-- ============================================================
CREATE TABLE IF NOT EXISTS played_cards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week            INTEGER NOT NULL,
  team_id         UUID NOT NULL REFERENCES teams(id),
  user_card_id    UUID REFERENCES user_cards(id),
  card_id         UUID NOT NULL REFERENCES cards(id),
  play_slot       TEXT NOT NULL CHECK (play_slot IN ('own_team', 'opponent', 'any_team')),
  target_team_id  UUID REFERENCES teams(id),
  target_player_id TEXT REFERENCES players(id),
  is_revealed     BOOLEAN DEFAULT FALSE,
  is_resolved     BOOLEAN DEFAULT FALSE,
  played_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CHAT MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  message     TEXT NOT NULL,
  is_deleted  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id   UUID REFERENCES leagues(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- API CONFIG (admin-stored keys, never in code)
-- ============================================================
CREATE TABLE IF NOT EXISTS api_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER leagues_updated_at BEFORE UPDATE ON leagues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER cards_updated_at BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_teams_league_id ON teams(league_id);
CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id);
CREATE INDEX IF NOT EXISTS idx_rosters_team_id ON rosters(team_id);
CREATE INDEX IF NOT EXISTS idx_matchups_league_week ON matchups(league_id, week);
CREATE INDEX IF NOT EXISTS idx_scores_player_week ON scores(player_id, week, season);
CREATE INDEX IF NOT EXISTS idx_transactions_league ON transactions(league_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_league ON chat_messages(league_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_user_cards_team ON user_cards(team_id);
CREATE INDEX IF NOT EXISTS idx_played_cards_league_week ON played_cards(league_id, week);

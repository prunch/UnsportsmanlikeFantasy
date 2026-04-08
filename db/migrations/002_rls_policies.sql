-- Migration 002: Row Level Security Policies
-- Run after 001_initial_schema.sql

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE played_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper function: check if user is in a league
-- ============================================================
CREATE OR REPLACE FUNCTION is_league_member(p_league_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM teams
    WHERE league_id = p_league_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- USERS
-- ============================================================
-- Users can read their own profile
CREATE POLICY users_select_own ON users
  FOR SELECT USING (id = auth.uid());

-- Users can update their own profile
CREATE POLICY users_update_own ON users
  FOR UPDATE USING (id = auth.uid());

-- Service role can do anything (backend)
-- (handled by service role key bypassing RLS)

-- ============================================================
-- LEAGUES
-- ============================================================
-- Members can see their leagues
CREATE POLICY leagues_select_member ON leagues
  FOR SELECT USING (is_league_member(id));

-- Any authenticated user can see league basics (to join)
CREATE POLICY leagues_select_invite ON leagues
  FOR SELECT USING (status = 'setup');

-- Only commissioner can update
CREATE POLICY leagues_update_commissioner ON leagues
  FOR UPDATE USING (commissioner_id = auth.uid());

-- ============================================================
-- TEAMS
-- ============================================================
-- League members can see all teams in their leagues
CREATE POLICY teams_select_member ON teams
  FOR SELECT USING (is_league_member(league_id));

-- Users can update their own team
CREATE POLICY teams_update_own ON teams
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================
-- ROSTERS
-- ============================================================
-- League members can see rosters in their leagues
CREATE POLICY rosters_select_member ON rosters
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = rosters.team_id AND is_league_member(t.league_id))
  );

-- Users can update their own roster
CREATE POLICY rosters_update_own ON rosters
  FOR ALL USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = rosters.team_id AND t.user_id = auth.uid())
  );

-- ============================================================
-- MATCHUPS
-- ============================================================
CREATE POLICY matchups_select_member ON matchups
  FOR SELECT USING (is_league_member(league_id));

-- ============================================================
-- SCORES
-- ============================================================
CREATE POLICY scores_select_member ON scores
  FOR SELECT USING (is_league_member(league_id));

-- ============================================================
-- PLAYERS (public read — everyone can see NFL players)
-- ============================================================
CREATE POLICY players_select_all ON players
  FOR SELECT USING (TRUE);

-- ============================================================
-- CARDS (active cards are public, all league members can see)
-- ============================================================
CREATE POLICY cards_select_active ON cards
  FOR SELECT USING (is_active = TRUE);

-- ============================================================
-- USER CARDS
-- ============================================================
-- Users can see their own cards
CREATE POLICY user_cards_select_own ON user_cards
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM teams t WHERE t.id = user_cards.team_id AND t.user_id = auth.uid())
  );

-- ============================================================
-- PLAYED CARDS (secret until revealed)
-- ============================================================
-- Users can see played cards in their league after reveal, or their own
CREATE POLICY played_cards_select ON played_cards
  FOR SELECT USING (
    is_league_member(league_id) AND (
      is_revealed = TRUE OR
      EXISTS (SELECT 1 FROM teams t WHERE t.id = played_cards.team_id AND t.user_id = auth.uid())
    )
  );

-- ============================================================
-- CHAT MESSAGES
-- ============================================================
CREATE POLICY chat_select_member ON chat_messages
  FOR SELECT USING (is_league_member(league_id) AND is_deleted = FALSE);

CREATE POLICY chat_insert_member ON chat_messages
  FOR INSERT WITH CHECK (is_league_member(league_id) AND user_id = auth.uid());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE POLICY notifications_own ON notifications
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- API CONFIG (admin only — no RLS policy = only service role)
-- ============================================================
-- No public policies — only accessible via service role key (backend)

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE POLICY transactions_select_member ON transactions
  FOR SELECT USING (is_league_member(league_id));

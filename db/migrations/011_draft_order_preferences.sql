-- Migration 011: User draft order preferences
-- Adds position priority list per team, stored on the teams table.
-- Also adds auto_pick_enabled flag so users can opt into full auto-pick.

-- Add draft order preference to teams table
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS draft_order TEXT[] DEFAULT ARRAY['RB','WR','QB','TE','K','DEF'],
  ADD COLUMN IF NOT EXISTS auto_pick_enabled BOOLEAN NOT NULL DEFAULT false;

-- Validate draft_order on insert/update via a check constraint
-- (Supabase/Postgres doesn't easily enforce array contents, so we do it in the API)

COMMENT ON COLUMN teams.draft_order IS
  'Ordered list of NFL positions the user wants prioritized during auto-pick, e.g. {RB,WR,QB,TE,K,DEF}';

COMMENT ON COLUMN teams.auto_pick_enabled IS
  'When true the server will always auto-pick for this team, even when the timer has not expired';

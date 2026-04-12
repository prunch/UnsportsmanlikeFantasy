-- Migration 018: Add max_picks to weekly_card_picks
-- Pre-week-1 seed sessions get 6 picks, normal weeks get 3
ALTER TABLE public.weekly_card_picks
  ADD COLUMN IF NOT EXISTS max_picks INTEGER NOT NULL DEFAULT 3;

COMMENT ON COLUMN public.weekly_card_picks.max_picks IS 'Number of cards the user can pick this session. 6 for pre-week-1 seed (empty deck), 3 for normal weeks.';

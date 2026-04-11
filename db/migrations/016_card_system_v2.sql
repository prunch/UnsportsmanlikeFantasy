-- Gridiron Cards — Phase 3.5: Card System v2 redesign
-- Migration 016: Add target_scope, expand play_slot enum, add target_group,
--                raise deck cap enforcement (API-level), deactivate team-scope cards
-- See CARD_SYSTEM_REDESIGN.md for the full design spec.
--
-- This migration is backward-compatible: v1 play_slot values are preserved,
-- v1 target_type column is retained but made nullable, and v1 seed cards are
-- reclassified into target_scope based on description.

-- ============================================================
-- 1) cards.target_scope — distinguish single-player from group targeting
-- ============================================================
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS target_scope TEXT
    CHECK (target_scope IN ('player', 'group'));

-- Best-effort backfill: descriptions beginning with "All " become group cards.
-- Everything else defaults to player. This matches the existing v1 seed,
-- where "All WRs...", "All RBs..." are the only group cards.
UPDATE cards
  SET target_scope = CASE
    WHEN description ILIKE 'all %' THEN 'group'
    ELSE 'player'
  END
  WHERE target_scope IS NULL;

ALTER TABLE cards ALTER COLUMN target_scope SET NOT NULL;

-- v1 target_type kept for rollback safety, but no longer required
ALTER TABLE cards ALTER COLUMN target_type DROP NOT NULL;

-- ============================================================
-- 2) Deactivate any team-scope cards (target_position='All')
--    v2 does not support whole-team scope. Not expected to match any v1 seeds,
--    but included to catch admin-authored cards from the live system.
-- ============================================================
UPDATE cards
  SET is_active = FALSE
  WHERE target_position = 'All';

-- ============================================================
-- 3) played_cards.play_slot — expand enum to include v2 slots
--    v1 values ('own_team','opponent','any_team') are kept for backward compat
--    during the v1→v2 rollout. The v2 API writes the new values.
-- ============================================================
ALTER TABLE played_cards
  DROP CONSTRAINT IF EXISTS played_cards_play_slot_check;

ALTER TABLE played_cards
  ADD CONSTRAINT played_cards_play_slot_check
    CHECK (play_slot IN (
      'own_team', 'opponent', 'any_team',
      'switcheroo', 'buff', 'debuff', 'wild'
    ));

-- ============================================================
-- 4) played_cards.target_group — for group-scope plays
--    When a group card is played, target_player_id is NULL and target_group
--    is set to the position bloc that was hit (e.g. 'WR' for an "All WRs"
--    play). The scoring resolver fans this out to the relevant starters at
--    resolution time.
-- ============================================================
ALTER TABLE played_cards
  ADD COLUMN IF NOT EXISTS target_group TEXT
    CHECK (target_group IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF'));

-- ============================================================
-- 5) Impact preview cache — used by hover previews and confirm modals
--    One row per played_card, storing the resolver's projected delta so the
--    UI can display "-18.5 points" without recomputing each hover.
-- ============================================================
CREATE TABLE IF NOT EXISTS card_play_preview (
  played_card_id     UUID PRIMARY KEY REFERENCES played_cards(id) ON DELETE CASCADE,
  projected_delta    NUMERIC(8, 2) NOT NULL,
  projected_delta_pct NUMERIC(6, 2) NOT NULL,
  affected_player_ids JSONB,                  -- array of player IDs for group plays
  computed_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_play_preview_played_card
  ON card_play_preview(played_card_id);

-- ============================================================
-- Note: Deck cap change (6 → 12) is enforced in the API layer, not the DB.
-- See api/src/routes/cards.ts — look for the `6` literal in the stack-size
-- check inside POST /api/leagues/:id/cards/pick.
-- ============================================================

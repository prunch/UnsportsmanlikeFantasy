-- ============================================================
-- Migration 015: Kicker and Defense stat columns
--
-- Adds position-specific stat columns to player_season_stats so the Players
-- grid can show appropriate numbers for kickers (FGs, XPs) and team defenses
-- (sacks, INTs, TDs, points/yards allowed). The existing offensive columns
-- (pass/rush/rec) continue to apply to QB/RB/WR/TE as before.
-- ============================================================

-- ── Kicker stats ─────────────────────────────────────────────
ALTER TABLE player_season_stats
  ADD COLUMN IF NOT EXISTS fg_made INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fg_att  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fg_long INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_made INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_att  INTEGER NOT NULL DEFAULT 0;

-- ── Defense stats ────────────────────────────────────────────
-- Sacks are stored as NUMERIC(5,1) because half-sacks are a thing.
-- `def_int` is interceptions-by-the-defense (distinct from the offensive
-- `pass_int` which counts INTs thrown by a QB).
ALTER TABLE player_season_stats
  ADD COLUMN IF NOT EXISTS sacks             NUMERIC(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS def_int           INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fumbles_recovered INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS def_td             INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safeties          INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_allowed    INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS yards_allowed     INTEGER      NOT NULL DEFAULT 0;

COMMENT ON COLUMN player_season_stats.sacks IS 'Team defensive sacks for the season (supports half-sacks).';
COMMENT ON COLUMN player_season_stats.def_int IS 'Team defensive interceptions for the season (not QB INTs thrown).';
COMMENT ON COLUMN player_season_stats.points_allowed IS 'Total points allowed by the team defense for the season.';

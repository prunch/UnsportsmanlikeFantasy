-- ============================================================
-- Migration 014: Player stats, projections, and per-league user rankings
--
-- Adds three tables that power the new Player Stats Grid feature:
--
--   1. player_season_stats    — historical season totals (one row per player/season)
--   2. player_projections     — forward-looking projections (one row per player/season)
--   3. user_player_rankings   — per-league, per-user draft ranking overrides
--
-- None of these replace existing columns — `players.adp` and `players.value_rank`
-- remain the global defaults. The new tables layer on top so the grid can show
-- real stats/projections and let each user tune their own draft board.
-- ============================================================

-- ── 1. Historical season totals ──────────────────────────────
-- Wide-ish table of per-season box-score-style totals. Fantasy points are stored
-- pre-computed for both PPR and standard so the grid can show either without a
-- server-side join that recomputes on every request.
CREATE TABLE IF NOT EXISTS player_season_stats (
  player_id            TEXT    NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season               INTEGER NOT NULL,
  games_played         INTEGER NOT NULL DEFAULT 0,

  -- Fantasy totals (pre-computed from the underlying box-score columns below)
  fantasy_points_ppr   NUMERIC(7,2) NOT NULL DEFAULT 0,
  fantasy_points_std   NUMERIC(7,2) NOT NULL DEFAULT 0,

  -- Passing
  pass_att             INTEGER NOT NULL DEFAULT 0,
  pass_cmp             INTEGER NOT NULL DEFAULT 0,
  pass_yds             INTEGER NOT NULL DEFAULT 0,
  pass_td              INTEGER NOT NULL DEFAULT 0,
  pass_int             INTEGER NOT NULL DEFAULT 0,

  -- Rushing
  rush_att             INTEGER NOT NULL DEFAULT 0,
  rush_yds             INTEGER NOT NULL DEFAULT 0,
  rush_td              INTEGER NOT NULL DEFAULT 0,

  -- Receiving
  targets              INTEGER NOT NULL DEFAULT 0,
  rec                  INTEGER NOT NULL DEFAULT 0,
  rec_yds              INTEGER NOT NULL DEFAULT 0,
  rec_td               INTEGER NOT NULL DEFAULT 0,

  -- Misc
  fumbles_lost         INTEGER NOT NULL DEFAULT 0,

  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (player_id, season)
);

CREATE INDEX IF NOT EXISTS idx_player_season_stats_season
  ON player_season_stats (season, fantasy_points_ppr DESC);

COMMENT ON TABLE player_season_stats IS
  'Season-long box-score totals per player, ingested from Tank01 (or similar). Fantasy points pre-computed for fast grid rendering.';

-- ── 2. Projections for the upcoming season ───────────────────
-- Forward-looking values only. Re-running the projection ingest is idempotent
-- via the primary key; old projections for past seasons are kept as history.
CREATE TABLE IF NOT EXISTS player_projections (
  player_id              TEXT    NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season                 INTEGER NOT NULL,

  proj_fantasy_pts_ppr   NUMERIC(7,2),
  proj_fantasy_pts_std   NUMERIC(7,2),
  proj_games             INTEGER,
  proj_ppg_ppr           NUMERIC(5,2),    -- convenience, may be NULL if proj_games unknown
  tier                   INTEGER,         -- 1 = best; NULL = untiered
  bye_week               INTEGER,
  source                 TEXT NOT NULL DEFAULT 'tank01',

  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (player_id, season)
);

CREATE INDEX IF NOT EXISTS idx_player_projections_season
  ON player_projections (season, proj_fantasy_pts_ppr DESC NULLS LAST);

COMMENT ON TABLE player_projections IS
  'Forward-looking season projections per player. Refreshed weekly during the season and daily during preseason.';

-- ── 3. Per-user, per-league player rankings ──────────────────
-- Each row is one player in one user's personal draft board for one league.
-- The (league_id, user_id, player_id) composite PK lets us upsert the whole
-- list in one call from the frontend. `rank` is unique per (league, user) via
-- a partial unique index so we get a helpful error if the client sends dupes.
CREATE TABLE IF NOT EXISTS user_player_rankings (
  league_id   UUID    NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id     UUID    NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  player_id   TEXT    NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rank        INTEGER NOT NULL CHECK (rank > 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (league_id, user_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_user_player_rankings_lookup
  ON user_player_rankings (league_id, user_id, rank);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_player_rankings_unique_rank
  ON user_player_rankings (league_id, user_id, rank);

COMMENT ON TABLE user_player_rankings IS
  'Each row is one player in one user''s personal draft board for one league. Drives autodraft ordering.';

-- ── updated_at trigger for the two writeable-by-users tables ─
-- (player_season_stats and player_projections are backend-only; we keep
-- manual NOW() in the upsert path rather than a trigger.)
CREATE TRIGGER user_player_rankings_updated_at
  BEFORE UPDATE ON user_player_rankings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

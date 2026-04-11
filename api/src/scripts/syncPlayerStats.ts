/**
 * syncPlayerStats.ts
 *
 * Pulls per-player season totals from Tank01 and upserts them into
 * `player_season_stats` for the specified season. Run this AFTER syncPlayers
 * so every Tank01 playerID already exists in the players table.
 *
 * Usage:
 *   npm run sync:stats -- --season 2025
 *   npm run sync:stats -- --season 2025 --limit 50     # quick smoke test
 *   npm run sync:stats -- --season 2025 --seed         # skip API, seed dummy rows
 *
 * Notes
 * ─────
 * - Tank01's `/getNFLPlayerInfo` endpoint returns stats keyed by season under
 *   `body.stats.{season}`. The shape varies by position (QB has passing
 *   blocks, RB has rushing blocks, etc.) so we defensively parse each block.
 * - We compute fantasy points ourselves rather than trusting any provider's
 *   scoring, because every league uses its own settings. We store both PPR
 *   and standard so the UI can toggle.
 * - Ingest is rate-limited. Tank01's RapidAPI plan caps requests/sec; we
 *   sleep 150ms between calls which stays well under the limit.
 */

import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── CLI parsing ───────────────────────────────────────────────────────────────
interface Args {
  season: number;
  limit: number | null;
  seed: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { season: new Date().getFullYear(), limit: null, seed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season') out.season = parseInt(argv[++i], 10);
    else if (a === '--limit') out.limit = parseInt(argv[++i], 10);
    else if (a === '--seed') out.seed = true;
  }
  if (!Number.isFinite(out.season)) {
    console.error('❌ --season must be an integer year');
    process.exit(1);
  }
  return out;
}

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Tank01 ────────────────────────────────────────────────────────────────────
const TANK01_BASE_URL = 'https://tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com';
const TANK01_HOST = 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com';

async function getTank01Key(): Promise<string | null> {
  if (process.env.TANK01_API_KEY) return process.env.TANK01_API_KEY;
  const { data } = await supabase
    .from('api_config')
    .select('value')
    .eq('key', 'tank01_api_key')
    .single();
  return data?.value || null;
}

interface Tank01StatBlock {
  passingYards?: string;
  passTD?: string;
  int?: string;
  passAttempts?: string;
  passCompletions?: string;

  rushYds?: string;
  rushTD?: string;
  carries?: string;

  recTD?: string;
  recYds?: string;
  receptions?: string;
  targets?: string;

  fumblesLost?: string;
  gamesPlayed?: string;
}

interface Tank01PlayerInfo {
  statusCode: number;
  body?: {
    playerID?: string;
    stats?: Record<string, Tank01StatBlock>;
  };
}

async function fetchPlayerSeason(
  apiKey: string,
  playerId: string,
  season: number
): Promise<Tank01StatBlock | null> {
  const url = `${TANK01_BASE_URL}/getNFLPlayerInfo?playerID=${encodeURIComponent(playerId)}&getStats=true&statsSeason=${season}`;
  const res = await fetch(url, {
    headers: {
      'x-rapidapi-host': TANK01_HOST,
      'x-rapidapi-key': apiKey,
    },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as Tank01PlayerInfo;
  if (json.statusCode !== 200 || !json.body?.stats) return null;

  // stats can be keyed by year OR by 'season' OR buried a level deeper — we
  // grab whichever block has the year we asked for.
  const stats = json.body.stats;
  return stats[String(season)] || stats[season] || null;
}

// ── Stat parsing ──────────────────────────────────────────────────────────────
function n(v: string | number | undefined): number {
  if (v == null) return 0;
  const parsed = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface ParsedStats {
  games_played: number;
  pass_att: number;
  pass_cmp: number;
  pass_yds: number;
  pass_td: number;
  pass_int: number;
  rush_att: number;
  rush_yds: number;
  rush_td: number;
  targets: number;
  rec: number;
  rec_yds: number;
  rec_td: number;
  fumbles_lost: number;
}

function parseStatBlock(block: Tank01StatBlock): ParsedStats {
  return {
    games_played: n(block.gamesPlayed),
    pass_att: n(block.passAttempts),
    pass_cmp: n(block.passCompletions),
    pass_yds: n(block.passingYards),
    pass_td: n(block.passTD),
    pass_int: n(block.int),
    rush_att: n(block.carries),
    rush_yds: n(block.rushYds),
    rush_td: n(block.rushTD),
    targets: n(block.targets),
    rec: n(block.receptions),
    rec_yds: n(block.recYds),
    rec_td: n(block.recTD),
    fumbles_lost: n(block.fumblesLost),
  };
}

// Standard yahoo-ish fantasy scoring:
//   Pass: 1 pt / 25 yds, 4 pt / TD, -1 / INT
//   Rush: 1 pt / 10 yds, 6 pt / TD
//   Rec:  1 pt / 10 yds, 6 pt / TD, +1 per reception in PPR
//   Fumbles lost: -2
function computeFantasyPoints(s: ParsedStats, ppr: boolean): number {
  const passPts = s.pass_yds / 25 + s.pass_td * 4 - s.pass_int;
  const rushPts = s.rush_yds / 10 + s.rush_td * 6;
  const recPts = s.rec_yds / 10 + s.rec_td * 6 + (ppr ? s.rec : 0);
  const pts = passPts + rushPts + recPts - s.fumbles_lost * 2;
  return Math.round(pts * 100) / 100;
}

// ── Seed mode: deterministic placeholder rows (no API calls) ─────────────────
// Used for local dev and when we just want the grid wired up without burning
// RapidAPI quota. Seeds one stats row + one projection row per player with
// position-aware values so the grid actually looks populated.
function seedStatsFor(
  position: string,
  adp: number | null,
  _valueRank: number | null
): { stats: ParsedStats; fppr: number; fstd: number; projPpr: number; projStd: number } {
  // ADP is our only signal for "how good is this player" in seed mode. Lower
  // ADP => more usage. Clamp to [1, 400] and flip so high value => more stats.
  const raw = adp ?? 200;
  const rank = Math.max(1, Math.min(400, raw));
  const score = (400 - rank) / 400; // 0..1

  const gp = 16;

  let stats: ParsedStats = {
    games_played: gp,
    pass_att: 0, pass_cmp: 0, pass_yds: 0, pass_td: 0, pass_int: 0,
    rush_att: 0, rush_yds: 0, rush_td: 0,
    targets: 0, rec: 0, rec_yds: 0, rec_td: 0,
    fumbles_lost: 0,
  };

  if (position === 'QB') {
    stats = {
      ...stats,
      pass_att: Math.round(500 * score + 200),
      pass_cmp: Math.round(340 * score + 120),
      pass_yds: Math.round(4000 * score + 1500),
      pass_td: Math.round(28 * score + 6),
      pass_int: Math.round(12 - 6 * score),
      rush_att: Math.round(60 * score + 10),
      rush_yds: Math.round(350 * score + 40),
      rush_td: Math.round(3 * score),
    };
  } else if (position === 'RB') {
    stats = {
      ...stats,
      rush_att: Math.round(270 * score + 30),
      rush_yds: Math.round(1100 * score + 100),
      rush_td: Math.round(10 * score),
      targets: Math.round(60 * score + 10),
      rec: Math.round(45 * score + 8),
      rec_yds: Math.round(400 * score + 50),
      rec_td: Math.round(2 * score),
    };
  } else if (position === 'WR') {
    stats = {
      ...stats,
      targets: Math.round(140 * score + 30),
      rec: Math.round(90 * score + 20),
      rec_yds: Math.round(1200 * score + 200),
      rec_td: Math.round(9 * score),
      rush_att: Math.round(5 * score),
      rush_yds: Math.round(30 * score),
    };
  } else if (position === 'TE') {
    stats = {
      ...stats,
      targets: Math.round(100 * score + 20),
      rec: Math.round(70 * score + 15),
      rec_yds: Math.round(800 * score + 100),
      rec_td: Math.round(7 * score),
    };
  } else if (position === 'K') {
    stats = { ...stats, games_played: 16 };
  } else if (position === 'DEF') {
    stats = { ...stats, games_played: 16 };
  }

  const fppr = computeFantasyPoints(stats, true);
  const fstd = computeFantasyPoints(stats, false);

  // Projections are roughly last-season scaled by 0.9 — deterministic noise
  // so the grid isn't identical to history.
  const projPpr = Math.round(fppr * 0.9 * 100) / 100;
  const projStd = Math.round(fstd * 0.9 * 100) / 100;

  return { stats, fppr, fstd, projPpr, projStd };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs();
  console.log(`🏈 syncPlayerStats: season=${args.season} limit=${args.limit ?? 'ALL'} seed=${args.seed}`);

  // Load all players. We need id + position + adp for the seed-mode computation.
  let query = supabase
    .from('players')
    .select('id, name, position, adp, value_rank')
    .order('adp', { ascending: true, nullsFirst: false });
  if (args.limit) query = query.limit(args.limit);

  const { data: players, error } = await query;
  if (error) {
    console.error('❌ Failed to load players:', error.message);
    process.exit(1);
  }
  if (!players || players.length === 0) {
    console.error('❌ No players found. Run sync:players first.');
    process.exit(1);
  }
  console.log(`📋 Loaded ${players.length} players`);

  const statsRows: Array<Record<string, unknown>> = [];
  const projRows: Array<Record<string, unknown>> = [];

  if (args.seed) {
    // Seed mode — no API calls
    for (const p of players) {
      const { stats, fppr, fstd, projPpr, projStd } = seedStatsFor(
        p.position as string,
        (p.adp as number | null) ?? null,
        (p.value_rank as number | null) ?? null
      );
      statsRows.push({
        player_id: p.id,
        season: args.season,
        ...stats,
        fantasy_points_ppr: fppr,
        fantasy_points_std: fstd,
      });
      projRows.push({
        player_id: p.id,
        season: args.season,
        proj_fantasy_pts_ppr: projPpr,
        proj_fantasy_pts_std: projStd,
        proj_games: 17,
        proj_ppg_ppr: projPpr > 0 ? Math.round((projPpr / 17) * 100) / 100 : null,
        tier: null,
        bye_week: null,
        source: 'seed',
      });
    }
    console.log(`🌱 Seed mode: built ${statsRows.length} stats rows + ${projRows.length} projection rows`);
  } else {
    // Real Tank01 mode
    const maybeKey = await getTank01Key();
    if (!maybeKey) {
      console.error('❌ No Tank01 API key configured. Set TANK01_API_KEY env or api_config row.');
      console.error('   Tip: run with --seed to populate placeholder rows without API calls.');
      process.exit(1);
      throw new Error('unreachable'); // narrows maybeKey for TS
    }
    const apiKey: string = maybeKey;

    let i = 0;
    for (const p of players) {
      i++;
      if (i % 50 === 0) console.log(`  … ${i}/${players.length}`);

      try {
        const block = await fetchPlayerSeason(apiKey, p.id as string, args.season);
        if (!block) continue;

        const parsed = parseStatBlock(block);
        const fppr = computeFantasyPoints(parsed, true);
        const fstd = computeFantasyPoints(parsed, false);

        statsRows.push({
          player_id: p.id,
          season: args.season,
          ...parsed,
          fantasy_points_ppr: fppr,
          fantasy_points_std: fstd,
        });
      } catch (err) {
        console.warn(`  ⚠️ ${p.name}: ${err instanceof Error ? err.message : 'fetch failed'}`);
      }

      // Courtesy rate limit — 150ms between calls keeps us well under the cap
      await new Promise((r) => setTimeout(r, 150));
    }
    console.log(`📊 Fetched stats for ${statsRows.length}/${players.length} players`);
  }

  // Upsert in batches
  const BATCH = 200;
  async function upsertChunked(table: string, rows: Array<Record<string, unknown>>, conflict: string): Promise<void> {
    let ok = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const { error: upErr } = await supabase.from(table).upsert(chunk, { onConflict: conflict });
      if (upErr) {
        console.error(`❌ ${table} batch ${i / BATCH + 1} failed:`, upErr.message);
      } else {
        ok += chunk.length;
      }
    }
    console.log(`  ↑ ${table}: ${ok}/${rows.length} rows upserted`);
  }

  if (statsRows.length > 0) await upsertChunked('player_season_stats', statsRows, 'player_id,season');
  if (projRows.length > 0) await upsertChunked('player_projections', projRows, 'player_id,season');

  console.log('🎉 Done.');
}

main().catch((err) => {
  console.error('💥 Unhandled:', err);
  process.exit(1);
});

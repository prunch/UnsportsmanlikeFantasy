/**
 * syncPlayers.ts
 * Fetches all NFL players from Tank01 API and upserts them into the players table.
 *
 * Run with: npm run sync:players
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ── Supabase setup ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── Tank01 API config ──────────────────────────────────────────────────────────
const TANK01_BASE_URL = 'https://tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com';
const TANK01_API_KEY = '6331ae9eedmsh35d60ce275915c4p1c709bjsn7d75d291860c';
const TANK01_HOST = 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com';

// ── Type defs ──────────────────────────────────────────────────────────────────
interface Tank01Injury {
  designation?: string;
  description?: string;
}

interface Tank01Player {
  playerID: string;
  espnName?: string;
  longName?: string;
  pos?: string;
  team?: string;
  espnHeadshot?: string;
  isFreeAgent?: string;
  injury?: Tank01Injury;
  bDay?: string;
  school?: string;
}

interface Tank01Response {
  statusCode: number;
  body: Tank01Player[] | Record<string, Tank01Player>;
}

// Valid positions accepted by the DB CHECK constraint
const VALID_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

// Map various kicker codes → 'K', any defense label → 'DEF'
function normalizePosition(pos: string | undefined): string | null {
  if (!pos) return null;
  const p = pos.toUpperCase().trim();
  if (VALID_POSITIONS.has(p)) return p;
  if (['PK', 'K'].includes(p)) return 'K';
  if (['DST', 'D/ST', 'DEF', 'D'].includes(p)) return 'DEF';
  return null; // skip positions we can't map (OL, DL, LB, CB, S, P, etc.)
}

// Map Tank01 injury designation to the DB status enum
function mapInjuryStatus(designation: string | undefined): string {
  if (!designation) return 'active';
  const d = designation.toLowerCase();
  if (d.includes('ir') || d.includes('reserve')) return 'ir';
  if (d.includes('out')) return 'out';
  if (d.includes('doubtful')) return 'doubtful';
  if (d.includes('questionable')) return 'questionable';
  return 'active';
}

// ── Fetch from Tank01 ──────────────────────────────────────────────────────────
async function fetchAllPlayers(): Promise<Tank01Player[]> {
  console.log('📡 Fetching players from Tank01...');

  const url = `${TANK01_BASE_URL}/getNFLPlayerList`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': TANK01_HOST,
      'x-rapidapi-key': TANK01_API_KEY,
    },
  });

  if (!res.ok) {
    throw new Error(`Tank01 HTTP ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as Tank01Response;

  if (json.statusCode !== 200) {
    throw new Error(`Tank01 returned statusCode ${json.statusCode}`);
  }

  // body can be an array or a keyed object
  const body = json.body;
  if (Array.isArray(body)) return body;

  // object keyed by playerID
  return Object.values(body) as Tank01Player[];
}

// ── Map one Tank01 player → DB row ────────────────────────────────────────────
function mapPlayer(p: Tank01Player): {
  id: string;
  name: string;
  position: string;
  nfl_team: string;
  headshot_url: string | null;
  status: string;
  updated_at: string;
} | null {
  const id = p.playerID?.trim();
  if (!id) return null;

  const name = (p.longName || p.espnName || '').trim();
  if (!name) return null;

  const position = normalizePosition(p.pos);
  if (!position) return null; // skip non-fantasy positions

  // Players with no team are free agents; we still sync them but mark inactive
  const nflTeam = (p.team || 'FA').trim();

  const isFreeAgent = p.isFreeAgent === 'True';
  const injuryDesignation = p.injury?.designation;

  // Status logic:
  // 1. If free agent, mark inactive (status = 'active' but nfl_team = 'FA')
  // 2. Otherwise use injury designation
  const status = isFreeAgent ? 'active' : mapInjuryStatus(injuryDesignation);

  return {
    id,
    name,
    position,
    nfl_team: nflTeam,
    headshot_url: p.espnHeadshot || null,
    status,
    updated_at: new Date().toISOString(),
  };
}

// ── Upsert in batches ──────────────────────────────────────────────────────────
async function upsertBatch(rows: ReturnType<typeof mapPlayer>[]): Promise<number> {
  const validRows = rows.filter(Boolean) as NonNullable<ReturnType<typeof mapPlayer>>[];
  if (validRows.length === 0) return 0;

  const { error } = await supabase
    .from('players')
    .upsert(validRows, { onConflict: 'id', ignoreDuplicates: false });

  if (error) {
    console.error('❌ Upsert error:', error.message);
    throw error;
  }

  return validRows.length;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🏈 Starting NFL player sync...\n');

  try {
    const players = await fetchAllPlayers();
    console.log(`✅ Fetched ${players.length} players from Tank01\n`);

    let synced = 0;
    let skipped = 0;
    const BATCH_SIZE = 500;

    const mapped: NonNullable<ReturnType<typeof mapPlayer>>[] = [];
    for (const p of players) {
      const row = mapPlayer(p);
      if (row) {
        mapped.push(row);
      } else {
        skipped++;
      }
    }

    console.log(`📋 ${mapped.length} players will be synced, ${skipped} skipped (non-fantasy positions)\n`);

    // Upsert in batches of 500 to stay within Supabase limits
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE);
      const count = await upsertBatch(batch);
      synced += count;
      console.log(`  ↑ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${count} players upserted (total: ${synced})`);
    }

    console.log(`\n🎉 Sync complete! ${synced} players synced into the database.`);
  } catch (err) {
    console.error('\n❌ Sync failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();

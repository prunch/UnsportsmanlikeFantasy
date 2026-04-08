/**
 * syncPlayersUtil.ts
 * Reusable core sync logic — used by both the CLI script and the admin API endpoint.
 */

import { supabaseAdmin } from './supabase';

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

export interface SyncResult {
  playersSynced: number;
  skipped: number;
}

export interface DefenseSyncResult {
  defensesSynced: number;
}

// ── Team Defense type defs ──────────────────────────────────────────────────

interface Tank01TeamDefenseStats {
  sacks?: string;
  defensiveInterceptions?: string;
  fumblesRecovered?: string;
  defTD?: string;
  totalTackles?: string;
  passingYardsAllowed?: string;
  rushingYardsAllowed?: string;
  passingTDAllowed?: string;
  rushingTDAllowed?: string;
}

interface Tank01Team {
  teamAbv: string;
  teamName?: string;
  espnLogo1?: string;
  teamStats?: {
    Defense?: Tank01TeamDefenseStats;
  };
}

interface Tank01TeamsResponse {
  statusCode: number;
  body: Tank01Team[] | Record<string, Tank01Team>;
}

// Valid positions accepted by the DB CHECK constraint
const VALID_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

export function normalizePosition(pos: string | undefined): string | null {
  if (!pos) return null;
  const p = pos.toUpperCase().trim();
  if (VALID_POSITIONS.has(p)) return p;
  if (['PK', 'K'].includes(p)) return 'K';
  if (['DST', 'D/ST', 'DEF', 'D'].includes(p)) return 'DEF';
  return null;
}

export function mapInjuryStatus(designation: string | undefined): string {
  if (!designation) return 'active';
  const d = designation.toLowerCase();
  if (d.includes('ir') || d.includes('reserve')) return 'ir';
  if (d.includes('out')) return 'out';
  if (d.includes('doubtful')) return 'doubtful';
  if (d.includes('questionable')) return 'questionable';
  return 'active';
}

export async function fetchAllPlayers(): Promise<Tank01Player[]> {
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

  const body = json.body;
  if (Array.isArray(body)) return body;
  return Object.values(body) as Tank01Player[];
}

type PlayerRow = {
  id: string;
  name: string;
  position: string;
  nfl_team: string;
  headshot_url: string | null;
  status: string;
  updated_at: string;
};

export function mapPlayer(p: Tank01Player): PlayerRow | null {
  const id = p.playerID?.trim();
  if (!id) return null;

  const name = (p.longName || p.espnName || '').trim();
  if (!name) return null;

  const position = normalizePosition(p.pos);
  if (!position) return null;

  const nflTeam = (p.team || 'FA').trim();
  const isFreeAgent = p.isFreeAgent === 'True';
  const injuryDesignation = p.injury?.designation;
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

type DefenseRow = {
  id: string;
  name: string;
  position: string;
  nfl_team: string;
  headshot_url: string | null;
  status: string;
  updated_at: string;
};

/**
 * Fetches NFL teams from Tank01 and maps them to defense rows.
 */
export async function fetchAllTeams(): Promise<Tank01Team[]> {
  const url = `${TANK01_BASE_URL}/getNFLTeams?teamStats=true`;
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

  const json = (await res.json()) as Tank01TeamsResponse;

  if (json.statusCode !== 200) {
    throw new Error(`Tank01 returned statusCode ${json.statusCode}`);
  }

  const body = json.body;
  if (Array.isArray(body)) return body;
  return Object.values(body) as Tank01Team[];
}

export function mapTeamDefense(team: Tank01Team): DefenseRow | null {
  const abv = team.teamAbv?.trim();
  if (!abv) return null;

  const name = team.teamName?.trim();
  if (!name) return null;

  return {
    id: `${abv}-DEF`,
    name: `${name} Defense`,
    position: 'DEF',
    nfl_team: abv,
    headshot_url: team.espnLogo1 || null,
    status: 'active',
    updated_at: new Date().toISOString(),
  };
}

/**
 * Runs the defense sync — upserts all 32 NFL team defenses into the players table.
 */
export async function runDefenseSync(): Promise<DefenseSyncResult> {
  const teams = await fetchAllTeams();

  const mapped: DefenseRow[] = [];
  for (const team of teams) {
    const row = mapTeamDefense(team);
    if (row) mapped.push(row);
  }

  if (mapped.length === 0) {
    return { defensesSynced: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin as any)
    .from('players')
    .upsert(mapped, { onConflict: 'id', ignoreDuplicates: false });

  if (error) {
    throw new Error(`Defense upsert error: ${error.message}`);
  }

  return { defensesSynced: mapped.length };
}

/**
 * Runs the full player sync. Returns how many were synced and skipped.
 */
export async function runPlayerSync(): Promise<SyncResult> {
  const players = await fetchAllPlayers();

  let skipped = 0;
  const mapped: PlayerRow[] = [];

  for (const p of players) {
    const row = mapPlayer(p);
    if (row) {
      mapped.push(row);
    } else {
      skipped++;
    }
  }

  const BATCH_SIZE = 500;
  let synced = 0;

  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    const batch = mapped.slice(i, i + BATCH_SIZE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any)
      .from('players')
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });

    if (error) {
      throw new Error(`Upsert error: ${error.message}`);
    }

    synced += batch.length;
  }

  return { playersSynced: synced, skipped };
}

import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';

const TANK01_BASE_URL = 'https://tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com';

async function getApiKey(): Promise<string | null> {
  // First check env var
  if (process.env.TANK01_API_KEY) return process.env.TANK01_API_KEY;

  // Fall back to DB config
  try {
    const { data } = await supabaseAdmin
      .from('api_config')
      .select('value')
      .eq('key', 'tank01_api_key')
      .single();
    return data?.value || null;
  } catch {
    return null;
  }
}

async function tank01Fetch(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Tank01 API key not configured. Please set it in the admin panel.');
  }

  const url = new URL(`${TANK01_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString(), {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com'
    }
  });

  if (!response.ok) {
    throw new Error(`Tank01 API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getNFLPlayers(): Promise<unknown> {
  return tank01Fetch('/getNFLTeamRoster', { teamAbv: 'ALL' });
}

export async function getLiveScores(week: string, season: string): Promise<unknown> {
  return tank01Fetch('/getNFLScoresOnly', { gameWeek: week, seasonType: 'reg', season });
}

export async function getPlayerStats(playerId: string, season: string): Promise<unknown> {
  return tank01Fetch('/getNFLPlayerInfo', { playerID: playerId, season });
}

export async function getGameStats(gameId: string): Promise<unknown> {
  return tank01Fetch('/getNFLGameInfo', { gameID: gameId });
}

export async function getTeamRoster(teamAbv: string): Promise<unknown> {
  return tank01Fetch('/getNFLTeamRoster', { teamAbv });
}

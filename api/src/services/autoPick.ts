/**
 * Auto-pick service
 *
 * Selects the best available player for a team based on their saved
 * draft-order preferences (position priority list).
 *
 * Strategy:
 *  1. Walk the team's position priority list in order.
 *  2. For each position, find all undrafted players at that position
 *     sorted by ADP ascending (lowest ADP = highest value).
 *  3. Pick the first available player found.
 *  4. If ALL priority positions are exhausted (e.g. every QB is gone)
 *     fall back to the globally best available player by ADP.
 */

import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';

const DEFAULT_DRAFT_ORDER = ['RB', 'WR', 'QB', 'TE', 'K', 'DEF'];

interface AutoPickResult {
  playerId: string;
  playerName: string;
  position: string;
  reason: string; // 'priority' | 'fallback'
}

/**
 * Resolve the best player to auto-pick for the given team in the given league.
 * Returns null when no available players remain (draft over).
 */
export async function resolveAutoPick(
  leagueId: string,
  teamId: string
): Promise<AutoPickResult | null> {
  // 1. Load the team's draft order preference
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('draft_order')
    .eq('id', teamId)
    .single();

  if (teamErr || !team) {
    logger.warn(`[autoPick] Could not load team ${teamId}: ${teamErr?.message}`);
    return null;
  }

  const draftOrder: string[] =
    Array.isArray(team.draft_order) && team.draft_order.length > 0
      ? team.draft_order
      : DEFAULT_DRAFT_ORDER;

  // 2. Get all already-drafted player IDs in this league
  const { data: draftedPicks } = await supabaseAdmin
    .from('draft_picks')
    .select('player_id')
    .eq('league_id', leagueId);

  const draftedIds = (draftedPicks || []).map((p: { player_id: string }) => p.player_id);

  // 3. Try each position in priority order
  for (const position of draftOrder) {
    let query = supabaseAdmin
      .from('players')
      .select('id, name, position, adp')
      .eq('position', position)
      .eq('status', 'active')
      .order('adp', { ascending: true })
      .limit(1);

    if (draftedIds.length > 0) {
      query = query.not('id', 'in', `(${draftedIds.join(',')})`);
    }

    const { data: candidates } = await query;

    if (candidates && candidates.length > 0) {
      const player = candidates[0] as { id: string; name: string; position: string; adp: number | null };
      logger.info(`[autoPick] Team ${teamId} → ${player.name} (${player.position}) via priority pick`);
      return {
        playerId: player.id,
        playerName: player.name,
        position: player.position,
        reason: 'priority',
      };
    }
  }

  // 4. Fallback: best available by ADP regardless of position
  let fallbackQuery = supabaseAdmin
    .from('players')
    .select('id, name, position, adp')
    .eq('status', 'active')
    .order('adp', { ascending: true })
    .limit(1);

  if (draftedIds.length > 0) {
    fallbackQuery = fallbackQuery.not('id', 'in', `(${draftedIds.join(',')})`);
  }

  const { data: fallback } = await fallbackQuery;

  if (fallback && fallback.length > 0) {
    const player = fallback[0] as { id: string; name: string; position: string; adp: number | null };
    logger.info(`[autoPick] Team ${teamId} → ${player.name} (${player.position}) via ADP fallback`);
    return {
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      reason: 'fallback',
    };
  }

  logger.warn(`[autoPick] No available players found for league ${leagueId}`);
  return null;
}

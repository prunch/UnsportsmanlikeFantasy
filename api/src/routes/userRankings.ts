// ============================================================
// Per-league, per-user player rankings
//
// Each user builds their own draft board per league (scoring differs, so one
// master list across leagues doesn't make sense). These routes read and write
// the `user_player_rankings` table introduced in migration 014.
//
// Mounted at /api/leagues — the leagueId comes from the URL path.
//
//   GET /api/leagues/:leagueId/rankings/mine
//        → { rankings: [{ player_id, rank }, ...] }
//
//   PUT /api/leagues/:leagueId/rankings/mine
//        body: { rankings: [{ playerId, rank }, ...] }
//        → { updated: <count> }
//
//   PATCH /api/leagues/:leagueId/rankings/mine
//        body: { playerId, rank }         -- set a single player's rank
//        → { ok: true }
//
//   DELETE /api/leagues/:leagueId/rankings/mine/:playerId
//        → { ok: true }
// ============================================================

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();

// ── Validation schemas ───────────────────────────────────────

const bulkUpdateSchema = z.object({
  // Empty array is legal — it means "clear my rankings for this league".
  rankings: z.array(
    z.object({
      playerId: z.string().min(1),
      rank: z.number().int().positive(),
    })
  ),
});

const singleUpdateSchema = z.object({
  playerId: z.string().min(1),
  rank: z.number().int().positive(),
});

// ── Helper: verify the user is a member of the league ───────
// We don't want users to be able to peek at someone else's rankings, and
// writing rankings for a league you aren't in makes no sense. A user is a
// member iff there's a teams row with (league_id, user_id).
async function assertLeagueMembership(leagueId: string, userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error('[userRankings] membership check failed', { leagueId, userId, dbError: error });
    throw new AppError('Failed to verify league membership', 500);
  }
  if (!data) {
    throw new AppError('You are not a member of this league', 403);
  }
}

// ── GET /api/leagues/:leagueId/rankings/mine ─────────────────
router.get(
  '/:leagueId/rankings/mine',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { leagueId } = req.params;
    const userId = req.user!.id;

    try {
      await assertLeagueMembership(leagueId, userId);

      const { data, error } = await supabaseAdmin
        .from('user_player_rankings')
        .select('player_id, rank, updated_at')
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .order('rank', { ascending: true });

      if (error) {
        logger.error('[userRankings] GET mine — DB error', { leagueId, userId, dbError: error });
        throw new AppError('Failed to load rankings', 500);
      }

      res.json({ rankings: data || [] });
    } catch (err) {
      next(err);
    }
  }
);

// ── PUT /api/leagues/:leagueId/rankings/mine ─────────────────
// Bulk replace: delete everything the user has for this league, insert the
// new list. Done in two round-trips (delete, then insert) rather than a
// single upsert because the incoming list may contain fewer players than the
// stored list — upsert alone would leave orphan ranks behind.
router.put(
  '/:leagueId/rankings/mine',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { leagueId } = req.params;
    const userId = req.user!.id;

    try {
      const body = bulkUpdateSchema.parse(req.body);
      await assertLeagueMembership(leagueId, userId);

      // Sanity: no duplicate ranks within a single submission. The DB unique
      // index will catch this too, but a friendly 400 beats a confusing 500.
      const ranks = new Set<number>();
      for (const r of body.rankings) {
        if (ranks.has(r.rank)) {
          throw new AppError(`Duplicate rank ${r.rank} in payload`, 400);
        }
        ranks.add(r.rank);
      }

      // 1. Clear existing rows for this (league, user)
      const { error: delErr } = await supabaseAdmin
        .from('user_player_rankings')
        .delete()
        .eq('league_id', leagueId)
        .eq('user_id', userId);

      if (delErr) {
        logger.error('[userRankings] PUT mine — delete failed', { leagueId, userId, dbError: delErr });
        throw new AppError('Failed to clear existing rankings', 500);
      }

      // 2. Insert the new set (if any)
      if (body.rankings.length > 0) {
        const rows = body.rankings.map((r: { playerId: string; rank: number }) => ({
          league_id: leagueId,
          user_id: userId,
          player_id: r.playerId,
          rank: r.rank,
        }));

        const { error: insErr } = await supabaseAdmin
          .from('user_player_rankings')
          .insert(rows);

        if (insErr) {
          logger.error('[userRankings] PUT mine — insert failed', {
            leagueId,
            userId,
            count: rows.length,
            dbError: insErr,
          });
          throw new AppError(`Failed to save rankings: ${insErr.message}`, 500);
        }
      }

      logger.info('[userRankings] PUT mine — success', {
        leagueId,
        userId,
        count: body.rankings.length,
      });
      res.json({ updated: body.rankings.length });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /api/leagues/:leagueId/rankings/mine ───────────────
// Set a single player's rank. If another player already holds that rank,
// bump them down by one so we don't violate the unique index. This is the
// path inline rank edits in the grid hit.
router.patch(
  '/:leagueId/rankings/mine',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { leagueId } = req.params;
    const userId = req.user!.id;

    try {
      const { playerId, rank } = singleUpdateSchema.parse(req.body);
      await assertLeagueMembership(leagueId, userId);

      // If a different player already holds this rank, shift everyone at-or-
      // below by +1. We do this in a single RPC-less pass by selecting the
      // affected rows first and then updating them. On a per-user, per-league
      // ranking list of a few hundred rows this is cheap.
      const { data: conflicts, error: conflictErr } = await supabaseAdmin
        .from('user_player_rankings')
        .select('player_id, rank')
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .gte('rank', rank)
        .neq('player_id', playerId)
        .order('rank', { ascending: false });

      if (conflictErr) {
        logger.error('[userRankings] PATCH — conflict fetch failed', {
          leagueId,
          userId,
          dbError: conflictErr,
        });
        throw new AppError('Failed to reorder rankings', 500);
      }

      // Bump conflicts down one at a time, starting from the highest rank so
      // we never trip the unique index while shifting.
      for (const row of conflicts || []) {
        const { error: bumpErr } = await supabaseAdmin
          .from('user_player_rankings')
          .update({ rank: row.rank + 1 })
          .eq('league_id', leagueId)
          .eq('user_id', userId)
          .eq('player_id', row.player_id);
        if (bumpErr) {
          logger.error('[userRankings] PATCH — bump failed', {
            leagueId,
            userId,
            playerId: row.player_id,
            dbError: bumpErr,
          });
          throw new AppError('Failed to reorder rankings', 500);
        }
      }

      // Upsert the target player's rank
      const { error: upErr } = await supabaseAdmin
        .from('user_player_rankings')
        .upsert(
          {
            league_id: leagueId,
            user_id: userId,
            player_id: playerId,
            rank,
          },
          { onConflict: 'league_id,user_id,player_id' }
        );

      if (upErr) {
        logger.error('[userRankings] PATCH — upsert failed', {
          leagueId,
          userId,
          playerId,
          dbError: upErr,
        });
        throw new AppError('Failed to save ranking', 500);
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/leagues/:leagueId/rankings/mine/:playerId ────
router.delete(
  '/:leagueId/rankings/mine/:playerId',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { leagueId, playerId } = req.params;
    const userId = req.user!.id;

    try {
      await assertLeagueMembership(leagueId, userId);

      const { error } = await supabaseAdmin
        .from('user_player_rankings')
        .delete()
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .eq('player_id', playerId);

      if (error) {
        logger.error('[userRankings] DELETE — failed', {
          leagueId,
          userId,
          playerId,
          dbError: error,
        });
        throw new AppError('Failed to remove ranking', 500);
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

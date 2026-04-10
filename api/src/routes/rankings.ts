// ============================================================
// Rankings import route
// POST /api/admin/rankings/import — upload a CSV of player rankings
//
// Expected CSV columns (case-insensitive):
//   RK      — integer rank (required)
//   PLAYER  — player name  (required)
//   POS     — position     (optional: QB/RB/WR/TE/K/DEF/DST)
//   TEAM    — NFL team     (optional: e.g. KC, NE, SF)
//
// Protected: admin only
// ============================================================

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { supabaseAdmin } from '../utils/supabase';
import { requireAdmin } from '../middleware/auth';
import {
  normalizePosition,
  normalizeTeam,
  scoreMatch,
  MatchCandidate,
} from '../lib/fuzzyMatch';

const router = Router();

// ── Multer: in-memory storage (no disk writes) ───────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB cap — CSV files are tiny
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    // Accept any file ending in .csv regardless of MIME type.
    // Browsers and operating systems report CSV MIME types inconsistently:
    // macOS → text/csv, Windows → application/vnd.ms-excel or text/plain,
    // some browsers → application/octet-stream.
    if (
      file.originalname.toLowerCase().endsWith('.csv') ||
      file.mimetype === 'text/csv' ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/octet-stream'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

// ── Types ────────────────────────────────────────────────────

interface CsvRow {
  rk: number;
  player: string;
  pos: string | null;
  team: string | null;
}

interface ImportResult {
  total: number;
  matched: number;
  failed: number;
  failures: FailureDetail[];
}

interface FailureDetail {
  rank: number;
  player: string;
  pos: string | null;
  team: string | null;
  reason: string;
}

// ── CSV parsing ──────────────────────────────────────────────

/**
 * Parse a CSV Buffer into normalized CsvRow objects.
 * Column headers are case-insensitive.
 * Skips rows where RK is not a valid integer or PLAYER is empty.
 */
async function parseCsv(buffer: Buffer): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CsvRow[] = [];
    const stream = Readable.from(buffer);

    stream.pipe(
      parse({
        columns: (header: string[]) =>
          header.map((h) => h.trim().toUpperCase()),
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      })
    )
      .on('data', (record: Record<string, string>) => {
        const rk = parseInt(record['RK'] ?? record['RANK'] ?? '', 10);
        const player = (record['PLAYER'] ?? record['NAME'] ?? '').trim();

        if (isNaN(rk) || !player) return; // skip header-like or empty rows

        rows.push({
          rk,
          player,
          pos: normalizePosition(record['POS'] ?? record['POSITION']),
          team: normalizeTeam(record['TEAM']),
        });
      })
      .on('error', reject)
      .on('end', () => resolve(rows));
  });
}

// ── Matching engine ──────────────────────────────────────────

/**
 * Find the best DB player for a CSV row using fuzzy scoring.
 * Returns null if no candidate scores above the threshold.
 */
const MATCH_THRESHOLD = 60; // minimum score to accept a match

function findBestMatch(
  row: CsvRow,
  players: MatchCandidate[]
): MatchCandidate | null {
  let bestPlayer: MatchCandidate | null = null;
  let bestScore = -1;

  for (const player of players) {
    const score = scoreMatch(row.player, row.pos, row.team, player);
    if (score > bestScore) {
      bestScore = score;
      bestPlayer = player;
    }
  }

  return bestScore >= MATCH_THRESHOLD ? bestPlayer : null;
}

// ── Route ────────────────────────────────────────────────────

/**
 * POST /api/admin/rankings/import
 * Multipart form upload: field name = "rankings"
 *
 * Returns:
 * {
 *   total: 300,
 *   matched: 285,
 *   failed: 15,
 *   failures: [{ rank, player, pos, team, reason }, ...]
 * }
 */
router.post(
  '/import',
  requireAdmin,
  upload.single('rankings'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No CSV file uploaded. Use field name "rankings".' });
      return;
    }

    // ── 1. Parse CSV ─────────────────────────────────────────
    let rows: CsvRow[];
    try {
      rows = await parseCsv(req.file.buffer);
    } catch (err) {
      res.status(400).json({
        error: 'Failed to parse CSV',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (rows.length === 0) {
      res.status(400).json({
        error: 'CSV contains no valid rows. Expected columns: RK, PLAYER (and optionally POS, TEAM)',
      });
      return;
    }

    // ── 2. Load all players from DB ──────────────────────────
    // Fetch everything once — avoids N+1 queries (300 players = tiny payload)
    const { data: dbPlayers, error: fetchErr } = await supabaseAdmin
      .from('players')
      .select('id, name, position, nfl_team');

    if (fetchErr || !dbPlayers) {
      res.status(500).json({ error: 'Failed to load players from database' });
      return;
    }

    const candidates: MatchCandidate[] = dbPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
    }));

    // ── 3. Match each row and collect updates ────────────────
    const updates: { id: string; value_rank: number }[] = [];
    const failures: FailureDetail[] = [];

    for (const row of rows) {
      const match = findBestMatch(row, candidates);

      if (match) {
        updates.push({ id: match.id, value_rank: row.rk });
      } else {
        failures.push({
          rank: row.rk,
          player: row.player,
          pos: row.pos,
          team: row.team,
          reason: 'No matching player found in database',
        });
      }
    }

    // ── 4. Apply updates — overwrite existing rankings ───────
    // Supabase doesn't support bulk UPDATE with individual values, so we
    // clear existing ranks first, then write the new set.
    // Wrapped in sequential awaits (not Promise.all) to avoid Supabase rate limits.

    // Clear all existing value_rank values.
    //
    // PostgREST requires every UPDATE to carry a WHERE clause, so we pass
    // a filter that always matches every row: "id ≠ <impossible UUID>".
    // This is the canonical Supabase JS idiom for "update every row" and
    // sidesteps quirks with `is null` filter parsing we've hit before.
    const IMPOSSIBLE_UUID = '00000000-0000-0000-0000-000000000000';
    const { error: clearErr } = await supabaseAdmin
      .from('players')
      .update({ value_rank: null })
      .neq('id', IMPOSSIBLE_UUID);

    if (clearErr) {
      // Log the full error object to Render logs so we can diagnose
      // issues like missing columns, RLS blocking, or bad service key.
      console.error('[rankings/import] clear step failed:', clearErr);
      res.status(500).json({
        error: 'Failed to clear existing rankings',
        detail: clearErr.message,
        code: clearErr.code,
        hint: clearErr.hint,
      });
      return;
    }

    // Write new rankings in batches of 50 to avoid hitting PostgREST limits
    const BATCH_SIZE = 50;
    let writeErrors = 0;
    const writeFailures: FailureDetail[] = [];

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);

      // Upsert by ID — safe to run even if value_rank just got cleared
      const { error: upsertErr } = await supabaseAdmin
        .from('players')
        .upsert(
          batch.map(({ id, value_rank }) => ({ id, value_rank })),
          { onConflict: 'id' }
        );

      if (upsertErr) {
        writeErrors += batch.length;
        for (const u of batch) {
          writeFailures.push({
            rank: u.value_rank,
            player: `[DB id: ${u.id}]`,
            pos: null,
            team: null,
            reason: `DB write failed: ${upsertErr.message}`,
          });
        }
      }
    }

    // ── 5. Return stats ──────────────────────────────────────
    const result: ImportResult = {
      total: rows.length,
      matched: updates.length - writeErrors,
      failed: failures.length + writeErrors,
      failures: [...failures, ...writeFailures],
    };

    res.json(result);
  }
);

// ── GET /import — status/info endpoint (helpful for testing) ─
router.get('/import', requireAdmin, (_req: Request, res: Response) => {
  res.json({
    description: 'POST to this endpoint with a multipart CSV file (field: "rankings")',
    expectedColumns: {
      RK: 'integer rank (required)',
      PLAYER: 'player name (required)',
      POS: 'position QB/RB/WR/TE/K/DEF (optional)',
      TEAM: 'NFL team abbreviation e.g. KC, NE (optional)',
    },
    notes: [
      'Column headers are case-insensitive',
      'POS and TEAM improve match accuracy but are not required',
      'DST and D/ST are treated as DEF to match the database',
      'Existing value_rank values are overwritten on every import',
    ],
  });
});

export default router;

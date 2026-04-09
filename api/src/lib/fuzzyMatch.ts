// ============================================================
// Fuzzy player name matching utilities
// Used by the rankings import to match CSV rows → DB players
// ============================================================

/**
 * Normalize a player name for fuzzy comparison.
 * Handles common variations:
 *   - "Patrick Mahomes II" → "patrick mahomes"
 *   - "D.J. Moore" → "dj moore"
 *   - "Marvin Harrison Jr." → "marvin harrison jr"
 *   - "Travis Kelce" → "travis kelce"
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')           // remove dots (D.J. → DJ)
    .replace(/\s+ii+$/i, '')      // strip trailing II, III, IV
    .replace(/\bjr\.?$/i, 'jr')   // normalize Jr. → jr
    .replace(/\bsr\.?$/i, 'sr')   // normalize Sr. → sr
    .replace(/[^a-z0-9 ]/g, '')   // strip remaining punctuation
    .replace(/\s+/g, ' ')         // collapse whitespace
    .trim();
}

/**
 * Normalize position string to match DB enum values.
 * DB uses: QB | RB | WR | TE | K | DEF
 */
export function normalizePosition(pos: string | undefined): string | null {
  if (!pos) return null;
  const p = pos.trim().toUpperCase();
  const validPositions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST', 'D/ST'];
  if (!validPositions.includes(p)) return null;
  // Normalize DST / D/ST → DEF (match DB enum)
  if (p === 'DST' || p === 'D/ST') return 'DEF';
  return p;
}

/**
 * Normalize an NFL team abbreviation.
 * Handles common variations between data sources.
 */
export function normalizeTeam(team: string | undefined): string | null {
  if (!team) return null;

  const t = team.trim().toUpperCase();

  // Common alias maps (source → canonical)
  const aliases: Record<string, string> = {
    'JAC': 'JAX',    // Jacksonville
    'LAR': 'LAR',    // LA Rams (already canonical)
    'LAC': 'LAC',    // LA Chargers
    'WSH': 'WAS',    // Washington
    'WFT': 'WAS',
    'GBP': 'GB',
    'GNB': 'GB',
    'KCC': 'KC',
    'NWE': 'NE',
    'NEP': 'NE',
    'NOR': 'NO',
    'NOS': 'NO',
    'SFO': 'SF',
    'TBB': 'TB',
    'TAM': 'TB',
    'PHO': 'ARI',
  };

  return aliases[t] ?? t;
}

/**
 * Compute a simple Levenshtein distance between two strings.
 * Used as a tiebreaker when multiple name tokens match.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Score a single DB player against a CSV row.
 * Returns a number 0–100 (higher = better match).
 * Returns -1 if the match is definitely wrong (wrong position, etc.)
 */
export interface MatchCandidate {
  id: string;
  name: string;
  position: string;
  nfl_team: string;
}

export function scoreMatch(
  csvName: string,
  csvPos: string | null,
  csvTeam: string | null,
  candidate: MatchCandidate
): number {
  const normCsv = normalizeName(csvName);
  const normDb = normalizeName(candidate.name);

  // Hard filter: if position is provided and clearly wrong, skip
  if (csvPos && candidate.position !== csvPos) return -1;

  // Exact name match = 100
  if (normCsv === normDb) {
    let score = 100;
    // Bonus: team also matches
    if (csvTeam && candidate.nfl_team === csvTeam) score += 10;
    return score;
  }

  // Partial: one is a substring of the other (handles "Patrick Mahomes" matching "Patrick Mahomes II")
  if (normDb.includes(normCsv) || normCsv.includes(normDb)) {
    let score = 85;
    if (csvTeam && candidate.nfl_team === csvTeam) score += 10;
    return score;
  }

  // Levenshtein distance for minor typos / abbreviations
  const dist = levenshtein(normCsv, normDb);
  const maxLen = Math.max(normCsv.length, normDb.length);

  // Allow up to ~15% character distance
  if (dist / maxLen <= 0.15) {
    let score = Math.round(70 * (1 - dist / maxLen));
    if (csvTeam && candidate.nfl_team === csvTeam) score += 10;
    return score;
  }

  return -1; // no match
}

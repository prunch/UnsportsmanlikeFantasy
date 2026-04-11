// ============================================================
// PlayerGrid — sortable, filterable grid of players with stats
//
// Used in three places (so far):
//   1. LeaguePage "Players" tab (pre-draft / during draft)
//   2. WaiverWirePage free-agents tab
//   3. DraftRoomPage player pool (optional upgrade from the plain list)
//
// The component is intentionally config-driven: callers pass a `columns`
// array and an optional `rowAction` render-prop so the same grid can show
// Draft/Claim/Rank buttons depending on context. Data fetching is also
// delegated — the parent supplies a `fetcher` that returns the current page
// of GridPlayer rows, and PlayerGrid owns the sort / filter / pagination UI.
// ============================================================

import { useEffect, useMemo, useState, useCallback, ReactNode } from 'react';
import { Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────

export interface SeasonStats {
  season: number;
  games_played: number;
  fantasy_points_ppr: number;
  fantasy_points_std: number;
  pass_yds: number;
  pass_td: number;
  pass_int: number;
  rush_yds: number;
  rush_td: number;
  targets: number;
  rec: number;
  rec_yds: number;
  rec_td: number;
  fumbles_lost: number;
}

export interface Projection {
  season: number;
  proj_fantasy_pts_ppr: number | null;
  proj_fantasy_pts_std: number | null;
  proj_games: number | null;
  proj_ppg_ppr: number | null;
  tier: number | null;
  bye_week: number | null;
}

export interface GridPlayer {
  id: string;
  name: string;
  position: string;
  nfl_team: string;
  status: string;
  adp?: number | null;
  value_rank?: number | null;
  headshot_url?: string | null;
  season_stats?: SeasonStats | null;
  projection?: Projection | null;
  // Caller-supplied per-user rank (injected at fetch time — not a DB column on players)
  my_rank?: number | null;
}

export type SortDir = 'asc' | 'desc';

export interface ColumnDef {
  key: string;
  label: string;
  // Width class for the <th> and <td>. Defaults to `w-20`.
  width?: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  // Cell accessor. Either a key path into GridPlayer or a render function.
  render: (p: GridPlayer) => ReactNode;
  // Comparator for client-side sort. Returning undefined falls back to a
  // generic numeric/string compare on the cell's raw value.
  compare?: (a: GridPlayer, b: GridPlayer) => number;
}

export interface FetchResult {
  players: GridPlayer[];
  total: number;
}

export interface PlayerGridProps {
  /**
   * Called whenever the grid needs to (re)load data. The grid owns the
   * search/position state and passes them in. Callers can ignore `offset`
   * if they want to return the full list in one shot.
   */
  fetcher: (args: {
    search: string;
    position: string;
    limit: number;
    offset: number;
  }) => Promise<FetchResult>;

  columns: ColumnDef[];

  /**
   * Optional per-row action button area (Draft / Claim / etc). Rendered
   * on the right of every row.
   */
  rowAction?: (p: GridPlayer) => ReactNode;

  /** Initial sort. Defaults to ADP ascending. */
  initialSort?: { key: string; dir: SortDir };

  /** Optional title shown above the grid */
  title?: string;

  /** Optional element rendered on the right of the toolbar */
  toolbarExtra?: ReactNode;

  /** Page size — defaults to 100 */
  pageSize?: number;

  /** Bump this number to force a refetch (e.g. after a pick is made) */
  refreshKey?: number;
}

// ── Position colors (match the rest of the app) ──────────────

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-500/20 text-red-400 border-red-500/30',
  RB: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  WR: 'bg-green-500/20 text-green-400 border-green-500/30',
  TE: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  K: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  DEF: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

// ── Default column library ───────────────────────────────────
// Callers typically spread a subset of these into their own `columns` array,
// append position-specific columns, and then add a `rowAction` prop.

function num(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return digits > 0 ? v.toFixed(digits) : String(Math.round(v));
}

function statOrDash(p: GridPlayer, key: keyof SeasonStats): number | null {
  const s = p.season_stats;
  if (!s) return null;
  const v = s[key];
  return typeof v === 'number' ? v : null;
}

function projOrDash(p: GridPlayer, key: keyof Projection): number | null {
  const proj = p.projection;
  if (!proj) return null;
  const v = proj[key];
  return typeof v === 'number' ? v : null;
}

export const PLAYER_GRID_COLUMNS: Record<string, ColumnDef> = {
  name: {
    key: 'name',
    label: 'Player',
    width: 'min-w-[200px]',
    align: 'left',
    sortable: true,
    render: (p) => (
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`px-2 py-0.5 rounded text-xs font-bold border flex-shrink-0 ${
            POSITION_COLORS[p.position] || ''
          }`}
        >
          {p.position}
        </span>
        <div className="min-w-0">
          <div className="text-white font-medium text-sm truncate">{p.name}</div>
          <div className="text-slate-400 text-xs">
            {p.nfl_team}
            {p.status !== 'active' && (
              <span className="ml-2 text-red-400 font-semibold uppercase">{p.status}</span>
            )}
          </div>
        </div>
      </div>
    ),
    compare: (a, b) => a.name.localeCompare(b.name),
  },

  adp: {
    key: 'adp',
    label: 'ADP',
    align: 'right',
    sortable: true,
    render: (p) => <span className="text-slate-300 text-sm tabular-nums">{num(p.adp ?? null, 1)}</span>,
    compare: (a, b) => (a.adp ?? 9999) - (b.adp ?? 9999),
  },

  value_rank: {
    key: 'value_rank',
    label: 'Rank',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-300 text-sm tabular-nums">{p.value_rank ?? '—'}</span>
    ),
    compare: (a, b) => (a.value_rank ?? 9999) - (b.value_rank ?? 9999),
  },

  my_rank: {
    key: 'my_rank',
    label: 'My Rk',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-gridiron-gold text-sm font-semibold tabular-nums">
        {p.my_rank ?? '—'}
      </span>
    ),
    compare: (a, b) => (a.my_rank ?? 9999) - (b.my_rank ?? 9999),
  },

  proj_ppr: {
    key: 'proj_ppr',
    label: 'Proj',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-200 text-sm tabular-nums">
        {num(projOrDash(p, 'proj_fantasy_pts_ppr'), 1)}
      </span>
    ),
    compare: (a, b) =>
      (b.projection?.proj_fantasy_pts_ppr ?? -1) - (a.projection?.proj_fantasy_pts_ppr ?? -1),
  },

  proj_ppg: {
    key: 'proj_ppg',
    label: 'PPG',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-400 text-sm tabular-nums">
        {num(projOrDash(p, 'proj_ppg_ppr'), 1)}
      </span>
    ),
    compare: (a, b) =>
      (b.projection?.proj_ppg_ppr ?? -1) - (a.projection?.proj_ppg_ppr ?? -1),
  },

  bye: {
    key: 'bye',
    label: 'Bye',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-400 text-sm tabular-nums">
        {p.projection?.bye_week ?? '—'}
      </span>
    ),
    compare: (a, b) =>
      (a.projection?.bye_week ?? 99) - (b.projection?.bye_week ?? 99),
  },

  tier: {
    key: 'tier',
    label: 'Tier',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-400 text-sm tabular-nums">{p.projection?.tier ?? '—'}</span>
    ),
    compare: (a, b) => (a.projection?.tier ?? 99) - (b.projection?.tier ?? 99),
  },

  gp: {
    key: 'gp',
    label: 'GP',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-400 text-sm tabular-nums">{num(statOrDash(p, 'games_played'))}</span>
    ),
    compare: (a, b) =>
      (b.season_stats?.games_played ?? -1) - (a.season_stats?.games_played ?? -1),
  },

  last_ppr: {
    key: 'last_ppr',
    label: 'Last PPR',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-300 text-sm tabular-nums">
        {num(statOrDash(p, 'fantasy_points_ppr'), 1)}
      </span>
    ),
    compare: (a, b) =>
      (b.season_stats?.fantasy_points_ppr ?? -1) - (a.season_stats?.fantasy_points_ppr ?? -1),
  },

  pass_yds: {
    key: 'pass_yds',
    label: 'PaYd',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-400 text-sm tabular-nums">{num(statOrDash(p, 'pass_yds'))}</span>
    ),
    compare: (a, b) => (b.season_stats?.pass_yds ?? -1) - (a.season_stats?.pass_yds ?? -1),
  },

  pass_td: {
    key: 'pass_td',
    label: 'PaTD',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-400 text-sm tabular-nums">{num(statOrDash(p, 'pass_td'))}</span>
    ),
    compare: (a, b) => (b.season_stats?.pass_td ?? -1) - (a.season_stats?.pass_td ?? -1),
  },

  rush_yds: {
    key: 'rush_yds',
    label: 'RuYd',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-400 text-sm tabular-nums">{num(statOrDash(p, 'rush_yds'))}</span>
    ),
    compare: (a, b) => (b.season_stats?.rush_yds ?? -1) - (a.season_stats?.rush_yds ?? -1),
  },

  rush_td: {
    key: 'rush_td',
    label: 'RuTD',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-400 text-sm tabular-nums">{num(statOrDash(p, 'rush_td'))}</span>
    ),
    compare: (a, b) => (b.season_stats?.rush_td ?? -1) - (a.season_stats?.rush_td ?? -1),
  },

  rec: {
    key: 'rec',
    label: 'Rec',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-400 text-sm tabular-nums">{num(statOrDash(p, 'rec'))}</span>
    ),
    compare: (a, b) => (b.season_stats?.rec ?? -1) - (a.season_stats?.rec ?? -1),
  },

  rec_yds: {
    key: 'rec_yds',
    label: 'ReYd',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-400 text-sm tabular-nums">{num(statOrDash(p, 'rec_yds'))}</span>
    ),
    compare: (a, b) => (b.season_stats?.rec_yds ?? -1) - (a.season_stats?.rec_yds ?? -1),
  },

  rec_td: {
    key: 'rec_td',
    label: 'ReTD',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-400 text-sm tabular-nums">{num(statOrDash(p, 'rec_td'))}</span>
    ),
    compare: (a, b) => (b.season_stats?.rec_td ?? -1) - (a.season_stats?.rec_td ?? -1),
  },

  targets: {
    key: 'targets',
    label: 'Tgt',
    align: 'right',
    sortable: true,
    render: (p) => (
      <span className="text-slate-400 text-sm tabular-nums">{num(statOrDash(p, 'targets'))}</span>
    ),
    compare: (a, b) => (b.season_stats?.targets ?? -1) - (a.season_stats?.targets ?? -1),
  },
};

/**
 * Convenience: a reasonable default column set suitable for most pre-draft
 * and waiver views. Callers can still spread + override.
 */
export const DEFAULT_COLUMNS: ColumnDef[] = [
  PLAYER_GRID_COLUMNS.name,
  PLAYER_GRID_COLUMNS.adp,
  PLAYER_GRID_COLUMNS.value_rank,
  PLAYER_GRID_COLUMNS.proj_ppr,
  PLAYER_GRID_COLUMNS.proj_ppg,
  PLAYER_GRID_COLUMNS.bye,
  PLAYER_GRID_COLUMNS.last_ppr,
  PLAYER_GRID_COLUMNS.gp,
];

// ── Component ────────────────────────────────────────────────

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;

export default function PlayerGrid({
  fetcher,
  columns,
  rowAction,
  initialSort = { key: 'adp', dir: 'asc' },
  title,
  toolbarExtra,
  pageSize = 100,
  refreshKey = 0,
}: PlayerGridProps) {
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [sortKey, setSortKey] = useState(initialSort.key);
  const [sortDir, setSortDir] = useState<SortDir>(initialSort.dir);
  const [offset, setOffset] = useState(0);
  const [players, setPlayers] = useState<GridPlayer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Reset pagination whenever the filter changes
  useEffect(() => {
    setOffset(0);
  }, [search, posFilter, refreshKey]);

  // Debounced search (300ms) to avoid hammering the API on every keystroke
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcher({ search: debouncedSearch, position: posFilter, limit: pageSize, offset })
      .then((r) => {
        if (cancelled) return;
        setPlayers(r.players);
        setTotal(r.total);
      })
      .catch(() => {
        if (!cancelled) {
          setPlayers([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, posFilter, offset, pageSize, refreshKey, fetcher]);

  // Client-side sort (server returns a page already filtered/paginated,
  // we only re-sort within that page).
  const sortedPlayers = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return players;
    const sorted = [...players].sort((a, b) => {
      const cmp = col.compare ? col.compare(a, b) : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [players, columns, sortKey, sortDir]);

  const toggleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        // Default to descending for stat columns (higher = better), ascending for rank-ish
        const rankish = ['name', 'adp', 'value_rank', 'my_rank', 'tier', 'bye'];
        setSortDir(rankish.includes(key) ? 'asc' : 'desc');
      }
    },
    [sortKey]
  );

  const page = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        {title && <h3 className="text-white font-bold mr-2">{title}</h3>}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search players…"
            className="input pl-9 w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={`px-3 py-2 text-xs font-bold rounded-lg transition-colors ${
                posFilter === pos
                  ? 'bg-gridiron-gold text-slate-900'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
        {toolbarExtra}
      </div>

      {/* Grid */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 border-b border-slate-700">
              <tr>
                {columns.map((c) => {
                  const isSorted = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      className={`px-3 py-2 font-semibold text-slate-300 ${
                        c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                      } ${c.width ?? ''} ${
                        c.sortable ? 'cursor-pointer select-none hover:text-white' : ''
                      }`}
                      onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {c.sortable &&
                          (isSorted ? (
                            sortDir === 'asc' ? (
                              <ChevronUp size={12} />
                            ) : (
                              <ChevronDown size={12} />
                            )
                          ) : (
                            <ChevronsUpDown size={12} className="text-slate-600" />
                          ))}
                      </span>
                    </th>
                  );
                })}
                {rowAction && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={columns.length + (rowAction ? 1 : 0)} className="py-10 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : sortedPlayers.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (rowAction ? 1 : 0)} className="py-10 text-center text-slate-500">
                    No players found
                  </td>
                </tr>
              ) : (
                sortedPlayers.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/50 transition-colors">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2 ${
                          c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'
                        }`}
                      >
                        {c.render(p)}
                      </td>
                    ))}
                    {rowAction && <td className="px-3 py-2 text-right">{rowAction(p)}</td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing {offset + 1}–{Math.min(offset + pageSize, total)} of {total}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 bg-slate-800 rounded disabled:opacity-40"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              Prev
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              className="px-2 py-1 bg-slate-800 rounded disabled:opacity-40"
              disabled={offset + pageSize >= total}
              onClick={() => setOffset(offset + pageSize)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PlayersPage — Pre-draft / in-draft player stats browser
//
// Shown when league.status is 'setup' or 'draft'. Lets users browse every
// player in the league, sort by any stat column, and edit their personal
// draft rankings (which the autodraft uses when their timer expires).
//
// Renders via the shared <PlayerGrid> so the same logic is reused on the
// waiver wire page during the season.
// ============================================================

import { useCallback, useMemo, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Save, X, Trash2, Info } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPut, apiPatch, apiDelete } from '../../utils/api';
import type { League } from '../LeaguePage';
import PlayerGrid, {
  GridPlayer,
  PLAYER_GRID_COLUMNS,
  ColumnDef,
  FetchResult,
} from '../../components/PlayerGrid';

interface RankingRow {
  player_id: string;
  rank: number;
  updated_at: string;
}

interface PlayersApiResponse {
  players: GridPlayer[];
  total: number;
  limit: number;
  offset: number;
}

export default function PlayersPage({ league }: { league: League }) {
  const { token } = useAuthStore();
  const [myRankings, setMyRankings] = useState<Map<string, number>>(new Map());
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Load the current user's per-league rankings up front ──
  useEffect(() => {
    if (!token) return;
    apiGet<{ rankings: RankingRow[] }>(`/leagues/${league.id}/rankings/mine`, token)
      .then((data) => {
        const m = new Map<string, number>();
        for (const r of data.rankings) m.set(r.player_id, r.rank);
        setMyRankings(m);
      })
      .catch(() => {
        // Non-fatal — grid still renders without the my_rank column populated
      });
  }, [league.id, token]);

  // ── Fetcher wired into PlayerGrid ─────────────────────────
  // We intentionally fetch the ENTIRE player pool in one request (limit 2500,
  // which is above the ~1800 rows we have) so that client-side sort by any
  // column is universal rather than per-page. At 1800 rows this is ~1MB
  // uncompressed / ~150KB gzipped, which is fine for a pre-draft load.
  const fetcher = useCallback(
    async ({
      search,
      position,
    }: {
      search: string;
      position: string;
      limit: number;
      offset: number;
    }): Promise<FetchResult> => {
      const params = new URLSearchParams();
      params.set('withStats', 'true');
      params.set('limit', '2500');
      params.set('offset', '0');
      // Server-side default order so the first paint is already in the right
      // order even before the client-side sort hook runs.
      params.set('sortBy', 'value_rank');
      if (search) params.set('q', search);
      if (position !== 'ALL') params.set('position', position);

      const res = await apiGet<PlayersApiResponse>(
        `/players?${params.toString()}`,
        token || undefined
      );

      // Inject my_rank from the map so the grid can sort/display it.
      const playersWithRank = res.players.map((p) => ({
        ...p,
        my_rank: myRankings.get(p.id) ?? null,
      }));

      return { players: playersWithRank, total: res.total };
    },
    [token, myRankings]
  );

  // ── Rank editing handlers ──────────────────────────────────
  async function commitRank(playerId: string, value: string): Promise<void> {
    if (!token) return;
    const rank = parseInt(value, 10);
    if (!Number.isFinite(rank) || rank < 1) {
      toast.error('Rank must be a positive integer');
      return;
    }
    setSaving(true);
    try {
      await apiPatch(
        `/leagues/${league.id}/rankings/mine`,
        { playerId, rank },
        token
      );
      // Merge locally without re-fetching the whole list.
      const next = new Map(myRankings);
      next.set(playerId, rank);
      // If this rank displaced someone else, the backend shifted them — we
      // could re-fetch to reflect that, but for now just refresh the grid.
      setMyRankings(next);
      setEditing(null);
      setEditValue('');
      setRefreshKey((k) => k + 1);
      toast.success('Rank saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save rank');
    } finally {
      setSaving(false);
    }
  }

  async function clearRank(playerId: string): Promise<void> {
    if (!token) return;
    setSaving(true);
    try {
      await apiDelete(`/leagues/${league.id}/rankings/mine/${playerId}`, token);
      const next = new Map(myRankings);
      next.delete(playerId);
      setMyRankings(next);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove rank');
    } finally {
      setSaving(false);
    }
  }

  async function resetAll(): Promise<void> {
    if (!token) return;
    if (!confirm('Clear ALL of your personal rankings for this league? This cannot be undone.')) return;
    try {
      await apiPut(`/leagues/${league.id}/rankings/mine`, { rankings: [] }, token);
      setMyRankings(new Map());
      setRefreshKey((k) => k + 1);
      toast.success('Rankings cleared');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear rankings');
    }
  }

  // ── Column definitions ─────────────────────────────────────
  const columns: ColumnDef[] = useMemo(
    () => [
      PLAYER_GRID_COLUMNS.name,
      PLAYER_GRID_COLUMNS.adp,
      PLAYER_GRID_COLUMNS.value_rank,
      {
        // Custom version of my_rank — editable in-place
        key: 'my_rank',
        label: 'My Rk',
        align: 'right',
        sortable: true,
        render: (p) => {
          if (editing === p.id) {
            return (
              <div className="flex items-center justify-end gap-1">
                <input
                  type="number"
                  min={1}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRank(p.id, editValue);
                    if (e.key === 'Escape') {
                      setEditing(null);
                      setEditValue('');
                    }
                  }}
                  className="input w-14 text-right py-1 px-2 text-sm"
                  autoFocus
                  disabled={saving}
                />
                <button
                  onClick={() => commitRank(p.id, editValue)}
                  disabled={saving}
                  className="text-green-400 hover:text-green-300 disabled:opacity-50"
                  title="Save"
                >
                  <Save size={14} />
                </button>
                <button
                  onClick={() => {
                    setEditing(null);
                    setEditValue('');
                  }}
                  className="text-slate-400 hover:text-white"
                  title="Cancel"
                >
                  <X size={14} />
                </button>
              </div>
            );
          }
          return (
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-gridiron-gold text-sm font-semibold tabular-nums">
                {p.my_rank ?? '—'}
              </span>
              <button
                onClick={() => {
                  setEditing(p.id);
                  setEditValue(String(p.my_rank ?? ''));
                }}
                className="text-slate-500 hover:text-gridiron-gold transition-colors"
                title="Edit rank"
              >
                <Pencil size={12} />
              </button>
              {p.my_rank != null && (
                <button
                  onClick={() => clearRank(p.id)}
                  className="text-slate-500 hover:text-red-400 transition-colors"
                  title="Remove from my rankings"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        },
        compare: (a, b) => (a.my_rank ?? 9999) - (b.my_rank ?? 9999),
      },
      PLAYER_GRID_COLUMNS.proj_ppr,
      PLAYER_GRID_COLUMNS.proj_ppg,
      PLAYER_GRID_COLUMNS.bye,
      PLAYER_GRID_COLUMNS.last_ppr,
      PLAYER_GRID_COLUMNS.gp,
      PLAYER_GRID_COLUMNS.pass_yds,
      PLAYER_GRID_COLUMNS.pass_td,
      PLAYER_GRID_COLUMNS.rush_yds,
      PLAYER_GRID_COLUMNS.rush_td,
      PLAYER_GRID_COLUMNS.rec,
      PLAYER_GRID_COLUMNS.rec_yds,
      PLAYER_GRID_COLUMNS.rec_td,
    ],
    [editing, editValue, saving, myRankings]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-white font-bold text-xl mb-1">Players</h2>
          <p className="text-slate-400 text-sm flex items-center gap-2">
            <Info size={14} />
            Browse every player, sort any column, and set your personal draft rankings.
            Lower rank number = higher priority for autodraft.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400">
            My rankings:{' '}
            <span className="text-gridiron-gold font-semibold">{myRankings.size}</span>
          </div>
          {myRankings.size > 0 && (
            <button
              onClick={resetAll}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      <PlayerGrid
        fetcher={fetcher}
        columns={columns}
        pageSize={2500}
        initialSort={{ key: 'value_rank', dir: 'asc' }}
        refreshKey={refreshKey}
      />
    </div>
  );
}

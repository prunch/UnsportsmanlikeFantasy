import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPost, apiDelete } from '../../utils/api';
import toast from 'react-hot-toast';
import type { League } from '../LeaguePage';
import { Plus, X, Clock } from 'lucide-react';
import PlayerGrid, {
  GridPlayer,
  PLAYER_GRID_COLUMNS,
  ColumnDef,
  FetchResult,
} from '../../components/PlayerGrid';

interface Player {
  id: string;
  name: string;
  position: string;
  nfl_team: string;
  status: string;
  adp?: number;
}

interface RosterEntry {
  id: string;
  slot: string;
  player: Player;
}

interface WaiverClaim {
  id: string;
  priority: number;
  status: string;
  week: number;
  created_at: string;
  processed_at?: string;
  failure_reason?: string;
  team: { id: string; team_name: string };
  add_player: Player;
  drop_player?: Player;
}

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-500/20 text-red-400',
  RB: 'bg-blue-500/20 text-blue-400',
  WR: 'bg-green-500/20 text-green-400',
  TE: 'bg-purple-500/20 text-purple-400',
  K: 'bg-yellow-500/20 text-yellow-400',
  DEF: 'bg-orange-500/20 text-orange-400'
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  processed: 'bg-green-500/10 text-green-400 border-green-500/30',
  failed: 'bg-red-500/10 text-red-400 border-red-500/30',
  cancelled: 'bg-slate-500/10 text-slate-400 border-slate-500/30'
};

// Columns for the free-agents grid. Season stats/projections are shown when
// available (currently only when the backend /leagues/:id/free-agents endpoint
// is extended to return them — see the fetcher comment). For now they'll show
// dashes gracefully.
const waiverGridColumns: ColumnDef[] = [
  PLAYER_GRID_COLUMNS.name,
  PLAYER_GRID_COLUMNS.adp,
  PLAYER_GRID_COLUMNS.proj_ppr,
  PLAYER_GRID_COLUMNS.last_ppr,
  PLAYER_GRID_COLUMNS.bye,
];

export default function WaiverWirePage({ league }: { league: League }) {
  const { token, user } = useAuthStore();
  const [tab, setTab] = useState<'available' | 'claims'>('available');
  const [waiverClaims, setWaiverClaims] = useState<WaiverClaim[]>([]);
  const [myRoster, setMyRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimModal, setClaimModal] = useState<Player | null>(null);
  const [dropPlayerId, setDropPlayerId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [gridRefresh, setGridRefresh] = useState(0);

  async function loadAll() {
    if (!token) return;
    try {
      const [claims, roster] = await Promise.all([
        apiGet<WaiverClaim[]>(`/leagues/${league.id}/waivers`, token),
        apiGet<RosterEntry[]>(`/leagues/${league.id}/roster/mine`, token)
      ]);
      setWaiverClaims(claims);
      setMyRoster(roster);
    } catch (err) {
      toast.error('Failed to load waiver data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [league.id, token]);

  // ── Fetcher for the shared PlayerGrid ──
  // We hit the existing /leagues/:id/free-agents endpoint which already filters
  // rostered players out. The endpoint currently returns a plain array, not a
  // {players,total} envelope, so we adapt it here.
  const freeAgentsFetcher = useCallback(
    async ({ search, position }: { search: string; position: string }): Promise<FetchResult> => {
      if (!token) return { players: [], total: 0 };
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (position !== 'ALL') params.set('position', position);
      const data = await apiGet<Player[]>(
        `/leagues/${league.id}/free-agents?${params.toString()}`,
        token
      );
      // The free-agents endpoint doesn't join stats yet (it lives under
      // /leagues, not /players) — the grid will just show dashes for stat
      // columns until we extend it. Name/position/team/ADP/status render fine.
      const players: GridPlayer[] = data.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        nfl_team: p.nfl_team,
        status: p.status,
        adp: p.adp ?? null,
      }));
      return { players, total: players.length };
    },
    [league.id, token]
  );

  async function handleSubmitClaim() {
    if (!token || !claimModal) return;
    setSubmitting(true);
    try {
      await apiPost(`/leagues/${league.id}/waiver`, {
        addPlayerId: claimModal.id,
        dropPlayerId: dropPlayerId || undefined
      }, token);
      toast.success(`Waiver claim submitted for ${claimModal.name}!`);
      setClaimModal(null);
      setDropPlayerId('');
      await loadAll();
      setGridRefresh((k) => k + 1);
      setTab('claims');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit claim');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelClaim(claimId: string) {
    if (!token) return;
    if (!confirm('Cancel this waiver claim?')) return;
    try {
      await apiDelete(`/leagues/${league.id}/waiver/${claimId}`, token);
      toast.success('Claim cancelled');
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel claim');
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-800 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  const myClaims = waiverClaims.filter(c => c.team?.id && myRoster.length >= 0);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700">
        <button
          onClick={() => setTab('available')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'available'
              ? 'border-gridiron-gold text-gridiron-gold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Free Agents
        </button>
        <button
          onClick={() => setTab('claims')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            tab === 'claims'
              ? 'border-gridiron-gold text-gridiron-gold'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          My Claims
          {waiverClaims.filter(c => c.status === 'pending').length > 0 && (
            <span className="bg-gridiron-gold text-slate-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
              {waiverClaims.filter(c => c.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {tab === 'available' && (
        <PlayerGrid
          fetcher={freeAgentsFetcher}
          columns={waiverGridColumns}
          initialSort={{ key: 'adp', dir: 'asc' }}
          pageSize={100}
          refreshKey={gridRefresh}
          rowAction={(p) => (
            <button
              onClick={() => {
                setClaimModal({
                  id: p.id,
                  name: p.name,
                  position: p.position,
                  nfl_team: p.nfl_team,
                  status: p.status,
                  adp: p.adp ?? undefined,
                });
                setDropPlayerId('');
              }}
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
            >
              <Plus size={14} />
              Claim
            </button>
          )}
        />
      )}

      {tab === 'claims' && (
        <div className="space-y-3">
          {waiverClaims.length === 0 ? (
            <div className="text-center py-16">
              <Clock size={40} className="text-slate-600 mx-auto mb-3" />
              <h3 className="text-white font-bold mb-1">No waiver claims</h3>
              <p className="text-slate-400 text-sm">Browse free agents and submit claims to add players to your team.</p>
            </div>
          ) : (
            waiverClaims.map(claim => (
              <div key={claim.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[claim.status]}`}>
                        {claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
                      </span>
                      <span className="text-slate-500 text-xs">Priority #{claim.priority}</span>
                      <span className="text-slate-500 text-xs">Week {claim.week}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Plus size={14} className="text-green-400" />
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${POSITION_COLORS[claim.add_player.position] || ''}`}>
                          {claim.add_player.position}
                        </span>
                        <span className="text-white font-medium">{claim.add_player.name}</span>
                        <span className="text-slate-400 text-xs">{claim.add_player.nfl_team}</span>
                      </div>
                    </div>
                    {claim.drop_player && (
                      <div className="flex items-center gap-2 text-sm mt-1">
                        <X size={14} className="text-red-400" />
                        <span className="text-slate-400">Drop:</span>
                        <span className="text-white">{claim.drop_player.name}</span>
                      </div>
                    )}
                    {claim.failure_reason && (
                      <p className="text-red-400 text-xs mt-1">{claim.failure_reason}</p>
                    )}
                  </div>
                  {claim.status === 'pending' && (
                    <button
                      onClick={() => handleCancelClaim(claim.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                      title="Cancel claim"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Claim Modal */}
      {claimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-white font-bold text-xl mb-2">Submit Waiver Claim</h3>
            <p className="text-slate-400 text-sm mb-6">
              Claim <strong className="text-white">{claimModal.name}</strong> ({claimModal.position} · {claimModal.nfl_team}).
              Claims are processed by waiver priority.
            </p>

            {myRoster.length > 0 && (
              <div className="mb-6">
                <label className="label">Drop a player (optional)</label>
                <select
                  className="input w-full"
                  value={dropPlayerId}
                  onChange={e => setDropPlayerId(e.target.value)}
                >
                  <option value="">— Don't drop anyone —</option>
                  {myRoster
                    .filter(r => r.player)
                    .sort((a, b) => a.player.name.localeCompare(b.player.name))
                    .map(r => (
                      <option key={r.player.id} value={r.player.id}>
                        {r.player.name} ({r.player.position} · {r.player.nfl_team}) — {r.slot}
                      </option>
                    ))}
                </select>
                <p className="text-slate-500 text-xs mt-1">
                  If you're at max roster size you must drop someone.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSubmitClaim}
                disabled={submitting}
                className="btn-primary flex-1"
              >
                {submitting ? 'Submitting...' : 'Submit Claim'}
              </button>
              <button
                onClick={() => { setClaimModal(null); setDropPlayerId(''); }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

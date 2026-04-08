import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPost } from '../../utils/api';
import toast from 'react-hot-toast';
import type { League } from '../LeaguePage';
import { Search, Clock, Check, UserCircle } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Player {
  id: string;
  name: string;
  position: string;
  nfl_team: string;
  status: string;
  adp?: number;
  headshot_url?: string | null;
}

interface DraftPick {
  id: string;
  round: number;
  pick: number;
  is_auto: boolean;
  picked_at: string;
  team: { id: string; team_name: string };
  player: Player | null;
}

interface DraftTeam {
  id: string;
  team_name: string;
  draft_position: number;
  user: { id: string; display_name: string };
}

interface DraftState {
  league: {
    draft_timer_seconds: number;
    draft_current_pick: number;
    status: string;
  };
  teams: DraftTeam[];
  picks: DraftPick[];
  draftedPlayerIds: string[];
  currentPickNumber: number;
  currentTeam: DraftTeam | null;
  totalPicks: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-500/20 text-red-400 border-red-500/30',
  RB: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  WR: 'bg-green-500/20 text-green-400 border-green-500/30',
  TE: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  K: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  DEF: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;

// ── Player Avatar ────────────────────────────────────────────────────────────

function PlayerAvatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false);

  if (!src || imgError) {
    return (
      <div
        className="rounded-full bg-slate-700 flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <UserCircle size={size * 0.7} className="text-slate-500" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover bg-slate-700 shrink-0"
      style={{ width: size, height: size }}
      onError={() => setImgError(true)}
    />
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function DraftRoomPage({
  league,
  onPickMade,
}: {
  league: League;
  onPickMade: () => void;
}) {
  const { token, user } = useAuthStore();
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data loaders ──────────────────────────────────────────────────────────

  async function loadDraftState() {
    if (!token) return;
    try {
      const data = await apiGet<DraftState>(`/leagues/${league.id}/draft`, token);
      setDraftState(data);
      setTimeLeft(data.league.draft_timer_seconds);
    } catch {
      toast.error('Failed to load draft state');
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailablePlayers() {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      params.set('leagueId', league.id);
      if (search) params.set('q', search);
      if (posFilter !== 'ALL') params.set('position', posFilter);
      params.set('limit', '100');

      // Use the new /api/players/available endpoint which also returns headshot_url
      const data = await apiGet<{ players: Player[]; total: number }>(
        `/players/available?${params.toString()}`,
        token
      );
      setAvailablePlayers(data.players ?? []);
    } catch {
      // silently fail — draft still works without player list update
    }
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    loadDraftState();
    loadAvailablePlayers();

    // Poll every 8 s to catch other users' picks
    pollRef.current = setInterval(loadDraftState, 8000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league.id]);

  useEffect(() => {
    loadAvailablePlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, posFilter, draftState?.currentPickNumber]);

  // Countdown timer — resets whenever the current pick changes
  useEffect(() => {
    if (!draftState) return;
    setTimeLeft(draftState.league.draft_timer_seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [draftState?.currentPickNumber]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handlePick(playerId: string) {
    if (!token || picking) return;
    setPicking(true);
    try {
      await apiPost(`/leagues/${league.id}/draft/pick`, { playerId }, token);
      toast.success('Pick made! 🏈');
      await loadDraftState();
      await loadAvailablePlayers();
      onPickMade();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to make pick');
    } finally {
      setPicking(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading || !draftState) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-slate-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const myTeam = draftState.teams.find(t => t.user?.id === user?.id);
  const isMyTurn = draftState.currentTeam?.user?.id === user?.id;
  const timerPct = (timeLeft / draftState.league.draft_timer_seconds) * 100;
  const timerColor =
    timeLeft > 30 ? 'bg-green-500' : timeLeft > 10 ? 'bg-yellow-500' : 'bg-red-500';

  // Build a map of player id → Player for pick display
  const playerMap = new Map<string, Player>();
  for (const pick of draftState.picks) {
    if (pick.player) playerMap.set(pick.player.id, pick.player);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ── Left: Player Pool ─────────────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-4">
        {/* Current Pick Banner */}
        <div
          className={`rounded-xl p-4 border ${
            isMyTurn
              ? 'bg-gridiron-gold/10 border-gridiron-gold/50'
              : 'bg-slate-800 border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-slate-400 text-sm">
                Pick {draftState.currentPickNumber + 1} of {draftState.totalPicks}
              </p>
              <p className={`font-bold text-lg ${isMyTurn ? 'text-gridiron-gold' : 'text-white'}`}>
                {isMyTurn
                  ? '⭐ Your turn to pick!'
                  : `On the clock: ${draftState.currentTeam?.team_name || '—'}`}
              </p>
            </div>
            <div className="flex items-center gap-2 text-white">
              <Clock size={18} />
              <span className={`text-2xl font-mono font-bold ${timeLeft <= 10 ? 'text-red-400' : ''}`}>
                {timeLeft}s
              </span>
            </div>
          </div>
          {/* Timer bar */}
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${timerColor}`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
        </div>

        {/* Search + Position Filter */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search players..."
              className="input pl-9 w-full"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {POSITIONS.map(pos => (
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
        </div>

        {/* Player List */}
        <div className="card p-0 overflow-hidden">
          <div className="divide-y divide-slate-700 max-h-[500px] overflow-y-auto">
            {availablePlayers.length === 0 ? (
              <div className="py-10 text-center text-slate-500">
                {search || posFilter !== 'ALL' ? 'No players match your filters' : 'No players available'}
              </div>
            ) : (
              availablePlayers.map(player => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-750 transition-colors"
                >
                  {/* Photo */}
                  <PlayerAvatar src={player.headshot_url} name={player.name} size={40} />

                  {/* Position badge */}
                  <div
                    className={`px-2 py-0.5 rounded text-xs font-bold border ${
                      POSITION_COLORS[player.position] || 'bg-slate-700 text-slate-400 border-slate-600'
                    }`}
                  >
                    {player.position}
                  </div>

                  {/* Name + Team */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium text-sm truncate">{player.name}</div>
                    <div className="text-slate-400 text-xs">{player.nfl_team}</div>
                  </div>

                  {/* ADP */}
                  {player.adp != null && (
                    <div className="text-slate-500 text-xs shrink-0">ADP {player.adp}</div>
                  )}

                  {/* Draft button — only shown on your turn */}
                  {isMyTurn && (
                    <button
                      onClick={() => handlePick(player.id)}
                      disabled={picking}
                      className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1 shrink-0"
                    >
                      <Check size={14} />
                      Draft
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Right: Draft Board ────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* My Picks */}
        {myTeam && (
          <div className="card">
            <h3 className="text-white font-bold mb-3">
              My Picks ({draftState.picks.filter(p => p.team?.id === myTeam.id && p.player).length})
            </h3>
            <div className="space-y-2">
              {draftState.picks
                .filter(p => p.team?.id === myTeam.id && p.player)
                .map(pick => (
                  <div key={pick.id} className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 w-8 text-right">R{pick.round}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                        POSITION_COLORS[pick.player!.position] || ''
                      }`}
                    >
                      {pick.player!.position}
                    </span>
                    <PlayerAvatar src={pick.player!.headshot_url} name={pick.player!.name} size={24} />
                    <span className="text-white truncate">{pick.player!.name}</span>
                  </div>
                ))}
              {draftState.picks.filter(p => p.team?.id === myTeam.id && p.player).length === 0 && (
                <p className="text-slate-500 text-sm">No picks yet</p>
              )}
            </div>
          </div>
        )}

        {/* Draft Order */}
        <div className="card">
          <h3 className="text-white font-bold mb-3">Draft Order</h3>
          <div className="space-y-1.5">
            {[...draftState.teams]
              .sort((a, b) => a.draft_position - b.draft_position)
              .map((team, i) => (
                <div
                  key={team.id}
                  className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                    draftState.currentTeam?.id === team.id
                      ? 'bg-gridiron-gold/10 border border-gridiron-gold/30'
                      : 'bg-slate-800'
                  }`}
                >
                  <span className="text-slate-500 w-5 text-center">{i + 1}</span>
                  <span
                    className={`flex-1 truncate ${
                      team.user?.id === user?.id ? 'text-gridiron-gold font-bold' : 'text-white'
                    }`}
                  >
                    {team.team_name}
                  </span>
                  <span className="text-slate-400 text-xs">
                    {draftState.picks.filter(p => p.team?.id === team.id && p.player).length} picks
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Recent Picks */}
        <div className="card">
          <h3 className="text-white font-bold mb-3">Recent Picks</h3>
          <div className="space-y-2">
            {[...draftState.picks]
              .filter(p => p.player)
              .slice(-10)
              .reverse()
              .map(pick => (
                <div key={pick.id} className="flex items-start gap-2 text-sm">
                  <span className="text-slate-500 text-xs mt-0.5">#{pick.pick}</span>
                  <PlayerAvatar src={pick.player!.headshot_url} name={pick.player!.name} size={28} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                          POSITION_COLORS[pick.player!.position] || ''
                        }`}
                      >
                        {pick.player!.position}
                      </span>
                      <span className="text-white font-medium truncate">{pick.player!.name}</span>
                    </div>
                    <div className="text-slate-500 text-xs">{pick.team?.team_name}</div>
                  </div>
                </div>
              ))}
            {draftState.picks.filter(p => p.player).length === 0 && (
              <p className="text-slate-500 text-sm">Draft hasn't started yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

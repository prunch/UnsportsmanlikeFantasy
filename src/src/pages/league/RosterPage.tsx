import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPost } from '../../utils/api';
import toast from 'react-hot-toast';
import type { League } from '../LeaguePage';
import { ArrowLeftRight, Trash2 } from 'lucide-react';

interface Player {
  id: string;
  name: string;
  position: string;
  nfl_team: string;
  status: string;
  adp?: number;
  headshot_url?: string;
}

interface RosterEntry {
  id: string;
  slot: string;
  week: number;
  acquired_via: string;
  player: Player;
}

const LINEUP_SLOTS = ['QB', 'RB', 'RB2', 'WR', 'WR2', 'TE', 'FLEX', 'K', 'DEF'];
const BENCH_SLOTS = ['BN1', 'BN2', 'BN3', 'BN4', 'BN5', 'BN6'];
const IR_SLOTS = ['IR1', 'IR2'];

const SLOT_LABELS: Record<string, string> = {
  QB: 'QB', RB: 'RB', RB2: 'RB', WR: 'WR', WR2: 'WR',
  TE: 'TE', FLEX: 'FLEX', K: 'K', DEF: 'DEF',
  BN1: 'BN', BN2: 'BN', BN3: 'BN', BN4: 'BN', BN5: 'BN', BN6: 'BN',
  IR1: 'IR', IR2: 'IR'
};

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-500/20 text-red-400',
  RB: 'bg-blue-500/20 text-blue-400',
  WR: 'bg-green-500/20 text-green-400',
  TE: 'bg-purple-500/20 text-purple-400',
  K: 'bg-yellow-500/20 text-yellow-400',
  DEF: 'bg-orange-500/20 text-orange-400'
};

export default function RosterPage({ league }: { league: League }) {
  const { token } = useAuthStore();
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [movingPlayer, setMovingPlayer] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<string | null>(null); // playerId being moved

  async function loadRoster() {
    if (!token) return;
    try {
      const data = await apiGet<RosterEntry[]>(`/leagues/${league.id}/roster/mine`, token);
      setRoster(data);
    } catch (err) {
      toast.error('Failed to load roster');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRoster();
  }, [league.id, token]);

  async function handleMovePlayer(playerId: string, targetSlot: string) {
    if (!token) return;
    setMovingPlayer(playerId);
    try {
      await apiPost(`/leagues/${league.id}/roster`, { playerId, slot: targetSlot }, token);
      toast.success('Lineup updated!');
      await loadRoster();
      setPendingMove(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to move player');
    } finally {
      setMovingPlayer(null);
    }
  }

  async function handleDrop(playerId: string, playerName: string) {
    if (!token) return;
    if (!confirm(`Drop ${playerName}? This cannot be undone.`)) return;
    try {
      await apiPost(`/leagues/${league.id}/roster/drop`, { playerId }, token);
      toast.success(`${playerName} dropped.`);
      await loadRoster();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to drop player');
    }
  }

  const rosterMap = new Map<string, RosterEntry>();
  for (const entry of roster) {
    rosterMap.set(entry.slot, entry);
  }

  function SlotRow({ slot }: { slot: string }) {
    const entry = rosterMap.get(slot);
    const label = SLOT_LABELS[slot];
    const isSelected = pendingMove === entry?.player?.id;

    return (
      <div
        className={`flex items-center gap-3 py-3 px-4 rounded-lg mb-1 transition-colors ${
          isSelected ? 'bg-slate-600' : 'bg-slate-800 hover:bg-slate-750'
        } ${pendingMove && !isSelected && entry ? 'cursor-pointer' : ''}`}
        onClick={() => {
          if (pendingMove && entry && pendingMove !== entry.player?.id) {
            // Swap them
            handleMovePlayer(pendingMove, slot);
          } else if (pendingMove && !entry) {
            // Move to empty slot
            handleMovePlayer(pendingMove, slot);
          }
        }}
      >
        {/* Slot label */}
        <div className="w-12 text-xs font-bold text-slate-500 text-center">{label}</div>

        {/* Player or empty */}
        {entry?.player ? (
          <>
            <div className="flex-1 flex items-center gap-3">
              {entry.player.headshot_url ? (
                <img src={entry.player.headshot_url} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                  {entry.player.name.charAt(0)}
                </div>
              )}
              <div>
                <div className="text-white font-medium text-sm">{entry.player.name}</div>
                <div className="text-slate-400 text-xs">
                  {entry.player.nfl_team} ·{' '}
                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${POSITION_COLORS[entry.player.position] || ''}`}>
                    {entry.player.position}
                  </span>
                  {entry.player.status !== 'active' && (
                    <span className="ml-2 text-red-400 font-semibold uppercase text-xs">
                      {entry.player.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 capitalize">{entry.acquired_via}</span>
              {league.status !== 'draft' && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setPendingMove(isSelected ? null : entry.player.id); }}
                    title="Move player"
                    className={`p-1.5 rounded transition-colors ${isSelected ? 'text-gridiron-gold bg-gridiron-gold/10' : 'text-slate-500 hover:text-white'}`}
                  >
                    <ArrowLeftRight size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDrop(entry.player.id, entry.player.name); }}
                    title="Drop player"
                    className="p-1.5 rounded text-slate-500 hover:text-red-400 transition-colors"
                    disabled={!!movingPlayer}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className={`flex-1 text-slate-600 text-sm italic ${pendingMove ? 'text-slate-400' : ''}`}>
            {pendingMove ? '← Move here' : 'Empty'}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-14 bg-slate-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (roster.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">📋</div>
        <h3 className="text-xl font-bold text-white mb-2">No players yet</h3>
        <p className="text-slate-400">
          {league.status === 'setup'
            ? 'Your roster will be filled after the draft.'
            : 'Add players via the waiver wire.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pendingMove && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-sm text-blue-300">
          Select a slot to move <strong>{roster.find(r => r.player?.id === pendingMove)?.player?.name}</strong> to, or click the move icon again to cancel.
        </div>
      )}

      {/* Starting Lineup */}
      <div className="card">
        <h3 className="text-white font-bold text-lg mb-3">Starting Lineup</h3>
        {LINEUP_SLOTS.map(slot => <SlotRow key={slot} slot={slot} />)}
      </div>

      {/* Bench */}
      <div className="card">
        <h3 className="text-white font-bold text-lg mb-3">Bench</h3>
        {BENCH_SLOTS.map(slot => <SlotRow key={slot} slot={slot} />)}
      </div>

      {/* IR */}
      <div className="card">
        <h3 className="text-white font-bold text-lg mb-3">Injured Reserve</h3>
        {IR_SLOTS.map(slot => <SlotRow key={slot} slot={slot} />)}
      </div>
    </div>
  );
}

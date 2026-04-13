import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPost } from '../../utils/api';
import toast from 'react-hot-toast';
import type { League } from '../LeaguePage';
import { Trash2, Lock, ArrowDownUp } from 'lucide-react';

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

const LINEUP_SLOTS = ['QB', 'RB', 'RB2', 'WR', 'WR2', 'WR3', 'TE', 'FLEX', 'K', 'DEF'];
const BENCH_SLOTS = ['BN1', 'BN2', 'BN3', 'BN4', 'BN5', 'BN6'];
const IR_SLOTS = ['IR1', 'IR2'];

const SLOT_LABELS: Record<string, string> = {
  QB: 'QB', RB: 'RB', RB2: 'RB', WR: 'WR', WR2: 'WR', WR3: 'WR',
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

// Position eligibility per slot (mirrors backend SLOT_ELIGIBILITY)
const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ['QB'],
  RB: ['RB'], RB2: ['RB'],
  WR: ['WR'], WR2: ['WR'], WR3: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  K: ['K'],
  DEF: ['DEF'],
  BN1: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
  BN2: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
  BN3: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
  BN4: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
  BN5: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
  BN6: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
  IR1: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
  IR2: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
};

/** Can this player position go into this slot? */
function canFitSlot(playerPosition: string, slot: string): boolean {
  const eligible = SLOT_ELIGIBILITY[slot];
  return eligible ? eligible.includes(playerPosition) : false;
}

/**
 * Check if two slots can swap.
 * Both players must be eligible for the other's slot.
 * If the target slot is empty, only the moving player needs to be eligible.
 */
function canSwap(
  selectedEntry: RosterEntry,
  targetSlot: string,
  targetEntry: RosterEntry | undefined
): boolean {
  // Can the selected player fit into the target slot?
  if (!canFitSlot(selectedEntry.player.position, targetSlot)) return false;

  // If target slot has a player, can that player fit into the selected player's slot?
  if (targetEntry) {
    if (!canFitSlot(targetEntry.player.position, selectedEntry.slot)) return false;
  }

  return true;
}

export default function RosterPage({ league }: { league: League }) {
  const { token } = useAuthStore();
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [swapping, setSwapping] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // The slot of the currently selected player (tap-to-select)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  async function loadRoster() {
    if (!token) return;
    try {
      const data = await apiGet<RosterEntry[]>(`/leagues/${league.id}/roster/mine`, token);
      setRoster(data);
    } catch {
      toast.error('Failed to load roster');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRoster();
  }, [league.id, token]);

  // Build slot → entry map
  const rosterMap = new Map<string, RosterEntry>();
  for (const entry of roster) {
    rosterMap.set(entry.slot, entry);
  }

  const selectedEntry = selectedSlot ? rosterMap.get(selectedSlot) : undefined;

  // Compute which slots are valid swap targets for the selected player
  const validTargets = new Set<string>();
  if (selectedEntry) {
    const allSlots = [...LINEUP_SLOTS, ...BENCH_SLOTS, ...IR_SLOTS];
    for (const slot of allSlots) {
      if (slot === selectedSlot) continue; // can't swap with yourself
      const target = rosterMap.get(slot);
      if (canSwap(selectedEntry, slot, target)) {
        validTargets.add(slot);
      }
    }
  }

  function handleSlotClick(slot: string) {
    if (swapping || isLocked) return;

    // No selection yet → select this slot if it has a player
    if (!selectedSlot) {
      if (rosterMap.get(slot)?.player) {
        setSelectedSlot(slot);
      }
      return;
    }

    // Clicking the same slot → deselect
    if (slot === selectedSlot) {
      setSelectedSlot(null);
      return;
    }

    // Clicking a valid target → execute swap
    if (validTargets.has(slot)) {
      executeSwap(selectedEntry!.player.id, slot);
      return;
    }

    // Clicking an invalid target → if it has a player, select that one instead
    if (rosterMap.get(slot)?.player) {
      setSelectedSlot(slot);
    } else {
      setSelectedSlot(null);
    }
  }

  async function executeSwap(playerId: string, targetSlot: string) {
    if (!token) return;
    setSwapping(true);
    try {
      await apiPost(`/leagues/${league.id}/roster`, { playerId, slot: targetSlot }, token);
      toast.success('Lineup updated!');
      setSelectedSlot(null);
      await loadRoster();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to move player';
      if (msg.includes('locked')) setIsLocked(true);
      toast.error(msg);
    } finally {
      setSwapping(false);
    }
  }

  async function handleDrop(playerId: string, playerName: string) {
    if (!token || isLocked) return;
    if (!confirm(`Drop ${playerName}? This cannot be undone.`)) return;
    try {
      await apiPost(`/leagues/${league.id}/roster/drop`, { playerId }, token);
      toast.success(`${playerName} dropped.`);
      setSelectedSlot(null);
      await loadRoster();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to drop player');
    }
  }

  function SlotRow({ slot }: { slot: string }) {
    const entry = rosterMap.get(slot);
    const label = SLOT_LABELS[slot];
    const isSelected = slot === selectedSlot;
    const isValidTarget = validTargets.has(slot);
    const isInSwapMode = !!selectedSlot;

    // Determine row styling
    let rowClasses = 'flex items-center gap-3 py-3 px-4 rounded-lg mb-1 transition-all cursor-pointer ';
    if (isSelected) {
      rowClasses += 'bg-gridiron-gold/15 border-2 border-gridiron-gold ring-1 ring-gridiron-gold/30';
    } else if (isValidTarget) {
      rowClasses += 'bg-green-500/8 border-2 border-green-500/40 hover:bg-green-500/15';
    } else if (isInSwapMode) {
      rowClasses += 'bg-slate-800 border-2 border-transparent opacity-40';
    } else {
      rowClasses += 'bg-slate-800 border-2 border-transparent hover:bg-slate-750';
    }

    return (
      <div
        className={rowClasses}
        onClick={() => handleSlotClick(slot)}
      >
        {/* Slot label */}
        <div className={`w-12 text-xs font-bold text-center ${
          isSelected ? 'text-gridiron-gold' : isValidTarget ? 'text-green-400' : 'text-slate-500'
        }`}>
          {label}
        </div>

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
                <div className={`font-medium text-sm ${isSelected ? 'text-gridiron-gold' : 'text-white'}`}>
                  {entry.player.name}
                </div>
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

            {/* Swap indicator or drop button */}
            <div className="flex items-center gap-1 shrink-0">
              {isSelected && (
                <span className="text-gridiron-gold text-xs font-medium mr-1">Selected</span>
              )}
              {isValidTarget && (
                <span className="text-green-400 text-xs flex items-center gap-1">
                  <ArrowDownUp size={12} /> Swap
                </span>
              )}
              {!isInSwapMode && league.status !== 'draft' && !isLocked && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDrop(entry.player.id, entry.player.name); }}
                  title="Drop player"
                  className="p-1.5 rounded text-slate-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </>
        ) : (
          <div className={`flex-1 text-sm italic ${
            isValidTarget ? 'text-green-400' : 'text-slate-600'
          }`}>
            {isValidTarget ? (
              <span className="flex items-center gap-1">
                <ArrowDownUp size={12} /> Move here
              </span>
            ) : (
              'Empty'
            )}
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
      {/* Lock banner */}
      {isLocked && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-sm text-yellow-400 flex items-center gap-2">
          <Lock size={14} /> Roster is locked — games have started this week.
        </div>
      )}

      {/* Selection hint */}
      {selectedSlot && selectedEntry && (
        <div className="bg-gridiron-gold/10 border border-gridiron-gold/30 rounded-xl p-3 text-sm text-gridiron-gold flex items-center justify-between">
          <span>
            <strong>{selectedEntry.player.name}</strong> selected — tap a highlighted slot to swap, or tap again to cancel.
          </span>
          <button
            onClick={() => setSelectedSlot(null)}
            className="text-xs text-slate-400 hover:text-white ml-3 shrink-0"
          >
            Cancel
          </button>
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

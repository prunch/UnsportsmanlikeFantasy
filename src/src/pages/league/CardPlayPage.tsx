import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Shield, X, ChevronRight, Target, CheckCircle, Lock } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPost } from '../../utils/api';
import { League } from '../LeaguePage';
import toast from 'react-hot-toast';
import { CardData } from '../../components/cards/Card';

// ── Types ──

interface UserCard {
  id: string;
  user_id: string;
  league_id: string;
  card_id: string;
  card: CardData & { target_scope?: 'player' | 'group' };
  obtained_at: string;
  played_at: string | null;
}

interface PlayedCardEntry {
  id: string;
  play_slot: string;
  card: CardData;
}

interface PlayedCardsResponse {
  week: number;
  season: number;
  kickoff_passed: boolean;
  plays: PlayedCardEntry[];
}

interface SwitcherooStatus {
  protected_player_id: string | null;
  used_this_week: boolean;
  restricted_player_id: string | null;
  available: boolean;
}

interface RosterEntry {
  id: string;
  slot: string;
  player: {
    id: string;
    name: string;
    position: string;
    nfl_team: string;
    status: string;
    headshot_url?: string;
  } | null;
}

interface TeamWithRoster {
  id: string;
  team_name: string;
  user: { id: string; display_name: string; avatar_url?: string };
  roster: RosterEntry[];
}

// Starting slots only — no bench or IR
const STARTING_SLOTS = ['QB', 'RB', 'RB2', 'WR', 'WR2', 'WR3', 'TE', 'FLEX', 'K', 'DEF'];

// Canonical slot → position mapping for filtering
function slotToPosition(slot: string): string {
  if (slot.startsWith('RB')) return 'RB';
  if (slot.startsWith('WR')) return 'WR';
  if (slot === 'FLEX') return 'FLEX';
  return slot;
}

// V2 play slots for display
const PLAY_SLOTS = [
  { key: 'buff', label: 'Buff', color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/30' },
  { key: 'debuff', label: 'Debuff', color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/30' },
  { key: 'wild', label: 'Wild', color: 'text-purple-400', bgColor: 'bg-purple-500/10 border-purple-500/30' },
] as const;

export default function CardPlayPage({ league }: { league: League }) {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();

  // Data
  const [stack, setStack] = useState<UserCard[]>([]);
  const [playedData, setPlayedData] = useState<PlayedCardsResponse | null>(null);
  const [switcheroo, setSwitcheroo] = useState<SwitcherooStatus | null>(null);
  const [allRosters, setAllRosters] = useState<TeamWithRoster[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [targetTeam, setTargetTeam] = useState<TeamWithRoster | null>(null);
  const [showRosterDialog, setShowRosterDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Find which slots are already used this week
  const myPlays = (playedData?.plays || []).filter(p => (p as any).user_id === user?.id);
  const usedSlots = new Set(myPlays.map(p => p.play_slot));

  // My team in this league
  const myTeam = allRosters.find(t => t.user?.id === user?.id);
  const otherTeams = allRosters.filter(t => t.user?.id !== user?.id);

  const loadAll = useCallback(async () => {
    if (!league.id || !token) return;
    setLoading(true);
    try {
      const [stackData, playedResponse, switcherooData, rostersData] = await Promise.all([
        apiGet<UserCard[]>(`/leagues/${league.id}/cards`, token),
        apiGet<PlayedCardsResponse>(`/leagues/${league.id}/cards/played`, token),
        apiGet<SwitcherooStatus>(`/leagues/${league.id}/switcheroo`, token),
        apiGet<TeamWithRoster[]>(`/leagues/${league.id}/rosters`, token)
      ]);
      setStack(stackData);
      setPlayedData(playedResponse);
      setSwitcheroo(switcherooData);
      setAllRosters(rostersData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [league.id, token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Card click handler ──
  function handleCardClick(uc: UserCard) {
    setSelectedCard(uc);
    setSelectedSlot(null);
    setTargetTeam(null);
  }

  // ── Switcheroo click: auto-open own roster ──
  function handleSwitcherooClick() {
    if (!switcheroo?.available || !myTeam) return;
    setSelectedCard(null); // switcheroo is special, not from stack
    setSelectedSlot('switcheroo');
    setTargetTeam(myTeam);
    setShowRosterDialog(true);
  }

  // ── After selecting a card, user picks a slot, then pick a target user ──
  function handleSlotSelect(slot: string) {
    if (!selectedCard) return;
    setSelectedSlot(slot);
    // Switcheroo is handled separately
    // For buff/debuff/wild — show the league table to pick a target user
  }

  // ── User picks a team from the league table ──
  function handleTeamSelect(team: TeamWithRoster) {
    setTargetTeam(team);
    setShowRosterDialog(true);
  }

  // ── Get eligible starters from a roster based on the selected card ──
  function getEligiblePlayers(roster: RosterEntry[]): RosterEntry[] {
    const starters = roster.filter(r => STARTING_SLOTS.includes(r.slot) && r.player);
    if (!selectedCard && selectedSlot === 'switcheroo') {
      // Switcheroo: any starter can be protected
      return starters;
    }
    if (!selectedCard) return starters;

    const card = selectedCard.card;

    // Group-scope card: all starters of that position group
    if (card.target_scope === 'group') {
      const pos = card.target_position; // e.g., 'WR', 'RB'
      if (!pos || pos === 'All') return starters;
      return starters.filter(r => {
        const playerPos = r.player?.position;
        return playerPos === pos;
      });
    }

    // Player-scope card with a target_position
    if (card.target_type === 'position' && card.target_position && card.target_position !== 'All') {
      const pos = card.target_position;
      return starters.filter(r => {
        const playerPos = r.player?.position;
        // FLEX matches the card's target position
        if (r.slot === 'FLEX') return playerPos === pos;
        return playerPos === pos;
      });
    }

    // target_type = 'player' or 'all': any starter is eligible
    return starters;
  }

  // ── Play the card against a specific player ──
  async function handlePlayOnPlayer(rosterEntry: RosterEntry) {
    if (!token || submitting) return;

    setSubmitting(true);
    try {
      if (selectedSlot === 'switcheroo') {
        // Use the switcheroo endpoint
        await apiPost(`/leagues/${league.id}/switcheroo`, {
          player_id: rosterEntry.player!.id
        }, token);
        toast.success(`Switcheroo activated! ${rosterEntry.player!.name} is protected.`);
      } else if (selectedCard && selectedSlot) {
        // Determine target_group for group-scope cards
        const card = selectedCard.card;
        const isGroup = card.target_scope === 'group';

        await apiPost(`/leagues/${league.id}/cards/play`, {
          user_card_id: selectedCard.id,
          play_slot: selectedSlot,
          target_player_id: isGroup ? undefined : rosterEntry.player!.id,
          target_team_id: targetTeam?.id,
          target_group: isGroup ? card.target_position : undefined
        }, token);
        toast.success(`${card.title} played on ${isGroup ? `all ${card.target_position}s` : rosterEntry.player!.name}!`);
      }

      // Reset and reload
      setSelectedCard(null);
      setSelectedSlot(null);
      setTargetTeam(null);
      setShowRosterDialog(false);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to play card');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Play a group card (targets all of a position) ──
  async function handlePlayOnGroup() {
    if (!selectedCard || !selectedSlot || !targetTeam || !token || submitting) return;
    const card = selectedCard.card;
    if (card.target_scope !== 'group') return;

    setSubmitting(true);
    try {
      await apiPost(`/leagues/${league.id}/cards/play`, {
        user_card_id: selectedCard.id,
        play_slot: selectedSlot,
        target_team_id: targetTeam.id,
        target_group: card.target_position
      }, token);
      toast.success(`${card.title} played on all ${card.target_position}s!`);

      setSelectedCard(null);
      setSelectedSlot(null);
      setTargetTeam(null);
      setShowRosterDialog(false);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to play card');
    } finally {
      setSubmitting(false);
    }
  }

  function resetSelection() {
    setSelectedCard(null);
    setSelectedSlot(null);
    setTargetTeam(null);
    setShowRosterDialog(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gridiron-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isGroupCard = selectedCard?.card.target_scope === 'group';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Target size={22} className="text-gridiron-gold" />
          Play Your Cards
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Week {playedData?.week || league.current_week} — Select a card, choose a slot, then pick your target.
        </p>
      </div>

      {/* ── CARD HAND ── */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
        <h2 className="text-white font-semibold text-sm mb-4">Your Hand</h2>

        {stack.length === 0 && !switcheroo?.available ? (
          <p className="text-slate-500 text-sm text-center py-4">
            No cards to play. <button onClick={() => navigate(`/leagues/${league.id}/cards/pick`)} className="text-gridiron-gold hover:underline">Pick cards →</button>
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {/* Switcheroo card */}
            {switcheroo && (
              <button
                onClick={handleSwitcherooClick}
                disabled={switcheroo.used_this_week}
                className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all min-w-[120px] ${
                  selectedSlot === 'switcheroo'
                    ? 'border-gridiron-gold bg-gridiron-gold/10 scale-105'
                    : switcheroo.used_this_week
                      ? 'border-slate-700 bg-slate-800 opacity-50 cursor-not-allowed'
                      : 'border-blue-500/40 bg-blue-500/10 hover:border-blue-400 hover:scale-[1.02] cursor-pointer'
                }`}
              >
                <Shield size={24} className="text-blue-400 mb-1" />
                <span className="text-white text-xs font-bold">Switcheroo</span>
                <span className="text-blue-400 text-[10px]">Protect a player</span>
                {switcheroo.used_this_week && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                    <Lock size={16} className="text-slate-400" />
                  </div>
                )}
                {switcheroo.protected_player_id && switcheroo.used_this_week && (
                  <span className="text-[10px] text-green-400 mt-1">Active</span>
                )}
              </button>
            )}

            {/* Card stack */}
            {stack.map(uc => {
              const isBuff = uc.card.effect_type === 'buff';
              const isSelected = selectedCard?.id === uc.id;
              const modDisplay = uc.card.modifier_type === 'percentage'
                ? `${isBuff ? '+' : '-'}${uc.card.modifier_value}%`
                : `${isBuff ? '+' : '-'}${uc.card.modifier_value} pts`;

              return (
                <button
                  key={uc.id}
                  onClick={() => handleCardClick(uc)}
                  className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all min-w-[120px] ${
                    isSelected
                      ? 'border-gridiron-gold bg-gridiron-gold/10 scale-105'
                      : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:scale-[1.02] cursor-pointer'
                  }`}
                >
                  <div className={`text-lg mb-0.5 ${isBuff ? 'text-green-400' : 'text-red-400'}`}>
                    {isBuff ? '↑' : '↓'}
                  </div>
                  <span className="text-white text-xs font-bold text-center leading-tight">{uc.card.title}</span>
                  <span className={`text-[10px] font-mono font-bold mt-0.5 ${isBuff ? 'text-green-400' : 'text-red-400'}`}>
                    {modDisplay}
                  </span>
                  <span className="text-slate-500 text-[10px] mt-0.5">
                    {uc.card.target_scope === 'group' ? `All ${uc.card.target_position}s` : uc.card.target_position || 'Any'}
                  </span>
                  {/* Rarity dot */}
                  <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                    uc.card.rarity === 'rare' ? 'bg-blue-400' : uc.card.rarity === 'uncommon' ? 'bg-green-400' : 'bg-slate-500'
                  }`} />
                </button>
              );
            })}
          </div>
        )}

        {/* Already-played slots this week */}
        {usedSlots.size > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle size={12} className="text-green-400" />
            Played this week: {Array.from(usedSlots).join(', ')}
          </div>
        )}
      </div>

      {/* ── SLOT SELECTION (after picking a card) ── */}
      {selectedCard && !selectedSlot && (
        <div className="bg-slate-800/50 border border-gridiron-gold/30 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm">
              Choose a slot for <span className="text-gridiron-gold">{selectedCard.card.title}</span>
            </h3>
            <button onClick={resetSelection} className="text-slate-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <div className="flex gap-3">
            {PLAY_SLOTS.map(slot => {
              const used = usedSlots.has(slot.key);
              return (
                <button
                  key={slot.key}
                  onClick={() => handleSlotSelect(slot.key)}
                  disabled={used}
                  className={`flex-1 py-3 rounded-lg border text-sm font-semibold transition-all ${
                    used
                      ? 'border-slate-700 bg-slate-800 text-slate-600 cursor-not-allowed'
                      : `${slot.bgColor} ${slot.color} hover:scale-[1.02] cursor-pointer`
                  }`}
                >
                  {slot.label}
                  {used && <span className="block text-[10px] text-slate-600 mt-0.5">Used</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── LEAGUE MEMBERS TABLE (after picking card + slot) ── */}
      {selectedCard && selectedSlot && !showRosterDialog && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm">
              Choose a target for{' '}
              <span className="text-gridiron-gold">{selectedCard.card.title}</span>{' '}
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                PLAY_SLOTS.find(s => s.key === selectedSlot)?.bgColor || ''
              } ${PLAY_SLOTS.find(s => s.key === selectedSlot)?.color || ''}`}>
                {selectedSlot}
              </span>
            </h3>
            <button onClick={resetSelection} className="text-slate-400 hover:text-white">
              <X size={16} />
            </button>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl divide-y divide-slate-700">
            {/* Show all teams (including own for buff plays) */}
            {allRosters.map(team => {
              const isMe = team.user?.id === user?.id;
              return (
                <button
                  key={team.id}
                  onClick={() => handleTeamSelect(team)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {team.user?.avatar_url ? (
                      <img src={team.user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-brand-800 flex items-center justify-center text-sm font-bold text-white">
                        {team.user?.display_name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-white font-medium text-sm">
                        {team.team_name}
                        {isMe && <span className="ml-2 text-xs text-gridiron-gold">(You)</span>}
                      </div>
                      <div className="text-slate-500 text-xs">{team.user?.display_name}</div>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-600" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DEFAULT STATE: League members table when no card selected ── */}
      {!selectedCard && !selectedSlot && (
        <div>
          <h2 className="text-white font-semibold text-sm mb-3">League Members</h2>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl divide-y divide-slate-700">
            {allRosters.map(team => {
              const isMe = team.user?.id === user?.id;
              return (
                <div
                  key={team.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {team.user?.avatar_url ? (
                      <img src={team.user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-brand-800 flex items-center justify-center text-sm font-bold text-white">
                        {team.user?.display_name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-white font-medium text-sm">
                        {team.team_name}
                        {isMe && <span className="ml-2 text-xs text-gridiron-gold">(You)</span>}
                      </div>
                      <div className="text-slate-500 text-xs">{team.user?.display_name}</div>
                    </div>
                  </div>
                  <span className="text-slate-600 text-xs">Select a card first</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ROSTER DIALOG ── */}
      {showRosterDialog && targetTeam && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            {/* Dialog header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div>
                <h3 className="text-white font-bold">
                  {selectedSlot === 'switcheroo' ? 'Protect a Player' : 'Select Target'}
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  {targetTeam.team_name} — {targetTeam.user?.display_name}
                  {selectedCard && (
                    <> · <span className="text-gridiron-gold">{selectedCard.card.title}</span></>
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowRosterDialog(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* Group card banner */}
            {isGroupCard && selectedSlot !== 'switcheroo' && (
              <div className="mx-4 mt-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <p className="text-purple-300 text-sm font-medium">
                  This card targets all {selectedCard?.card.target_position}s on this roster.
                </p>
                <button
                  onClick={handlePlayOnGroup}
                  disabled={submitting}
                  className="mt-2 w-full py-2 bg-purple-500 text-white font-semibold rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors text-sm"
                >
                  {submitting ? 'Playing...' : `Play on All ${selectedCard?.card.target_position}s`}
                </button>
              </div>
            )}

            {/* Roster list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {(() => {
                const starters = targetTeam.roster.filter(r => STARTING_SLOTS.includes(r.slot) && r.player);
                const eligible = getEligiblePlayers(targetTeam.roster);
                const eligibleIds = new Set(eligible.map(e => e.id));

                // Show switcheroo-restricted player
                const restrictedId = switcheroo?.restricted_player_id;

                return starters.map(entry => {
                  const isEligible = eligibleIds.has(entry.id);
                  const isRestricted = selectedSlot === 'switcheroo' && entry.player?.id === restrictedId;
                  const canSelect = isEligible && !isRestricted && !isGroupCard;

                  return (
                    <button
                      key={entry.id}
                      onClick={() => canSelect && handlePlayOnPlayer(entry)}
                      disabled={!canSelect || submitting}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                        canSelect
                          ? 'hover:bg-gridiron-gold/10 hover:border-gridiron-gold/30 cursor-pointer border border-transparent'
                          : isGroupCard && isEligible
                            ? 'border border-purple-500/20 bg-purple-500/5'
                            : 'opacity-40 cursor-not-allowed border border-transparent'
                      }`}
                    >
                      {/* Headshot or initials */}
                      {entry.player?.headshot_url ? (
                        <img src={entry.player.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-700" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                          {entry.player?.position}
                        </div>
                      )}

                      {/* Player info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium truncate">
                          {entry.player?.name || 'Empty'}
                        </div>
                        <div className="text-slate-500 text-xs">
                          {entry.player?.position} · {entry.player?.nfl_team}
                          <span className="text-slate-600 ml-2">Slot: {entry.slot}</span>
                        </div>
                      </div>

                      {/* Status indicators */}
                      <div className="shrink-0">
                        {isRestricted ? (
                          <span className="text-xs text-yellow-400">Used last week</span>
                        ) : canSelect ? (
                          <ChevronRight size={14} className="text-slate-600" />
                        ) : isGroupCard && isEligible ? (
                          <span className="text-xs text-purple-400">Targeted</span>
                        ) : (
                          <Lock size={14} className="text-slate-700" />
                        )}
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            {/* Dialog footer */}
            <div className="p-3 border-t border-slate-700 text-center">
              <button
                onClick={() => setShowRosterDialog(false)}
                className="text-slate-400 text-sm hover:text-white transition-colors"
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

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Shield, X, ChevronRight, Target, CheckCircle, Lock, RotateCcw, Trash2, Edit3 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPost, apiDelete, apiPut } from '../../utils/api';
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
  user_id: string;
  user_card_id: string;
  play_slot: string;
  card: CardData & { target_scope?: 'player' | 'group' };
  target_player_id: string | null;
  target_team_id: string | null;
  target_group: string | null;
}

interface LeaguePlaysResponse {
  week: number;
  season: number;
  locked: boolean;
  my_plays: PlayedCardEntry[];
  opponent_plays: PlayedCardEntry[];
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

const STARTING_SLOTS = ['QB', 'RB', 'RB2', 'WR', 'WR2', 'WR3', 'TE', 'FLEX', 'K', 'DEF'];
const MAX_PLAYS_PER_WEEK = 3;

export default function CardPlayPage({ league }: { league: League }) {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();

  // Data
  const [stack, setStack] = useState<UserCard[]>([]);
  const [leaguePlays, setLeaguePlays] = useState<LeaguePlaysResponse | null>(null);
  const [switcheroo, setSwitcheroo] = useState<SwitcherooStatus | null>(null);
  const [allRosters, setAllRosters] = useState<TeamWithRoster[]>([]);
  const [loading, setLoading] = useState(true);

  // Flow state
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null);
  const [isSwitcherooMode, setIsSwitcherooMode] = useState(false);
  const [targetTeam, setTargetTeam] = useState<TeamWithRoster | null>(null);
  const [showRosterDialog, setShowRosterDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reassign state: which played card we're reassigning
  const [reassigningCard, setReassigningCard] = useState<PlayedCardEntry | null>(null);

  // Derived
  const myPlays = leaguePlays?.my_plays || [];
  const playsUsed = myPlays.length;
  const playsRemaining = MAX_PLAYS_PER_WEEK - playsUsed;
  const myTeam = allRosters.find(t => t.user?.id === user?.id);
  const isLocked = leaguePlays?.locked ?? false;

  // Build a lookup: playerId → card info for display
  const playerCardMap = new Map<string, PlayedCardEntry>();
  const teamGroupCardMap = new Map<string, PlayedCardEntry[]>(); // teamId → group cards
  for (const play of myPlays) {
    if (play.target_player_id) {
      playerCardMap.set(play.target_player_id, play);
    }
    if (play.target_group && play.target_team_id) {
      const key = play.target_team_id;
      if (!teamGroupCardMap.has(key)) teamGroupCardMap.set(key, []);
      teamGroupCardMap.get(key)!.push(play);
    }
  }

  const loadAll = useCallback(async () => {
    if (!league.id || !token) return;
    setLoading(true);
    try {
      const [stackData, playsData, switcherooData, rostersData] = await Promise.all([
        apiGet<UserCard[]>(`/leagues/${league.id}/cards`, token),
        apiGet<LeaguePlaysResponse>(`/leagues/${league.id}/cards/league-plays`, token),
        apiGet<SwitcherooStatus>(`/leagues/${league.id}/switcheroo`, token),
        apiGet<TeamWithRoster[]>(`/leagues/${league.id}/rosters`, token)
      ]);
      setStack(stackData);
      setLeaguePlays(playsData);
      setSwitcheroo(switcherooData);
      setAllRosters(rostersData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [league.id, token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Helper: find target display name ──
  function getTargetDisplay(play: PlayedCardEntry): string {
    if (play.target_group) {
      const team = allRosters.find(t => t.id === play.target_team_id);
      return `All ${play.target_group}s — ${team?.team_name || 'Unknown'}`;
    }
    if (play.target_player_id) {
      for (const team of allRosters) {
        const entry = team.roster.find(r => r.player?.id === play.target_player_id);
        if (entry?.player) return `${entry.player.name} (${team.team_name})`;
      }
      return 'Unknown player';
    }
    return 'No target';
  }

  // ── Select a card from the hand ──
  function handleCardClick(uc: UserCard) {
    if (isLocked) {
      toast.error('Cards are locked — games have started');
      return;
    }
    if (playsRemaining <= 0) {
      toast.error('You have already played 3 cards this week');
      return;
    }
    setReassigningCard(null);
    setSelectedCard(uc);
    setIsSwitcherooMode(false);
    setTargetTeam(null);
    setShowRosterDialog(false);
  }

  // ── Switcheroo click ──
  function handleSwitcherooClick() {
    if (!switcheroo?.available || !myTeam || isLocked) return;
    setReassigningCard(null);
    setSelectedCard(null);
    setIsSwitcherooMode(true);
    setTargetTeam(myTeam);
    setShowRosterDialog(true);
  }

  // ── Pick a target team ──
  function handleTeamSelect(team: TeamWithRoster) {
    const card = reassigningCard?.card || selectedCard?.card;
    if (!card) return;

    if (card.target_scope === 'group') {
      if (reassigningCard) {
        reassignGroupCard(team);
      } else {
        playGroupCard(team);
      }
      return;
    }

    setTargetTeam(team);
    setShowRosterDialog(true);
  }

  // ── Play a group-scope card ──
  async function playGroupCard(team: TeamWithRoster) {
    if (!selectedCard || !token || submitting) return;
    const card = selectedCard.card;
    setSubmitting(true);
    try {
      await apiPost(`/leagues/${league.id}/cards/play`, {
        user_card_id: selectedCard.id,
        target_team_id: team.id,
        target_group: card.target_position
      }, token);
      toast.success(`${card.title} played on ${team.team_name}'s ${card.target_position}s!`);
      resetSelection();
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to play card');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Reassign group card to new team ──
  async function reassignGroupCard(team: TeamWithRoster) {
    if (!reassigningCard || !token || submitting) return;
    setSubmitting(true);
    try {
      await apiPut(`/leagues/${league.id}/cards/play/${reassigningCard.id}`, {
        target_team_id: team.id,
        target_group: reassigningCard.card.target_position || reassigningCard.target_group
      }, token);
      toast.success(`Card reassigned to ${team.team_name}!`);
      resetSelection();
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reassign card');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Play a player-scope card on a specific player ──
  async function handlePlayOnPlayer(rosterEntry: RosterEntry) {
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      if (isSwitcherooMode) {
        await apiPost(`/leagues/${league.id}/switcheroo`, {
          player_id: rosterEntry.player!.id
        }, token);
        toast.success(`Switcheroo activated! ${rosterEntry.player!.name} is protected.`);
      } else if (reassigningCard) {
        await apiPut(`/leagues/${league.id}/cards/play/${reassigningCard.id}`, {
          target_player_id: rosterEntry.player!.id,
          target_team_id: targetTeam?.id
        }, token);
        toast.success(`Card reassigned to ${rosterEntry.player!.name}!`);
      } else if (selectedCard) {
        await apiPost(`/leagues/${league.id}/cards/play`, {
          user_card_id: selectedCard.id,
          target_player_id: rosterEntry.player!.id,
          target_team_id: targetTeam?.id
        }, token);
        toast.success(`${selectedCard.card.title} played on ${rosterEntry.player!.name}!`);
      }
      resetSelection();
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to play card');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Unplay a card (return to stack) ──
  async function handleUnplay(play: PlayedCardEntry) {
    if (!token || submitting || isLocked) return;
    setSubmitting(true);
    try {
      await apiDelete(`/leagues/${league.id}/cards/play/${play.id}`, token);
      toast.success(`${play.card.title} returned to your stack`);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unplay card');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Start reassigning a played card ──
  function handleStartReassign(play: PlayedCardEntry) {
    if (isLocked) return;
    setSelectedCard(null);
    setIsSwitcherooMode(false);
    setReassigningCard(play);
    setTargetTeam(null);
    setShowRosterDialog(false);
  }

  // ── Eligible players ──
  function getEligiblePlayers(roster: RosterEntry[]): RosterEntry[] {
    const starters = roster.filter(r => STARTING_SLOTS.includes(r.slot) && r.player);
    if (isSwitcherooMode) return starters;

    const card = reassigningCard?.card || selectedCard?.card;
    if (!card) return starters;

    if (card.target_type === 'position' && card.target_position && card.target_position !== 'All') {
      const pos = card.target_position;
      return starters.filter(r => r.player?.position === pos);
    }
    return starters;
  }

  function resetSelection() {
    setSelectedCard(null);
    setIsSwitcherooMode(false);
    setReassigningCard(null);
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

  const activeCardOrReassign = selectedCard || reassigningCard;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Target size={22} className="text-gridiron-gold" />
          Play Your Cards
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Week {leaguePlays?.week || league.current_week} —
          {isLocked
            ? ' Cards are locked for this week.'
            : playsRemaining > 0
              ? ` ${playsRemaining} play${playsRemaining !== 1 ? 's' : ''} remaining this week.`
              : ' All 3 cards played this week.'
          }
        </p>
        {isLocked && (
          <div className="mt-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-yellow-400 text-xs flex items-center gap-1.5">
              <Lock size={12} /> Games have started — cards are locked until next week.
            </p>
          </div>
        )}
      </div>

      {/* ── ACTIVE CARDS (played this week) ── */}
      {myPlays.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-sm flex items-center gap-2">
              <CheckCircle size={14} className="text-green-400" />
              Active Cards This Week
            </h2>
            <span className="text-xs text-slate-500">{playsUsed}/{MAX_PLAYS_PER_WEEK} played</span>
          </div>

          <div className="space-y-2">
            {myPlays.map(play => {
              const isBuff = play.card.effect_type === 'buff';
              const modDisplay = play.card.modifier_type === 'percentage'
                ? `${isBuff ? '+' : '-'}${play.card.modifier_value}%`
                : `${isBuff ? '+' : '-'}${play.card.modifier_value} pts`;
              const isBeingReassigned = reassigningCard?.id === play.id;

              return (
                <div
                  key={play.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                    isBeingReassigned
                      ? 'border-gridiron-gold bg-gridiron-gold/10'
                      : 'border-slate-700 bg-slate-800/80'
                  }`}
                >
                  {/* Card info */}
                  <div className={`text-lg ${isBuff ? 'text-green-400' : 'text-red-400'}`}>
                    {isBuff ? '↑' : '↓'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium">{play.card.title}</div>
                    <div className="text-slate-400 text-xs mt-0.5">
                      <span className={isBuff ? 'text-green-400' : 'text-red-400'}>{modDisplay}</span>
                      {' → '}
                      {getTargetDisplay(play)}
                    </div>
                  </div>

                  {/* Actions (only if not locked) */}
                  {!isLocked && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => isBeingReassigned ? resetSelection() : handleStartReassign(play)}
                        disabled={submitting}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-gridiron-gold transition-colors"
                        title="Reassign target"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleUnplay(play)}
                        disabled={submitting}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                        title="Return to stack"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </div>
                  )}

                  {isLocked && (
                    <Lock size={14} className="text-slate-600 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CARD HAND (unplayed cards) ── */}
      {!isLocked && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-sm">Your Hand</h2>
            <span className="text-xs text-slate-500">{stack.length} in deck</span>
          </div>

          {stack.length === 0 && !switcheroo?.available ? (
            <p className="text-slate-500 text-sm text-center py-4">
              No cards to play.{' '}
              <button onClick={() => navigate(`/leagues/${league.id}/cards/pick`)} className="text-gridiron-gold hover:underline">
                Pick cards →
              </button>
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {/* Switcheroo card */}
              {switcheroo && (
                <button
                  onClick={handleSwitcherooClick}
                  disabled={switcheroo.used_this_week}
                  className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all min-w-[120px] ${
                    isSwitcherooMode
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
                    disabled={playsRemaining <= 0}
                    className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all min-w-[120px] ${
                      isSelected
                        ? 'border-gridiron-gold bg-gridiron-gold/10 scale-105'
                        : playsRemaining <= 0
                          ? 'border-slate-700 bg-slate-800 opacity-40 cursor-not-allowed'
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
                    <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                      uc.card.rarity === 'rare' ? 'bg-blue-400' : uc.card.rarity === 'uncommon' ? 'bg-green-400' : 'bg-slate-500'
                    }`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── LEAGUE MEMBERS TABLE ── */}
      {(activeCardOrReassign || isSwitcherooMode) && !isLocked && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold text-sm">
              {reassigningCard
                ? <>Reassign <span className="text-gridiron-gold">{reassigningCard.card.title}</span> — pick new target</>
                : selectedCard
                  ? <>Target for <span className="text-gridiron-gold">{selectedCard.card.title}</span>
                      {selectedCard.card.target_scope === 'group' && (
                        <span className="text-slate-400 text-xs ml-2">(affects all {selectedCard.card.target_position}s on chosen team)</span>
                      )}
                    </>
                  : 'League Members'
              }
            </h2>
            <button onClick={resetSelection} className="text-slate-400 hover:text-white text-xs flex items-center gap-1">
              <X size={14} /> Cancel
            </button>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl divide-y divide-slate-700">
            {allRosters.map(team => {
              const isMe = team.user?.id === user?.id;

              return (
                <button
                  key={team.id}
                  onClick={() => handleTeamSelect(team)}
                  disabled={submitting}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/50 transition-colors text-left"
                >
                  <TeamRow team={team} isMe={isMe} />
                  <ChevronRight size={16} className="text-slate-600" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ROSTER DIALOG (player-scope cards + switcheroo) ── */}
      {showRosterDialog && targetTeam && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div>
                <h3 className="text-white font-bold">
                  {isSwitcherooMode ? 'Protect a Player' : reassigningCard ? 'Reassign Target' : 'Select Target Player'}
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  {targetTeam.team_name} — {targetTeam.user?.display_name}
                  {(selectedCard || reassigningCard) && (
                    <> · <span className="text-gridiron-gold">{(reassigningCard?.card || selectedCard?.card)?.title}</span></>
                  )}
                </p>
              </div>
              <button onClick={() => setShowRosterDialog(false)} className="text-slate-400 hover:text-white p-1">
                <X size={18} />
              </button>
            </div>

            {/* Eligible player hint */}
            {(() => {
              const card = reassigningCard?.card || selectedCard?.card;
              return card?.target_position && card.target_position !== 'All' && (
                <div className="mx-4 mt-3 px-3 py-2 bg-gridiron-gold/10 border border-gridiron-gold/20 rounded-lg">
                  <p className="text-gridiron-gold text-xs">
                    This card targets <strong>{card.target_position}</strong> players — only eligible players are selectable.
                  </p>
                </div>
              );
            })()}

            {/* Roster list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {(() => {
                const starters = targetTeam.roster.filter(r => STARTING_SLOTS.includes(r.slot) && r.player);
                const eligible = getEligiblePlayers(targetTeam.roster);
                const eligibleIds = new Set(eligible.map(e => e.id));
                const restrictedId = switcheroo?.restricted_player_id;

                return starters.map(entry => {
                  const isEligible = eligibleIds.has(entry.id);
                  const isRestricted = isSwitcherooMode && entry.player?.id === restrictedId;
                  const canSelect = isEligible && !isRestricted;

                  return (
                    <button
                      key={entry.id}
                      onClick={() => canSelect && handlePlayOnPlayer(entry)}
                      disabled={!canSelect || submitting}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                        canSelect
                          ? 'hover:bg-gridiron-gold/10 hover:border-gridiron-gold/30 cursor-pointer border border-transparent'
                          : 'opacity-35 cursor-not-allowed border border-transparent'
                      }`}
                    >
                      {entry.player?.headshot_url ? (
                        <img src={entry.player.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-700" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                          {entry.player?.position}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium truncate">
                          {entry.player?.name || 'Empty'}
                        </div>
                        <div className="text-slate-500 text-xs">
                          {entry.player?.position} · {entry.player?.nfl_team}
                          <span className="text-slate-600 ml-2">{entry.slot}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {isRestricted ? (
                          <span className="text-xs text-yellow-400">Used last week</span>
                        ) : canSelect ? (
                          <ChevronRight size={14} className="text-slate-600" />
                        ) : (
                          <Lock size={14} className="text-slate-700" />
                        )}
                      </div>
                    </button>
                  );
                });
              })()}
            </div>

            <div className="p-3 border-t border-slate-700 text-center">
              <button onClick={() => setShowRosterDialog(false)} className="text-slate-400 text-sm hover:text-white transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable team row ──
function TeamRow({ team, isMe }: { team: TeamWithRoster; isMe: boolean }) {
  return (
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
  );
}

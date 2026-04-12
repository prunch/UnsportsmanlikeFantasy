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
  user_id: string;
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

const STARTING_SLOTS = ['QB', 'RB', 'RB2', 'WR', 'WR2', 'WR3', 'TE', 'FLEX', 'K', 'DEF'];
const MAX_PLAYS_PER_WEEK = 3;

export default function CardPlayPage({ league }: { league: League }) {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();

  // Data
  const [stack, setStack] = useState<UserCard[]>([]);
  const [playedData, setPlayedData] = useState<PlayedCardsResponse | null>(null);
  const [switcheroo, setSwitcheroo] = useState<SwitcherooStatus | null>(null);
  const [allRosters, setAllRosters] = useState<TeamWithRoster[]>([]);
  const [loading, setLoading] = useState(true);

  // Flow state
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null);
  const [isSwitcherooMode, setIsSwitcherooMode] = useState(false);
  const [targetTeam, setTargetTeam] = useState<TeamWithRoster | null>(null);
  const [showRosterDialog, setShowRosterDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Derived
  const myPlays = (playedData?.plays || []).filter(p => p.user_id === user?.id);
  const playsUsed = myPlays.length;
  const playsRemaining = MAX_PLAYS_PER_WEEK - playsUsed;
  const myTeam = allRosters.find(t => t.user?.id === user?.id);

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

  // ── Select a card from the hand ──
  function handleCardClick(uc: UserCard) {
    if (playsRemaining <= 0) {
      toast.error('You have already played 3 cards this week');
      return;
    }
    setSelectedCard(uc);
    setIsSwitcherooMode(false);
    setTargetTeam(null);
    setShowRosterDialog(false);
  }

  // ── Switcheroo click: jump straight to own roster ──
  function handleSwitcherooClick() {
    if (!switcheroo?.available || !myTeam) return;
    setSelectedCard(null);
    setIsSwitcherooMode(true);
    setTargetTeam(myTeam);
    setShowRosterDialog(true);
  }

  // ── Pick a target team ──
  function handleTeamSelect(team: TeamWithRoster) {
    if (!selectedCard) return;
    const card = selectedCard.card;

    // Group-scope card → play immediately on this team, no roster drill-down
    if (card.target_scope === 'group') {
      playGroupCard(team);
      return;
    }

    // Player-scope card → open roster to pick a specific player
    setTargetTeam(team);
    setShowRosterDialog(true);
  }

  // ── Play a group-scope card directly on a team ──
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

  // ── Get eligible starters from a roster based on the selected card ──
  function getEligiblePlayers(roster: RosterEntry[]): RosterEntry[] {
    const starters = roster.filter(r => STARTING_SLOTS.includes(r.slot) && r.player);

    if (isSwitcherooMode) return starters; // any starter can be protected

    if (!selectedCard) return starters;
    const card = selectedCard.card;

    // Player-scope card with a target_position filter
    if (card.target_type === 'position' && card.target_position && card.target_position !== 'All') {
      const pos = card.target_position;
      return starters.filter(r => r.player?.position === pos);
    }

    // target_type = 'player' or 'all': any starter is eligible
    return starters;
  }

  function resetSelection() {
    setSelectedCard(null);
    setIsSwitcherooMode(false);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Target size={22} className="text-gridiron-gold" />
          Play Your Cards
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Week {playedData?.week || league.current_week} —
          {playsRemaining > 0
            ? ` ${playsRemaining} play${playsRemaining !== 1 ? 's' : ''} remaining this week.`
            : ' All 3 cards played this week.'
          }
        </p>
      </div>

      {/* ── CARD HAND ── */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-sm">Your Hand</h2>
          <span className="text-xs text-slate-500">
            {playsUsed}/{MAX_PLAYS_PER_WEEK} played · {stack.length} in deck
          </span>
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

        {/* Cards played this week */}
        {myPlays.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-700">
            <p className="text-xs text-slate-500 mb-2">Played this week:</p>
            <div className="flex flex-wrap gap-2">
              {myPlays.map(p => (
                <span key={p.id} className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full flex items-center gap-1">
                  <CheckCircle size={10} className="text-green-400" />
                  {p.card.title}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── LEAGUE MEMBERS TABLE ── */}
      {/* Show when a card is selected (for targeting) or as passive list when nothing selected */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-sm">
            {selectedCard
              ? <>Target for <span className="text-gridiron-gold">{selectedCard.card.title}</span>
                  {selectedCard.card.target_scope === 'group' && (
                    <span className="text-slate-400 text-xs ml-2">(affects all {selectedCard.card.target_position}s on chosen team)</span>
                  )}
                </>
              : 'League Members'
            }
          </h2>
          {selectedCard && (
            <button onClick={resetSelection} className="text-slate-400 hover:text-white text-xs flex items-center gap-1">
              <X size={14} /> Cancel
            </button>
          )}
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl divide-y divide-slate-700">
          {allRosters.map(team => {
            const isMe = team.user?.id === user?.id;
            const isClickable = !!selectedCard;

            return isClickable ? (
              <button
                key={team.id}
                onClick={() => handleTeamSelect(team)}
                disabled={submitting}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/50 transition-colors text-left"
              >
                <TeamRow team={team} isMe={isMe} />
                <ChevronRight size={16} className="text-slate-600" />
              </button>
            ) : (
              <div key={team.id} className="flex items-center justify-between px-4 py-3">
                <TeamRow team={team} isMe={isMe} />
                <span className="text-slate-700 text-xs">Select a card first</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── ROSTER DIALOG (player-scope cards + switcheroo) ── */}
      {showRosterDialog && targetTeam && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div>
                <h3 className="text-white font-bold">
                  {isSwitcherooMode ? 'Protect a Player' : 'Select Target Player'}
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  {targetTeam.team_name} — {targetTeam.user?.display_name}
                  {selectedCard && (
                    <> · <span className="text-gridiron-gold">{selectedCard.card.title}</span></>
                  )}
                </p>
              </div>
              <button onClick={() => setShowRosterDialog(false)} className="text-slate-400 hover:text-white p-1">
                <X size={18} />
              </button>
            </div>

            {/* Eligible player hint */}
            {selectedCard?.card.target_position && selectedCard.card.target_position !== 'All' && (
              <div className="mx-4 mt-3 px-3 py-2 bg-gridiron-gold/10 border border-gridiron-gold/20 rounded-lg">
                <p className="text-gridiron-gold text-xs">
                  This card targets <strong>{selectedCard.card.target_position}</strong> players — only eligible players are selectable.
                </p>
              </div>
            )}

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

            {/* Footer */}
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

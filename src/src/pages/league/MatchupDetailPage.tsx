import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Trophy, Zap, Shield } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet } from '../../utils/api';
import { League } from '../LeaguePage';
import { CardData } from '../../components/cards/Card';

interface PlayerRef {
  id: string;
  name: string;
  position: string;
  nfl_team: string | null;
  status: string | null;
  headshot_url: string | null;
}

interface ProjectionRef {
  season: number;
  proj_fantasy_pts_ppr: number | null;
  proj_ppg_ppr: number | null;
  bye_week: number | null;
}

interface Starter {
  roster_id: string;
  slot: string;
  player: PlayerRef | null;
  projection: ProjectionRef | null;
}

interface Lineup {
  starters: Starter[];
  projected_total: number;
}

interface TeamInfo {
  id: string;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  points_for?: number;
  user: { id: string; display_name: string; avatar_url?: string };
}

interface MatchupDetailResponse {
  week: number;
  season: number;
  league_status: string;
  matchup: {
    id: string;
    week: number;
    home_score: number;
    away_score: number;
    is_final: boolean;
    is_playoff: boolean;
    winner_team_id: string | null;
    home_team: TeamInfo;
    away_team: TeamInfo;
  };
  home_lineup: Lineup | null;
  away_lineup: Lineup | null;
}

interface PlayedCardEntry {
  id: string;
  user_id: string;
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

// Canonical slot ordering for side-by-side display
const SLOT_ORDER = ['QB', 'RB', 'RB2', 'WR', 'WR2', 'WR3', 'TE', 'FLEX', 'K', 'DEF'];
const SLOT_LABEL: Record<string, string> = {
  QB: 'QB',
  RB: 'RB',
  RB2: 'RB',
  WR: 'WR',
  WR2: 'WR',
  WR3: 'WR',
  TE: 'TE',
  FLEX: 'FLEX',
  K: 'K',
  DEF: 'DEF',
};

export default function MatchupDetailPage({ league }: { league: League }) {
  const { matchupId } = useParams<{ matchupId: string }>();
  const { token, user } = useAuthStore();
  const [data, setData] = useState<MatchupDetailResponse | null>(null);
  const [cardPlays, setCardPlays] = useState<LeaguePlaysResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !matchupId) return;
    try {
      const [matchupRes, playsRes] = await Promise.all([
        apiGet<MatchupDetailResponse>(
          `/leagues/${league.id}/matchups/${matchupId}`,
          token
        ),
        apiGet<LeaguePlaysResponse>(
          `/leagues/${league.id}/cards/league-plays`,
          token
        )
      ]);
      setData(matchupRes);
      setCardPlays(playsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matchup');
    } finally {
      setLoading(false);
    }
  }, [league.id, token, matchupId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gridiron-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">{error || 'Matchup not found'}</p>
        <Link
          to={`/leagues/${league.id}/matchups`}
          className="text-gridiron-gold text-sm mt-4 inline-block"
        >
          ← Back to matchups
        </Link>
      </div>
    );
  }

  const { matchup, home_lineup, away_lineup } = data;
  const homeTeam = matchup.home_team;
  const awayTeam = matchup.away_team;

  const isMyMatchup =
    homeTeam?.user?.id === user?.id || awayTeam?.user?.id === user?.id;

  // Build card maps for display
  // Combine own plays (always visible) + opponent plays (visible after lock)
  const allVisiblePlays = [
    ...(cardPlays?.my_plays || []),
    ...(cardPlays?.opponent_plays || [])
  ];
  const isLocked = cardPlays?.locked ?? false;

  // Player → card(s) map
  const playerCardMap = new Map<string, PlayedCardEntry[]>();
  // Team → group card(s) map
  const teamGroupCardMap = new Map<string, PlayedCardEntry[]>();

  for (const play of allVisiblePlays) {
    if (play.target_player_id) {
      if (!playerCardMap.has(play.target_player_id)) playerCardMap.set(play.target_player_id, []);
      playerCardMap.get(play.target_player_id)!.push(play);
    }
    if (play.target_group && play.target_team_id) {
      const key = play.target_team_id;
      if (!teamGroupCardMap.has(key)) teamGroupCardMap.set(key, []);
      teamGroupCardMap.get(key)!.push(play);
    }
  }

  // Cards relevant to this matchup
  const matchupTeamIds = new Set([homeTeam?.id, awayTeam?.id].filter(Boolean));
  const matchupPlays = allVisiblePlays.filter(p => {
    if (p.target_team_id && matchupTeamIds.has(p.target_team_id)) return true;
    // Check if target player is on either roster
    if (p.target_player_id) {
      const allStarters = [
        ...(home_lineup?.starters || []),
        ...(away_lineup?.starters || [])
      ];
      return allStarters.some(s => s.player?.id === p.target_player_id);
    }
    return false;
  });

  // Align starters side-by-side by SLOT_ORDER
  const homeByIdx = new Map<number, Starter>();
  const awayByIdx = new Map<number, Starter>();
  (home_lineup?.starters || []).forEach((s) => {
    const idx = SLOT_ORDER.indexOf(s.slot);
    if (idx >= 0) homeByIdx.set(idx, s);
  });
  (away_lineup?.starters || []).forEach((s) => {
    const idx = SLOT_ORDER.indexOf(s.slot);
    if (idx >= 0) awayByIdx.set(idx, s);
  });

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <Link
        to={`/leagues/${league.id}/matchups`}
        className="inline-flex items-center gap-1 text-slate-400 hover:text-gridiron-gold text-sm transition-colors"
      >
        <ChevronLeft size={16} /> Back to matchups
      </Link>

      {/* Header: team vs team totals */}
      <div
        className={`card ${
          isMyMatchup ? 'border-gridiron-gold/40 bg-gridiron-gold/5' : ''
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-slate-400 text-xs uppercase tracking-wide">
            Week {matchup.week}
          </div>
          <div className="flex items-center gap-2">
            {matchup.is_playoff && (
              <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/30">
                Playoffs
              </span>
            )}
            {isMyMatchup && (
              <span className="text-xs bg-gridiron-gold/20 text-gridiron-gold px-2 py-0.5 rounded-full border border-gridiron-gold/30">
                Your Matchup
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 items-center gap-4">
          <TeamHeader team={homeTeam} align="right" />
          <div className="text-center">
            <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">
              {matchup.is_final ? 'Final' : 'Projected'}
            </div>
            <div className="flex items-center justify-center gap-3">
              <span
                className={`text-3xl font-bold tabular-nums ${
                  matchup.is_final && matchup.winner_team_id === homeTeam?.id
                    ? 'text-gridiron-gold'
                    : matchup.is_final
                    ? 'text-slate-500'
                    : 'text-white'
                }`}
              >
                {Number(
                  matchup.is_final ? matchup.home_score : home_lineup?.projected_total || 0
                ).toFixed(1)}
              </span>
              <span className="text-slate-600 text-sm">—</span>
              <span
                className={`text-3xl font-bold tabular-nums ${
                  matchup.is_final && matchup.winner_team_id === awayTeam?.id
                    ? 'text-gridiron-gold'
                    : matchup.is_final
                    ? 'text-slate-500'
                    : 'text-white'
                }`}
              >
                {Number(
                  matchup.is_final ? matchup.away_score : away_lineup?.projected_total || 0
                ).toFixed(1)}
              </span>
            </div>
          </div>
          <TeamHeader team={awayTeam} align="left" />
        </div>

        {matchup.is_final && matchup.winner_team_id && (
          <div className="mt-4 text-center">
            <span className="text-xs text-gridiron-gold flex items-center justify-center gap-1">
              <Trophy size={12} />
              {matchup.winner_team_id === homeTeam?.id
                ? homeTeam?.team_name
                : awayTeam?.team_name}{' '}
              wins
            </span>
          </div>
        )}
      </div>

      {/* ── ACTIVE CARDS ON THIS MATCHUP ── */}
      {matchupPlays.length > 0 && (
        <div className="card">
          <h2 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
            <Zap size={14} className="text-gridiron-gold" />
            Active Cards
            {!isLocked && (
              <span className="text-slate-500 text-xs font-normal ml-1">(opponent cards hidden until kickoff)</span>
            )}
          </h2>
          <div className="space-y-2">
            {matchupPlays.map(play => {
              const isBuff = play.card.effect_type === 'buff';
              const isOwn = play.user_id === user?.id;
              const modDisplay = play.card.modifier_type === 'percentage'
                ? `${isBuff ? '+' : '-'}${play.card.modifier_value}%`
                : `${isBuff ? '+' : '-'}${play.card.modifier_value} pts`;

              let targetLabel = '';
              if (play.target_group) {
                const team = play.target_team_id === homeTeam?.id ? homeTeam : awayTeam;
                targetLabel = `All ${play.target_group}s — ${team?.team_name}`;
              } else if (play.target_player_id) {
                const allStarters = [
                  ...(home_lineup?.starters || []),
                  ...(away_lineup?.starters || [])
                ];
                const starter = allStarters.find(s => s.player?.id === play.target_player_id);
                targetLabel = starter?.player?.name || 'Unknown player';
              }

              return (
                <div key={play.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700">
                  <div className={`text-sm ${isBuff ? 'text-green-400' : 'text-red-400'}`}>
                    {isBuff ? '↑' : '↓'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-medium">
                      {play.card.title}
                      <span className={`ml-2 font-mono text-[10px] ${isBuff ? 'text-green-400' : 'text-red-400'}`}>{modDisplay}</span>
                    </div>
                    <div className="text-slate-500 text-[10px]">
                      {targetLabel}
                      {isOwn && <span className="text-gridiron-gold ml-1">(yours)</span>}
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    play.card.rarity === 'rare' ? 'bg-blue-400' : play.card.rarity === 'uncommon' ? 'bg-green-400' : 'bg-slate-500'
                  }`} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lineups side-by-side */}
      <div className="card">
        <h2 className="text-white font-bold text-lg mb-3">Starting Lineups</h2>
        <div className="divide-y divide-slate-800">
          {SLOT_ORDER.map((slot, idx) => {
            const homeStart = homeByIdx.get(idx);
            const awayStart = awayByIdx.get(idx);
            return (
              <div
                key={slot}
                className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2"
              >
                <LineupCell
                  starter={homeStart}
                  align="right"
                  playerCards={homeStart?.player ? playerCardMap.get(homeStart.player.id) : undefined}
                  groupCards={homeTeam ? teamGroupCardMap.get(homeTeam.id) : undefined}
                />
                <div className="text-slate-500 text-xs uppercase tracking-wider font-semibold text-center w-12">
                  {SLOT_LABEL[slot] || slot}
                </div>
                <LineupCell
                  starter={awayStart}
                  align="left"
                  playerCards={awayStart?.player ? playerCardMap.get(awayStart.player.id) : undefined}
                  groupCards={awayTeam ? teamGroupCardMap.get(awayTeam.id) : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeamHeader({ team, align }: { team: TeamInfo; align: 'left' | 'right' }) {
  return (
    <div
      className={`flex items-center gap-3 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      {team?.user?.avatar_url ? (
        <img src={team.user.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-brand-800 flex items-center justify-center text-lg font-bold text-white shrink-0">
          {team?.user?.display_name?.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-white font-bold text-base truncate">
          {team?.team_name || 'TBD'}
        </div>
        <div className="text-slate-400 text-xs truncate">
          {team?.user?.display_name}
        </div>
        <div className="text-slate-500 text-xs">
          {team?.wins}–{team?.losses}
          {team?.ties > 0 ? `–${team.ties}` : ''}
        </div>
      </div>
    </div>
  );
}

function LineupCell({
  starter,
  align,
  playerCards,
  groupCards
}: {
  starter: Starter | undefined;
  align: 'left' | 'right';
  playerCards?: PlayedCardEntry[];
  groupCards?: PlayedCardEntry[];
}) {
  if (!starter || !starter.player) {
    return (
      <div className={`text-slate-600 text-sm ${align === 'right' ? 'text-right' : ''}`}>
        —
      </div>
    );
  }
  const p = starter.player;
  const proj = starter.projection?.proj_ppg_ppr ?? null;
  const bye = starter.projection?.bye_week ?? null;

  // Collect cards affecting this player:
  // 1. Direct player-targeted cards
  // 2. Group cards that match this player's position
  const relevantCards: PlayedCardEntry[] = [...(playerCards || [])];
  if (groupCards) {
    for (const gc of groupCards) {
      if (gc.target_group === p.position) {
        relevantCards.push(gc);
      }
    }
  }

  return (
    <div
      className={`flex items-center gap-2 min-w-0 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-white text-sm font-medium truncate flex items-center gap-1"
          style={align === 'right' ? { justifyContent: 'flex-end' } : {}}
        >
          {align === 'left' && relevantCards.length > 0 && (
            <CardBadges cards={relevantCards} />
          )}
          <span className="truncate">{p.name}</span>
          {align === 'right' && relevantCards.length > 0 && (
            <CardBadges cards={relevantCards} />
          )}
        </div>
        <div className="text-slate-500 text-xs truncate">
          {p.position} &middot; {p.nfl_team || 'FA'}
          {bye ? ` · Bye ${bye}` : ''}
        </div>
      </div>
      <div className="text-right shrink-0 w-14">
        <div className="text-white text-sm font-semibold tabular-nums">
          {proj != null ? Number(proj).toFixed(1) : '—'}
        </div>
        <div className="text-slate-600 text-[10px] uppercase tracking-wide">proj</div>
      </div>
    </div>
  );
}

/** Small card badge icons shown next to a player's name */
function CardBadges({ cards }: { cards: PlayedCardEntry[] }) {
  return (
    <span className="flex items-center gap-0.5 shrink-0">
      {cards.map(card => {
        const isBuff = card.card.effect_type === 'buff';
        return (
          <span
            key={card.id}
            className={`inline-flex items-center justify-center w-4 h-4 rounded text-[8px] font-bold ${
              isBuff
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
            title={`${card.card.title} (${isBuff ? '+' : '-'}${card.card.modifier_value}${card.card.modifier_type === 'percentage' ? '%' : 'pts'})`}
          >
            {isBuff ? '↑' : '↓'}
          </span>
        );
      })}
    </span>
  );
}

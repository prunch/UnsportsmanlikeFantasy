import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Swords, Trophy, Zap, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet } from '../../utils/api';
import { League } from '../LeaguePage';
import UserLink from '../../components/UserLink';
import { CardData } from '../../components/cards/Card';

interface TeamInfo {
  id: string;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  user: { id: string; display_name: string; avatar_url?: string };
}

interface MatchupRow {
  id: string;
  week: number;
  home_score: number;
  away_score: number;
  home_projected_total: number;
  away_projected_total: number;
  is_final: boolean;
  is_playoff: boolean;
  winner_team_id: string | null;
  home_team: TeamInfo;
  away_team: TeamInfo;
}

interface MatchupsResponse {
  week: number;
  season: number;
  league_status: string;
  matchups: MatchupRow[];
}

interface PlayedCardEntry {
  id: string;
  user_id: string;
  play_slot: string;
  card: CardData;
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

export default function MatchupsPage({ league }: { league: League }) {
  const { token, user } = useAuthStore();
  const [data, setData] = useState<MatchupsResponse | null>(null);
  const [cardPlays, setCardPlays] = useState<LeaguePlaysResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [matchupRes, playsRes] = await Promise.all([
        apiGet<MatchupsResponse>(
          `/leagues/${league.id}/matchups/current`,
          token
        ),
        apiGet<LeaguePlaysResponse>(
          `/leagues/${league.id}/cards/league-plays`,
          token
        ).catch(() => null)
      ]);
      setData(matchupRes);
      if (playsRes) setCardPlays(playsRes);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [league.id, token]);

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

  const matchups = data?.matchups || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Swords size={22} className="text-gridiron-gold" />
          This Week's Matchups
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Week {data?.week} — click a matchup to see both lineups and play your cards.
        </p>
      </div>

      {matchups.length === 0 ? (
        <div className="card text-center py-12">
          <Trophy size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400">No matchups scheduled this week.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {matchups.map((m) => {
            const isMyMatchup =
              m.home_team?.user?.id === user?.id || m.away_team?.user?.id === user?.id;

            // Count cards targeting each team in this matchup
            const allVisiblePlays = [
              ...(cardPlays?.my_plays || []),
              ...(cardPlays?.opponent_plays || [])
            ];
            const homeCardCount = allVisiblePlays.filter(p => p.target_team_id === m.home_team?.id).length;
            const awayCardCount = allVisiblePlays.filter(p => p.target_team_id === m.away_team?.id).length;
            const totalCards = homeCardCount + awayCardCount;

            return (
              <Link
                key={m.id}
                to={`/leagues/${league.id}/matchups/${m.id}`}
                className={`card hover:border-gridiron-gold/60 transition-colors group ${
                  isMyMatchup ? 'border-gridiron-gold/40 bg-gridiron-gold/5' : ''
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {m.is_playoff && (
                      <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full border border-purple-500/30">
                        Playoffs
                      </span>
                    )}
                    {isMyMatchup && (
                      <span className="text-xs bg-gridiron-gold/20 text-gridiron-gold px-2 py-0.5 rounded-full border border-gridiron-gold/30">
                        Your Matchup
                      </span>
                    )}
                    {totalCards > 0 && (
                      <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/25 flex items-center gap-1">
                        <Zap size={10} /> {totalCards} card{totalCards !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {m.is_final ? (
                      <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">
                        Final
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Zap size={10} /> Projected
                      </span>
                    )}
                    <ChevronRight
                      size={16}
                      className="text-slate-600 group-hover:text-gridiron-gold transition-colors"
                    />
                  </div>
                </div>

                {/* Teams row */}
                <div className="space-y-2">
                  <TeamRow
                    team={m.home_team}
                    score={m.is_final ? m.home_score : m.home_projected_total}
                    isFinal={m.is_final}
                    isWinner={m.is_final && m.winner_team_id === m.home_team?.id}
                    isLoser={!!(m.is_final && m.winner_team_id && m.winner_team_id !== m.home_team?.id)}
                    cardCount={homeCardCount}
                  />
                  <div className="text-slate-600 text-xs text-center">vs</div>
                  <TeamRow
                    team={m.away_team}
                    score={m.is_final ? m.away_score : m.away_projected_total}
                    isFinal={m.is_final}
                    isWinner={m.is_final && m.winner_team_id === m.away_team?.id}
                    isLoser={!!(m.is_final && m.winner_team_id && m.winner_team_id !== m.away_team?.id)}
                    cardCount={awayCardCount}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamRow({
  team,
  score,
  isFinal,
  isWinner,
  isLoser,
  cardCount = 0,
}: {
  team: TeamInfo;
  score: number;
  isFinal: boolean;
  isWinner: boolean;
  isLoser: boolean;
  cardCount?: number;
}) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-lg ${
        isWinner ? 'bg-gridiron-gold/10' : isLoser ? 'opacity-60' : 'bg-slate-800/50'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {team?.user?.avatar_url ? (
          <img src={team.user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-brand-800 flex items-center justify-center text-sm font-bold text-white shrink-0">
            {team?.user?.display_name?.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-white font-semibold text-sm truncate">
            {team?.team_name || 'TBD'}
          </div>
          <div className="text-slate-500 text-xs truncate">
            {team?.user ? (
              <UserLink userId={team.user.id} displayName={team.user.display_name} className="text-slate-500 text-xs" />
            ) : null}
            {' '}&middot; {team?.wins}–{team?.losses}
            {team?.ties > 0 ? `–${team.ties}` : ''}
          </div>
        </div>
      </div>
      <div className="text-right shrink-0 ml-3 flex items-center gap-2">
        {cardCount > 0 && (
          <span className="flex items-center gap-0.5 text-amber-400" title={`${cardCount} card${cardCount !== 1 ? 's' : ''} active`}>
            <Zap size={10} />
            <span className="text-[10px] font-bold">{cardCount}</span>
          </span>
        )}
        <div>
          <div className="text-white font-bold text-xl tabular-nums">
            {Number(score || 0).toFixed(1)}
          </div>
          <div className="text-slate-500 text-[10px] uppercase tracking-wide">
            {isFinal ? 'Final' : 'Proj'}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { Trophy, Zap, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet } from '../../utils/api';
import { League } from '../LeaguePage';
import UserLink from '../../components/UserLink';

interface Team {
  id: string;
  team_name: string;
  user: { id: string; display_name: string; avatar_url?: string };
}

interface Matchup {
  id: string;
  week: number;
  home_score: number;
  away_score: number;
  live_home_score: number;
  live_away_score: number;
  is_final: boolean;
  is_live: boolean;
  is_playoff: boolean;
  winner_team_id: string | null;
  home_team: Team | Team[];
  away_team: Team | Team[];
}

interface ScoreboardData {
  week: number;
  season: number;
  leagueStatus: string;
  matchups: Matchup[];
}

interface Standing {
  id: string;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  user: { id: string; display_name: string; avatar_url?: string };
}

export default function ScoreboardPage({ league }: { league: League }) {
  const { token, user } = useAuthStore();
  const [scoreboard, setScoreboard] = useState<ScoreboardData | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'scoreboard' | 'standings'>('scoreboard');
  const [selectedWeek, setSelectedWeek] = useState(league.current_week || 1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadScoreboard = useCallback(async (week?: number) => {
    if (!token) return;
    try {
      const w = week ?? selectedWeek;
      const data = await apiGet<ScoreboardData>(
        `/leagues/${league.id}/scoreboard?week=${w}`,
        token
      );
      setScoreboard(data);
      setLastUpdated(new Date());
    } catch {
      // silent on refresh
    } finally {
      setLoading(false);
    }
  }, [league.id, token, selectedWeek]);

  const loadStandings = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiGet<Standing[]>(`/leagues/${league.id}/scoreboard/standings`, token);
      setStandings(data);
    } catch {
      // silent
    }
  }, [league.id, token]);

  useEffect(() => {
    loadScoreboard();
    loadStandings();
    // Live refresh every 60s during active games
    const interval = setInterval(() => {
      if (league.status === 'active') loadScoreboard();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadScoreboard, loadStandings, league.status]);

  function getTeam(t: Team | Team[]): Team | null {
    return Array.isArray(t) ? (t[0] || null) : t;
  }

  function navigateWeek(dir: -1 | 1) {
    const maxWeek = league.status === 'playoffs' ? 17 : 14;
    const newWeek = Math.max(1, Math.min(maxWeek, selectedWeek + dir));
    setSelectedWeek(newWeek);
    loadScoreboard(newWeek);
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
      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-slate-700 pb-0">
        {(['scoreboard', 'standings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors capitalize ${
              activeTab === tab
                ? 'border-gridiron-gold text-gridiron-gold'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {tab === 'scoreboard' ? '🏈 Scoreboard' : '📊 Standings'}
          </button>
        ))}
      </div>

      {activeTab === 'scoreboard' && (
        <>
          {/* Week Nav */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigateWeek(-1)}
                disabled={selectedWeek <= 1}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <h2 className="text-white font-bold text-lg">
                Week {selectedWeek}
                {selectedWeek === league.current_week && (
                  <span className="ml-2 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Current</span>
                )}
              </h2>
              <button
                onClick={() => navigateWeek(1)}
                disabled={selectedWeek >= (league.status === 'playoffs' ? 17 : 14)}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-xs text-slate-500">
                  Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                onClick={() => loadScoreboard()}
                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                title="Refresh scores"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {/* Matchups */}
          {!scoreboard?.matchups?.length ? (
            <div className="card text-center py-12">
              <Trophy size={40} className="mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400">No matchups scheduled for Week {selectedWeek} yet.</p>
              <p className="text-slate-500 text-sm mt-1">Check back when the season is active.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {scoreboard.matchups.map((matchup) => {
                const homeTeam = getTeam(matchup.home_team);
                const awayTeam = getTeam(matchup.away_team);
                const homeScore = matchup.live_home_score ?? matchup.home_score ?? 0;
                const awayScore = matchup.live_away_score ?? matchup.away_score ?? 0;
                const isMyMatchup = homeTeam?.user?.id === user?.id || awayTeam?.user?.id === user?.id;

                return (
                  <div
                    key={matchup.id}
                    className={`card ${isMyMatchup ? 'border-gridiron-gold/40 bg-gridiron-gold/5' : ''}`}
                  >
                    {/* Status badge */}
                    <div className="flex items-center justify-between mb-4">
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
                      <div>
                        {matchup.is_final ? (
                          <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">Final</span>
                        ) : matchup.is_live ? (
                          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full border border-green-500/30 flex items-center gap-1">
                            <Zap size={10} className="animate-pulse" />
                            Live
                          </span>
                        ) : (
                          <span className="text-xs bg-slate-700/50 text-slate-500 px-2 py-0.5 rounded-full">Upcoming</span>
                        )}
                      </div>
                    </div>

                    {/* Teams + Scores */}
                    <div className="flex items-center gap-4">
                      {/* Home Team */}
                      <div className={`flex-1 text-right ${
                        matchup.is_final && matchup.winner_team_id === homeTeam?.id ? 'opacity-100' : ''
                      }`}>
                        <div className="flex items-center justify-end gap-3">
                          <div>
                            <div className="text-white font-semibold text-sm">
                              {homeTeam?.team_name || 'TBD'}
                            </div>
                            <div className="text-slate-500 text-xs">
                              {homeTeam?.user ? (
                                <UserLink userId={homeTeam.user.id} displayName={homeTeam.user.display_name} className="text-slate-500 text-xs" />
                              ) : null}
                            </div>
                          </div>
                          {homeTeam?.user?.avatar_url ? (
                            <img src={homeTeam.user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-brand-800 flex items-center justify-center text-sm font-bold text-white">
                              {homeTeam?.user?.display_name?.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Scores */}
                      <div className="flex items-center gap-3 px-4">
                        <span className={`text-2xl font-bold tabular-nums ${
                          matchup.is_final
                            ? matchup.winner_team_id === homeTeam?.id
                              ? 'text-white'
                              : 'text-slate-500'
                            : 'text-white'
                        }`}>
                          {Number(homeScore).toFixed(1)}
                        </span>
                        <span className="text-slate-600 text-sm">vs</span>
                        <span className={`text-2xl font-bold tabular-nums ${
                          matchup.is_final
                            ? matchup.winner_team_id === awayTeam?.id
                              ? 'text-white'
                              : 'text-slate-500'
                            : 'text-white'
                        }`}>
                          {Number(awayScore).toFixed(1)}
                        </span>
                      </div>

                      {/* Away Team */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          {awayTeam?.user?.avatar_url ? (
                            <img src={awayTeam.user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-brand-800 flex items-center justify-center text-sm font-bold text-white">
                              {awayTeam?.user?.display_name?.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="text-white font-semibold text-sm">
                              {awayTeam?.team_name || 'TBD'}
                            </div>
                            <div className="text-slate-500 text-xs">
                              {awayTeam?.user ? (
                                <UserLink userId={awayTeam.user.id} displayName={awayTeam.user.display_name} className="text-slate-500 text-xs" />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Winner badge */}
                    {matchup.is_final && matchup.winner_team_id && (
                      <div className="mt-3 text-center">
                        <span className="text-xs text-gridiron-gold">
                          🏆 {
                            matchup.winner_team_id === homeTeam?.id
                              ? homeTeam?.team_name
                              : awayTeam?.team_name
                          } wins
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'standings' && (
        <div className="card">
          <h2 className="text-white font-bold text-xl mb-4">Season Standings</h2>
          {standings.length === 0 ? (
            <p className="text-slate-400 text-sm">No standings yet.</p>
          ) : (
            <div className="divide-y divide-slate-700">
              {standings.map((team, i) => (
                <div
                  key={team.id}
                  className={`py-3 flex items-center gap-4 ${team.user?.id === user?.id ? 'bg-gridiron-gold/5 -mx-4 px-4 rounded-lg' : ''}`}
                >
                  <div className="w-6 text-slate-500 text-sm font-medium text-center">
                    {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                  </div>
                  {team.user?.avatar_url ? (
                    <img src={team.user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-brand-800 flex items-center justify-center text-sm font-bold text-white">
                      {team.user?.display_name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="text-white font-medium text-sm">
                      {team.team_name}
                      {team.user?.id === user?.id && (
                        <span className="ml-2 text-xs text-gridiron-gold">You</span>
                      )}
                    </div>
                    <div className="text-slate-400 text-xs">
                      {team.user ? (
                        <UserLink userId={team.user.id} displayName={team.user.display_name} className="text-slate-400 text-xs" />
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-semibold text-sm">
                      {team.wins}–{team.losses}{team.ties > 0 ? `–${team.ties}` : ''}
                    </div>
                    <div className="text-slate-500 text-xs">
                      {Number(team.points_for).toFixed(1)} PF
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

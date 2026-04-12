import { useParams, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { apiGet, apiPost } from '../utils/api';
import toast from 'react-hot-toast';
import { Users, ClipboardList, Zap, TrendingUp, Copy, Layers, Trophy, Shield, ListOrdered, Swords } from 'lucide-react';
import RosterPage from './league/RosterPage';
import DraftRoomPage from './league/DraftRoomPage';
import WaiverWirePage from './league/WaiverWirePage';
import PlayersPage from './league/PlayersPage';
import CardDeckPage from './CardDeckPage';
import CardPickPage from './CardPickPage';
import ChatPage from './league/ChatPage';
import ScoreboardPage from './league/ScoreboardPage';
import MatchupsPage from './league/MatchupsPage';
import MatchupDetailPage from './league/MatchupDetailPage';
import CardPlayPage from './league/CardPlayPage';
import CommissionerPage from './league/CommissionerPage';
import LeagueChatWidget from '../components/chat/LeagueChatWidget';

export interface League {
  id: string;
  name: string;
  status: string;
  season: number;
  current_week: number;
  invite_code: string;
  commissioner_id: string;
  max_teams: number;
  draft_type: string;
  draft_timer_seconds: number;
  draft_current_pick: number;
  teams: Array<{
    id: string;
    team_name: string;
    wins: number;
    losses: number;
    ties: number;
    points_for: number;
    points_against: number;
    waiver_priority: number;
    draft_position: number;
    user: { id: string; display_name: string; avatar_url?: string };
  }>;
}

function LeagueNav({ leagueId, status, isCommissioner }: { leagueId: string; status: string; isCommissioner: boolean }) {
  const location = useLocation();
  const base = `/leagues/${leagueId}`;

  const tabs = [
    { to: base, label: 'Overview', icon: <Users size={16} /> },
    { to: `${base}/roster`, label: 'My Roster', icon: <ClipboardList size={16} /> },
    // Players tab is available pre-draft (setup) and during the draft, so users
    // can tune their autodraft rankings before the clock starts
    ...(status === 'setup' || status === 'draft'
      ? [{ to: `${base}/players`, label: 'Players', icon: <ListOrdered size={16} /> }]
      : []),
    ...(status === 'draft' ? [{ to: `${base}/draft`, label: 'Draft Room', icon: <Zap size={16} /> }] : []),
    ...(status === 'active' || status === 'playoffs'
      ? [{ to: `${base}/waivers`, label: 'Waiver Wire', icon: <TrendingUp size={16} /> }]
      : []),
    ...(status === 'active' || status === 'playoffs'
      ? [{ to: `${base}/matchups`, label: 'Matchups', icon: <Swords size={16} /> }]
      : []),
    ...(status === 'active' || status === 'playoffs'
      ? [{ to: `${base}/cards`, label: 'Cards', icon: <Layers size={16} /> }]
      : []),
    ...(status === 'active' || status === 'playoffs' || status === 'complete'
      ? [{ to: `${base}/scoreboard`, label: 'Scoreboard', icon: <Trophy size={16} /> }]
      : []),
    ...(isCommissioner
      ? [{ to: `${base}/commissioner`, label: 'Commissioner', icon: <Shield size={16} /> }]
      : [])
  ];

  return (
    <nav className="flex gap-1 mb-8 border-b border-slate-700 pb-0">
      {tabs.map(tab => {
        const isActive =
          tab.to === base
            ? location.pathname === base || location.pathname === `${base}/`
            : location.pathname.startsWith(tab.to);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              isActive
                ? 'border-gridiron-gold text-gridiron-gold'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function LeagueOverview({ league, onStartDraft, isCommissioner }: {
  league: League;
  onStartDraft: () => void;
  isCommissioner: boolean;
}) {
  const [startingDraft, setStartingDraft] = useState(false);

  async function handleStartDraft() {
    setStartingDraft(true);
    try {
      await onStartDraft();
    } finally {
      setStartingDraft(false);
    }
  }

  function copyInviteCode() {
    navigator.clipboard.writeText(league.invite_code);
    toast.success('Invite code copied!');
  }

  const sortedTeams = [...(league.teams || [])].sort(
    (a, b) => b.wins - a.wins || b.points_for - a.points_for
  );

  return (
    <div className="space-y-6">
      {/* Setup Banner */}
      {league.status === 'setup' && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-5">
          <h3 className="text-yellow-400 font-bold mb-1">⏳ League in Setup</h3>
          <p className="text-slate-400 text-sm mb-3">
            Share the invite code with your league members. The commissioner can start the draft once all teams have
            joined ({league.teams?.length || 0}/{league.max_teams} teams).
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-lg">
              <span className="text-slate-400 text-sm">Invite Code:</span>
              <span className="font-mono font-bold text-gridiron-gold text-lg">{league.invite_code}</span>
            </div>
            <button onClick={copyInviteCode} className="btn-secondary flex items-center gap-2 text-sm py-2">
              <Copy size={14} />
              Copy Code
            </button>
            {isCommissioner && (
              <button
                onClick={handleStartDraft}
                disabled={startingDraft || (league.teams?.length || 0) < 2}
                className="btn-primary text-sm py-2 disabled:opacity-50"
              >
                {startingDraft ? 'Starting...' : '🚀 Start Draft'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Draft Banner */}
      {league.status === 'draft' && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-5">
          <h3 className="text-blue-400 font-bold mb-1">🎯 Draft In Progress</h3>
          <p className="text-slate-400 text-sm">
            Pick {league.draft_current_pick} of {(league.teams?.length || 0) * 15} —{' '}
            <Link to={`/leagues/${league.id}/draft`} className="text-blue-400 underline">
              Go to Draft Room →
            </Link>
          </p>
        </div>
      )}

      {/* Standings */}
      <div className="card">
        <h2 className="text-white font-bold text-xl mb-4">
          Teams ({league.teams?.length || 0}/{league.max_teams})
        </h2>
        {!league.teams?.length ? (
          <p className="text-slate-400">No teams yet.</p>
        ) : (
          <div className="divide-y divide-slate-700">
            {sortedTeams.map((team, i) => (
              <div key={team.id} className="py-3 flex items-center gap-4">
                <div className="w-6 text-slate-500 text-sm font-medium">{i + 1}</div>
                <div className="w-9 h-9 rounded-full bg-brand-800 flex items-center justify-center text-sm font-bold text-white">
                  {team.user?.display_name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-white font-medium">{team.team_name}</div>
                  <div className="text-slate-400 text-xs">{team.user?.display_name}</div>
                </div>
                <div className="text-right">
                  {league.status === 'active' || league.status === 'playoffs' ? (
                    <>
                      <div className="text-white text-sm font-medium">
                        {team.wins}–{team.losses}{team.ties > 0 ? `–${team.ties}` : ''}
                      </div>
                      <div className="text-slate-400 text-xs">{Number(team.points_for).toFixed(1)} pts</div>
                    </>
                  ) : (
                    <div className="text-slate-500 text-sm">Draft #{team.draft_position || '—'}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* League Settings */}
      <div className="card">
        <h2 className="text-white font-bold text-xl mb-4">Settings</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ['Draft Type', league.draft_type === 'snake' ? 'Snake Draft' : league.draft_type],
            ['Pick Timer', `${league.draft_timer_seconds}s`],
            ['Max Teams', String(league.max_teams)],
            ['Season', String(league.season)],
            ['Scoring', 'PPR'],
            ['Status', league.status.charAt(0).toUpperCase() + league.status.slice(1)]
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-slate-700 last:border-0">
              <span className="text-slate-400">{label}</span>
              <span className="text-white font-medium capitalize">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuthStore();
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadLeague() {
    if (!id) return;
    try {
      const data = await apiGet<League>(`/leagues/${id}`, token || undefined);
      setLeague(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load league');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeague();
  }, [id, token]);

  async function handleStartDraft() {
    if (!id || !token) return;
    try {
      await apiPost(`/leagues/${id}/draft/start`, {}, token);
      toast.success('Draft started! Draft order has been randomized.');
      await loadLeague();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start draft');
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-slate-700 rounded w-1/3 animate-pulse" />
        <div className="h-4 bg-slate-700 rounded w-1/4 animate-pulse" />
      </div>
    );
  }

  if (error || !league) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">{error || 'League not found'}</p>
      </div>
    );
  }

  const isCommissioner = league.commissioner_id === user?.id;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-white">{league.name}</h1>
          <span className="text-xs bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full">
            {league.season}
          </span>
          <StatusBadge status={league.status} />
        </div>
        {league.status === 'active' && (
          <p className="text-slate-400">Week {league.current_week}</p>
        )}
        {isCommissioner && (
          <p className="text-xs text-gridiron-gold mt-1">⭐ You are the commissioner</p>
        )}
      </div>

      {/* Tab nav */}
      <LeagueNav leagueId={id!} status={league.status} isCommissioner={isCommissioner} />

      {/* Routes */}
      <Routes>
        <Route
          index
          element={
            <LeagueOverview
              league={league}
              onStartDraft={handleStartDraft}
              isCommissioner={isCommissioner}
            />
          }
        />
        <Route path="roster" element={<RosterPage league={league} />} />
        <Route
          path="players"
          element={
            league.status === 'setup' || league.status === 'draft' ? (
              <PlayersPage league={league} />
            ) : (
              <Navigate to={`/leagues/${id}`} replace />
            )
          }
        />
        <Route
          path="draft"
          element={
            league.status === 'draft' ? (
              <DraftRoomPage league={league} onPickMade={loadLeague} />
            ) : (
              <Navigate to={`/leagues/${id}`} replace />
            )
          }
        />
        <Route
          path="waivers"
          element={
            league.status === 'active' || league.status === 'playoffs' ? (
              <WaiverWirePage league={league} />
            ) : (
              <Navigate to={`/leagues/${id}`} replace />
            )
          }
        />
        <Route
          path="cards"
          element={
            league.status === 'active' || league.status === 'playoffs' ? (
              <CardDeckPage />
            ) : (
              <Navigate to={`/leagues/${id}`} replace />
            )
          }
        />
        <Route
          path="cards/pick"
          element={
            league.status === 'active' || league.status === 'playoffs' ? (
              <CardPickPage />
            ) : (
              <Navigate to={`/leagues/${id}`} replace />
            )
          }
        />
        <Route
          path="cards/play"
          element={
            league.status === 'active' || league.status === 'playoffs' ? (
              <CardPlayPage league={league} />
            ) : (
              <Navigate to={`/leagues/${id}`} replace />
            )
          }
        />
        <Route path="chat" element={<ChatPage league={league} />} />
        <Route
          path="scoreboard"
          element={
            league.status === 'active' || league.status === 'playoffs' || league.status === 'complete' ? (
              <ScoreboardPage league={league} />
            ) : (
              <Navigate to={`/leagues/${id}`} replace />
            )
          }
        />
        <Route
          path="matchups"
          element={
            league.status === 'active' || league.status === 'playoffs' ? (
              <MatchupsPage league={league} />
            ) : (
              <Navigate to={`/leagues/${id}`} replace />
            )
          }
        />
        <Route
          path="matchups/:matchupId"
          element={
            league.status === 'active' || league.status === 'playoffs' ? (
              <MatchupDetailPage league={league} />
            ) : (
              <Navigate to={`/leagues/${id}`} replace />
            )
          }
        />
        <Route
          path="commissioner"
          element={
            isCommissioner ? (
              <CommissionerPage league={league} onLeagueUpdate={loadLeague} />
            ) : (
              <Navigate to={`/leagues/${id}`} replace />
            )
          }
        />
      </Routes>

      {/* Floating chat widget — available on every league sub-route */}
      <LeagueChatWidget league={league} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    setup: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    draft: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    active: 'bg-green-500/10 text-green-400 border-green-500/30',
    playoffs: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    complete: 'bg-slate-500/10 text-slate-400 border-slate-500/30'
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${colors[status] || colors.setup}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

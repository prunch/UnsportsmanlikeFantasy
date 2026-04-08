import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { apiGet } from '../utils/api';

interface League {
  id: string;
  name: string;
  status: string;
  season: number;
  current_week: number;
  invite_code: string;
  commissioner_id: string;
  max_teams: number;
  teams: Array<{
    id: string;
    team_name: string;
    wins: number;
    losses: number;
    points_for: number;
    user: { id: string; display_name: string; avatar_url?: string };
  }>;
}

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuthStore();
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await apiGet<League>(`/leagues/${id}`, token || undefined);
        setLeague(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load league');
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id, token]);

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

  return (
    <div>
      {/* League Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-white">{league.name}</h1>
          <span className="text-xs bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full">
            {league.season}
          </span>
        </div>
        <p className="text-slate-400">
          Status: <span className="text-white capitalize">{league.status}</span>
          {league.current_week > 0 && ` · Week ${league.current_week}`}
        </p>
        <div className="mt-2 inline-flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg">
          <span className="text-slate-400 text-sm">Invite Code:</span>
          <span className="font-mono font-bold text-gridiron-gold">{league.invite_code}</span>
        </div>
      </div>

      {/* Setup Banner */}
      {league.status === 'setup' && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-5 mb-8">
          <h3 className="text-yellow-400 font-bold mb-1">⏳ League in Setup</h3>
          <p className="text-slate-400 text-sm">
            Share the invite code above with your league members. The commissioner can start the draft once all teams have joined ({league.teams?.length || 0}/{league.max_teams} teams).
          </p>
        </div>
      )}

      {/* Standings / Teams */}
      <div className="card">
        <h2 className="text-white font-bold text-xl mb-4">Teams ({league.teams?.length || 0}/{league.max_teams})</h2>
        {!league.teams?.length ? (
          <p className="text-slate-400">No teams yet.</p>
        ) : (
          <div className="divide-y divide-slate-700">
            {league.teams.map((team, i) => (
              <div key={team.id} className="py-3 flex items-center gap-4">
                <div className="w-6 text-slate-500 text-sm font-medium">{i + 1}</div>
                <div className="w-9 h-9 rounded-full bg-brand-800 flex items-center justify-center text-sm font-bold">
                  {team.user?.display_name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-white font-medium">{team.team_name}</div>
                  <div className="text-slate-400 text-xs">{team.user?.display_name}</div>
                </div>
                <div className="text-right">
                  <div className="text-white text-sm font-medium">
                    {team.wins}–{team.losses}
                  </div>
                  <div className="text-slate-400 text-xs">{team.points_for} pts</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Coming soon panels */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        {['Scoreboard', 'My Roster', 'Standings', 'Transactions', 'Draft Room', 'Card Deck'].map(section => (
          <div key={section} className="card opacity-50">
            <h3 className="text-slate-400 font-semibold">{section}</h3>
            <p className="text-xs text-slate-600 mt-1">Coming in Phase 2</p>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiGet } from '../utils/api';
import { Plus, Users, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';

interface League {
  id: string;
  name: string;
  status: string;
  season: number;
  max_teams: number;
  current_week: number;
  commissioner_id: string;
}

export default function DashboardPage() {
  const { user, token } = useAuthStore();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeagues() {
      try {
        const data = await apiGet<League[]>('/leagues', token || undefined);
        setLeagues(data);
      } catch (err) {
        // Supabase not configured yet — show empty state
        setLeagues([]);
      } finally {
        setLoading(false);
      }
    }
    fetchLeagues();
  }, [token]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">My Leagues</h1>
          <p className="text-slate-400 mt-1">Hey {user?.displayName} 👋</p>
        </div>
        <div className="flex gap-3">
          <Link to="/leagues/join" className="btn-secondary flex items-center gap-2">
            <Users size={18} />
            Join League
          </Link>
          <Link to="/leagues/create" className="btn-primary flex items-center gap-2">
            <Plus size={18} />
            Create League
          </Link>
        </div>
      </div>

      {/* League grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card animate-pulse">
              <div className="h-5 bg-slate-700 rounded mb-3 w-3/4" />
              <div className="h-3 bg-slate-700 rounded mb-2 w-1/2" />
              <div className="h-3 bg-slate-700 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : leagues.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leagues.map(league => (
            <LeagueCard key={league.id} league={league} userId={user?.id || ''} />
          ))}
        </div>
      )}
    </div>
  );
}

function LeagueCard({ league, userId }: { league: League; userId: string }) {
  const statusColors: Record<string, string> = {
    setup: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    draft: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    active: 'bg-green-500/10 text-green-400 border-green-500/30',
    playoffs: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    complete: 'bg-slate-500/10 text-slate-400 border-slate-500/30'
  };

  const isCommissioner = league.commissioner_id === userId;

  return (
    <Link to={`/leagues/${league.id}`} className="card hover:border-slate-500 transition-colors block">
      <div className="flex items-start justify-between mb-3">
        <div className="text-2xl">🏈</div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColors[league.status] || statusColors.setup}`}>
          {league.status.charAt(0).toUpperCase() + league.status.slice(1)}
        </span>
      </div>
      <h3 className="text-white font-bold text-lg mb-1">{league.name}</h3>
      <p className="text-slate-400 text-sm mb-3">
        {league.season} Season · Week {league.current_week || '--'}
      </p>
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Trophy size={12} />
          Up to {league.max_teams} teams
        </span>
        {isCommissioner && (
          <span className="text-gridiron-gold font-semibold">Commissioner</span>
        )}
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">🏈</div>
      <h2 className="text-2xl font-bold text-white mb-2">No leagues yet</h2>
      <p className="text-slate-400 mb-8">
        Create a league and invite your crew, or join an existing one.
      </p>
      <div className="flex items-center justify-center gap-4">
        <Link to="/leagues/create" className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          Create a League
        </Link>
        <Link to="/leagues/join" className="btn-secondary flex items-center gap-2">
          <Users size={18} />
          Join a League
        </Link>
      </div>
    </div>
  );
}

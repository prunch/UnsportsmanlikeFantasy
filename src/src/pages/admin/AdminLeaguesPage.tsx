import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet } from '../../utils/api';
import toast from 'react-hot-toast';

interface League {
  id: string;
  name: string;
  status: string;
  season: number;
  max_teams: number;
  current_week: number;
  invite_code: string;
  created_at: string;
}

export default function AdminLeaguesPage() {
  const { token } = useAuthStore();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiGet<{ leagues: League[]; total: number }>('/admin/leagues', token || undefined);
        setLeagues(data.leagues || []);
        setTotal(data.total || 0);
      } catch {
        toast.error('Failed to load leagues');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      setup: 'bg-yellow-500/10 text-yellow-400',
      draft: 'bg-blue-500/10 text-blue-400',
      active: 'bg-green-500/10 text-green-400',
      playoffs: 'bg-purple-500/10 text-purple-400',
      complete: 'bg-slate-500/10 text-slate-400'
    };
    return (
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors[status] || colors.setup}`}>
        {status}
      </span>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Leagues <span className="text-slate-500 text-lg">({total})</span></h1>

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800 border-b border-slate-700">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3 uppercase tracking-wider">League</th>
                <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3 uppercase tracking-wider">Status</th>
                <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3 uppercase tracking-wider">Invite Code</th>
                <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {leagues.map(league => (
                <tr key={league.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{league.name}</div>
                    <div className="text-sm text-slate-400">{league.season} · Up to {league.max_teams} teams</div>
                  </td>
                  <td className="px-4 py-3">{statusBadge(league.status)}</td>
                  <td className="px-4 py-3">
                    <code className="font-mono text-gridiron-gold text-sm">{league.invite_code}</code>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(league.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {leagues.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No leagues yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

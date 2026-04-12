import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Shield, Trophy, Calendar, Settings, Lock } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { apiGet } from '../utils/api';

interface PublicProfile {
  id: string;
  displayName: string;
  username: string | null;
  bio: string;
  avatarUrl: string | null;
  teamName: string | null;
  isProfilePublic: boolean;
  memberSince: string;
  stats: {
    totalWins: number;
    totalLosses: number;
    totalTies: number;
    totalPointsFor: number;
    leagueCount: number;
  };
  leagues: Array<{
    teamId: string;
    teamName: string;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    league: {
      id: string;
      name: string;
      status: string;
      season: number;
    } | null;
  }>;
}

export default function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isOwnProfile = user?.id === userId;

  useEffect(() => {
    loadProfile();
  }, [userId]);

  async function loadProfile() {
    if (!token || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<PublicProfile>(`/users/${userId}/profile`, token);
      setProfile(data);
    } catch (err: any) {
      if (err.message?.includes('private')) {
        setError('private');
      } else if (err.message?.includes('not found') || err.message?.includes('404')) {
        setError('not_found');
      } else {
        setError('error');
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gridiron-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error === 'private') {
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="card text-center py-16">
          <Lock size={48} className="mx-auto mb-4 text-slate-600" />
          <h2 className="text-white text-xl font-bold mb-2">Private Profile</h2>
          <p className="text-slate-400">This user has set their profile to private.</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="card text-center py-16">
          <h2 className="text-white text-xl font-bold mb-2">User Not Found</h2>
          <p className="text-slate-400">This profile doesn't exist or has been deleted.</p>
        </div>
      </div>
    );
  }

  const initials = profile.displayName.charAt(0).toUpperCase();
  const winPct = profile.stats.totalWins + profile.stats.totalLosses + profile.stats.totalTies > 0
    ? ((profile.stats.totalWins / (profile.stats.totalWins + profile.stats.totalLosses + profile.stats.totalTies)) * 100).toFixed(1)
    : '0.0';

  const memberDate = new Date(profile.memberSince).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric'
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={16} /> Back
        </button>
        {isOwnProfile && (
          <Link
            to="/settings"
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-gridiron-gold transition-colors"
          >
            <Settings size={14} />
            Edit Profile
          </Link>
        )}
      </div>

      {/* Profile Header */}
      <div className="card">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              className="w-24 h-24 rounded-full object-cover border-2 border-slate-600 flex-shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-brand-800 flex items-center justify-center text-3xl font-bold text-white border-2 border-slate-600 flex-shrink-0">
              {initials}
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white truncate">{profile.displayName}</h1>
            {profile.username && (
              <p className="text-gridiron-gold text-sm">@{profile.username}</p>
            )}
            {profile.teamName && (
              <p className="text-slate-400 text-sm mt-1">{profile.teamName}</p>
            )}
            <div className="flex items-center gap-1 mt-2 text-slate-500 text-xs">
              <Calendar size={12} />
              Member since {memberDate}
            </div>
            {profile.bio && (
              <p className="text-slate-300 text-sm mt-3 whitespace-pre-wrap">{profile.bio}</p>
            )}
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Record', value: `${profile.stats.totalWins}-${profile.stats.totalLosses}${profile.stats.totalTies > 0 ? `-${profile.stats.totalTies}` : ''}` },
          { label: 'Win %', value: `${winPct}%` },
          { label: 'Points For', value: profile.stats.totalPointsFor.toLocaleString() },
          { label: 'Leagues', value: String(profile.stats.leagueCount) }
        ].map(stat => (
          <div key={stat.label} className="card text-center py-4">
            <div className="text-white text-xl font-bold">{stat.value}</div>
            <div className="text-slate-500 text-xs mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* League History */}
      {profile.leagues.length > 0 && (
        <div className="card">
          <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
            <Trophy size={18} className="text-gridiron-gold" />
            Leagues
          </h2>
          <div className="divide-y divide-slate-700">
            {profile.leagues.map(entry => (
              <div key={entry.teamId} className="py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  {entry.league ? (
                    <Link
                      to={`/leagues/${entry.league.id}/scoreboard`}
                      className="text-white font-medium text-sm hover:text-gridiron-gold transition-colors"
                    >
                      {entry.league.name}
                    </Link>
                  ) : (
                    <span className="text-white font-medium text-sm">Unknown League</span>
                  )}
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-slate-400 text-xs">as {entry.teamName}</span>
                    {entry.league && (
                      <>
                        <span className="text-slate-600 text-xs">·</span>
                        <span className="text-slate-500 text-xs capitalize">
                          {entry.league.status} · {entry.league.season}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <div className="text-white font-semibold text-sm">
                    {entry.wins}-{entry.losses}{entry.ties > 0 ? `-${entry.ties}` : ''}
                  </div>
                  <div className="text-slate-500 text-xs">
                    {Number(entry.pointsFor).toFixed(1)} PF
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.leagues.length === 0 && (
        <div className="card text-center py-8">
          <Shield size={32} className="mx-auto mb-2 text-slate-600" />
          <p className="text-slate-400 text-sm">No league history yet</p>
        </div>
      )}
    </div>
  );
}

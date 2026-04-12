import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiGet } from '../utils/api';
import toast from 'react-hot-toast';
import { Zap, RefreshCw, Target } from 'lucide-react';
import CardStack, { UserCard } from '../components/cards/CardStack';

export default function CardDeckPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { token } = useAuthStore();

  const [stack, setStack] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<number | null>(null);

  useEffect(() => {
    loadStack();
  }, [leagueId]);

  async function loadStack() {
    if (!leagueId) return;
    setLoading(true);
    try {
      const stackData = await apiGet<UserCard[]>(`/leagues/${leagueId}/cards`, token || undefined);
      setStack(stackData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load card data');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap size={22} className="text-gridiron-gold" />
            Card Deck
          </h2>
          <p className="text-slate-400 text-sm mt-1">{stack.length}/6 cards in stack</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadStack}
            disabled={loading}
            className="btn-secondary text-sm py-1.5 flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link
            to={`/leagues/${leagueId}/cards/play`}
            className="btn-primary text-sm py-1.5 flex items-center gap-1.5"
          >
            <Target size={14} />
            Play Cards
          </Link>
          <Link
            to={`/leagues/${leagueId}/cards/pick`}
            className="btn-secondary text-sm py-1.5"
          >
            + Pick Cards
          </Link>
        </div>
      </div>

      {/* Card Stack */}
      {loading ? (
        <div className="space-y-3">
          <div className="h-4 bg-slate-700 rounded w-1/4 animate-pulse" />
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-52 bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <CardStack cards={stack} />
      )}
    </div>
  );
}

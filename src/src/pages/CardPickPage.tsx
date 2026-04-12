import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiGet, apiPost } from '../utils/api';
import toast from 'react-hot-toast';
import { CheckCircle, Zap } from 'lucide-react';
import Card, { CardData } from '../components/cards/Card';

interface PickSession {
  id: string;
  week: number;
  season: number;
  card_pool: string[];
  picked_ids: string[];
  completed_at: string | null;
  max_picks: number;
  cards: CardData[];
}

export default function CardPickPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { token } = useAuthStore();
  const navigate = useNavigate();

  const [session, setSession] = useState<PickSession | null>(null);
  const [loading, setLoading] = useState(true);
  // Track which cards have been flipped & added to deck (by card id)
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  // Prevent double-fire while API call is in flight
  const pendingRef = useRef<Set<string>>(new Set());

  const MAX_PICKS = session?.max_picks ?? 3;
  const isSeedPick = MAX_PICKS === 6;
  const picksUsed = claimed.size;
  const picksRemaining = MAX_PICKS - picksUsed;
  const isComplete = picksRemaining <= 0 || !!session?.completed_at;

  useEffect(() => {
    load();
  }, [leagueId]);

  async function load() {
    if (!leagueId) return;
    try {
      const data = await apiGet<PickSession>(`/leagues/${leagueId}/cards/pick`, token || undefined);
      setSession(data);
      // Restore already-picked cards from session
      if (data.picked_ids?.length > 0) {
        setClaimed(new Set(data.picked_ids));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load pick session');
    } finally {
      setLoading(false);
    }
  }

  // Called immediately when a card is flipped — adds it to deck via API
  async function handleFlipPick(card: CardData) {
    if (isComplete || !leagueId || !token) return;
    if (claimed.has(card.id) || pendingRef.current.has(card.id)) return;

    pendingRef.current.add(card.id);

    try {
      await apiPost(`/leagues/${leagueId}/cards/pick`, {
        cardId: card.id
      }, token);

      setClaimed(prev => {
        const next = new Set(prev);
        next.add(card.id);
        return next;
      });

      const newCount = picksUsed + 1;
      if (newCount >= MAX_PICKS) {
        toast.success(`All ${MAX_PICKS} cards added to your deck!`);
        // Brief delay so the user sees the last card flip
        setTimeout(() => navigate(`/leagues/${leagueId}/cards`), 1500);
      } else {
        toast.success(`Card added! ${MAX_PICKS - newCount} pick${MAX_PICKS - newCount !== 1 ? 's' : ''} left.`, { duration: 1500 });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add card');
    } finally {
      pendingRef.current.delete(card.id);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-slate-700 rounded w-1/3 animate-pulse" />
        <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-52 bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">Failed to load card pick session.</p>
      </div>
    );
  }

  if (session.completed_at && claimed.size === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <CheckCircle size={48} className="mx-auto text-green-400" />
        <h2 className="text-2xl font-bold text-white">Pick Complete!</h2>
        <p className="text-slate-400">You've already picked your cards for Week {session.week}.</p>
        <button
          onClick={() => navigate(`/leagues/${leagueId}/cards`)}
          className="btn-primary"
        >
          View My Card Stack
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Zap size={24} className="text-gridiron-gold" />
          <h1 className="text-3xl font-bold text-white">
            {isSeedPick ? 'Seed Your Deck' : 'Weekly Card Pick'}
          </h1>
          <Zap size={24} className="text-gridiron-gold" />
        </div>
        <p className="text-slate-400">
          Week {session.week} · Flip a card to add it to your deck.{' '}
          <span className="text-white font-semibold">{picksRemaining}</span> pick{picksRemaining !== 1 ? 's' : ''} remaining.
        </p>
      </div>

      {/* Pick counter */}
      <div className="flex justify-center">
        <div className="flex gap-1.5">
          {Array.from({ length: MAX_PICKS }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${
                i < picksUsed ? 'bg-gridiron-gold' : 'bg-slate-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 12 cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {session.cards.map(card => {
          const isClaimed = claimed.has(card.id);
          const cardDisabled = isComplete && !isClaimed;

          return (
            <div key={card.id} className="relative">
              <Card
                card={card}
                faceDown={!isClaimed}
                showPickActions={!isClaimed && !isComplete}
                onPick={handleFlipPick}
                selected={isClaimed}
                disabled={cardDisabled}
              />
              {isClaimed && (
                <div className="mt-1 text-center">
                  <span className="text-xs text-gridiron-gold flex items-center justify-center gap-1">
                    <CheckCircle size={10} /> In your deck
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Done / navigate away */}
      {isComplete ? (
        <div className="text-center pt-4 border-t border-slate-700">
          <button
            onClick={() => navigate(`/leagues/${leagueId}/cards`)}
            className="btn-primary"
          >
            View My Card Stack →
          </button>
        </div>
      ) : (
        <div className="text-center pt-4 border-t border-slate-700">
          <button
            onClick={() => navigate(`/leagues/${leagueId}/cards`)}
            className="text-slate-500 text-sm hover:text-slate-300 transition-colors"
          >
            Done picking for now →
          </button>
        </div>
      )}
    </div>
  );
}

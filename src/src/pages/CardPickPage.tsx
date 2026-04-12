import { useState, useEffect } from 'react';
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
  const [selected, setSelected] = useState<CardData[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Dynamic: 6 for pre-week-1 seed (empty deck), 3 for normal weeks
  const MAX_PICKS = session?.max_picks ?? 3;
  const isSeedPick = MAX_PICKS === 6;

  useEffect(() => {
    load();
  }, [leagueId]);

  async function load() {
    if (!leagueId) return;
    try {
      const data = await apiGet<PickSession>(`/leagues/${leagueId}/cards/pick`, token || undefined);
      setSession(data);
      // Pre-select already-picked cards (if session was resumed)
      if (data.picked_ids.length > 0 && data.cards) {
        const alreadyPicked = data.cards.filter(c => data.picked_ids.includes(c.id));
        setSelected(alreadyPicked);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load pick session');
    } finally {
      setLoading(false);
    }
  }

  function handlePick(card: CardData) {
    if (session?.completed_at) return;
    if (selected.find(c => c.id === card.id)) {
      // Deselect
      setSelected(prev => prev.filter(c => c.id !== card.id));
    } else if (selected.length < MAX_PICKS) {
      setSelected(prev => [...prev, card]);
    } else {
      toast.error(`You can only pick ${MAX_PICKS} cards`);
    }
  }

  async function handleSubmit() {
    if (selected.length === 0) {
      toast.error('Select at least 1 card');
      return;
    }
    if (!leagueId) return;

    setSubmitting(true);
    try {
      await apiPost(`/leagues/${leagueId}/cards/pick`, {
        cardIds: selected.map(c => c.id)
      }, token || undefined);
      toast.success(`${selected.length} card${selected.length > 1 ? 's' : ''} added to your stack!`);
      navigate(`/leagues/${leagueId}/cards`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit picks');
    } finally {
      setSubmitting(false);
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

  if (session.completed_at) {
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
          {isSeedPick
            ? `Week ${session.week} · Flip cards and pick ${MAX_PICKS} to seed your starting deck before the season kicks off.`
            : `Week ${session.week} · Flip cards to reveal them, then pick ${MAX_PICKS} to add to your deck.`
          }
        </p>
      </div>

      {/* Pick progress */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-slate-400 text-sm font-medium">
            Selected: <span className="text-white">{selected.length}/{MAX_PICKS}</span>
          </span>
          {selected.length > 0 && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary text-sm py-1.5 px-4 disabled:opacity-50"
            >
              {submitting ? 'Adding...' : `Add ${selected.length} Card${selected.length !== 1 ? 's' : ''} to Stack`}
            </button>
          )}
        </div>

        {/* Selected card titles */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map(card => (
              <span key={card.id} className="text-xs bg-gridiron-gold/10 text-gridiron-gold border border-gridiron-gold/30 px-2 py-1 rounded-full flex items-center gap-1">
                <CheckCircle size={10} />
                {card.title}
                <button
                  onClick={() => handlePick(card)}
                  className="ml-1 hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 12 cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {session.cards.map(card => {
          const isSelected = selected.some(c => c.id === card.id);
          const isMaxed = selected.length >= MAX_PICKS && !isSelected;

          return (
            <div key={card.id}>
              <Card
                card={card}
                faceDown={true}
                showPickActions={true}
                onPick={handlePick}
                selected={isSelected}
                disabled={isMaxed}
              />
              {isSelected && (
                <div className="mt-1 text-center">
                  <span className="text-xs text-gridiron-gold flex items-center justify-center gap-1">
                    <CheckCircle size={10} /> Selected
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Skip pick */}
      <div className="text-center pt-4 border-t border-slate-700">
        <p className="text-slate-500 text-xs mb-2">
          Don't want to pick? {MAX_PICKS} random cards will be auto-assigned if you skip.
        </p>
        <button
          onClick={() => navigate(`/leagues/${leagueId}/cards`)}
          className="text-slate-500 text-sm hover:text-slate-300 transition-colors"
        >
          Skip for now →
        </button>
      </div>
    </div>
  );
}

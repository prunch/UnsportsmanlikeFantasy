import { Layers } from 'lucide-react';
import Card, { CardData } from './Card';

export interface UserCard {
  id: string;
  user_id: string;
  league_id: string;
  card_id: string;
  obtained_at: string;
  played_at: string | null;
  card: CardData;
}

interface CardStackProps {
  cards: UserCard[];
  onPlayCard?: (userCard: UserCard) => void;
  loading?: boolean;
}

export default function CardStack({ cards, onPlayCard, loading = false }: CardStackProps) {
  const MAX_STACK = 6;

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-52 rounded-xl bg-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
          <Layers size={28} className="text-slate-600" />
        </div>
        <h3 className="text-slate-400 font-medium mb-1">No cards in your stack</h3>
        <p className="text-slate-500 text-sm">Complete the weekly card pick to add cards.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Stack size indicator */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-400">
          {cards.length}/{MAX_STACK} cards
        </span>
        <div className="flex gap-1">
          {Array.from({ length: MAX_STACK }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-sm ${i < cards.length ? 'bg-gridiron-gold' : 'bg-slate-700'}`}
            />
          ))}
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map(userCard => (
          <div key={userCard.id} className="relative">
            <Card card={userCard.card} />
            {onPlayCard && (
              <button
                onClick={() => onPlayCard(userCard)}
                className="mt-2 w-full btn-primary text-sm py-1.5"
              >
                Play Card
              </button>
            )}
          </div>
        ))}
        {/* Empty slots */}
        {Array.from({ length: MAX_STACK - cards.length }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="h-52 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center"
          >
            <span className="text-slate-600 text-xs">Empty Slot</span>
          </div>
        ))}
      </div>
    </div>
  );
}

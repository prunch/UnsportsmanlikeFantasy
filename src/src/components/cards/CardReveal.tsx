import { useState } from 'react';
import { Eye, Clock } from 'lucide-react';
import Card, { CardData } from './Card';

interface PlayedCard {
  id: string;
  user_id: string;
  card_id: string;
  card: CardData;
  play_slot: 'own_team' | 'opponent' | 'any_team';
  target_player_id: string | null;
  played_at: string;
  revealed_at: string | null;
}

interface CardRevealProps {
  plays: PlayedCard[];
  kickoffPassed: boolean;
  currentUserId: string;
}

const slotLabels: Record<string, string> = {
  own_team: '🛡️ Your Team',
  opponent: '⚔️ Opponent',
  any_team: '🌐 Any Team'
};

export default function CardReveal({ plays, kickoffPassed, currentUserId }: CardRevealProps) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  function reveal(id: string) {
    setRevealed(prev => new Set([...prev, id]));
  }

  if (plays.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock size={32} className="mx-auto mb-3 text-slate-600" />
        <p className="text-slate-400">No cards played this week yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {!kickoffPassed && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
          <Clock size={18} className="text-yellow-400 shrink-0" />
          <div>
            <p className="text-yellow-400 font-medium text-sm">Cards Hidden Until Kickoff</p>
            <p className="text-slate-400 text-xs mt-0.5">
              Opponent's cards will be revealed at Sunday 1PM ET kickoff. You can see your own plays below.
            </p>
          </div>
        </div>
      )}

      {kickoffPassed && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
          <Eye size={18} className="text-green-400 shrink-0" />
          <div>
            <p className="text-green-400 font-medium text-sm">Cards Revealed!</p>
            <p className="text-slate-400 text-xs mt-0.5">
              All cards played this week are now visible to everyone.
            </p>
          </div>
        </div>
      )}

      {/* Play list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plays.map(play => {
          const isOwn = play.user_id === currentUserId;
          const isVisible = isOwn || kickoffPassed || play.revealed_at !== null;
          const isRevealed = revealed.has(play.id);

          return (
            <div key={play.id} className="space-y-2">
              {/* Slot label */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">
                  {slotLabels[play.play_slot] || play.play_slot}
                </span>
                {isOwn && (
                  <span className="text-xs bg-gridiron-gold/10 text-gridiron-gold px-2 py-0.5 rounded-full">
                    You played this
                  </span>
                )}
              </div>

              {/* Card or hidden state */}
              {isVisible ? (
                <Card card={play.card} faceDown={!isRevealed && !isOwn && kickoffPassed} />
              ) : (
                <div className="h-52 rounded-xl border-2 border-slate-700 bg-slate-800/50 flex flex-col items-center justify-center">
                  <Eye size={24} className="text-slate-600 mb-2" />
                  <span className="text-slate-500 text-xs">Hidden until kickoff</span>
                </div>
              )}

              {/* Target info */}
              {isVisible && play.target_player_id && (
                <p className="text-xs text-slate-500">
                  Target: <span className="text-slate-300">{play.target_player_id}</span>
                </p>
              )}

              {/* Reveal button for kickoff-revealed cards */}
              {kickoffPassed && !isOwn && !isRevealed && (
                <button
                  onClick={() => reveal(play.id)}
                  className="w-full btn-secondary text-xs py-1.5"
                >
                  Flip Card
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

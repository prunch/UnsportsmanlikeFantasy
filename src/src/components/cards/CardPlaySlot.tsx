import { Shield, Swords, Globe } from 'lucide-react';
import { UserCard } from './CardStack';
import Card from './Card';

export type PlaySlot = 'own_team' | 'opponent' | 'any_team';

interface PlaySlotConfig {
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const SLOT_CONFIG: Record<PlaySlot, PlaySlotConfig> = {
  own_team: {
    label: 'Your Team',
    description: 'Play on a player on your own roster',
    icon: <Shield size={18} />,
    color: 'border-green-500/40 hover:border-green-500/70 text-green-400'
  },
  opponent: {
    label: 'Opponent',
    description: 'Play on a player on your weekly opponent\'s roster',
    icon: <Swords size={18} />,
    color: 'border-red-500/40 hover:border-red-500/70 text-red-400'
  },
  any_team: {
    label: 'Any Team',
    description: 'Play on any player in the league',
    icon: <Globe size={18} />,
    color: 'border-blue-500/40 hover:border-blue-500/70 text-blue-400'
  }
};

interface CardPlaySlotProps {
  slot: PlaySlot;
  playedCard: UserCard | null;
  onPlay: (slot: PlaySlot) => void;
  disabled?: boolean;
}

export default function CardPlaySlot({ slot, playedCard, onPlay, disabled = false }: CardPlaySlotProps) {
  const config = SLOT_CONFIG[slot];

  return (
    <div className="flex flex-col gap-2">
      {/* Slot header */}
      <div className={`flex items-center gap-2 text-sm font-medium ${config.color.split(' ')[2]}`}>
        {config.icon}
        <span>{config.label}</span>
      </div>
      <p className="text-xs text-slate-500 mb-2">{config.description}</p>

      {/* Slot body */}
      {playedCard ? (
        <div className="opacity-80">
          <Card card={playedCard.card} />
          <div className="mt-2 text-center text-xs text-slate-500">Played ✓</div>
        </div>
      ) : (
        <button
          onClick={() => !disabled && onPlay(slot)}
          disabled={disabled}
          className={`h-52 rounded-xl border-2 border-dashed ${config.color} 
            flex flex-col items-center justify-center gap-3 transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <div className="opacity-60">{config.icon}</div>
          <span className="text-xs font-medium opacity-70">Play a card here</span>
        </button>
      )}
    </div>
  );
}

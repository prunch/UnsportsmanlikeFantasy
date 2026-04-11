import { useState } from 'react';
import { Zap, TrendingUp, TrendingDown } from 'lucide-react';

export interface CardData {
  id: string;
  title: string;
  description: string;
  target_type: 'player' | 'position' | 'all';
  target_position?: string;
  effect_type: 'buff' | 'debuff';
  modifier_type: 'absolute' | 'percentage';
  modifier_value: number;
  rarity: 'common' | 'uncommon' | 'rare';
  is_active?: boolean;
}

interface CardProps {
  card: CardData;
  /** If true, card starts face-down and can be flipped by clicking */
  faceDown?: boolean;
  /** Whether to show the "Take it" / "Keep flipping" actions */
  showPickActions?: boolean;
  /** Called when user picks this card */
  onPick?: (card: CardData) => void;
  /** Whether this card is already selected in the pick phase */
  selected?: boolean;
  /** Whether clicking is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const rarityConfig: Record<string, { border: string; label: string; glow: string }> = {
  common:   { border: 'border-slate-600',   label: 'text-slate-400',  glow: '' },
  uncommon: { border: 'border-green-500/60', label: 'text-green-400',  glow: 'shadow-green-500/20' },
  rare:     { border: 'border-blue-500/60',  label: 'text-blue-400',   glow: 'shadow-blue-500/30' }
};

export function Card({ card, faceDown = false, showPickActions = false, onPick, selected, disabled, className = '' }: CardProps) {
  const [flipped, setFlipped] = useState(!faceDown);

  const rarity = rarityConfig[card.rarity] || rarityConfig.common;
  const isBuff = card.effect_type === 'buff';
  const modDisplay = card.modifier_type === 'percentage'
    ? `${isBuff ? '+' : '-'}${card.modifier_value}%`
    : `${isBuff ? '+' : '-'}${card.modifier_value} pts`;

  function handleBackClick() {
    if (disabled) return;
    if (!flipped) {
      setFlipped(true);
    }
  }

  // Once the card is face-up in pick mode, clicking the face itself
  // toggles selection (no separate "Take It" button).
  function handleFrontClick() {
    if (disabled) return;
    if (!flipped) return;
    if (!showPickActions || !onPick) return;
    onPick(card);
  }

  const frontInteractive = flipped && showPickActions && !!onPick && !disabled;

  return (
    <div
      className={`relative ${className}`}
      style={{ perspective: '1000px' }}
    >
      <div
        className={`relative w-full transition-transform duration-500`}
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(0deg)' : 'rotateY(180deg)',
          minHeight: '200px'
        }}
      >
        {/* Front face */}
        <div
          onClick={handleFrontClick}
          className={`absolute inset-0 rounded-xl border-2 ${rarity.border} bg-slate-800
            ${rarity.glow ? `shadow-lg ${rarity.glow}` : ''}
            ${selected ? 'ring-2 ring-gridiron-gold' : ''}
            ${frontInteractive ? 'cursor-pointer hover:scale-[1.03] hover:border-gridiron-gold/60' : ''}
            transition-all duration-200 p-4 flex flex-col select-none`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Rarity badge */}
          <div className="flex items-start justify-between mb-2">
            <span className={`text-xs font-bold uppercase tracking-wider ${rarity.label}`}>
              {card.rarity}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
              isBuff ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {isBuff ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {card.effect_type}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-white font-bold text-base mb-2 leading-tight">{card.title}</h3>

          {/* Description */}
          <p className="text-slate-400 text-xs leading-relaxed flex-1">{card.description}</p>

          {/* Stats footer */}
          <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
            <span className={`text-sm font-bold ${isBuff ? 'text-green-400' : 'text-red-400'}`}>
              {modDisplay}
            </span>
            <span className="text-slate-500 text-xs">
              {card.target_position || card.target_type}
            </span>
          </div>
        </div>

        {/* Back face (face-down card back) */}
        <div
          className={`absolute inset-0 rounded-xl border-2 border-gridiron-gold/30 bg-gradient-to-br from-slate-900 to-slate-800
            flex flex-col items-center justify-center cursor-pointer hover:border-gridiron-gold/60 transition-colors
            select-none`}
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          onClick={handleBackClick}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gridiron-gold/10 border border-gridiron-gold/30 flex items-center justify-center">
              <Zap size={24} className="text-gridiron-gold/60" />
            </div>
            <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Tap to Reveal</span>
          </div>
          {/* Decorative grid pattern */}
          <div className="absolute inset-0 rounded-xl overflow-hidden opacity-10">
            <div className="w-full h-full" style={{
              backgroundImage: 'repeating-linear-gradient(0deg, #d4af37 0px, transparent 1px, transparent 20px), repeating-linear-gradient(90deg, #d4af37 0px, transparent 1px, transparent 20px)',
              backgroundSize: '20px 20px'
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Card;

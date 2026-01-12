
import React from 'react';
import { Card, Player } from '../types';

interface CardHandProps {
  player: Player;
  selectedCardId: string | null;
  onCardSelect: (cardId: string) => void;
}

export const CardHand: React.FC<CardHandProps> = ({ player, selectedCardId, onCardSelect }) => {
  const getSuitColor = (suit: string) => 
    (suit === 'hearts' || suit === 'diamonds') ? 'text-red-600' : 'text-slate-900';

  const getSuitIcon = (suit: string) => {
    switch(suit) {
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
      case 'spades': return '♠';
      default: return '';
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-900 to-transparent flex justify-center items-end gap-3 z-50">
      <div className="bg-slate-800/80 px-8 py-4 rounded-t-2xl backdrop-blur-md border-t border-slate-600 shadow-2xl flex flex-col items-center">
        <div className="text-white text-sm font-bold mb-2 uppercase tracking-widest">{player.color}'s Turn</div>
        <div className="flex -space-x-4 hover:space-x-2 transition-all duration-300">
          {player.hand.map((card, index) => {
            const isSelected = selectedCardId === card.id;
            return (
              <button
                key={card.id}
                onClick={() => onCardSelect(card.id)}
                className={`
                  relative w-20 h-32 rounded-lg bg-slate-100 border-2 shadow-xl transition-all duration-200
                  flex flex-col items-center justify-center
                  ${isSelected ? 'border-yellow-400 -translate-y-8 z-10 scale-110' : 'border-slate-300 hover:-translate-y-4 hover:z-10'}
                `}
                style={{ transformOrigin: 'bottom center' }}
              >
                <span className={`text-2xl font-bold ${getSuitColor(card.suit)}`}>{card.rank}</span>
                <span className={`text-4xl ${getSuitColor(card.suit)}`}>{getSuitIcon(card.suit)}</span>
                
                {/* Mini index */}
                <span className={`absolute top-1 left-1 text-xs font-bold ${getSuitColor(card.suit)}`}>{card.rank}</span>
                <span className={`absolute bottom-1 right-1 text-xs font-bold ${getSuitColor(card.suit)} rotate-180`}>{card.rank}</span>
              </button>
            );
          })}
          {player.hand.length === 0 && (
             <div className="text-slate-400 italic py-8 px-4">Waiting for next round...</div>
          )}
        </div>
      </div>
    </div>
  );
};

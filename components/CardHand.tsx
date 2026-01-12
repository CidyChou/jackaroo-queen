
import React from 'react';
import { Card, Player } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface CardHandProps {
  player: Player;
  selectedCardId: string | null;
  shakingCardId: string | null; // ID of card that should shake
  isDeadlocked: boolean; // If true, show glow around hand
  onCardSelect: (cardId: string) => void;
}

export const CardHand: React.FC<CardHandProps> = ({ 
  player, 
  selectedCardId, 
  shakingCardId,
  isDeadlocked,
  onCardSelect 
}) => {
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
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent flex justify-center items-end gap-3 z-50 pointer-events-none">
      <div className={`
        pointer-events-auto bg-slate-800/90 px-8 py-4 rounded-t-2xl backdrop-blur-md border-t border-slate-600 shadow-2xl flex flex-col items-center transition-all duration-500
        ${isDeadlocked ? 'ring-4 ring-red-500/50 shadow-[0_0_50px_rgba(239,68,68,0.4)]' : ''}
      `}>
        <div className={`text-sm font-bold mb-2 uppercase tracking-widest flex items-center gap-2 ${isDeadlocked ? 'text-red-400 animate-pulse' : 'text-white'}`}>
           {isDeadlocked && <span>⚠️</span>}
           {isDeadlocked ? 'Stuck! Choose card to burn' : `${player.color}'s Turn`}
        </div>
        
        <div className="flex -space-x-4 hover:space-x-2 transition-all duration-300">
          {player.hand.map((card, index) => {
            const isSelected = selectedCardId === card.id;
            const isShaking = shakingCardId === card.id;

            return (
              <div key={card.id} className="relative">
                {/* Tooltip for Shake */}
                <AnimatePresence>
                  {isShaking && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap"
                    >
                      Can't Move
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  animate={isShaking ? { x: [-5, 5, -5, 5, 0] } : { x: 0 }}
                  transition={{ duration: 0.4 }}
                  onClick={() => onCardSelect(card.id)}
                  className={`
                    relative w-20 h-32 rounded-lg bg-slate-100 border-2 shadow-xl transition-all duration-200
                    flex flex-col items-center justify-center cursor-pointer
                    ${isSelected ? 'border-yellow-400 -translate-y-8 z-10 scale-110' : 'border-slate-300 hover:-translate-y-4 hover:z-10'}
                    ${isDeadlocked && !isSelected ? 'opacity-80 hover:opacity-100' : ''}
                  `}
                  style={{ transformOrigin: 'bottom center' }}
                >
                  <span className={`text-2xl font-bold ${getSuitColor(card.suit)}`}>{card.rank}</span>
                  <span className={`text-4xl ${getSuitColor(card.suit)}`}>{getSuitIcon(card.suit)}</span>
                  
                  {/* Mini index */}
                  <span className={`absolute top-1 left-1 text-xs font-bold ${getSuitColor(card.suit)}`}>{card.rank}</span>
                  <span className={`absolute bottom-1 right-1 text-xs font-bold ${getSuitColor(card.suit)} rotate-180`}>{card.rank}</span>
                  
                  {isDeadlocked && (
                     <div className="absolute inset-0 bg-red-500/10 rounded-md pointer-events-none" />
                  )}
                </motion.button>
              </div>
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

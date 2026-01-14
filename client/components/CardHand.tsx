
import React from 'react';
import { Player } from '../types';
import { AnimatePresence } from 'framer-motion';
import { DraggableCard } from './DraggableCard';

interface CardHandProps {
  player: Player;
  selectedCardId: string | null;
  shakingCardId: string | null;
  isDeadlocked: boolean;
  onCardSelect: (cardId: string) => void;
  // Drag Hooks
  onDragStart: () => void;
  onDragEnd: () => void;
  onHoverBurnZone: (isHovering: boolean) => void;
  onBurnCard: (cardId: string) => void;
}

export const CardHand: React.FC<CardHandProps> = ({ 
  player, 
  selectedCardId, 
  shakingCardId,
  isDeadlocked,
  onCardSelect,
  onDragStart,
  onDragEnd,
  onHoverBurnZone,
  onBurnCard
}) => {

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent flex justify-center items-end gap-3 z-50 pointer-events-none">
      <div className={`
        pointer-events-auto bg-slate-800/90 px-8 py-4 rounded-t-2xl backdrop-blur-md border-t border-slate-600 shadow-2xl flex flex-col items-center transition-all duration-500
        ${isDeadlocked ? 'ring-4 ring-red-500/50 shadow-[0_0_50px_rgba(239,68,68,0.4)]' : ''}
      `}>
        {isDeadlocked && (
          <div className="text-sm font-bold mb-2 uppercase tracking-widest flex items-center gap-2 text-red-400 animate-pulse">
             <span>⚠️</span>
             Stuck! Drag card to burn 🔥
          </div>
        )}
        
        <div className="flex -space-x-4 hover:space-x-2 transition-all duration-300">
          <AnimatePresence mode='popLayout'>
            {player.hand.map((card) => (
              <DraggableCard
                key={card.id}
                card={card}
                isSelected={selectedCardId === card.id}
                isShaking={shakingCardId === card.id}
                isDeadlocked={isDeadlocked}
                onSelect={onCardSelect}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onHoverBurnZone={onHoverBurnZone}
                onBurn={onBurnCard}
              />
            ))}
          </AnimatePresence>
          
          {player.hand.length === 0 && (
             <div className="text-slate-400 italic py-8 px-4">Waiting for next round...</div>
          )}
        </div>
      </div>
    </div>
  );
};

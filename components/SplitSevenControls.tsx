
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { GameState } from '../types';
import { calculateValidMoves } from '../services/moveEngine';

interface SplitSevenControlsProps {
  gameState: GameState;
  onSelectSteps: (steps: number) => void;
}

export const SplitSevenControls: React.FC<SplitSevenControlsProps> = ({ gameState, onSelectSteps }) => {
  const player = gameState.players[gameState.currentPlayerIndex];
  const card = player.hand.find(c => c.id === gameState.selectedCardId);
  
  // Is this the first move or second?
  const isFirstLeg = gameState.split7State?.firstMoveUsed === null;
  const remaining = gameState.split7State?.remainingSteps || 0;

  // Calculate which buttons should be enabled
  const validStepCounts = useMemo(() => {
    if (!card || !isFirstLeg) return [];
    
    const valid = [];
    for (let i = 1; i <= 7; i++) {
       const moves = calculateValidMoves(gameState, player, card, null, i);
       if (moves.length > 0) valid.push(i);
    }
    return valid;
  }, [gameState, player, card, isFirstLeg]);

  if (!card) return null;

  return (
    <motion.div 
       initial={{ opacity: 0, y: 20 }}
       animate={{ opacity: 1, y: 0 }}
       exit={{ opacity: 0, y: 20 }}
       className="fixed bottom-40 left-1/2 -translate-x-1/2 z-[60] bg-slate-900/90 backdrop-blur-md border border-amber-500/30 p-4 rounded-2xl shadow-2xl flex flex-col items-center gap-3"
    >
       <div className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
          <span>✨</span>
          {isFirstLeg ? "Choose steps to move" : `Move remaining ${remaining} steps`}
       </div>
       
       {isFirstLeg ? (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((steps) => {
              const isPossible = validStepCounts.includes(steps);
              // Logic: You can select '7' to finish immediately.
              // Or select 1..6 to split.
              
              return (
                <button
                  key={steps}
                  onClick={() => isPossible && onSelectSteps(steps)}
                  disabled={!isPossible}
                  className={`
                    w-10 h-10 rounded-lg font-black text-lg transition-all flex items-center justify-center border-b-4 active:border-b-0 active:translate-y-1
                    ${isPossible 
                       ? 'bg-green-600 border-green-800 text-white hover:bg-green-500' 
                       : 'bg-slate-700 border-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                    }
                  `}
                >
                  {steps}
                </button>
              );
            })}
          </div>
       ) : (
          <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg text-amber-400 font-mono text-sm">
             Select a marble to move {remaining} steps...
          </div>
       )}
    </motion.div>
  );
};

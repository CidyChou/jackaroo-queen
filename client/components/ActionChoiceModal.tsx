
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ActionChoiceModalProps {
  isVisible: boolean;
  variant?: 'TEN' | 'RED_Q';
  onOptionMove?: () => void;
  onOptionAttack: () => void;
  onCancel?: () => void; // Kept for prop compatibility
}

export const ActionChoiceModal: React.FC<ActionChoiceModalProps> = ({ 
  isVisible, 
  variant = 'TEN',
  onOptionMove, 
  onOptionAttack
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.9, x: "-50%" }}
          animate={{ y: 0, opacity: 1, scale: 1, x: "-50%" }}
          exit={{ y: 20, opacity: 0, scale: 0.9, x: "-50%" }}
          className="fixed bottom-40 left-1/2 z-[70] flex items-center justify-center pointer-events-auto"
        >
           <div className="bg-slate-900/90 backdrop-blur-md border border-amber-500/30 p-2 rounded-full shadow-2xl flex items-center gap-3 px-4">
              
              {/* Variant 10: Show Move Option */}
              {variant === 'TEN' && onOptionMove && (
                <button
                  onClick={onOptionMove}
                  className="bg-slate-700 hover:bg-slate-600 active:scale-95 text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-lg transition-all border border-slate-500/50 flex items-center gap-2 whitespace-nowrap group"
                >
                  <span className="group-hover:-translate-x-1 transition-transform">👣</span> 
                  <span>Move 10</span>
                </button>
              )}

              {/* Attack Option (Common to both) */}
              <button
                onClick={onOptionAttack}
                className="bg-red-600 hover:bg-red-500 active:scale-95 text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-lg transition-all border border-red-400/50 flex items-center gap-2 whitespace-nowrap animate-pulse"
              >
                <span>⚔️</span>
                <span>{variant === 'TEN' ? 'Force Discard' : 'Confirm Attack'}</span>
              </button>
           </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

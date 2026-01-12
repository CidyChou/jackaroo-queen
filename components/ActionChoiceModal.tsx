
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ActionChoiceModalProps {
  isVisible: boolean;
  onOptionMove: () => void;
  onOptionAttack: () => void;
}

export const ActionChoiceModal: React.FC<ActionChoiceModalProps> = ({ 
  isVisible, 
  onOptionMove, 
  onOptionAttack 
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pb-40 pointer-events-none">
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="pointer-events-auto bg-slate-900/95 p-6 rounded-2xl border border-amber-500/30 backdrop-blur-xl shadow-2xl flex flex-col items-center gap-4 max-w-sm mx-4"
          >
            <div className="text-center">
              <h3 className="text-xl font-black text-amber-500 uppercase tracking-widest mb-1">Card 10 Selected</h3>
              <p className="text-slate-300 text-sm">Choose your action:</p>
            </div>

            <div className="flex gap-4 w-full">
              <button
                onClick={onOptionMove}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-transform active:scale-95 flex flex-col items-center gap-1 border border-slate-600 hover:border-slate-500"
              >
                <span className="text-2xl">👣</span>
                <span className="text-sm">Move 10</span>
              </button>

              <button
                onClick={onOptionAttack}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-transform active:scale-95 flex flex-col items-center gap-1 border border-red-400 hover:border-red-300 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                <span className="text-2xl group-hover:scale-125 transition-transform">⚔️</span>
                <span className="text-sm whitespace-nowrap">Force Discard</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

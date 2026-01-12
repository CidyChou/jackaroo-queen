
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BurnNotificationProps {
  cardRank?: string | null; // If a card is selected to burn
  onBurn: () => void;
  isVisible: boolean;
}

export const BurnNotification: React.FC<BurnNotificationProps> = ({ cardRank, onBurn, isVisible }) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 50, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.95 }}
          className={`absolute bottom-40 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 backdrop-blur-md border pl-5 pr-2 py-2 rounded-full shadow-2xl transition-colors duration-300
            ${cardRank 
              ? 'bg-red-900/90 border-red-500/50 shadow-red-900/50' 
              : 'bg-slate-900/80 border-slate-700/50 shadow-black/50'
            }
          `}
        >
          <div className="flex items-center gap-3">
            <span className={`text-xl ${!cardRank ? 'animate-pulse grayscale' : ''}`}>🔥</span>
            <div className="flex flex-col">
              <span className={`font-bold text-sm whitespace-nowrap ${cardRank ? 'text-white' : 'text-slate-300'}`}>
                {cardRank ? `Discard ${cardRank}?` : "No Moves Available"}
              </span>
              {!cardRank && (
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Select a card to discard
                </span>
              )}
            </div>
          </div>

          {cardRank && (
            <motion.button
              initial={{ width: 0, opacity: 0, scale: 0.5 }}
              animate={{ width: 'auto', opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onBurn}
              className="ml-2 bg-red-600 hover:bg-red-500 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg border border-red-400/30 whitespace-nowrap flex items-center gap-2"
            >
              <span>Confirm Burn</span>
              <span>🔥</span>
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

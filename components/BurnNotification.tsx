
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
          className="absolute bottom-40 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-slate-900/80 backdrop-blur-md border border-red-500/30 text-white pl-5 pr-2 py-2 rounded-full shadow-2xl shadow-red-900/40"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl animate-pulse">🔥</span>
            <div className="flex flex-col">
              <span className="font-bold text-sm text-red-100 whitespace-nowrap">
                {cardRank ? `Burn ${cardRank} to skip?` : "No Moves Available"}
              </span>
              {!cardRank && (
                <span className="text-[10px] text-red-300 uppercase tracking-wider font-semibold">
                  Select card to burn
                </span>
              )}
            </div>
          </div>

          {cardRank && (
            <motion.button
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              onClick={onBurn}
              className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white text-sm font-bold px-5 py-2 rounded-full transition-all shadow-lg border border-red-400/30 whitespace-nowrap"
            >
              Confirm Burn
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

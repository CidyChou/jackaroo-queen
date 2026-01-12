
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BurnZoneProps {
  isVisible: boolean; // True when user is dragging a card
  isHovered: boolean; // True when card is over the zone
  hasSelectedCard: boolean; // True when a card is selected (for click mode)
  onClick: () => void; // Click handler
}

export const BurnZone: React.FC<BurnZoneProps> = ({ isVisible, isHovered, hasSelectedCard, onClick }) => {
  // Show if dragging (drop mode) OR if card selected (click mode)
  const shouldShow = isVisible || hasSelectedCard;
  
  // Mode detection
  const isDropMode = isVisible;
  const isClickMode = !isVisible && hasSelectedCard;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.button
          initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
          animate={{ 
            opacity: 1, 
            scale: (isHovered || isClickMode) ? 1.1 : 1, 
            rotate: 0 
          }}
          exit={{ opacity: 0, scale: 0.5, rotate: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          onClick={isClickMode ? onClick : undefined}
          className={`fixed top-6 right-6 z-40 w-24 h-24 rounded-full flex flex-col items-center justify-center border-4 shadow-2xl backdrop-blur-sm transition-colors duration-200 pointer-events-auto
            ${(isHovered || isClickMode)
              ? 'bg-red-600/90 border-red-400 text-white shadow-red-500/50 cursor-pointer' 
              : 'bg-slate-900/60 border-slate-600/50 text-slate-400 border-dashed cursor-default'
            }
          `}
        >
          <motion.div
            animate={{ scale: (isHovered || isClickMode) ? 1.2 : 1 }}
            className="text-3xl mb-1"
          >
            {(isHovered || isClickMode) ? '🔥' : '🗑️'}
          </motion.div>
          
          <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight px-2">
            {isDropMode && (isHovered ? 'Drop!' : 'Burn')}
            {isClickMode && "Burn Selected"}
          </span>
          
          {/* Pulse effect for Click Mode */}
          {isClickMode && (
            <motion.div
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: 1.3, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="absolute inset-0 rounded-full bg-red-500 z-[-1]"
            />
          )}

          {/* Pulse effect for Hover Drop */}
          {isHovered && isDropMode && (
            <motion.div
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="absolute inset-0 rounded-full bg-red-500 z-[-1]"
            />
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
};

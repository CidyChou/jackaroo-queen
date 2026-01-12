
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BurnZoneProps {
  isVisible: boolean; // True when user is dragging a card
  isHovered: boolean; // True when card is over the zone
}

export const BurnZone: React.FC<BurnZoneProps> = ({ isVisible, isHovered }) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
          animate={{ 
            opacity: 1, 
            scale: isHovered ? 1.2 : 1, 
            rotate: 0 
          }}
          exit={{ opacity: 0, scale: 0.5, rotate: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className={`fixed top-6 right-6 z-40 w-24 h-24 rounded-full flex flex-col items-center justify-center border-4 shadow-2xl backdrop-blur-sm transition-colors duration-200
            ${isHovered 
              ? 'bg-red-600/90 border-red-400 text-white shadow-red-500/50' 
              : 'bg-slate-900/60 border-slate-600/50 text-slate-400 border-dashed'
            }
          `}
        >
          <motion.div
            animate={{ scale: isHovered ? 1.2 : 1 }}
            className="text-3xl mb-1"
          >
            {isHovered ? '🔥' : '🗑️'}
          </motion.div>
          <span className="text-[10px] font-bold uppercase tracking-wider">
            {isHovered ? 'Drop!' : 'Burn'}
          </span>
          
          {/* Pulse effect when hovered */}
          {isHovered && (
            <motion.div
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="absolute inset-0 rounded-full bg-red-500 z-[-1]"
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

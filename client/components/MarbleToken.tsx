
import React from 'react';
import { PlayerColor } from '../types';
import { MARBLE_COLORS } from '../services/layoutService';
import { motion } from 'framer-motion';

interface MarbleTokenProps {
  id: string;
  color: PlayerColor;
  x: number;
  y: number;
  isSelected: boolean;
  isClickable: boolean;
  onClick: () => void;
}

export const MarbleToken: React.FC<MarbleTokenProps> = ({ 
  id, color, x, y, isSelected, isClickable, onClick 
}) => {
  return (
    <motion.div
      className={`absolute w-5 h-5 rounded-full shadow-md border-2 z-20 cursor-pointer
        ${MARBLE_COLORS[color]}
        ${isSelected ? 'ring-4 ring-white z-30' : ''}
        ${isClickable && !isSelected ? 'hover:scale-110 hover:brightness-110 ring-2 ring-white/50' : ''}
        ${!isClickable && !isSelected ? 'opacity-90' : ''}
      `}
      // We explicitly animate left and top for smooth travel across the board
      animate={{ 
        left: `${x}%`,
        top: `${y}%`,
        scale: isSelected ? 1.3 : 1
      }}
      style={{
        marginLeft: '-10px', // Center alignment offset (half width)
        marginTop: '-10px',  // Center alignment offset (half height)
      }}
      transition={{ 
        type: "spring", 
        stiffness: 180, 
        damping: 25,
        mass: 1 
      }}
      onClick={(e) => {
        if (isClickable || isSelected) {
          e.stopPropagation();
          onClick();
        }
      }}
    >
      {/* Glossy reflection effect */}
      <div className="absolute top-1 left-1 w-1.5 h-1.5 bg-white rounded-full opacity-40"></div>
    </motion.div>
  );
};

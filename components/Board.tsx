
import React, { useMemo } from 'react';
import { GameState, Marble } from '../types';
import { COORDINATES, Coordinate } from '../services/coordinates';
import { MarbleToken } from './MarbleToken';

interface BoardProps {
  gameState: GameState;
  onMarbleClick: (marbleId: string) => void;
  onNodeClick: (nodeId: string) => void;
}

export const Board: React.FC<BoardProps> = ({ gameState, onMarbleClick, onNodeClick }) => {
  const coordinates = COORDINATES;

  // Helpers to determine visual state
  const getHighlightState = (nodeId: string) => {
    // Is this node a valid destination for the selected marble?
    const move = gameState.possibleMoves.find(m => m.targetPosition === nodeId);
    if (move) return 'destination';
    return 'none';
  };

  const isMarbleSelectable = (marbleId: string) => {
    if (!gameState.selectedCardId) return false;
    
    // 1. Is it currently selected?
    if (gameState.selectedMarbleId === marbleId) return true;
    
    // 2. Is it a valid source marble? (Standard move)
    if (gameState.possibleMoves.some(m => m.marbleId === marbleId)) return true;

    // 3. Is it a valid Swap Target? (Black Jack)
    // If we have selected OUR marble, we need to check if this marble is a target
    if (gameState.selectedMarbleId) {
       if (gameState.possibleMoves.some(m => m.swapTargetMarbleId === marbleId)) return true;
    }
    
    return false;
  };

  return (
    <div 
      className="relative w-full h-full rounded-full shadow-2xl border-[8px] sm:border-[12px] border-amber-900 overflow-hidden bg-amber-800"
      style={{ aspectRatio: '1/1' }} // Force aspect ratio inline for safety
    >
      
      {/* --- Background Layer --- */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,_var(--tw-gradient-stops))] from-amber-700 via-amber-800 to-amber-950 opacity-90"></div>
      
      {/* Wood Texture Pattern Overlay - using a reliable CSS gradient fallback if image fails */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" 
           style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px)' }}>
      </div>

      {/* Decorative Center Ring */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[22%] h-[22%] rounded-full border-4 border-amber-900/40 bg-black/20 backdrop-blur-sm z-0"></div>
      
      {/* --- Board Slots Layer --- */}
      {Object.entries(coordinates).map(([nodeId, pos]) => {
        const highlight = getHighlightState(nodeId);
        const isBase = nodeId.includes('base');
        
        // Dynamic styling
        let slotColor = 'bg-amber-950/40 shadow-inner'; 
        let sizeClass = 'w-3 h-3 sm:w-4 sm:h-4'; // Responsive sizing

        if (isBase) {
           sizeClass = 'w-4 h-4 sm:w-5 sm:h-5';
           slotColor = 'bg-black/30'; 
        }
        
        // Color code zones
        if (nodeId === 'node_0' || nodeId.includes('home_red')) slotColor = 'bg-red-900/40 border border-red-900/50';
        if (nodeId === 'node_13' || nodeId.includes('home_blue')) slotColor = 'bg-blue-900/40 border border-blue-900/50';
        if (nodeId === 'node_26' || nodeId.includes('home_yellow')) slotColor = 'bg-yellow-900/40 border border-yellow-900/50';
        if (nodeId === 'node_39' || nodeId.includes('home_green')) slotColor = 'bg-green-900/40 border border-green-900/50';

        if (highlight === 'destination') {
           slotColor = 'bg-green-400/60 shadow-[0_0_15px_rgba(74,222,128,0.8)] scale-150 z-10 animate-pulse border-white';
        }

        return (
          <div
            key={nodeId}
            onClick={() => highlight === 'destination' && onNodeClick(nodeId)}
            className={`absolute rounded-full transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 cursor-default border border-transparent
              ${sizeClass}
              ${slotColor}
              ${highlight === 'destination' ? 'cursor-pointer' : ''}
            `}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          />
        );
      })}

      {/* --- Marbles Layer --- */}
      {Object.values(gameState.marbles).map((marble: Marble) => {
        let pos: Coordinate = { x: 50, y: 50 };
        
        if (marble.position === 'BASE') {
          const baseNodeId = `base_${marble.color}_${marble.id.split('_')[2]}`;
          pos = coordinates[baseNodeId] || { x: 50, y: 50 };
        } else if (marble.position === 'HOME') {
           pos = coordinates[`home_${marble.color}_4`] || { x: 50, y: 50 };
        } else {
           pos = coordinates[marble.position] || { x: 50, y: 50 };
        }

        // Logic for making opponent marbles clickable during swap
        const selectable = isMarbleSelectable(marble.id);
        const isSwapTarget = gameState.possibleMoves.some(m => m.swapTargetMarbleId === marble.id);

        return (
          <MarbleToken
            key={marble.id}
            id={marble.id}
            color={marble.color}
            x={pos.x}
            y={pos.y}
            isSelected={gameState.selectedMarbleId === marble.id}
            isClickable={selectable}
            onClick={() => onMarbleClick(marble.id)}
          />
        );
      })}
      
      {/* Center Logo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-900/20 font-black text-6xl sm:text-8xl select-none pointer-events-none tracking-tighter z-0">
        JK
      </div>
    </div>
  );
};

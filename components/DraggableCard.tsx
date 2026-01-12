
import React, { useState } from 'react';
import { Card } from '../types';
import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence, TargetAndTransition } from 'framer-motion';

interface DraggableCardProps {
  card: Card;
  isSelected: boolean;
  isShaking: boolean;
  isDeadlocked: boolean;
  onSelect: (cardId: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onHoverBurnZone: (isHovering: boolean) => void;
  onBurn: (cardId: string) => void;
}

const DraggableCardComponent: React.FC<DraggableCardProps> = ({
  card, isSelected, isShaking, isDeadlocked,
  onSelect, onDragStart, onDragEnd, onHoverBurnZone, onBurn
}) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  
  // 1. Local State Setup: 'idle' vs 'burning'
  const [burnStage, setBurnStage] = useState<'idle' | 'burning'>('idle');

  // Helpers for visual style
  const getSuitColor = (suit: string) => 
    (suit === 'hearts' || suit === 'diamonds') ? 'text-red-600' : 'text-slate-900';

  const getSuitIcon = (suit: string) => {
    switch(suit) {
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
      case 'spades': return '♠';
      default: return '';
    }
  };

  const handleDragStart = () => {
    onDragStart(); 
  };

  const handleDrag = (_: any, info: PanInfo) => {
     if (burnStage === 'burning') return;
     const isOverZone = info.point.x > window.innerWidth - 120 && info.point.y < 150;
     onHoverBurnZone(isOverZone);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    const isOverZone = info.point.x > window.innerWidth - 120 && info.point.y < 150;
    
    // Always notify parent drag ended (to hide zone UI)
    onDragEnd();
    onHoverBurnZone(false);
    
    if (isOverZone) {
      // 2. Trigger Burn Sequence (Pause -> Fade -> Remove)
      setBurnStage('burning');
    }
  };

  // Logic to determine animation state
  const getAnimation = (): TargetAndTransition => {
    // 3. Define Animation Variants
    if (burnStage === 'burning') {
      return { 
        opacity: 0, 
        scale: 0.9,
        // Crucial: Lock to current drag position to prevent snap-back
        // We read the current MotionValue to freeze it in place
        x: x.get(),
        y: y.get(),
        rotate: rotate.get(),
        transition: { 
            delay: 0.2, // The Pause
            duration: 0.2, // The Slow Fade
            ease: "easeInOut"
        }
      };
    }

    if (isShaking) {
      return { x: [-5, 5, -5, 5, 0], y: 0 };
    }

    return { 
        y: isSelected ? -30 : 0, 
        x: 0, // Reset X if not burning (snap to center)
        scale: isSelected ? 1.1 : 1,
        border: isSelected ? '2px solid #facc15' : '2px solid #cbd5e1',
        opacity: 1
    };
  };

  return (
    <motion.div
      // NOTE: 'layout' prop removed to prevent drag interruption during parent re-renders
      initial={{ scale: 0.8, opacity: 0, y: 50 }}
      animate={{ 
        scale: 1, 
        opacity: 1, 
        y: 0,
        zIndex: isSelected ? 20 : 1 
      }}
      exit={{ scale: 0, opacity: 0, y: -50, rotate: 20, transition: { duration: 0.3 } }}
      className="relative"
    >
      {/* Tooltip for Shake */}
      <AnimatePresence>
        {isShaking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap pointer-events-none"
          >
            Can't Move
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        // Disable drag logic once burning starts
        drag={burnStage === 'idle'} 
        dragConstraints={{ top: -1000, left: -1000, right: 1000, bottom: 500 }}
        dragElastic={0.1}
        // Disable snap-back when burning (so it stays in the zone)
        dragSnapToOrigin={burnStage === 'idle'} 
        
        // Interaction Handlers
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        onClick={() => burnStage === 'idle' && onSelect(card.id)}

        // Bind physics
        style={{ transformOrigin: 'center', x, y, rotate }} 
        
        // Apply Dynamic Animation
        animate={getAnimation()}
        
        // 4. The Final Trigger: Remove from game only after fade completes
        onAnimationComplete={() => {
            if (burnStage === 'burning') {
                onBurn(card.id);
            }
        }}
        
        whileDrag={{ 
            scale: 1.1, 
            zIndex: 100, 
            cursor: 'grabbing',
            boxShadow: "0px 20px 40px rgba(0,0,0,0.4)"
        }}
        whileHover={burnStage === 'idle' ? { 
            y: isSelected ? -35 : -10, 
            scale: isSelected ? 1.15 : 1.05,
            zIndex: 30
        } : {}}
        transition={{ duration: 0.2 }}

        className={`
          relative w-20 h-32 rounded-lg bg-slate-100 shadow-xl
          flex flex-col items-center justify-center cursor-grab active:cursor-grabbing
          ${isDeadlocked && !isSelected ? 'opacity-80' : ''}
        `}
      >
        <span className={`text-2xl font-bold ${getSuitColor(card.suit)}`}>{card.rank}</span>
        <span className={`text-4xl ${getSuitColor(card.suit)}`}>{getSuitIcon(card.suit)}</span>
        
        {/* Mini index */}
        <span className={`absolute top-1 left-1 text-xs font-bold ${getSuitColor(card.suit)}`}>{card.rank}</span>
        <span className={`absolute bottom-1 right-1 text-xs font-bold ${getSuitColor(card.suit)} rotate-180`}>{card.rank}</span>
        
        {isDeadlocked && (
            <div className="absolute inset-0 bg-red-500/10 rounded-md pointer-events-none" />
        )}
      </motion.button>
    </motion.div>
  );
};

export const DraggableCard = React.memo(DraggableCardComponent);

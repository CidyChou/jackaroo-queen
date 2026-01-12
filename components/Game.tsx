
import React, { useReducer, useEffect, useState, useMemo } from 'react';
import { createInitialState, enhancedGameReducer } from '../services/gameLogic';
import { calculateValidMoves } from '../services/moveEngine';
import { Board } from './Board';
import { CardHand } from './CardHand';
import { BurnNotification } from './BurnNotification';
import { BurnZone } from './BurnZone'; // Import BurnZone
import { ActionChoiceModal } from './ActionChoiceModal'; // Import Modal
import { AnimatePresence, motion } from 'framer-motion';
import { getBestMove } from '../services/BotLogic';

interface GameProps {
  playerCount: number;
  onExit: () => void;
}

export const Game: React.FC<GameProps> = ({ playerCount, onExit }) => {
  const [gameState, dispatch] = useReducer(enhancedGameReducer, playerCount, createInitialState);
  
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // UX States
  const [shakingCardId, setShakingCardId] = useState<string | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [isHoveringBurn, setIsHoveringBurn] = useState(false);

  // --- Logic: Detect Deadlock (Scenario B) ---
  const isDeadlocked = useMemo(() => {
    if (currentPlayer.isBot) return false;
    // Don't flag deadlocks if we are in the middle of a specific decision
    if (gameState.phase !== 'PLAYER_INPUT' && gameState.phase !== 'TURN_START' && gameState.phase !== 'OPPONENT_DISCARD') return false;
    
    // If being attacked, you MUST burn, so not deadlocked in the traditional sense
    if (gameState.phase === 'OPPONENT_DISCARD') return true; // Reusing deadlock UI for "Must Burn" state

    const hasAnyMove = currentPlayer.hand.some(card => {
       const moves = calculateValidMoves(gameState, currentPlayer, card, null);
       return moves.length > 0;
    });

    return !hasAnyMove;
  }, [
    currentPlayer.isBot, 
    currentPlayer.hand, 
    gameState.phase, 
    gameState.marbles, 
    gameState.currentRound,
    gameState.currentPlayerIndex 
  ]);

  // --- Bot Turn Logic ---
  useEffect(() => {
    if (!currentPlayer.isBot) return;

    let isCancelled = false;

    const executeBotTurn = async () => {
       // 1. Bot is Victim Logic (Under Attack)
       if (gameState.phase === 'OPPONENT_DISCARD') {
          setToastMessage("Bot Discarding...");
          await new Promise(r => setTimeout(r, 1500));
          if (isCancelled) return;
          
          // Bot randomly picks a card to burn
          if (currentPlayer.hand.length > 0) {
             const randomCard = currentPlayer.hand[Math.floor(Math.random() * currentPlayer.hand.length)];
             dispatch({ type: 'SELECT_CARD', cardId: randomCard.id });
             await new Promise(r => setTimeout(r, 500));
             dispatch({ type: 'BURN_CARD' });
             setToastMessage("Turn Returned!");
          } else {
             // Empty hand, just resolve
             dispatch({ type: 'BURN_CARD' }); 
          }
          return;
       }

       // 2. Normal Bot Turn
       if (gameState.phase !== 'TURN_START') return;
       
       await new Promise(r => setTimeout(r, 1200));
       if (isCancelled) return;

       const decision = getBestMove(gameState, currentPlayer);

       if (decision.action === 'BURN') {
          dispatch({ type: 'SELECT_CARD', cardId: decision.cardId });
          setToastMessage("CPU Burning Card...");
          await new Promise(r => setTimeout(r, 1000));
          dispatch({ type: 'BURN_CARD' });
       } else if (decision.action === 'MOVE' && decision.move) {
          dispatch({ type: 'SELECT_CARD', cardId: decision.cardId });
          await new Promise(r => setTimeout(r, 600)); 
          
          if (decision.move.type === 'force_discard') {
             // Bot chose attack
             dispatch({ type: 'CONFIRM_MOVE' }); // This triggers the attack phase in reducer
          } else {
             // Standard move
             dispatch({ type: 'SELECT_MARBLE', marbleId: decision.move.marbleId! });
             
             if (decision.move.targetPosition) {
                dispatch({ type: 'SELECT_TARGET_NODE', nodeId: decision.move.targetPosition });
             } else {
                dispatch({ type: 'CONFIRM_MOVE' });
             }
          }
       }
    };

    executeBotTurn();
    return () => { isCancelled = true; };
  }, [currentPlayer, gameState.phase, gameState.currentRound]);

  // --- Turn Resolution ---
  useEffect(() => {
    if (gameState.phase === 'RESOLVING_MOVE') {
      const timer = setTimeout(() => {
        dispatch({ type: 'RESOLVE_TURN' });
        setToastMessage(null);
      }, 1000); 
      return () => clearTimeout(timer);
    }
  }, [gameState.phase]);

  // --- Handlers ---

  const handleCardSelect = (cardId: string) => {
    if (currentPlayer.isBot) return;

    // Toggle Selection
    if (gameState.selectedCardId === cardId) {
      dispatch({ type: 'CANCEL_SELECTION' });
      return;
    }

    // 1. If Deadlocked OR Attacked, we are selecting a card to BURN.
    if (isDeadlocked || gameState.phase === 'OPPONENT_DISCARD') {
      dispatch({ type: 'SELECT_CARD', cardId });
      return;
    }

    // 2. If Normal Play
    const card = currentPlayer.hand.find(c => c.id === cardId);
    if (!card) return;

    // Note: If card is 10, Reducer will set phase to DECIDING_10
    
    // Check validity for non-10 cards purely for shaking effect
    // For 10, we let it select regardless
    if (card.rank !== '10') {
        const moves = calculateValidMoves(gameState, currentPlayer, card, null);
        if (moves.length === 0) {
            setShakingCardId(cardId);
            setTimeout(() => setShakingCardId(null), 600);
        } else {
            dispatch({ type: 'SELECT_CARD', cardId });
        }
    } else {
        // Always select 10 to trigger modal
        dispatch({ type: 'SELECT_CARD', cardId });
    }
  };

  const handleManualBurn = (cardId: string) => {
    dispatch({ type: 'SELECT_CARD', cardId });
    dispatch({ type: 'BURN_CARD' });
    setToastMessage(gameState.phase === 'OPPONENT_DISCARD' ? "Surrendered!" : "Card Burned 🔥");
    setTimeout(() => setToastMessage(null), 1500);
  };

  const handleMarbleClick = (marbleId: string) => {
    if (currentPlayer.isBot) return; 
    if (gameState.phase !== 'PLAYER_INPUT') return;
    dispatch({ type: 'SELECT_MARBLE', marbleId });
  };

  const handleNodeClick = (nodeId: string) => {
    if (currentPlayer.isBot) return; 
    if (gameState.phase !== 'PLAYER_INPUT') return;
    dispatch({ type: 'SELECT_TARGET_NODE', nodeId });
  };

  const selectedCard = currentPlayer.hand.find(c => c.id === gameState.selectedCardId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden relative selection:bg-amber-500/30">
      
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black z-0 pointer-events-none"></div>

      {/* Burn Zone */}
      <BurnZone 
        isVisible={isDraggingCard} 
        isHovered={isHoveringBurn} 
        hasSelectedCard={!!gameState.selectedCardId && !currentPlayer.isBot}
        onClick={() => {
           if (gameState.selectedCardId) {
             handleManualBurn(gameState.selectedCardId);
           }
        }}
      />
      
      {/* 10 Decision Modal */}
      <ActionChoiceModal 
        isVisible={gameState.phase === 'DECIDING_10' && !currentPlayer.isBot}
        onOptionMove={() => dispatch({ type: 'RESOLVE_10_DECISION', choice: 'MOVE' })}
        onOptionAttack={() => dispatch({ type: 'RESOLVE_10_DECISION', choice: 'ATTACK' })}
      />

      {/* Attack Banner (When waiting for opponent or when being attacked) */}
      <AnimatePresence>
        {gameState.phase === 'OPPONENT_DISCARD' && (
           <motion.div
             initial={{ y: -100, opacity: 0 }}
             animate={{ y: 0, opacity: 1 }}
             exit={{ y: -100, opacity: 0 }}
             className="absolute top-24 left-0 right-0 z-30 flex justify-center pointer-events-none"
           >
             <div className="bg-red-600/90 text-white font-black px-8 py-4 rounded-xl shadow-2xl border-2 border-red-400 backdrop-blur text-xl uppercase tracking-widest flex items-center gap-4 animate-pulse">
               <span className="text-3xl">⚔️</span>
               {currentPlayer.isBot ? "WAITING FOR OPPONENT DISCARD..." : "YOU ARE ATTACKED! DISCARD A CARD!"}
               <span className="text-3xl">⚔️</span>
             </div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* Header / HUD */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none z-10">
        <div className="pointer-events-auto">
          <button 
            onClick={onExit}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-2 group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span> Exit Match
          </button>

          <h1 className="text-3xl font-black text-amber-500 drop-shadow-lg tracking-wider">JACKAROO</h1>
          <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 mt-2 flex items-center gap-4">
             <div className="text-sm text-slate-400">Round <span className="text-white font-bold text-lg">{gameState.currentRound}</span></div>
             
             <div className={`px-3 py-1 rounded font-bold text-sm uppercase transition-colors duration-300 flex items-center gap-2
               ${currentPlayer.isBot ? 'bg-yellow-900/50 text-yellow-200' : 'bg-green-900/50 text-green-200'}
             `}>
                {currentPlayer.isBot ? (
                  <>
                    <span className="w-2 h-2 bg-yellow-400 rounded-full animate-ping"></span>
                    Thinking
                  </>
                ) : (
                  <>
                     <span className="text-lg">🫵</span> YOUR TURN
                  </>
                )}
             </div>
          </div>
        </div>
        
        {/* Game Log */}
        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700 w-72 pointer-events-auto max-h-48 overflow-auto shadow-2xl backdrop-blur-sm hidden sm:block">
           <h3 className="text-xs uppercase text-slate-500 font-bold mb-2 tracking-widest border-b border-white/10 pb-1">Battle Log</h3>
           <div className="flex flex-col-reverse gap-1">
             {gameState.lastActionLog.map((log, i) => (
               <motion.div 
                 initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} 
                 key={gameState.lastActionLog.length - 1 - i} 
                 className="text-xs text-slate-300 py-1"
               >
                 <span className="text-amber-500 mr-2">➤</span> {log}
               </motion.div>
             ))}
           </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex items-center justify-center p-4 lg:p-10 relative z-0">
        <div className="relative w-full max-w-[650px] aspect-square">
          <Board 
            gameState={gameState} 
            onMarbleClick={handleMarbleClick}
            onNodeClick={handleNodeClick}
          />

          <AnimatePresence>
            {toastMessage && (
               <motion.div
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0 }}
                 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-black/80 backdrop-blur px-6 py-3 rounded-full border border-white/20 text-white font-bold shadow-2xl"
               >
                 {toastMessage}
               </motion.div>
            )}
          </AnimatePresence>

          {/* Burn Notification for deadlock or attack */}
          <BurnNotification 
            isVisible={(isDeadlocked || gameState.phase === 'OPPONENT_DISCARD') && !isDraggingCard}
            cardRank={selectedCard?.rank}
            onBurn={() => dispatch({ type: 'BURN_CARD' })}
          />
        </div>
      </div>

      {/* Footer / Hand */}
      <div className={`transition-opacity duration-500 ${currentPlayer.isBot ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
        <CardHand 
          player={currentPlayer} 
          selectedCardId={gameState.selectedCardId}
          shakingCardId={shakingCardId}
          isDeadlocked={isDeadlocked || gameState.phase === 'OPPONENT_DISCARD'}
          onCardSelect={handleCardSelect}
          // Drag Props
          onDragStart={() => {
            setIsDraggingCard(true);
            if (gameState.selectedCardId) {
               dispatch({ type: 'CANCEL_SELECTION' });
            }
          }}
          onDragEnd={() => setIsDraggingCard(false)}
          onHoverBurnZone={setIsHoveringBurn}
          onBurnCard={handleManualBurn}
        />
      </div>
    </div>
  );
};

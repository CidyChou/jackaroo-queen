
import React, { useReducer, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createInitialState, enhancedGameReducer } from '../services/gameLogic';
import { calculateValidMoves } from '../services/moveEngine';
import { Board } from './Board';
import { CardHand } from './CardHand';
import { BurnNotification } from './BurnNotification';
import { BurnZone } from './BurnZone'; 
import { ActionChoiceModal } from './ActionChoiceModal'; 
import { SplitSevenControls } from './SplitSevenControls';
import { ActionLog } from './ActionLog'; // Import
import { AnimatePresence, motion } from 'framer-motion';
import { getBestMove } from '../services/BotLogic';

interface GameProps {
  playerCount: number;
  onExit: () => void;
}

// Constants
const TURN_TIME_LIMIT = 15; // seconds

export const Game: React.FC<GameProps> = ({ playerCount, onExit }) => {
  const [gameState, dispatch] = useReducer(enhancedGameReducer, playerCount, createInitialState);
  
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // UX States
  const [shakingCardId, setShakingCardId] = useState<string | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [isHoveringBurn, setIsHoveringBurn] = useState(false);
  
  // Turn timer and auto mode (for human player only)
  const [turnTimeRemaining, setTurnTimeRemaining] = useState<number>(TURN_TIME_LIMIT);
  const [isInAutoMode, setIsInAutoMode] = useState(false);
  const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnStartRef = useRef<number>(Date.now());

  // --- Logic: Detect Deadlock (Scenario B) ---
  const isDeadlocked = useMemo(() => {
    if (currentPlayer.isBot) return false;
    if (gameState.phase !== 'PLAYER_INPUT' && gameState.phase !== 'TURN_START' && gameState.phase !== 'OPPONENT_DISCARD') return false;
    
    if (gameState.phase === 'OPPONENT_DISCARD') return true; 

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

  // --- Logic: Check if "Move 10" is actually possible (for the Modal) ---
  const canPlayMove10 = useMemo(() => {
     if (gameState.phase !== 'DECIDING_10') return false;
     if (currentPlayer.isBot) return false;
     
     const card = currentPlayer.hand.find(c => c.id === gameState.selectedCardId);
     if (!card) return false;

     const moves = calculateValidMoves(gameState, currentPlayer, card, null);
     return moves.some(m => m.type !== 'force_discard');
  }, [gameState, currentPlayer]);

  // --- Turn Timer Logic for Human Player ---
  const startTurnTimer = useCallback(() => {
    // Clear existing timer
    if (turnTimerRef.current) {
      clearInterval(turnTimerRef.current);
    }
    
    // Reset timer
    turnStartRef.current = Date.now();
    setTurnTimeRemaining(TURN_TIME_LIMIT);
    
    // Start countdown
    turnTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - turnStartRef.current) / 1000);
      const remaining = Math.max(0, TURN_TIME_LIMIT - elapsed);
      setTurnTimeRemaining(remaining);
      
      if (remaining <= 0) {
        // Time's up - enter auto mode
        if (turnTimerRef.current) {
          clearInterval(turnTimerRef.current);
          turnTimerRef.current = null;
        }
        setIsInAutoMode(true);
        setToastMessage('⏱️ 超时！已进入托管模式');
        setTimeout(() => setToastMessage(null), 3000);
      }
    }, 1000);
  }, []);

  // Start timer when turn changes to human player, or execute auto play
  useEffect(() => {
    if (currentPlayer.isBot) return;
    
    // List of phases where we might need to take action
    const actionablePhases = ['TURN_START', 'PLAYER_INPUT', 'DECIDING_10', 'DECIDING_RED_Q', 'HANDLING_SPLIT_7', 'OPPONENT_DISCARD'];
    
    if (!actionablePhases.includes(gameState.phase)) {
      return;
    }

    // If human player is in auto mode, execute auto play
    if (isInAutoMode) {
      let isCancelled = false;
      
      const executeAutoPlay = async () => {
        await new Promise(r => setTimeout(r, 800));
        if (isCancelled) return;
        
        setToastMessage("🤖 托管出牌中...");
        
        // Handle special phases
        if (gameState.phase === 'DECIDING_10') {
          dispatch({ type: 'RESOLVE_10_DECISION', choice: 'ATTACK' });
          return;
        }
        
        if (gameState.phase === 'DECIDING_RED_Q') {
          dispatch({ type: 'RESOLVE_RED_Q_DECISION', choice: 'ATTACK' });
          return;
        }
        
        if (gameState.phase === 'HANDLING_SPLIT_7') {
          const card = currentPlayer.hand.find(c => c.id === gameState.selectedCardId);
          if (card) {
            const remainingSteps = gameState.split7State?.remainingSteps ?? 7;
            // Try to find valid moves with decreasing steps
            for (let steps = remainingSteps; steps >= 1; steps--) {
              const moves = calculateValidMoves(gameState, currentPlayer, card, null, steps);
              if (moves.length > 0) {
                dispatch({ type: 'SELECT_STEP_COUNT', steps });
                await new Promise(r => setTimeout(r, 300));
                if (isCancelled) return;
                const bestMove = moves[0];
                if (bestMove.marbleId) {
                  dispatch({ type: 'SELECT_MARBLE', marbleId: bestMove.marbleId });
                }
                if (bestMove.targetPosition) {
                  await new Promise(r => setTimeout(r, 300));
                  dispatch({ type: 'SELECT_TARGET_NODE', nodeId: bestMove.targetPosition });
                }
                return;
              }
            }
            // No valid moves, burn the card
            dispatch({ type: 'BURN_CARD' });
          }
          return;
        }
        
        if (gameState.phase === 'OPPONENT_DISCARD') {
          if (currentPlayer.hand.length > 0) {
            const randomCard = currentPlayer.hand[Math.floor(Math.random() * currentPlayer.hand.length)];
            dispatch({ type: 'SELECT_CARD', cardId: randomCard.id });
            await new Promise(r => setTimeout(r, 500));
            dispatch({ type: 'BURN_CARD' });
          }
          return;
        }
        
        if (gameState.phase === 'PLAYER_INPUT' && gameState.selectedCardId && gameState.possibleMoves.length > 0) {
          const bestMove = gameState.possibleMoves[0];
          if (bestMove.marbleId && !gameState.selectedMarbleId) {
            dispatch({ type: 'SELECT_MARBLE', marbleId: bestMove.marbleId });
            await new Promise(r => setTimeout(r, 300));
          }
          if (bestMove.targetPosition) {
            dispatch({ type: 'SELECT_TARGET_NODE', nodeId: bestMove.targetPosition });
          } else {
            dispatch({ type: 'CONFIRM_MOVE' });
          }
          return;
        }
        
        // Normal turn start
        if (gameState.phase === 'TURN_START') {
          const decision = getBestMove(gameState, currentPlayer);
          
          if (decision.action === 'BURN') {
            dispatch({ type: 'SELECT_CARD', cardId: decision.cardId });
            await new Promise(r => setTimeout(r, 800));
            if (isCancelled) return;
            dispatch({ type: 'BURN_CARD' });
          } else if (decision.action === 'MOVE' && decision.move) {
            dispatch({ type: 'SELECT_CARD', cardId: decision.cardId });
            // Note: SELECT_CARD may trigger special phases for 10, 7, Red Q
            // Those will be handled in the next effect cycle
          }
        }
      };
      
      executeAutoPlay();
      return () => { isCancelled = true; };
    } else {
      // Not in auto mode, start the turn timer
      if (gameState.phase === 'TURN_START' || gameState.phase === 'PLAYER_INPUT') {
        startTurnTimer();
      }
    }
    
    // Cleanup timer when component unmounts or turn changes
    return () => {
      if (turnTimerRef.current) {
        clearInterval(turnTimerRef.current);
        turnTimerRef.current = null;
      }
    };
  }, [currentPlayer.isBot, gameState.phase, gameState.currentPlayerIndex, gameState.selectedCardId, isInAutoMode, startTurnTimer]);

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
          
          if (currentPlayer.hand.length > 0) {
             const randomCard = currentPlayer.hand[Math.floor(Math.random() * currentPlayer.hand.length)];
             dispatch({ type: 'SELECT_CARD', cardId: randomCard.id });
             await new Promise(r => setTimeout(r, 500));
             dispatch({ type: 'BURN_CARD' });
             setToastMessage("Turn Returned!");
          } else {
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
             dispatch({ type: 'CONFIRM_MOVE' }); 
          } else {
             // Standard Move or Swap
             dispatch({ type: 'SELECT_MARBLE', marbleId: decision.move.marbleId! });
             
             // For Swap, targetPosition is the opponent's position
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

  // Handle exit from auto mode
  const handleExitAutoMode = () => {
    setIsInAutoMode(false);
    startTurnTimer();
    setToastMessage('已退出托管模式');
    setTimeout(() => setToastMessage(null), 1500);
  };

  const handleCardSelect = (cardId: string) => {
    if (currentPlayer.isBot) return;

    // Block actions if in auto mode - must click cancel button first
    if (isInAutoMode) {
      setToastMessage('请先点击"取消托管"按钮');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }

    if (gameState.selectedCardId === cardId) {
      dispatch({ type: 'CANCEL_SELECTION' });
      return;
    }

    if (isDeadlocked || gameState.phase === 'OPPONENT_DISCARD') {
      dispatch({ type: 'SELECT_CARD', cardId });
      return;
    }

    const card = currentPlayer.hand.find(c => c.id === cardId);
    if (!card) return;

    const isSpecialCard = 
        card.rank === '10' || 
        card.rank === '7' ||
        (card.rank === 'Q' && (card.suit === 'hearts' || card.suit === 'diamonds'));
    
    if (!isSpecialCard) {
        const moves = calculateValidMoves(gameState, currentPlayer, card, null);
        if (moves.length === 0) {
            setShakingCardId(cardId);
            setTimeout(() => setShakingCardId(null), 600);
        } else {
            dispatch({ type: 'SELECT_CARD', cardId });
        }
    } else {
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
    
    // --- SWAP LOGIC: Clicking Opponent Marble ---
    // If we have a card and a source marble selected, checking if we clicked a valid swap target
    if (gameState.selectedCardId && gameState.selectedMarbleId) {
        const validSwapMove = gameState.possibleMoves.find(m => m.swapTargetMarbleId === marbleId);
        if (validSwapMove && validSwapMove.targetPosition) {
           // Execute swap by selecting the node of the target marble
           dispatch({ type: 'SELECT_TARGET_NODE', nodeId: validSwapMove.targetPosition });
           return;
        }

        // Standard Move Target Logic (Land on someone to kill)
        const targetMarble = gameState.marbles[marbleId];
        const validMove = gameState.possibleMoves.find(m => m.targetPosition === targetMarble.position);

        if (validMove && validMove.targetPosition) {
             dispatch({ type: 'SELECT_TARGET_NODE', nodeId: validMove.targetPosition });
             return;
        }
    }

    if (gameState.phase !== 'PLAYER_INPUT' && gameState.phase !== 'HANDLING_SPLIT_7') return;
    dispatch({ type: 'SELECT_MARBLE', marbleId });
  };

  const handleNodeClick = (nodeId: string) => {
    if (currentPlayer.isBot) return; 
    if (gameState.phase !== 'PLAYER_INPUT' && gameState.phase !== 'HANDLING_SPLIT_7') return;
    dispatch({ type: 'SELECT_TARGET_NODE', nodeId });
  };

  const selectedCard = currentPlayer.hand.find(c => c.id === gameState.selectedCardId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden relative selection:bg-amber-500/30">
      
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black z-0 pointer-events-none"></div>

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
      
      <ActionChoiceModal 
        isVisible={(gameState.phase === 'DECIDING_10' || gameState.phase === 'DECIDING_RED_Q') && !currentPlayer.isBot}
        variant={gameState.phase === 'DECIDING_RED_Q' ? 'RED_Q' : 'TEN'}
        onOptionMove={
            (canPlayMove10) 
            ? () => dispatch({ type: 'RESOLVE_10_DECISION', choice: 'MOVE' }) 
            : undefined
        }
        onOptionAttack={() => {
           if (gameState.phase === 'DECIDING_RED_Q') {
              dispatch({ type: 'RESOLVE_RED_Q_DECISION', choice: 'ATTACK' });
           } else {
              dispatch({ type: 'RESOLVE_10_DECISION', choice: 'ATTACK' });
           }
        }}
        onCancel={() => dispatch({ type: 'RESOLVE_RED_Q_DECISION', choice: 'CANCEL' })}
      />

      <AnimatePresence>
        {gameState.phase === 'HANDLING_SPLIT_7' && !currentPlayer.isBot && (
          <SplitSevenControls 
             gameState={gameState}
             onSelectSteps={(steps) => dispatch({ type: 'SELECT_STEP_COUNT', steps })}
          />
        )}
      </AnimatePresence>

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

      {/* Auto Mode Overlay - Cancel Button in Center */}
      <AnimatePresence>
        {isInAutoMode && !currentPlayer.isBot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            data-testid="auto-mode-overlay"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-slate-800/95 backdrop-blur-md rounded-2xl border-2 border-purple-500/50 p-8 shadow-2xl text-center"
            >
              <button
                onClick={handleExitAutoMode}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl border-2 border-purple-400/50 text-white font-bold transition-all transform hover:scale-105 shadow-lg"
              >
                ✋ 取消托管
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

             {/* Turn Timer - only show for human player */}
             {!currentPlayer.isBot && (
               <div 
                 className={`px-3 py-1 rounded font-bold text-sm flex items-center gap-2 transition-all duration-300
                   ${turnTimeRemaining <= 5 
                     ? 'bg-red-900/70 text-red-200 animate-pulse' 
                     : turnTimeRemaining <= 10 
                       ? 'bg-orange-900/50 text-orange-200' 
                       : 'bg-slate-800/50 text-slate-200'}
                 `}
                 data-testid="turn-timer"
               >
                 <span className="text-lg">⏱️</span>
                 <span className="font-mono text-lg">{turnTimeRemaining}s</span>
               </div>
             )}

             {/* Auto Mode Indicator */}
             {isInAutoMode && (
               <div 
                 className="px-3 py-1 rounded font-bold text-sm bg-purple-900/70 text-purple-200 flex items-center gap-2 animate-pulse"
                 data-testid="auto-mode-indicator"
               >
                 <span className="text-lg">🤖</span>
                 托管中
               </div>
             )}
          </div>
        </div>
      </div>

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
        </div>
      </div>
      
      {/* Action Log Component (New) */}
      <ActionLog logs={gameState.lastActionLog} />
      
      <BurnNotification 
        isVisible={(isDeadlocked || gameState.phase === 'OPPONENT_DISCARD') && !isDraggingCard}
        cardRank={selectedCard?.rank}
        onBurn={() => dispatch({ type: 'BURN_CARD' })}
      />

      <div className={`transition-opacity duration-500 ${currentPlayer.isBot ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
        <CardHand 
          player={currentPlayer} 
          selectedCardId={gameState.selectedCardId}
          shakingCardId={shakingCardId}
          isDeadlocked={isDeadlocked || gameState.phase === 'OPPONENT_DISCARD'}
          onCardSelect={handleCardSelect}
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

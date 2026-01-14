/**
 * OnlineGame Component
 * Handles online 1v1 gameplay with WebSocket state synchronization
 * Requirements: 5.1, 5.3, 5.4, 6.1, 6.2, 6.3, 7.4
 */

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { calculateValidMoves } from '../services/moveEngine';
import { Board } from './Board';
import { CardHand } from './CardHand';
import { BurnNotification } from './BurnNotification';
import { BurnZone } from './BurnZone';
import { ActionChoiceModal } from './ActionChoiceModal';
import { SplitSevenControls } from './SplitSevenControls';
import { ActionLog } from './ActionLog';
import { AnimatePresence, motion } from 'framer-motion';
import { webSocketService, ServerMessage } from '../services/WebSocketService';
import type { GameState, GameAction } from '@shared/types';

// ============================================
// Types
// ============================================

export interface OnlineGameProps {
  roomCode: string;
  playerIndex: number;  // 0 or 1, player's position in the room
  initialState: GameState;
  onExit: () => void;
}

type OpponentStatus = 'connected' | 'disconnected' | 'reconnecting';

// ============================================
// Constants
// ============================================

const DISCONNECT_TIMEOUT_MS = 30000; // 30 seconds

// ============================================
// Component
// ============================================

export const OnlineGame: React.FC<OnlineGameProps> = ({
  roomCode,
  playerIndex,
  initialState,
  onExit,
}) => {
  // Game state from server
  const [gameState, setGameState] = useState<GameState>(initialState);
  
  // Connection and opponent status
  const [opponentStatus, setOpponentStatus] = useState<OpponentStatus>('connected');
  const [disconnectTimer, setDisconnectTimer] = useState<number | null>(null);
  const [showDisconnectNotification, setShowDisconnectNotification] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [winReason, setWinReason] = useState<string | null>(null);
  
  // UI States
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [shakingCardId, setShakingCardId] = useState<string | null>(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [isHoveringBurn, setIsHoveringBurn] = useState(false);
  
  // Refs
  const isMountedRef = useRef(true);
  const disconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Current player based on playerIndex
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const myPlayer = gameState.players[playerIndex];
  const isMyTurn = gameState.currentPlayerIndex === playerIndex;


  // ============================================
  // Deadlock Detection (same as Game.tsx but for online)
  // ============================================
  
  const isDeadlocked = useMemo(() => {
    if (!isMyTurn) return false;
    if (gameState.phase !== 'PLAYER_INPUT' && gameState.phase !== 'TURN_START' && gameState.phase !== 'OPPONENT_DISCARD') return false;
    
    if (gameState.phase === 'OPPONENT_DISCARD') return true;

    // Check if any card in hand has valid moves
    const hasAnyMove = myPlayer.hand.some(card => {
      // Skip hidden cards (shouldn't happen for own hand but safety check)
      if (card.rank === 'hidden' as any) return false;
      const moves = calculateValidMoves(gameState, myPlayer, card, null);
      return moves.length > 0;
    });

    return !hasAnyMove;
  }, [
    isMyTurn,
    myPlayer,  // Use full myPlayer object to catch all property changes
    gameState.phase,
    gameState.marbles,
    gameState.board,  // Add board dependency
    gameState.currentRound,
    gameState.currentPlayerIndex
  ]);

  // Check if "Move 10" is actually possible (for the Modal)
  const canPlayMove10 = useMemo(() => {
    if (gameState.phase !== 'DECIDING_10') return false;
    if (!isMyTurn) return false;
    
    const card = myPlayer.hand.find(c => c.id === gameState.selectedCardId);
    if (!card) return false;

    const moves = calculateValidMoves(gameState, myPlayer, card, null);
    return moves.some(m => m.type !== 'force_discard');
  }, [gameState, myPlayer, isMyTurn]);

  // ============================================
  // WebSocket Message Handlers
  // ============================================

  // Send game action to server (Requirements: 5.1)
  const sendGameAction = useCallback((action: GameAction) => {
    if (!isMyTurn && action.type !== 'BURN_CARD' && action.type !== 'SELECT_CARD') {
      // Allow BURN_CARD and SELECT_CARD during OPPONENT_DISCARD phase
      if (gameState.phase !== 'OPPONENT_DISCARD') {
        return;
      }
    }
    webSocketService.send({ type: 'GAME_ACTION', action });
  }, [isMyTurn, gameState.phase]);

  // Handle server messages (Requirements: 5.3, 6.2, 7.4)
  const handleServerMessage = useCallback((message: ServerMessage) => {
    if (!isMountedRef.current) return;

    switch (message.type) {
      case 'STATE_UPDATE':
        // Update local game state to match server state (Requirements: 5.3)
        console.log('[OnlineGame] STATE_UPDATE received:', {
          playerIndex,
          currentPlayerIndex: message.state.currentPlayerIndex,
          myHand: message.state.players[playerIndex]?.hand.map((c: any) => `${c.rank}${c.suit}`),
          phase: message.state.phase,
        });
        setGameState(message.state);
        break;

      case 'PLAYER_LEFT':
        // Opponent disconnected (Requirements: 6.2)
        if (message.playerIndex !== playerIndex) {
          setOpponentStatus('disconnected');
          setShowDisconnectNotification(true);
          
          // Start 30-second timeout (Requirements: 7.4)
          let timeLeft = DISCONNECT_TIMEOUT_MS / 1000;
          setDisconnectTimer(timeLeft);
          
          const countdownInterval = setInterval(() => {
            timeLeft -= 1;
            if (!isMountedRef.current) {
              clearInterval(countdownInterval);
              return;
            }
            setDisconnectTimer(timeLeft);
            
            if (timeLeft <= 0) {
              clearInterval(countdownInterval);
              // Declare victory due to opponent timeout
              setGameEnded(true);
              setWinReason('Opponent disconnected - You win!');
            }
          }, 1000);
          
          disconnectTimeoutRef.current = countdownInterval as unknown as ReturnType<typeof setTimeout>;
        }
        break;

      case 'PLAYER_JOINED':
        // Opponent reconnected
        if (message.playerIndex !== playerIndex) {
          setOpponentStatus('connected');
          setShowDisconnectNotification(false);
          setDisconnectTimer(null);
          
          if (disconnectTimeoutRef.current) {
            clearInterval(disconnectTimeoutRef.current as unknown as ReturnType<typeof setInterval>);
            disconnectTimeoutRef.current = null;
          }
        }
        break;

      case 'ERROR':
        setToastMessage(message.message);
        setTimeout(() => setToastMessage(null), 3000);
        break;
    }
  }, [playerIndex]);


  // ============================================
  // Effects
  // ============================================

  // Setup WebSocket listeners
  useEffect(() => {
    isMountedRef.current = true;
    
    // Track cleanup timeout for React Strict Mode handling
    let cleanupTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const unsubscribeMessage = webSocketService.onMessage(handleServerMessage);

    return () => {
      isMountedRef.current = false;
      unsubscribeMessage();
      
      if (disconnectTimeoutRef.current) {
        clearInterval(disconnectTimeoutRef.current as unknown as ReturnType<typeof setInterval>);
      }
      
      // Use a delay before disconnecting to handle React Strict Mode
      // which mounts/unmounts/remounts components in development
      cleanupTimeoutId = setTimeout(() => {
        // Only disconnect if component is still unmounted (not a Strict Mode remount)
        if (!isMountedRef.current) {
          // Disconnect WebSocket when component unmounts
          // This handles cases like browser refresh or navigation away
          if (webSocketService.getState() === 'connected') {
            webSocketService.send({ type: 'LEAVE_ROOM' });
          }
          webSocketService.disconnect();
        }
      }, 200);
    };
  }, [handleServerMessage]);

  // Auto-resolve turn when in RESOLVING_MOVE phase
  // This completes the turn after a move is executed
  useEffect(() => {
    if (gameState.phase === 'RESOLVING_MOVE' && isMyTurn) {
      const timer = setTimeout(() => {
        sendGameAction({ type: 'RESOLVE_TURN' });
      }, 500); // Small delay for animation
      return () => clearTimeout(timer);
    }
  }, [gameState.phase, isMyTurn, sendGameAction]);

  // ============================================
  // Event Handlers
  // ============================================

  const handleCardSelect = (cardId: string) => {
    // Only allow card selection on my turn or during OPPONENT_DISCARD phase when I'm the victim
    if (!isMyTurn && gameState.phase !== 'OPPONENT_DISCARD') return;
    if (gameState.phase === 'OPPONENT_DISCARD' && gameState.currentPlayerIndex !== playerIndex) return;

    if (gameState.selectedCardId === cardId) {
      sendGameAction({ type: 'CANCEL_SELECTION' });
      return;
    }

    if (isDeadlocked || gameState.phase === 'OPPONENT_DISCARD') {
      sendGameAction({ type: 'SELECT_CARD', cardId });
      return;
    }

    const card = myPlayer.hand.find(c => c.id === cardId);
    if (!card) return;

    const isSpecialCard =
      card.rank === '10' ||
      card.rank === '7' ||
      (card.rank === 'Q' && (card.suit === 'hearts' || card.suit === 'diamonds'));

    if (!isSpecialCard) {
      const moves = calculateValidMoves(gameState, myPlayer, card, null);
      if (moves.length === 0) {
        setShakingCardId(cardId);
        setTimeout(() => setShakingCardId(null), 600);
      } else {
        sendGameAction({ type: 'SELECT_CARD', cardId });
      }
    } else {
      sendGameAction({ type: 'SELECT_CARD', cardId });
    }
  };

  const handleManualBurn = (cardId: string) => {
    sendGameAction({ type: 'SELECT_CARD', cardId });
    sendGameAction({ type: 'BURN_CARD' });
    setToastMessage(gameState.phase === 'OPPONENT_DISCARD' ? 'Surrendered!' : 'Card Burned 🔥');
    setTimeout(() => setToastMessage(null), 1500);
  };

  const handleMarbleClick = (marbleId: string) => {
    if (!isMyTurn) return;

    // SWAP LOGIC: Clicking Opponent Marble
    if (gameState.selectedCardId && gameState.selectedMarbleId) {
      const validSwapMove = gameState.possibleMoves.find(m => m.swapTargetMarbleId === marbleId);
      if (validSwapMove && validSwapMove.targetPosition) {
        sendGameAction({ type: 'SELECT_TARGET_NODE', nodeId: validSwapMove.targetPosition });
        return;
      }

      // Standard Move Target Logic (Land on someone to kill)
      const targetMarble = gameState.marbles[marbleId];
      const validMove = gameState.possibleMoves.find(m => m.targetPosition === targetMarble.position);

      if (validMove && validMove.targetPosition) {
        sendGameAction({ type: 'SELECT_TARGET_NODE', nodeId: validMove.targetPosition });
        return;
      }
    }

    if (gameState.phase !== 'PLAYER_INPUT' && gameState.phase !== 'HANDLING_SPLIT_7') return;
    sendGameAction({ type: 'SELECT_MARBLE', marbleId });
  };

  const handleNodeClick = (nodeId: string) => {
    if (!isMyTurn) return;
    if (gameState.phase !== 'PLAYER_INPUT' && gameState.phase !== 'HANDLING_SPLIT_7') return;
    sendGameAction({ type: 'SELECT_TARGET_NODE', nodeId });
  };

  const handleExit = () => {
    webSocketService.send({ type: 'LEAVE_ROOM' });
    webSocketService.disconnect();
    onExit();
  };

  const selectedCard = myPlayer.hand.find(c => c.id === gameState.selectedCardId);


  // ============================================
  // Render
  // ============================================

  // Game ended screen
  if (gameEnded) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-slate-800/50 backdrop-blur-md rounded-2xl border border-white/10 p-8 text-center"
        >
          <h1 className="text-4xl font-black text-amber-500 mb-4">Game Over</h1>
          <p className="text-xl text-white mb-6">{winReason}</p>
          <button
            onClick={handleExit}
            className="px-6 py-3 bg-emerald-600/50 hover:bg-emerald-500/50 rounded-xl border border-emerald-400/30 text-white font-medium transition-colors"
          >
            Return to Menu
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden relative selection:bg-amber-500/30">
      
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black z-0 pointer-events-none"></div>

      <BurnZone
        isVisible={isDraggingCard}
        isHovered={isHoveringBurn}
        hasSelectedCard={!!gameState.selectedCardId && isMyTurn}
        onClick={() => {
          if (gameState.selectedCardId && isMyTurn) {
            handleManualBurn(gameState.selectedCardId);
          }
        }}
      />

      <ActionChoiceModal
        isVisible={(gameState.phase === 'DECIDING_10' || gameState.phase === 'DECIDING_RED_Q') && isMyTurn}
        variant={gameState.phase === 'DECIDING_RED_Q' ? 'RED_Q' : 'TEN'}
        onOptionMove={
          canPlayMove10
            ? () => sendGameAction({ type: 'RESOLVE_10_DECISION', choice: 'MOVE' })
            : undefined
        }
        onOptionAttack={() => {
          if (gameState.phase === 'DECIDING_RED_Q') {
            sendGameAction({ type: 'RESOLVE_RED_Q_DECISION', choice: 'ATTACK' });
          } else {
            sendGameAction({ type: 'RESOLVE_10_DECISION', choice: 'ATTACK' });
          }
        }}
        onCancel={() => sendGameAction({ type: 'RESOLVE_RED_Q_DECISION', choice: 'CANCEL' })}
      />

      <AnimatePresence>
        {gameState.phase === 'HANDLING_SPLIT_7' && isMyTurn && (
          <SplitSevenControls
            gameState={gameState}
            onSelectSteps={(steps) => sendGameAction({ type: 'SELECT_STEP_COUNT', steps })}
          />
        )}
      </AnimatePresence>

      {/* Opponent Disconnected Notification (Requirements: 6.2) */}
      <AnimatePresence>
        {showDisconnectNotification && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute top-24 left-0 right-0 z-30 flex justify-center pointer-events-none"
          >
            <div className="bg-orange-600/90 text-white font-black px-8 py-4 rounded-xl shadow-2xl border-2 border-orange-400 backdrop-blur text-xl uppercase tracking-widest flex items-center gap-4"
                 data-testid="disconnect-notification">
              <span className="text-3xl">⚠️</span>
              OPPONENT DISCONNECTED - {disconnectTimer}s remaining
              <span className="text-3xl">⚠️</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attack Phase Notification */}
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
              {gameState.currentPlayerIndex === playerIndex
                ? 'YOU ARE ATTACKED! DISCARD A CARD!'
                : 'WAITING FOR OPPONENT TO DISCARD...'}
              <span className="text-3xl">⚔️</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Header with game info and connection status */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none z-10">
        <div className="pointer-events-auto">
          <button
            onClick={handleExit}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-2 group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span> Exit Match
          </button>

          <h1 className="text-3xl font-black text-amber-500 drop-shadow-lg tracking-wider">JACKAROO</h1>
          <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 mt-2 flex items-center gap-4">
            <div className="text-sm text-slate-400">
              Round <span className="text-white font-bold text-lg">{gameState.currentRound}</span>
            </div>
            <div className="text-sm text-slate-400">
              Room: <span className="font-mono text-emerald-400">{roomCode}</span>
            </div>

            {/* Turn Indicator (Requirements: 6.1) */}
            <div
              className={`px-3 py-1 rounded font-bold text-sm uppercase transition-colors duration-300 flex items-center gap-2
                ${!isMyTurn ? 'bg-yellow-900/50 text-yellow-200' : 'bg-green-900/50 text-green-200'}
              `}
              data-testid="turn-indicator"
            >
              {!isMyTurn ? (
                <>
                  <span className="w-2 h-2 bg-yellow-400 rounded-full animate-ping"></span>
                  Opponent's Turn
                </>
              ) : (
                <>
                  <span className="text-lg">🫵</span> YOUR TURN
                </>
              )}
            </div>
          </div>
        </div>

        {/* Connection Status (Requirements: 6.3) */}
        <div className="pointer-events-auto bg-black/50 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              <span className="text-sm text-slate-400">You</span>
            </div>
            <div className="flex items-center gap-2" data-testid="opponent-status">
              <span
                className={`w-2 h-2 rounded-full ${
                  opponentStatus === 'connected'
                    ? 'bg-green-400'
                    : opponentStatus === 'reconnecting'
                    ? 'bg-yellow-400 animate-pulse'
                    : 'bg-red-400'
                }`}
              ></span>
              <span className="text-sm text-slate-400">
                Opponent {opponentStatus !== 'connected' && `(${opponentStatus})`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Game Board */}
      <div className="flex-1 flex items-center justify-center p-4 lg:p-10 relative z-0">
        <div className="relative w-full max-w-[650px] aspect-square">
          <Board
            gameState={gameState}
            onMarbleClick={handleMarbleClick}
            onNodeClick={handleNodeClick}
            playerIndex={playerIndex}
            playerCount={gameState.players.length}
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

      {/* Action Log */}
      <ActionLog logs={gameState.lastActionLog} />

      <BurnNotification
        isVisible={(isDeadlocked || (gameState.phase === 'OPPONENT_DISCARD' && gameState.currentPlayerIndex === playerIndex)) && !isDraggingCard}
        cardRank={selectedCard?.rank}
        onBurn={() => sendGameAction({ type: 'BURN_CARD' })}
      />

      {/* Card Hand - disabled when not my turn */}
      <div className={`transition-opacity duration-500 ${!isMyTurn && gameState.phase !== 'OPPONENT_DISCARD' ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
        <CardHand
          player={myPlayer}
          selectedCardId={gameState.selectedCardId}
          shakingCardId={shakingCardId}
          isDeadlocked={isDeadlocked || (gameState.phase === 'OPPONENT_DISCARD' && gameState.currentPlayerIndex === playerIndex)}
          onCardSelect={handleCardSelect}
          onDragStart={() => {
            setIsDraggingCard(true);
            if (gameState.selectedCardId) {
              sendGameAction({ type: 'CANCEL_SELECTION' });
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

export default OnlineGame;

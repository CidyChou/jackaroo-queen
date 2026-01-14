/**
 * MatchmakingPage Component
 * Handles online matchmaking flow: connecting, creating room, waiting for opponent
 * Requirements: 2.1, 2.3, 2.4, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 7.3
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { webSocketService, ConnectionState, ServerMessage } from '../services/WebSocketService';
import type { GameState } from '../shared/types';

// ============================================
// Types
// ============================================

export type MatchmakingState =
  | 'connecting'      // Connecting to server
  | 'creating_room'   // Creating room
  | 'waiting'         // Waiting for opponent
  | 'opponent_found'  // Opponent joined
  | 'starting'        // Game starting
  | 'error';          // Error occurred

export interface MatchmakingPageProps {
  onMatchFound: (roomCode: string, playerIndex: number, initialState: GameState) => void;
  onCancel: () => void;
  onError: (message: string) => void;
  serverUrl?: string;
}

// ============================================
// Constants
// ============================================

// Auto-detect WebSocket server URL based on current page hostname
const getDefaultServerUrl = (): string => {
  if (import.meta.env.VITE_WS_SERVER_URL) {
    return import.meta.env.VITE_WS_SERVER_URL;
  }
  // Use the same hostname as the page, but with WebSocket port 8080
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `ws://${hostname}:8080`;
};

const DEFAULT_SERVER_URL = getDefaultServerUrl();

const STATUS_MESSAGES: Record<MatchmakingState, string> = {
  connecting: 'Connecting to server...',
  creating_room: 'Creating room...',
  waiting: 'Waiting for opponent...',
  opponent_found: 'Opponent found!',
  starting: 'Starting game...',
  error: 'Connection error',
};

// ============================================
// Component
// ============================================

export const MatchmakingPage: React.FC<MatchmakingPageProps> = ({
  onMatchFound,
  onCancel,
  onError,
  serverUrl = DEFAULT_SERVER_URL,
}) => {
  const [matchState, setMatchState] = useState<MatchmakingState>('connecting');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);
  // Track if we've already started the game to prevent duplicate calls
  const gameStartedRef = useRef(false);
  // Track if we've already sent CREATE_ROOM to prevent duplicates (persists across re-renders)
  const createRoomSentRef = useRef(false);

  // Use refs to store the latest callbacks to avoid useEffect re-running
  const onMatchFoundRef = useRef(onMatchFound);
  const onErrorRef = useRef(onError);
  
  // Keep refs updated
  useEffect(() => {
    onMatchFoundRef.current = onMatchFound;
    onErrorRef.current = onError;
  }, [onMatchFound, onError]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    gameStartedRef.current = false;
    // Reset createRoomSent only if we're starting fresh (not a Strict Mode remount)
    // We check if WebSocket is disconnected to determine if this is a fresh start
    if (webSocketService.getState() === 'disconnected') {
      createRoomSentRef.current = false;
    }
    
    // Local state for tracking room info within this effect
    let currentRoomCode: string | null = null;
    let currentPlayerIndex: number | null = null;

    // Handle WebSocket connection state changes
    const handleConnectionStateChange = (state: ConnectionState) => {
      if (!isMountedRef.current) return;

      if (state === 'connected') {
        setMatchState((prevState: MatchmakingState) => {
          if (prevState === 'connecting' && !createRoomSentRef.current) {
            createRoomSentRef.current = true;
            // Send CREATE_ROOM message
            webSocketService.send({ type: 'CREATE_ROOM', playerCount: 2 });
            return 'creating_room';
          }
          return prevState;
        });
      } else if (state === 'error') {
        setMatchState('error');
        setErrorMessage('Failed to connect to server');
      } else if (state === 'disconnected') {
        setMatchState((prevState: MatchmakingState) => {
          if (prevState !== 'error') {
            setErrorMessage('Connection lost');
            return 'error';
          }
          return prevState;
        });
      }
    };

    // Handle server messages
    const handleServerMessage = (message: ServerMessage) => {
      if (!isMountedRef.current) return;

      switch (message.type) {
        case 'ROOM_CREATED':
          currentRoomCode = message.roomCode;
          currentPlayerIndex = message.playerIndex;
          setRoomCode(message.roomCode);
          setPlayerIndex(message.playerIndex);
          setMatchState('waiting');
          break;

        case 'ROOM_JOINED':
          // Auto-matched into an existing room
          currentRoomCode = message.roomCode;
          currentPlayerIndex = message.playerIndex;
          setRoomCode(message.roomCode);
          setPlayerIndex(message.playerIndex);
          setMatchState('opponent_found');
          break;

        case 'PLAYER_JOINED':
          setMatchState('opponent_found');
          break;

        case 'GAME_STARTED':
          if (!gameStartedRef.current) {
            gameStartedRef.current = true;
            setMatchState('starting');
            // Immediately call onMatchFound - no delay needed
            // The gameStartedRef is already set, so cleanup won't disconnect
            if (currentRoomCode !== null && currentPlayerIndex !== null) {
              onMatchFoundRef.current(currentRoomCode, currentPlayerIndex, message.state);
            }
          }
          break;

        case 'ERROR':
          setMatchState('error');
          setErrorMessage(message.message);
          onErrorRef.current(message.message);
          break;
      }
    };

    // Handle WebSocket errors
    const handleWebSocketError = (error: string) => {
      if (!isMountedRef.current) return;
      setMatchState('error');
      setErrorMessage(error);
    };

    // Register listeners
    const unsubscribeState = webSocketService.onStateChange(handleConnectionStateChange);
    const unsubscribeMessage = webSocketService.onMessage(handleServerMessage);
    const unsubscribeError = webSocketService.onError(handleWebSocketError);

    // Ensure any previous connection is fully closed before connecting
    // This handles the case where user quickly navigates back and forth
    webSocketService.disconnect();
    
    // Small delay to ensure clean state, then connect
    const connectTimeout = setTimeout(() => {
      if (isMountedRef.current) {
        webSocketService.connect(serverUrl);
      }
    }, 50);

    // Cleanup on unmount
    return () => {
      clearTimeout(connectTimeout);
      
      isMountedRef.current = false;
      unsubscribeState();
      unsubscribeMessage();
      unsubscribeError();

      // IMPORTANT: Do NOT disconnect WebSocket here!
      // If game started, OnlineGame will take over the connection.
      // If user cancels, handleCancel() will disconnect.
      // Disconnecting here causes race conditions with component transitions.
    };
  }, [serverUrl]); // Only depend on serverUrl

  // Handle cancel button
  const handleCancel = useCallback(() => {
    if (webSocketService.getState() === 'connected') {
      webSocketService.send({ type: 'LEAVE_ROOM' });
    }
    webSocketService.disconnect();
    onCancel();
  }, [onCancel]);

  // Handle retry button
  const handleRetry = useCallback(() => {
    setMatchState('connecting');
    setErrorMessage(null);
    setRoomCode(null);
    setPlayerIndex(null);
    gameStartedRef.current = false;
    createRoomSentRef.current = false; // Reset so we can send CREATE_ROOM again
    webSocketService.connect(serverUrl);
  }, [serverUrl]);

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black flex flex-col items-center justify-center p-4 text-white relative overflow-hidden">
      {/* Background Animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 100, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] opacity-5"
          style={{
            backgroundImage: 'radial-gradient(circle, #fff 2px, transparent 2px)',
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 text-center mb-12"
      >
        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 mb-2">
          Online Match
        </h1>
        <p className="text-slate-400 text-sm uppercase tracking-widest">1v1 PvP</p>
      </motion.div>

      {/* Status Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="z-10 bg-slate-800/50 backdrop-blur-md rounded-2xl border border-white/10 p-8 w-full max-w-md"
      >
        <AnimatePresence mode="wait">
          {matchState === 'error' ? (
            <ErrorDisplay
              key="error"
              message={errorMessage || 'Unknown error'}
              onRetry={handleRetry}
              onCancel={handleCancel}
            />
          ) : (
            <MatchingDisplay
              key="matching"
              state={matchState}
              roomCode={roomCode}
              onCancel={handleCancel}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// ============================================
// Sub-components
// ============================================

interface MatchingDisplayProps {
  state: MatchmakingState;
  roomCode: string | null;
  onCancel: () => void;
}

const MatchingDisplay: React.FC<MatchingDisplayProps> = ({ state, roomCode, onCancel }) => {
  const isWaiting = state === 'connecting' || state === 'creating_room' || state === 'waiting';
  const showSuccess = state === 'opponent_found' || state === 'starting';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center"
    >
      {/* Loading/Success Animation */}
      <div className="relative w-24 h-24 mb-6">
        {isWaiting && <LoadingSpinner />}
        {showSuccess && <SuccessIcon />}
      </div>

      {/* Status Message */}
      <p className="text-xl font-semibold text-white mb-2" data-testid="status-message">
        {STATUS_MESSAGES[state]}
      </p>

      {/* Room Code */}
      {roomCode && state === 'waiting' && (
        <p className="text-slate-400 text-sm mb-6">
          Room: <span className="font-mono text-emerald-400">{roomCode}</span>
        </p>
      )}

      {/* Cancel Button */}
      {isWaiting && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onCancel}
          className="mt-4 px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 rounded-xl border border-white/10 text-white font-medium transition-colors"
          data-testid="cancel-button"
        >
          Cancel
        </motion.button>
      )}
    </motion.div>
  );
};

interface ErrorDisplayProps {
  message: string;
  onRetry: () => void;
  onCancel: () => void;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ message, onRetry, onCancel }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="flex flex-col items-center"
  >
    {/* Error Icon */}
    <div className="w-24 h-24 mb-6 flex items-center justify-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="text-6xl"
      >
        ❌
      </motion.div>
    </div>

    {/* Error Message */}
    <p className="text-xl font-semibold text-red-400 mb-2" data-testid="error-title">
      Connection Error
    </p>
    <p className="text-slate-400 text-sm text-center mb-6" data-testid="error-message">
      {message}
    </p>

    {/* Action Buttons */}
    <div className="flex gap-4">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onRetry}
        className="px-6 py-3 bg-emerald-600/50 hover:bg-emerald-500/50 rounded-xl border border-emerald-400/30 text-white font-medium transition-colors"
        data-testid="retry-button"
      >
        Retry
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onCancel}
        className="px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 rounded-xl border border-white/10 text-white font-medium transition-colors"
        data-testid="cancel-button"
      >
        Back to Menu
      </motion.button>
    </div>
  </motion.div>
);

// ============================================
// Animation Components
// ============================================

const LoadingSpinner: React.FC = () => (
  <motion.div
    className="absolute inset-0"
    animate={{ rotate: 360 }}
    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
  >
    <div className="w-full h-full rounded-full border-4 border-slate-700 border-t-emerald-400" />
  </motion.div>
);

const SuccessIcon: React.FC = () => (
  <motion.div
    initial={{ scale: 0 }}
    animate={{ scale: 1 }}
    transition={{ type: 'spring', stiffness: 200 }}
    className="w-full h-full flex items-center justify-center text-6xl"
  >
    ✅
  </motion.div>
);

export default MatchmakingPage;

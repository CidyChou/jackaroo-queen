/**
 * MessageHandler - Handles all client messages
 * 
 * Handles:
 * - CREATE_ROOM: Create a new game room
 * - JOIN_ROOM: Join an existing room
 * - LEAVE_ROOM: Leave current room
 * - GAME_ACTION: Process game actions
 * - PING: Respond with PONG
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.4
 */

import { RoomManager } from './RoomManager.js';
import { PlayerSession } from './PlayerSession.js';
import { IMessageHandler } from './WebSocketServer.js';
import { Logger } from './Logger.js';
import { RateLimiter } from './RateLimiter.js';
import {
  ClientMessage,
  CreateRoomMessage,
  JoinRoomMessage,
  GameActionMessage,
  ServerMessage,
  ErrorCode,
  parseClientMessage,
  createErrorMessage,
  TimerUpdateMessage,
  AutoModeChangedMessage,
} from '../../shared/protocol.js';
import { GameAction } from '../../shared/types.js';
import { Room } from './Room.js';

export interface MessageHandlerConfig {
  /** Rate limiter configuration */
  rateLimiter?: {
    maxRequests: number;
    windowMs: number;
  };
}

export class MessageHandler implements IMessageHandler {
  private roomManager: RoomManager;
  private logger: Logger;
  private rateLimiter: RateLimiter;

  constructor(roomManager: RoomManager, config?: MessageHandlerConfig) {
    this.roomManager = roomManager;
    this.logger = new Logger('MessageHandler');
    this.rateLimiter = new RateLimiter(config?.rateLimiter);
    this.rateLimiter.start();
  }

  /**
   * Stops the message handler and cleans up resources
   */
  stop(): void {
    this.rateLimiter.stop();
  }

  /**
   * Main entry point for handling messages
   * Wrapped in try-catch to ensure errors don't crash the server
   * Requirements: 7.1, 7.2, 7.3, 7.4
   */
  handleMessage(session: PlayerSession, rawMessage: string): void {
    try {
      // Check rate limit first (Requirements: 7.4)
      if (!this.rateLimiter.checkLimit(session.sessionId)) {
        const remainingMs = this.rateLimiter.getBlockTimeRemaining(session.sessionId);
        this.logger.warn(`Rate limited session ${session.sessionId}`, {
          remainingMs,
        });
        session.send(createErrorMessage(
          'RATE_LIMITED',
          `Too many requests. Please wait ${Math.ceil(remainingMs / 1000)} seconds.`
        ));
        return;
      }

      this.processMessage(session, rawMessage);
    } catch (error) {
      // Global error catch - ensures server never crashes from message handling
      this.handleUnexpectedError(session, error, 'handleMessage');
    }
  }

  /**
   * Internal message processing logic
   */
  private processMessage(session: PlayerSession, rawMessage: string): void {
    // Parse and validate message
    const message = parseClientMessage(rawMessage);
    if (!message) {
      this.logger.warn(`Invalid message from ${session.sessionId}`, { rawMessage: rawMessage.slice(0, 100) });
      session.send(createErrorMessage('INVALID_MESSAGE', 'Invalid message format'));
      return;
    }

    this.logger.debug(`Received ${message.type} from ${session.sessionId}`);

    // Route to appropriate handler with individual try-catch
    try {
      switch (message.type) {
        case 'CREATE_ROOM':
          this.handleCreateRoom(session, message);
          break;
        case 'JOIN_ROOM':
          this.handleJoinRoom(session, message);
          break;
        case 'LEAVE_ROOM':
          this.handleLeaveRoom(session);
          break;
        case 'GAME_ACTION':
          this.handleGameAction(session, message);
          break;
        case 'PING':
          this.handlePing(session);
          break;
        default:
          session.send(createErrorMessage('INVALID_MESSAGE', 'Unknown message type'));
      }
    } catch (error) {
      this.handleUnexpectedError(session, error, `handle${message.type}`);
    }
  }

  /**
   * Handles unexpected errors during message processing
   * Ensures errors are logged and don't crash the server
   * Requirements: 7.1
   */
  private handleUnexpectedError(session: PlayerSession, error: unknown, context: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    this.logger.error(`Unexpected error in ${context} for session ${session.sessionId}`, {
      error: errorMessage,
      stack: errorStack,
      sessionId: session.sessionId,
      roomCode: session.getRoomCode(),
    });

    // Report to global error handler
    if (error instanceof Error) {
      Logger.reportError(error, `MessageHandler.${context}`);
    }

    // Send generic error to client - don't expose internal details
    try {
      session.send(createErrorMessage('INTERNAL_ERROR', 'Internal server error'));
    } catch (sendError) {
      // Even sending the error failed - just log it
      this.logger.error('Failed to send error response to client', sendError);
    }
  }

  /**
   * Handles player disconnection
   */
  handleDisconnect(session: PlayerSession): void {
    const roomCode = session.getRoomCode();
    if (!roomCode) {
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      return;
    }

    const playerIndex = session.getPlayerIndex();
    if (playerIndex === null) {
      return;
    }

    // Notify other players
    const playerLeftMessage: ServerMessage = {
      type: 'PLAYER_LEFT',
      playerIndex,
    };

    for (const player of room.getPlayers()) {
      if (player.sessionId !== session.sessionId) {
        player.send(playerLeftMessage);
      }
    }

    // Clean up rate limiter data for this session
    this.rateLimiter.removeSession(session.sessionId);

    this.logger.info(`Player ${session.sessionId} disconnected from room ${roomCode}`);
  }

  /**
   * Gets rate limiter statistics
   */
  getRateLimiterStats(): { trackedSessions: number; blockedSessions: number } {
    return this.rateLimiter.getStats();
  }


  // ============================================
  // Room Handlers
  // ============================================

  /**
   * Handles CREATE_ROOM message
   * Implements auto-matchmaking: joins existing waiting room if available, otherwise creates new room
   */
  private handleCreateRoom(session: PlayerSession, msg: CreateRoomMessage): void {
    // If already in a room, leave it first (graceful handling for reconnection scenarios)
    if (session.isInRoom()) {
      const oldRoomCode = session.getRoomCode();
      this.logger.info(`Session ${session.sessionId} leaving old room ${oldRoomCode} before matchmaking`);
      this.roomManager.leaveRoom(session.sessionId);
    }

    // Try to find an existing waiting room first (auto-matchmaking)
    const waitingRoom = this.roomManager.findWaitingRoom(msg.playerCount);
    
    if (waitingRoom) {
      // Join the existing waiting room
      const room = this.roomManager.joinRoom(waitingRoom.roomCode, session);
      if (room) {
        const playerIndex = room.getPlayerIndexBySessionId(session.sessionId);

        // Send ROOM_JOINED to the joining player
        const joinedResponse: ServerMessage = {
          type: 'ROOM_JOINED',
          roomCode: room.roomCode,
          playerIndex: playerIndex!,
          players: room.getPlayerInfo(),
        };
        session.send(joinedResponse);

        // Notify other players that someone joined
        const playerJoinedMessage: ServerMessage = {
          type: 'PLAYER_JOINED',
          playerIndex: playerIndex!,
        };

        for (const player of room.getPlayers()) {
          if (player.sessionId !== session.sessionId) {
            player.send(playerJoinedMessage);
          }
        }

        this.logger.info(`Player ${session.sessionId} auto-matched into room ${room.roomCode}`);

        // Auto-start game if room is full
        if (room.isFull()) {
          this.startGame(room);
        }
        return;
      }
    }

    // No waiting room found, create a new one
    const room = this.roomManager.createRoom(session, msg.playerCount);
    const playerIndex = room.getPlayerIndexBySessionId(session.sessionId);

    // Send confirmation
    const response: ServerMessage = {
      type: 'ROOM_CREATED',
      roomCode: room.roomCode,
      playerIndex: playerIndex!,
    };
    session.send(response);

    this.logger.info(`Room ${room.roomCode} created by ${session.sessionId}`);
  }

  /**
   * Handles JOIN_ROOM message
   */
  private handleJoinRoom(session: PlayerSession, msg: JoinRoomMessage): void {
    // Check if already in a room
    if (session.isInRoom()) {
      session.send(createErrorMessage('VALIDATION_ERROR', 'Already in a room'));
      return;
    }

    // Normalize room code to uppercase
    const roomCode = msg.roomCode.toUpperCase();

    // Try to join the room
    const room = this.roomManager.joinRoom(roomCode, session);
    if (!room) {
      // Check if room exists
      const existingRoom = this.roomManager.getRoom(roomCode);
      if (!existingRoom) {
        session.send(createErrorMessage('ROOM_NOT_FOUND', 'Room not found'));
      } else {
        session.send(createErrorMessage('ROOM_FULL', 'Room is full'));
      }
      return;
    }

    const playerIndex = room.getPlayerIndexBySessionId(session.sessionId);

    // Send confirmation to joining player
    const joinedResponse: ServerMessage = {
      type: 'ROOM_JOINED',
      roomCode: room.roomCode,
      playerIndex: playerIndex!,
      players: room.getPlayerInfo(),
    };
    session.send(joinedResponse);

    // Notify other players
    const playerJoinedMessage: ServerMessage = {
      type: 'PLAYER_JOINED',
      playerIndex: playerIndex!,
    };

    for (const player of room.getPlayers()) {
      if (player.sessionId !== session.sessionId) {
        player.send(playerJoinedMessage);
      }
    }

    this.logger.info(`Player ${session.sessionId} joined room ${roomCode}`);

    // Auto-start game if room is full
    if (room.isFull()) {
      this.startGame(room);
    }
  }


  /**
   * Handles LEAVE_ROOM message
   */
  private handleLeaveRoom(session: PlayerSession): void {
    const roomCode = session.getRoomCode();
    if (!roomCode) {
      session.send(createErrorMessage('NOT_IN_ROOM', 'Not in a room'));
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    const playerIndex = session.getPlayerIndex();

    // Leave the room
    this.roomManager.leaveRoom(session.sessionId);

    // Notify other players if room still exists
    if (room && playerIndex !== null) {
      const playerLeftMessage: ServerMessage = {
        type: 'PLAYER_LEFT',
        playerIndex,
      };

      for (const player of room.getPlayers()) {
        player.send(playerLeftMessage);
      }
    }

    this.logger.info(`Player ${session.sessionId} left room ${roomCode}`);
  }

  // ============================================
  // Game Action Handlers
  // ============================================

  /**
   * Handles GAME_ACTION message
   * Requirements: 7.2 - logs all game actions with timestamps
   */
  private handleGameAction(session: PlayerSession, msg: GameActionMessage): void {
    const roomCode = session.getRoomCode();
    if (!roomCode) {
      session.send(createErrorMessage('NOT_IN_ROOM', 'Not in a room'));
      return;
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      session.send(createErrorMessage('ROOM_NOT_FOUND', 'Room not found'));
      return;
    }

    // Check if game has started
    if (room.getStatus() !== 'playing') {
      session.send(createErrorMessage('GAME_NOT_STARTED', 'Game has not started'));
      return;
    }

    const action = msg.action;
    const playerIndex = session.getPlayerIndex();

    // Log the game action with timestamp (Requirements: 7.2)
    this.logger.logGameAction(session.sessionId, roomCode, action.type, {
      playerIndex,
    });

    // Validate action based on type
    const validationError = this.validateGameAction(session, room, action);
    if (validationError) {
      session.send(createErrorMessage(validationError.code, validationError.message));
      return;
    }

    // Player made an action - remove from auto mode if they were in it
    if (playerIndex !== null && room.isPlayerInAutoMode(playerIndex)) {
      room.removeFromAutoMode(playerIndex);
    }

    // Get state before action to check for turn change
    const stateBefore = room.getGameState();
    const playerBefore = stateBefore?.currentPlayerIndex;

    // Process the action
    const newState = room.processAction(session.sessionId, action);
    if (!newState) {
      session.send(createErrorMessage('INVALID_MOVE', 'Invalid move'));
      return;
    }

    // Broadcast state update to all players using Room's broadcast method
    room.broadcastStateUpdate();

    // Check if turn changed or if we need to restart timer
    const shouldRestartTimer = 
      action.type === 'RESOLVE_TURN' || 
      (newState.currentPlayerIndex !== playerBefore) ||
      (newState.phase === 'TURN_START' && stateBefore?.phase !== 'TURN_START');

    if (shouldRestartTimer) {
      // Restart turn timer for new player
      room.startTurnTimer();
      
      // Check if new player is in auto mode
      room.checkAndExecuteAutoPlay();
    }

    this.logger.debug(`Action ${action.type} processed in room ${roomCode}`);
  }


  /**
   * Validates a game action
   * Returns error info if invalid, null if valid
   */
  private validateGameAction(
    session: PlayerSession,
    room: ReturnType<RoomManager['getRoom']>,
    action: GameAction
  ): { code: ErrorCode; message: string } | null {
    if (!room) {
      return { code: 'ROOM_NOT_FOUND', message: 'Room not found' };
    }

    const gameState = room.getGameState();
    if (!gameState) {
      return { code: 'GAME_NOT_STARTED', message: 'Game has not started' };
    }

    const playerIndex = session.getPlayerIndex();
    if (playerIndex === null) {
      return { code: 'NOT_IN_ROOM', message: 'Not in room' };
    }

    // Turn validation - only current player can perform most actions
    // Some actions like CANCEL_SELECTION might be allowed for any player
    const turnRestrictedActions = [
      'SELECT_CARD',
      'SELECT_MARBLE',
      'SELECT_TARGET_NODE',
      'CONFIRM_MOVE',
      'BURN_CARD',
      'RESOLVE_10_DECISION',
      'RESOLVE_RED_Q_DECISION',
      'SELECT_STEP_COUNT',
      'RESOLVE_TURN',
    ];

    if (turnRestrictedActions.includes(action.type)) {
      if (!room.isCurrentPlayer(session.sessionId)) {
        return { code: 'NOT_YOUR_TURN', message: 'Not your turn' };
      }
    }

    // Card ownership validation for SELECT_CARD
    if (action.type === 'SELECT_CARD') {
      const cardId = (action as any).cardId;
      const player = gameState.players[playerIndex];
      const hasCard = player.hand.some(card => card.id === cardId);
      if (!hasCard) {
        return { code: 'INVALID_CARD', message: 'Card not in your hand' };
      }
    }

    // Marble ownership validation for SELECT_MARBLE
    if (action.type === 'SELECT_MARBLE') {
      const marbleId = (action as any).marbleId;
      // Marble validation is complex (depends on card type, Jack can select opponent marbles)
      // Let the game logic handle detailed validation
    }

    return null;
  }


  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Starts a game in a room
   */
  private startGame(room: ReturnType<RoomManager['getRoom']>): void {
    if (!room) {
      return;
    }

    const gameState = room.startGame();
    if (!gameState) {
      this.logger.error(`Failed to start game in room ${room.roomCode}`);
      return;
    }

    // Setup timer callbacks
    this.setupRoomTimerCallbacks(room);

    // Broadcast game started to all players using Room's broadcast method
    room.broadcastGameStarted();

    // Start turn timer
    room.startTurnTimer();

    this.logger.info(`Game started in room ${room.roomCode}`);
  }

  /**
   * Sets up timer callbacks for a room
   */
  private setupRoomTimerCallbacks(room: Room): void {
    // Timer update callback - broadcast to all players
    const onTimerUpdate = (timeRemaining: number, playerIndex: number) => {
      const timerMessage: TimerUpdateMessage = {
        type: 'TIMER_UPDATE',
        timeRemaining,
        currentPlayerIndex: playerIndex
      };
      
      for (const player of room.getPlayers()) {
        if (player.isConnected()) {
          player.send(timerMessage);
        }
      }
    };

    // Auto mode change callback
    const onAutoModeChange = (playerIndex: number, isAutoMode: boolean) => {
      const autoModeMessage: AutoModeChangedMessage = {
        type: 'AUTO_MODE_CHANGED',
        playerIndex,
        isAutoMode
      };
      
      for (const player of room.getPlayers()) {
        if (player.isConnected()) {
          player.send(autoModeMessage);
        }
      }

      // Add to action log
      this.logger.info(`Player ${playerIndex} ${isAutoMode ? 'entered' : 'exited'} auto mode in room ${room.roomCode}`);
    };

    // Auto play complete callback - restart timer for next turn
    const onAutoPlayComplete = () => {
      // Check if we need to auto-resolve the turn
      const gameState = room.getGameState();
      if (gameState?.phase === 'RESOLVING_MOVE') {
        // Auto-resolve the turn after a short delay
        setTimeout(() => {
          const state = room.getGameState();
          if (state?.phase === 'RESOLVING_MOVE') {
            room.processAction('', { type: 'RESOLVE_TURN' });
            room.broadcastStateUpdate();
            
            // Restart timer for next player
            room.startTurnTimer();
            
            // Check if next player is also in auto mode
            room.checkAndExecuteAutoPlay();
          }
        }, 500);
      } else {
        // Restart timer for next player
        room.startTurnTimer();
        
        // Check if next player is also in auto mode
        room.checkAndExecuteAutoPlay();
      }
    };

    room.setTimerCallbacks(onTimerUpdate, onAutoModeChange, onAutoPlayComplete);
  }

  /**
   * Handles PING message
   */
  private handlePing(session: PlayerSession): void {
    const pongMessage: ServerMessage = {
      type: 'PONG',
    };
    session.send(pongMessage);
  }
}

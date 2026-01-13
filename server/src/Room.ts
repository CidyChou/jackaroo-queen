/**
 * Room - Manages a single game room instance
 * 
 * Handles:
 * - Player management (add/remove)
 * - Game state via shared logic
 * - State filtering (hide other players' hands)
 * 
 * Requirements: 3.2, 3.3, 4.5
 */

import { v4 as uuidv4 } from 'uuid';
import { GameState, GameAction, Card, Player } from '../../shared/types.js';
import { createGameLogic, GameLogicConfig } from '../../shared/gameLogic.js';
import { PlayerSession } from './PlayerSession.js';
import { Logger } from './Logger.js';

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomConfig {
  maxPlayers: 2 | 4;
  roomCode: string;
}

// Server-side random implementations for game logic
const serverGameLogicConfig: GameLogicConfig = {
  generateId: () => uuidv4(),
  shuffleArray: <T>(arr: T[]): T[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  },
};

/**
 * Filters game state for a specific player by hiding other players' hands
 */
export const filterStateForPlayer = (
  state: GameState,
  playerIndex: number
): GameState => {
  const filteredPlayers = state.players.map((player: Player, index: number) => {
    if (index === playerIndex) {
      return player; // Own hand is fully visible
    }
    return {
      ...player,
      hand: player.hand.map((card: Card) => ({
        ...card,
        suit: 'hidden' as Card['suit'],
        rank: 'hidden' as Card['rank'],
      }))
    };
  });

  return {
    ...state,
    players: filteredPlayers,
    deck: [], // Hide deck from clients
  };
};


export class Room {
  readonly roomCode: string;
  readonly maxPlayers: 2 | 4;

  private status: RoomStatus;
  private players: Map<string, { session: PlayerSession; playerIndex: number }>;
  private gameState: GameState | null;
  private gameLogic: ReturnType<typeof createGameLogic>;
  private logger: Logger;
  private createdAt: number;
  private lastActivityAt: number;

  constructor(config: RoomConfig) {
    this.roomCode = config.roomCode;
    this.maxPlayers = config.maxPlayers;
    this.status = 'waiting';
    this.players = new Map();
    this.gameState = null;
    this.gameLogic = createGameLogic(serverGameLogicConfig);
    this.logger = new Logger(`Room:${config.roomCode}`);
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();

    this.logger.info(`Room created with max ${config.maxPlayers} players`);
  }

  // ============================================
  // Player Management
  // ============================================

  /**
   * Adds a player to the room
   * Returns true if successful, false if room is full
   */
  addPlayer(session: PlayerSession): boolean {
    if (this.isFull()) {
      this.logger.warn(`Cannot add player ${session.sessionId}: room is full`);
      return false;
    }

    if (this.status !== 'waiting') {
      this.logger.warn(`Cannot add player ${session.sessionId}: game already started`);
      return false;
    }

    // Find next available player index
    const usedIndices = new Set(
      Array.from(this.players.values()).map(p => p.playerIndex)
    );
    let playerIndex = 0;
    while (usedIndices.has(playerIndex)) {
      playerIndex++;
    }

    this.players.set(session.sessionId, { session, playerIndex });
    session.setRoom(this.roomCode, playerIndex);
    this.lastActivityAt = Date.now();

    this.logger.info(`Player ${session.sessionId} joined as player ${playerIndex}`);
    return true;
  }

  /**
   * Removes a player from the room
   */
  removePlayer(sessionId: string): void {
    const playerData = this.players.get(sessionId);
    if (!playerData) {
      return;
    }

    playerData.session.clearRoom();
    this.players.delete(sessionId);
    this.lastActivityAt = Date.now();

    this.logger.info(`Player ${sessionId} left the room`);

    // If game is in progress and all players left, mark as finished
    if (this.status === 'playing' && this.isEmpty()) {
      this.status = 'finished';
      this.logger.info('Room marked as finished (all players left)');
    }
  }

  /**
   * Returns all player sessions in the room
   */
  getPlayers(): PlayerSession[] {
    return Array.from(this.players.values()).map(p => p.session);
  }

  /**
   * Returns player info for room state
   */
  getPlayerInfo(): { index: number; connected: boolean }[] {
    return Array.from(this.players.values()).map(p => ({
      index: p.playerIndex,
      connected: p.session.isConnected(),
    }));
  }

  /**
   * Returns true if the room is at max capacity
   */
  isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  /**
   * Returns true if the room has no players
   */
  isEmpty(): boolean {
    return this.players.size === 0;
  }

  /**
   * Returns the number of players in the room
   */
  getPlayerCount(): number {
    return this.players.size;
  }

  // ============================================
  // Game Control
  // ============================================

  /**
   * Starts the game if room is full
   * Returns the initial game state or null if cannot start
   */
  startGame(): GameState | null {
    if (!this.isFull()) {
      this.logger.warn('Cannot start game: room not full');
      return null;
    }

    if (this.status !== 'waiting') {
      this.logger.warn('Cannot start game: already started');
      return null;
    }

    this.gameState = this.gameLogic.createInitialState(this.maxPlayers);
    this.status = 'playing';
    this.lastActivityAt = Date.now();

    this.logger.info('Game started');
    return this.gameState;
  }

  /**
   * Processes a game action from a player
   * Returns the new game state or null if action is invalid
   */
  processAction(sessionId: string, action: GameAction): GameState | null {
    if (this.status !== 'playing' || !this.gameState) {
      this.logger.warn(`Cannot process action: game not in progress`);
      return null;
    }

    const playerData = this.players.get(sessionId);
    if (!playerData) {
      this.logger.warn(`Cannot process action: player ${sessionId} not in room`);
      return null;
    }

    // Use enhanced reducer for target node selection
    const newState = this.gameLogic.enhancedGameReducer(this.gameState, action);
    
    // Check if state actually changed (action was valid)
    if (newState === this.gameState) {
      this.logger.debug('Action did not change state', { action });
      return null;
    }

    this.gameState = newState;
    this.lastActivityAt = Date.now();

    this.logger.debug('Action processed', { action: action.type });
    return this.gameState;
  }

  // ============================================
  // State Queries
  // ============================================

  /**
   * Returns the current room status
   */
  getStatus(): RoomStatus {
    return this.status;
  }

  /**
   * Returns the raw game state (for internal use)
   */
  getGameState(): GameState | null {
    return this.gameState;
  }

  /**
   * Returns the game state filtered for a specific player
   * Hides other players' hands
   */
  getStateForPlayer(sessionId: string): GameState | null {
    if (!this.gameState) {
      return null;
    }

    const playerData = this.players.get(sessionId);
    if (!playerData) {
      return null;
    }

    return filterStateForPlayer(this.gameState, playerData.playerIndex);
  }

  /**
   * Returns the player index for a session
   */
  getPlayerIndexBySessionId(sessionId: string): number | null {
    const playerData = this.players.get(sessionId);
    return playerData?.playerIndex ?? null;
  }

  /**
   * Returns true if the session is the current player's turn
   */
  isCurrentPlayer(sessionId: string): boolean {
    if (!this.gameState) {
      return false;
    }

    const playerData = this.players.get(sessionId);
    if (!playerData) {
      return false;
    }

    return playerData.playerIndex === this.gameState.currentPlayerIndex;
  }

  /**
   * Returns the creation timestamp
   */
  getCreatedAt(): number {
    return this.createdAt;
  }

  /**
   * Returns the last activity timestamp
   */
  getLastActivityAt(): number {
    return this.lastActivityAt;
  }

  // ============================================
  // State Broadcasting
  // ============================================

  /**
   * Broadcasts the current game state to all connected players
   * Each player receives a filtered state (hiding other players' hands)
   * Disconnected players are skipped
   * 
   * Requirements: 4.1, 4.2
   */
  broadcastState(createMessage: (state: GameState) => { type: string; state: GameState }): void {
    if (!this.gameState) {
      this.logger.warn('Cannot broadcast state: no game state');
      return;
    }

    for (const [sessionId, playerData] of this.players) {
      const { session } = playerData;

      // Skip disconnected players
      if (!session.isConnected()) {
        this.logger.debug(`Skipping broadcast to disconnected player ${sessionId}`);
        continue;
      }

      // Get filtered state for this player
      const filteredState = filterStateForPlayer(this.gameState, playerData.playerIndex);
      
      // Create and send the message
      const message = createMessage(filteredState);
      const sent = session.send(message as any);
      
      if (!sent) {
        this.logger.warn(`Failed to send state update to player ${sessionId}`);
      }
    }

    this.logger.debug('State broadcast complete');
  }

  /**
   * Broadcasts a state update message to all connected players
   * Convenience method that creates STATE_UPDATE messages
   * 
   * Requirements: 4.1, 4.2
   */
  broadcastStateUpdate(): void {
    this.broadcastState((state) => ({
      type: 'STATE_UPDATE',
      state,
    }));
  }

  /**
   * Broadcasts a game started message to all connected players
   * Convenience method that creates GAME_STARTED messages
   */
  broadcastGameStarted(): void {
    this.broadcastState((state) => ({
      type: 'GAME_STARTED',
      state,
    }));
  }
}

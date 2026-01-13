/**
 * PlayerSession - Manages individual player connection state
 * 
 * Handles:
 * - Connection status (connected/disconnected/reconnecting)
 * - 60-second reconnection window
 * - Room association
 * - Message sending
 * 
 * Requirements: 2.1, 2.2, 2.3
 */

import { WebSocket } from 'ws';
import { ServerMessage, serializeServerMessage } from './protocol.js';
import { Logger } from './Logger.js';

export type SessionStatus = 'connected' | 'disconnected' | 'reconnecting';

const RECONNECT_WINDOW_MS = 60 * 1000; // 60 seconds

export class PlayerSession {
  readonly sessionId: string;

  private ws: WebSocket | null;
  private status: SessionStatus;
  private roomCode: string | null;
  private playerIndex: number | null;
  private disconnectedAt: number | null;
  private logger: Logger;

  constructor(sessionId: string, ws: WebSocket) {
    this.sessionId = sessionId;
    this.ws = ws;
    this.status = 'connected';
    this.roomCode = null;
    this.playerIndex = null;
    this.disconnectedAt = null;
    this.logger = new Logger(`Session:${sessionId.slice(0, 8)}`);

    this.logger.info('Session created');
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Updates the WebSocket connection for this session
   */
  setWebSocket(ws: WebSocket): void {
    this.ws = ws;
    this.status = 'connected';
    this.disconnectedAt = null;
    this.logger.info('WebSocket updated');
  }

  /**
   * Marks the session as disconnected and records the disconnect time
   */
  disconnect(): void {
    this.ws = null;
    this.status = 'disconnected';
    this.disconnectedAt = Date.now();
    this.logger.info('Session disconnected');
  }

  /**
   * Attempts to reconnect the session with a new WebSocket
   * Only succeeds if within the 60-second reconnection window
   */
  reconnect(ws: WebSocket): boolean {
    if (!this.canReconnect()) {
      this.logger.warn('Reconnection attempt outside window');
      return false;
    }

    this.ws = ws;
    this.status = 'connected';
    this.disconnectedAt = null;
    this.logger.info('Session reconnected');
    return true;
  }

  /**
   * Returns true if the session is currently connected
   */
  isConnected(): boolean {
    return this.status === 'connected' && this.ws !== null;
  }

  /**
   * Returns true if the session can be reconnected (within 60-second window)
   */
  canReconnect(): boolean {
    if (this.status === 'connected') {
      return false; // Already connected
    }

    if (this.disconnectedAt === null) {
      return false; // Never disconnected
    }

    const elapsed = Date.now() - this.disconnectedAt;
    return elapsed < RECONNECT_WINDOW_MS;
  }

  /**
   * Returns the current session status
   */
  getStatus(): SessionStatus {
    return this.status;
  }

  /**
   * Returns the time remaining in the reconnection window (in ms)
   * Returns 0 if not in a reconnectable state
   */
  getReconnectTimeRemaining(): number {
    if (this.disconnectedAt === null || this.status === 'connected') {
      return 0;
    }

    const elapsed = Date.now() - this.disconnectedAt;
    const remaining = RECONNECT_WINDOW_MS - elapsed;
    return Math.max(0, remaining);
  }

  // ============================================
  // Room Association
  // ============================================

  /**
   * Associates this session with a room
   */
  setRoom(roomCode: string, playerIndex: number): void {
    this.roomCode = roomCode;
    this.playerIndex = playerIndex;
    this.logger.info(`Joined room ${roomCode} as player ${playerIndex}`);
  }

  /**
   * Clears the room association
   */
  clearRoom(): void {
    this.logger.info(`Left room ${this.roomCode}`);
    this.roomCode = null;
    this.playerIndex = null;
  }

  /**
   * Returns the room code this session is associated with
   */
  getRoomCode(): string | null {
    return this.roomCode;
  }

  /**
   * Returns the player index in the room
   */
  getPlayerIndex(): number | null {
    return this.playerIndex;
  }

  /**
   * Returns true if the session is in a room
   */
  isInRoom(): boolean {
    return this.roomCode !== null;
  }

  // ============================================
  // Message Sending
  // ============================================

  /**
   * Sends a message to the client
   * Returns true if the message was sent successfully
   */
  send(message: ServerMessage): boolean {
    if (!this.isConnected() || this.ws === null) {
      this.logger.warn('Cannot send message: not connected');
      return false;
    }

    try {
      const serialized = serializeServerMessage(message);
      this.ws.send(serialized);
      this.logger.debug('Message sent', { type: message.type });
      return true;
    } catch (error) {
      this.logger.error('Failed to send message', error);
      return false;
    }
  }

  /**
   * Returns the underlying WebSocket (for advanced operations)
   */
  getWebSocket(): WebSocket | null {
    return this.ws;
  }
}

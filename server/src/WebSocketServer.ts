/**
 * WebSocketServer - Main WebSocket server for Jackaroo game
 * 
 * Handles:
 * - Connection management
 * - Disconnection handling
 * - Message routing
 * - Session management
 * 
 * Requirements: 2.1, 2.2, 2.4, 2.5
 */

import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { PlayerSession } from './PlayerSession.js';
import { RoomManager } from './RoomManager.js';
import { Logger } from './Logger.js';

// Forward declaration for MessageHandler to avoid circular dependency
export interface IMessageHandler {
  handleMessage(session: PlayerSession, rawMessage: string): void;
  handleDisconnect(session: PlayerSession): void;
}

export interface WebSocketServerConfig {
  port: number;
  maxConnections: number;
  messageHandler: IMessageHandler;
  roomManager: RoomManager;
}

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

// Connection timeout (if no pong received)
const CONNECTION_TIMEOUT_MS = 60 * 1000;

export class WebSocketServer {
  private wss: WSServer | null = null;
  private sessions: Map<string, PlayerSession>;
  private config: WebSocketServerConfig;
  private logger: Logger;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Track WebSocket to session mapping
  private wsToSession: Map<WebSocket, string>;

  constructor(config: WebSocketServerConfig) {
    this.config = config;
    this.sessions = new Map();
    this.wsToSession = new Map();
    this.logger = new Logger('WebSocketServer');
  }

  /**
   * Starts the WebSocket server
   */
  start(): void {
    if (this.wss) {
      this.logger.warn('Server already started');
      return;
    }

    this.wss = new WSServer({ port: this.config.port });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    this.wss.on('error', (error: Error) => {
      this.logger.error('WebSocket server error', error);
    });

    // Start room cleanup
    this.config.roomManager.startCleanup();

    // Start heartbeat
    this.startHeartbeat();

    this.logger.info(`WebSocket server started on port ${this.config.port}`);
  }

  /**
   * Stops the WebSocket server
   */
  stop(): void {
    // Stop heartbeat
    this.stopHeartbeat();

    // Stop room cleanup
    this.config.roomManager.stopCleanup();

    // Close all connections
    for (const [sessionId, session] of this.sessions) {
      const ws = session.getWebSocket();
      if (ws) {
        ws.close(1001, 'Server shutting down');
      }
    }

    // Clear all sessions
    this.sessions.clear();
    this.wsToSession.clear();

    // Close server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Destroy all rooms
    this.config.roomManager.destroyAllRooms();

    this.logger.info('WebSocket server stopped');
  }


  // ============================================
  // Connection Handling
  // ============================================

  /**
   * Handles a new WebSocket connection
   * Requirements: 7.3 - logs connection events
   */
  private handleConnection(ws: WebSocket): void {
    // Check max connections
    if (this.sessions.size >= this.config.maxConnections) {
      this.logger.warn('Max connections reached, rejecting new connection');
      ws.close(1013, 'Server at capacity');
      return;
    }

    // Create new session
    const sessionId = uuidv4();
    const session = new PlayerSession(sessionId, ws);
    
    this.sessions.set(sessionId, session);
    this.wsToSession.set(ws, sessionId);

    // Log connection event (Requirements: 7.3)
    this.logger.logConnectionEvent('connect', sessionId, {
      totalSessions: this.sessions.size,
    });

    // Set up event handlers
    ws.on('message', (data: Buffer | string) => {
      this.handleMessage(ws, data);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.handleDisconnection(ws, code, reason.toString());
    });

    ws.on('error', (error: Error) => {
      this.handleError(ws, error);
    });

    ws.on('pong', () => {
      // Mark connection as alive for heartbeat
      (ws as any).isAlive = true;
    });

    // Mark as alive initially
    (ws as any).isAlive = true;
  }

  /**
   * Handles WebSocket disconnection
   * Requirements: 7.3 - logs connection events
   */
  private handleDisconnection(ws: WebSocket, code: number, reason: string): void {
    const sessionId = this.wsToSession.get(ws);
    if (!sessionId) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.wsToSession.delete(ws);
      return;
    }

    // Log disconnection event (Requirements: 7.3)
    this.logger.logConnectionEvent('disconnect', sessionId, {
      code,
      reason,
      roomCode: session.getRoomCode(),
    });

    // Notify message handler of disconnect
    this.config.messageHandler.handleDisconnect(session);

    // Mark session as disconnected (allows reconnection within 60s)
    session.disconnect();

    // Clean up WebSocket mapping
    this.wsToSession.delete(ws);

    // Schedule session cleanup after reconnection window
    setTimeout(() => {
      this.cleanupSession(sessionId);
    }, 65 * 1000); // 65 seconds (slightly longer than reconnect window)
  }

  /**
   * Handles WebSocket errors
   * Requirements: 7.1 - catches errors and prevents server crash
   */
  private handleError(ws: WebSocket, error: Error): void {
    const sessionId = this.wsToSession.get(ws);
    this.logger.error(`WebSocket error for session ${sessionId}`, error);

    // Report to global error handler
    Logger.reportError(error, `WebSocketServer.handleError:${sessionId}`);

    // Close the connection on error
    try {
      ws.close(1011, 'Internal error');
    } catch (closeError) {
      // Ignore close errors - connection may already be closed
      this.logger.debug('Error closing WebSocket after error', closeError);
    }
  }


  // ============================================
  // Message Handling
  // ============================================

  /**
   * Handles incoming WebSocket messages
   */
  private handleMessage(ws: WebSocket, data: Buffer | string): void {
    const sessionId = this.wsToSession.get(ws);
    if (!sessionId) {
      this.logger.warn('Message from unknown WebSocket');
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`Message from unknown session: ${sessionId}`);
      return;
    }

    const rawMessage = typeof data === 'string' ? data : data.toString('utf-8');

    // Delegate to message handler
    this.config.messageHandler.handleMessage(session, rawMessage);
  }

  // ============================================
  // Session Management
  // ============================================

  /**
   * Gets a session by ID
   */
  getSession(sessionId: string): PlayerSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Gets the total number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Cleans up a session if it's no longer reconnectable
   */
  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Only cleanup if session is still disconnected and can't reconnect
    if (!session.isConnected() && !session.canReconnect()) {
      // Leave any room the session was in
      this.config.roomManager.leaveRoom(sessionId);
      
      // Remove session
      this.sessions.delete(sessionId);
      this.logger.info(`Session ${sessionId} cleaned up (reconnection window expired)`);
    }
  }

  /**
   * Handles reconnection attempt
   * Requirements: 7.3 - logs connection events
   */
  handleReconnection(sessionId: string, ws: WebSocket): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (!session.canReconnect()) {
      return false;
    }

    // Update WebSocket mapping
    const oldWs = session.getWebSocket();
    if (oldWs) {
      this.wsToSession.delete(oldWs);
    }

    session.reconnect(ws);
    this.wsToSession.set(ws, sessionId);

    // Log reconnection event (Requirements: 7.3)
    this.logger.logConnectionEvent('reconnect', sessionId, {
      roomCode: session.getRoomCode(),
    });

    return true;
  }


  // ============================================
  // Broadcasting
  // ============================================

  /**
   * Sends a message to a specific session
   */
  sendToSession(sessionId: string, message: object): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    return session.send(message as any);
  }

  /**
   * Broadcasts a message to all sessions in a room
   */
  broadcastToRoom(roomCode: string, message: object): void {
    const room = this.config.roomManager.getRoom(roomCode);
    if (!room) {
      return;
    }

    for (const player of room.getPlayers()) {
      player.send(message as any);
    }
  }

  // ============================================
  // Heartbeat
  // ============================================

  /**
   * Starts the heartbeat mechanism to detect dead connections
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      return;
    }

    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) {
        return;
      }

      this.wss.clients.forEach((ws: WebSocket) => {
        if ((ws as any).isAlive === false) {
          // Connection is dead, terminate it
          this.logger.debug('Terminating dead connection');
          return ws.terminate();
        }

        // Mark as not alive and send ping
        (ws as any).isAlive = false;
        ws.ping();
      });
    }, HEARTBEAT_INTERVAL_MS);

    this.logger.debug('Heartbeat started');
  }

  /**
   * Stops the heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.logger.debug('Heartbeat stopped');
    }
  }
}

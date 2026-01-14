/**
 * WebSocket Service for Online Matchmaking
 * Manages WebSocket connection, message handling, and reconnection logic
 * Requirements: 2.1, 2.2, 2.4, 7.1, 7.2
 */

// Re-export protocol types from shared for convenience
export type {
  ClientMessage,
  ServerMessage,
  ClientMessageType,
  ServerMessageType,
  CreateRoomMessage,
  JoinRoomMessage,
  LeaveRoomMessage,
  GameActionMessage,
  PingMessage,
  RoomCreatedMessage,
  RoomJoinedMessage,
  PlayerJoinedMessage,
  PlayerLeftMessage,
  GameStartedMessage,
  StateUpdateMessage,
  ErrorMessage,
  PongMessage,
  ErrorCode,
} from '../shared/protocol';

import type { ClientMessage, ServerMessage } from '../shared/protocol';

// ============================================
// Connection State
// ============================================

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// ============================================
// Event Listeners
// ============================================

export type StateChangeListener = (state: ConnectionState) => void;
export type MessageListener = (message: ServerMessage) => void;
export type ErrorListener = (error: string) => void;

// ============================================
// WebSocket Service Class
// ============================================

export class WebSocketService {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private serverUrl: string = '';
  
  // Listeners
  private stateChangeListeners: Set<StateChangeListener> = new Set();
  private messageListeners: Set<MessageListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();
  
  // Ping/Pong
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private readonly PING_INTERVAL_MS = 30000; // 30 seconds
  
  // Reconnection
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect: boolean = false;

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Connect to WebSocket server
   * Requirements: 2.1
   */
  connect(serverUrl: string): void {
    // If already connected to the same server, do nothing
    if (this.serverUrl === serverUrl && this.state === 'connected') {
      return;
    }
    
    // If there's an existing connection (even if connecting), close it first
    if (this.ws) {
      this.shouldReconnect = false;
      this.ws.close(1000, 'New connection requested');
      this.ws = null;
      this.stopPingPong();
      this.clearReconnectTimeout();
    }

    this.serverUrl = serverUrl;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.setState('connecting');

    try {
      this.ws = new WebSocket(serverUrl);
      this.setupEventHandlers();
    } catch (error) {
      this.setState('error');
      this.notifyError(`Failed to create WebSocket: ${error}`);
    }
  }

  /**
   * Disconnect from WebSocket server
   * Requirements: 2.4
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.stopPingPong();
    this.clearReconnectTimeout();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }

    this.setState('disconnected');
  }

  /**
   * Send a message to the server
   */
  send(message: ClientMessage): void {
    if (this.state !== 'connected' || !this.ws) {
      this.notifyError('Cannot send message: not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      this.notifyError(`Failed to send message: ${error}`);
    }
  }

  /**
   * Register a state change listener
   */
  onStateChange(listener: StateChangeListener): () => void {
    this.stateChangeListeners.add(listener);
    return () => this.stateChangeListeners.delete(listener);
  }

  /**
   * Register a message listener
   */
  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  /**
   * Register an error listener
   */
  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  // ============================================
  // Private Methods
  // ============================================

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.setState('connected');
      this.reconnectAttempts = 0;
      this.startPingPong();
    };

    this.ws.onclose = (event) => {
      this.stopPingPong();
      
      if (this.shouldReconnect && !event.wasClean) {
        this.handleReconnect();
      } else {
        this.setState('disconnected');
      }
    };

    this.ws.onerror = () => {
      this.notifyError('WebSocket connection error');
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as ServerMessage;
      
      // Handle PONG internally
      if (message.type === 'PONG') {
        // Connection is alive, nothing else to do
        return;
      }

      // Notify all message listeners
      this.messageListeners.forEach(listener => listener(message));
    } catch (error) {
      this.notifyError(`Failed to parse message: ${error}`);
    }
  }

  /**
   * Start ping/pong heartbeat
   * Requirements: 2.2
   */
  private startPingPong(): void {
    this.stopPingPong();
    
    this.pingInterval = setInterval(() => {
      if (this.state === 'connected') {
        this.send({ type: 'PING' });
      }
    }, this.PING_INTERVAL_MS);
  }

  private stopPingPong(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Handle automatic reconnection
   * Requirements: 7.1, 7.2
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      this.setState('error');
      this.notifyError('Failed to reconnect after 3 attempts');
      this.shouldReconnect = false;
      return;
    }

    this.reconnectAttempts++;
    this.setState('connecting');

    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, this.reconnectAttempts - 1) * 1000;

    this.reconnectTimeout = setTimeout(() => {
      if (this.shouldReconnect) {
        try {
          this.ws = new WebSocket(this.serverUrl);
          this.setupEventHandlers();
        } catch (error) {
          this.handleReconnect();
        }
      }
    }, delay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateChangeListeners.forEach(listener => listener(newState));
    }
  }

  private notifyError(error: string): void {
    this.errorListeners.forEach(listener => listener(error));
  }
}

// Export singleton instance
export const webSocketService = new WebSocketService();

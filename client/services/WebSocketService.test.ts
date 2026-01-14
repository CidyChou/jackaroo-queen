/**
 * Unit Tests for WebSocketService
 * Requirements: 2.1, 2.2, 2.4, 7.1, 7.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketService, ConnectionState, ServerMessage, ClientMessage } from './WebSocketService';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onclose: ((event: { wasClean: boolean }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateClose(wasClean = false) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ wasClean });
  }

  simulateError() {
    this.onerror?.();
  }

  simulateMessage(data: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  static getLatest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  static clearInstances() {
    MockWebSocket.instances = [];
  }
}

describe('WebSocketService', () => {
  let service: WebSocketService;
  const originalWebSocket = global.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.clearInstances();
    service = new WebSocketService();
    
    // Mock WebSocket constructor
    (global as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    global.WebSocket = originalWebSocket;
    service.disconnect();
  });

  describe('Connection Management (Requirements 2.1, 2.4)', () => {
    it('should start in disconnected state', () => {
      expect(service.getState()).toBe('disconnected');
    });

    it('should transition to connecting state when connect is called', () => {
      const stateChanges: ConnectionState[] = [];
      service.onStateChange((state) => stateChanges.push(state));

      service.connect('ws://localhost:8080');

      expect(stateChanges).toContain('connecting');
    });

    it('should transition to connected state when WebSocket opens', () => {
      const stateChanges: ConnectionState[] = [];
      service.onStateChange((state) => stateChanges.push(state));

      service.connect('ws://localhost:8080');
      const mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();

      expect(service.getState()).toBe('connected');
      expect(stateChanges).toContain('connected');
    });

    it('should not create multiple connections if already connected to same server', () => {
      service.connect('ws://localhost:8080');
      const mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();
      
      // Try to connect again to the same server while already connected
      service.connect('ws://localhost:8080');

      // Should still only have one instance (the original one)
      expect(MockWebSocket.instances.length).toBe(1);
    });

    it('should disconnect gracefully', () => {
      service.connect('ws://localhost:8080');
      const mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();

      service.disconnect();

      expect(mockWs.close).toHaveBeenCalledWith(1000, 'Client disconnecting');
      expect(service.getState()).toBe('disconnected');
    });
  });

  describe('Message Sending', () => {
    it('should send messages when connected', () => {
      service.connect('ws://localhost:8080');
      const mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();

      const message: ClientMessage = { type: 'CREATE_ROOM', playerCount: 2 };
      service.send(message);

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('should notify error when sending while disconnected', () => {
      const errors: string[] = [];
      service.onError((error) => errors.push(error));

      service.send({ type: 'PING' });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('not connected');
    });
  });

  describe('Message Receiving', () => {
    it('should notify listeners when message is received', () => {
      const messages: ServerMessage[] = [];
      service.onMessage((msg) => messages.push(msg));

      service.connect('ws://localhost:8080');
      const mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();

      const serverMessage: ServerMessage = {
        type: 'ROOM_CREATED',
        roomCode: 'ABC123',
        playerIndex: 0,
      };
      mockWs.simulateMessage(serverMessage);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(serverMessage);
    });

    it('should handle PONG messages internally without notifying listeners', () => {
      const messages: ServerMessage[] = [];
      service.onMessage((msg) => messages.push(msg));

      service.connect('ws://localhost:8080');
      const mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();

      mockWs.simulateMessage({ type: 'PONG' });

      expect(messages).toHaveLength(0);
    });
  });

  describe('Ping/Pong Heartbeat (Requirement 2.2)', () => {
    it('should send PING every 30 seconds when connected', () => {
      service.connect('ws://localhost:8080');
      const mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();

      // Clear initial calls
      mockWs.send.mockClear();

      // Advance 30 seconds
      vi.advanceTimersByTime(30000);

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'PING' }));
    });

    it('should stop ping when disconnected', () => {
      service.connect('ws://localhost:8080');
      const mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();

      service.disconnect();
      mockWs.send.mockClear();

      // Advance 30 seconds
      vi.advanceTimersByTime(30000);

      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });

  describe('Auto Reconnection (Requirements 7.1, 7.2)', () => {
    it('should attempt to reconnect on unexpected disconnect', () => {
      service.connect('ws://localhost:8080');
      const mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();

      // Simulate unexpected disconnect
      mockWs.simulateClose(false);

      expect(service.getState()).toBe('connecting');
    });

    it('should not reconnect on clean disconnect', () => {
      service.connect('ws://localhost:8080');
      const mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();

      // Simulate clean disconnect
      mockWs.simulateClose(true);

      expect(service.getState()).toBe('disconnected');
    });

    it('should retry up to 3 times with exponential backoff', () => {
      service.connect('ws://localhost:8080');
      let mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();

      // First disconnect
      mockWs.simulateClose(false);
      expect(MockWebSocket.instances.length).toBe(1);

      // Wait for first retry (1 second)
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances.length).toBe(2);

      // Simulate failure
      mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateClose(false);

      // Wait for second retry (2 seconds)
      vi.advanceTimersByTime(2000);
      expect(MockWebSocket.instances.length).toBe(3);

      // Simulate failure
      mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateClose(false);

      // Wait for third retry (4 seconds)
      vi.advanceTimersByTime(4000);
      expect(MockWebSocket.instances.length).toBe(4);
    });

    it('should set error state after 3 failed reconnection attempts', () => {
      const errors: string[] = [];
      service.onError((error) => errors.push(error));

      service.connect('ws://localhost:8080');
      let mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();

      // Simulate 3 failed reconnection attempts
      for (let i = 0; i < 3; i++) {
        mockWs.simulateClose(false);
        vi.advanceTimersByTime(Math.pow(2, i) * 1000);
        mockWs = MockWebSocket.getLatest()!;
      }

      // Fourth disconnect should trigger error state
      mockWs.simulateClose(false);

      expect(service.getState()).toBe('error');
      expect(errors.some(e => e.includes('3 attempts'))).toBe(true);
    });
  });

  describe('Listener Management', () => {
    it('should allow unsubscribing from state changes', () => {
      const stateChanges: ConnectionState[] = [];
      const unsubscribe = service.onStateChange((state) => stateChanges.push(state));

      service.connect('ws://localhost:8080');
      unsubscribe();
      const mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();

      // Should only have 'connecting', not 'connected'
      expect(stateChanges).toEqual(['connecting']);
    });

    it('should allow unsubscribing from messages', () => {
      const messages: ServerMessage[] = [];
      const unsubscribe = service.onMessage((msg) => messages.push(msg));

      service.connect('ws://localhost:8080');
      const mockWs = MockWebSocket.getLatest()!;
      mockWs.simulateOpen();
      unsubscribe();

      mockWs.simulateMessage({ type: 'ROOM_CREATED', roomCode: 'ABC', playerIndex: 0 });

      expect(messages).toHaveLength(0);
    });

    it('should allow unsubscribing from errors', () => {
      const errors: string[] = [];
      const unsubscribe = service.onError((error) => errors.push(error));

      unsubscribe();
      service.send({ type: 'PING' }); // Should trigger error

      expect(errors).toHaveLength(0);
    });
  });
});

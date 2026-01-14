/**
 * Property Test: Ping/Pong Connection Maintenance
 * Feature: online-matchmaking, Property 1: Ping/Pong Connection Maintenance
 * 
 * *For any* active WebSocket connection, the Matchmaking_Service SHALL send 
 * PING messages at regular intervals (every 30 seconds) to maintain the connection.
 * 
 * **Validates: Requirements 2.2**
 */

import * as fc from 'fast-check';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketService } from '../../WebSocketService';

// Mock WebSocket for testing
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
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send = vi.fn((data: string) => {
    this.sentMessages.push(data);
  });

  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateClose(wasClean = false) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ wasClean });
  }

  simulatePong() {
    this.onmessage?.({ data: JSON.stringify({ type: 'PONG' }) });
  }

  static getLatest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  static clearInstances() {
    MockWebSocket.instances = [];
  }

  getPingCount(): number {
    return this.sentMessages.filter(msg => {
      try {
        const parsed = JSON.parse(msg);
        return parsed.type === 'PING';
      } catch {
        return false;
      }
    }).length;
  }
}

describe('Property 1: Ping/Pong Connection Maintenance', () => {
  const originalWebSocket = global.WebSocket;
  const PING_INTERVAL_MS = 30000; // 30 seconds

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.clearInstances();
    (global as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    global.WebSocket = originalWebSocket;
  });

  /**
   * Property 1.1: For any number of ping intervals elapsed, the service
   * SHALL send exactly that many PING messages while connected.
   */
  it('sends PING messages at regular 30-second intervals while connected', () => {
    fc.assert(
      fc.property(
        // Generate number of intervals to test (1 to 10)
        fc.integer({ min: 1, max: 10 }),
        (intervalCount) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          
          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();
          
          // Clear any initial messages
          mockWs.sentMessages = [];
          
          // Advance time by the specified number of intervals
          vi.advanceTimersByTime(PING_INTERVAL_MS * intervalCount);
          
          // Verify: should have sent exactly intervalCount PING messages
          const pingCount = mockWs.getPingCount();
          
          // Cleanup
          service.disconnect();
          
          return pingCount === intervalCount;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.2: For any connection duration less than the ping interval,
   * no PING messages should be sent.
   */
  it('does not send PING before the first interval elapses', () => {
    fc.assert(
      fc.property(
        // Generate time less than ping interval (1ms to 29999ms)
        fc.integer({ min: 1, max: PING_INTERVAL_MS - 1 }),
        (elapsedTime) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          
          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();
          
          // Clear any initial messages
          mockWs.sentMessages = [];
          
          // Advance time by less than one interval
          vi.advanceTimersByTime(elapsedTime);
          
          // Verify: should have sent 0 PING messages
          const pingCount = mockWs.getPingCount();
          
          // Cleanup
          service.disconnect();
          
          return pingCount === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.3: For any disconnection event, PING messages should stop.
   */
  it('stops sending PING messages after disconnection', () => {
    fc.assert(
      fc.property(
        // Generate time to stay connected before disconnect (1 to 5 intervals)
        fc.integer({ min: 1, max: 5 }),
        // Generate additional time after disconnect (1 to 5 intervals)
        fc.integer({ min: 1, max: 5 }),
        (connectedIntervals, disconnectedIntervals) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          
          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();
          
          // Clear any initial messages
          mockWs.sentMessages = [];
          
          // Advance time while connected
          vi.advanceTimersByTime(PING_INTERVAL_MS * connectedIntervals);
          const pingCountBeforeDisconnect = mockWs.getPingCount();
          
          // Disconnect
          service.disconnect();
          
          // Advance more time after disconnect
          vi.advanceTimersByTime(PING_INTERVAL_MS * disconnectedIntervals);
          const pingCountAfterDisconnect = mockWs.getPingCount();
          
          // Verify: ping count should not increase after disconnect
          return pingCountAfterDisconnect === pingCountBeforeDisconnect &&
                 pingCountBeforeDisconnect === connectedIntervals;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.4: PING messages should be correctly formatted.
   */
  it('sends correctly formatted PING messages', () => {
    fc.assert(
      fc.property(
        // Generate number of pings to verify (1 to 5)
        fc.integer({ min: 1, max: 5 }),
        (pingCount) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          
          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();
          
          // Clear any initial messages
          mockWs.sentMessages = [];
          
          // Advance time to generate pings
          vi.advanceTimersByTime(PING_INTERVAL_MS * pingCount);
          
          // Verify: all PING messages should be correctly formatted
          const pingMessages = mockWs.sentMessages.filter(msg => {
            try {
              const parsed = JSON.parse(msg);
              return parsed.type === 'PING';
            } catch {
              return false;
            }
          });
          
          const allCorrectlyFormatted = pingMessages.every(msg => {
            try {
              const parsed = JSON.parse(msg);
              // PING message should only have 'type' field
              return parsed.type === 'PING' && Object.keys(parsed).length === 1;
            } catch {
              return false;
            }
          });
          
          // Cleanup
          service.disconnect();
          
          return pingMessages.length === pingCount && allCorrectlyFormatted;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.5: Connection state must be 'connected' for PING to be sent.
   */
  it('only sends PING when connection state is connected', () => {
    fc.assert(
      fc.property(
        // Generate number of intervals to test
        fc.integer({ min: 1, max: 5 }),
        (intervalCount) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          
          // Start connecting but don't complete
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          
          // Don't call simulateOpen() - stay in 'connecting' state
          mockWs.sentMessages = [];
          
          // Advance time
          vi.advanceTimersByTime(PING_INTERVAL_MS * intervalCount);
          
          // Verify: no PING should be sent while not connected
          const pingCount = mockWs.getPingCount();
          
          // Cleanup
          service.disconnect();
          
          return pingCount === 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});

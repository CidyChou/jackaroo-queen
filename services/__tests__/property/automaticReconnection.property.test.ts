/**
 * Property Test: Automatic Reconnection
 * Feature: online-matchmaking, Property 4: Automatic Reconnection
 * 
 * *For any* unexpected WebSocket disconnection during an active game, the Client SHALL 
 * attempt to reconnect automatically up to 3 times before showing an error.
 * 
 * **Validates: Requirements 7.1, 7.2**
 */

import * as fc from 'fast-check';
import { describe, it, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketService, ConnectionState } from '../../WebSocketService';

// ============================================
// Mock WebSocket
// ============================================

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  static connectionAttempts: number = 0;

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
    MockWebSocket.connectionAttempts++;
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

  simulateError() {
    this.onerror?.();
  }

  static getLatest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  static clearInstances() {
    MockWebSocket.instances = [];
    MockWebSocket.connectionAttempts = 0;
  }

  static getConnectionAttempts(): number {
    return MockWebSocket.connectionAttempts;
  }
}

describe('Property 4: Automatic Reconnection', () => {
  const originalWebSocket = global.WebSocket;
  const MAX_RECONNECT_ATTEMPTS = 3;

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
   * Property 4.1: For any unexpected disconnection, the service SHALL attempt
   * to reconnect automatically.
   */
  it('attempts to reconnect after unexpected disconnection', () => {
    fc.assert(
      fc.property(
        // Generate a random number of successful reconnect attempts (0 to 2)
        fc.integer({ min: 0, max: 2 }),
        (successfulAttempts) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          const stateChanges: ConnectionState[] = [];
          
          service.onStateChange((state) => {
            stateChanges.push(state);
          });

          // Initial connection
          service.connect('ws://localhost:8080');
          const initialWs = MockWebSocket.getLatest()!;
          initialWs.simulateOpen();
          
          // Verify connected
          if (service.getState() !== 'connected') return false;
          
          // Simulate unexpected disconnection
          initialWs.simulateClose(false); // wasClean = false
          
          // Advance time to trigger reconnection (1 second for first attempt)
          vi.advanceTimersByTime(1000);
          
          // Verify reconnection was attempted
          const attemptsMade = MockWebSocket.getConnectionAttempts();
          
          // Cleanup
          service.disconnect();
          
          // Should have made at least 2 connection attempts (initial + 1 reconnect)
          return attemptsMade >= 2;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.2: For any series of failed reconnection attempts, the service
   * SHALL stop after exactly 3 attempts and show an error.
   */
  it('stops reconnecting after 3 failed attempts and shows error', () => {
    fc.assert(
      fc.property(
        // Generate random delays to advance (doesn't affect the property)
        fc.integer({ min: 1, max: 5 }),
        () => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          let errorReceived = false;
          let errorMessage = '';
          
          service.onError((error) => {
            errorReceived = true;
            errorMessage = error;
          });

          // Initial connection
          service.connect('ws://localhost:8080');
          const initialWs = MockWebSocket.getLatest()!;
          initialWs.simulateOpen();
          
          // Simulate unexpected disconnection
          initialWs.simulateClose(false);
          
          // Simulate 3 failed reconnection attempts
          // Attempt 1: after 1 second
          vi.advanceTimersByTime(1000);
          let ws = MockWebSocket.getLatest()!;
          ws.simulateClose(false);
          
          // Attempt 2: after 2 seconds (exponential backoff)
          vi.advanceTimersByTime(2000);
          ws = MockWebSocket.getLatest()!;
          ws.simulateClose(false);
          
          // Attempt 3: after 4 seconds (exponential backoff)
          vi.advanceTimersByTime(4000);
          ws = MockWebSocket.getLatest()!;
          ws.simulateClose(false);
          
          // Verify: error state and error message received
          const finalState = service.getState();
          
          // Cleanup
          service.disconnect();
          
          // Should be in error state after 3 failed attempts
          // Total attempts: 1 initial + 3 reconnects = 4
          return (
            finalState === 'error' &&
            errorReceived &&
            errorMessage.includes('3 attempts')
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.3: For any successful reconnection within the attempt limit,
   * the service SHALL reset the attempt counter and resume normal operation.
   */
  it('resets attempt counter on successful reconnection', () => {
    fc.assert(
      fc.property(
        // Generate which attempt succeeds (1, 2, or 3)
        fc.integer({ min: 1, max: 3 }),
        (successfulAttempt) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();

          // Initial connection
          service.connect('ws://localhost:8080');
          let ws = MockWebSocket.getLatest()!;
          ws.simulateOpen();
          
          // Simulate unexpected disconnection
          ws.simulateClose(false);
          
          // Fail attempts until the successful one
          for (let i = 1; i < successfulAttempt; i++) {
            const delay = Math.pow(2, i - 1) * 1000;
            vi.advanceTimersByTime(delay);
            ws = MockWebSocket.getLatest()!;
            ws.simulateClose(false);
          }
          
          // Successful reconnection on the specified attempt
          const delay = Math.pow(2, successfulAttempt - 1) * 1000;
          vi.advanceTimersByTime(delay);
          ws = MockWebSocket.getLatest()!;
          ws.simulateOpen();
          
          // Verify connected
          const stateAfterReconnect = service.getState();
          
          // Now simulate another disconnection - should get 3 more attempts
          ws.simulateClose(false);
          
          // Verify we can attempt reconnection again (counter was reset)
          vi.advanceTimersByTime(1000);
          const newAttemptWs = MockWebSocket.getLatest()!;
          
          // Cleanup
          service.disconnect();
          
          return (
            stateAfterReconnect === 'connected' &&
            newAttemptWs !== ws // A new WebSocket was created for reconnection
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.4: For any clean disconnection (user-initiated), the service
   * SHALL NOT attempt to reconnect.
   */
  it('does not reconnect after clean disconnection', () => {
    fc.assert(
      fc.property(
        // Generate random time to wait after disconnect
        fc.integer({ min: 1000, max: 10000 }),
        (waitTime) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();

          // Initial connection
          service.connect('ws://localhost:8080');
          const ws = MockWebSocket.getLatest()!;
          ws.simulateOpen();
          
          const attemptsBeforeDisconnect = MockWebSocket.getConnectionAttempts();
          
          // User-initiated disconnect
          service.disconnect();
          
          // Wait for any potential reconnection attempts
          vi.advanceTimersByTime(waitTime);
          
          const attemptsAfterDisconnect = MockWebSocket.getConnectionAttempts();
          
          // Verify: no new connection attempts after user disconnect
          return attemptsAfterDisconnect === attemptsBeforeDisconnect;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.5: For any reconnection attempt, the service SHALL use
   * exponential backoff (1s, 2s, 4s).
   */
  it('uses exponential backoff for reconnection attempts', () => {
    fc.assert(
      fc.property(
        // Generate which backoff delay to test (1, 2, or 3)
        fc.integer({ min: 1, max: 3 }),
        (attemptNumber) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();

          // Initial connection
          service.connect('ws://localhost:8080');
          let ws = MockWebSocket.getLatest()!;
          ws.simulateOpen();
          
          // Simulate unexpected disconnection
          ws.simulateClose(false);
          
          // Fail previous attempts to get to the target attempt
          for (let i = 1; i < attemptNumber; i++) {
            const delay = Math.pow(2, i - 1) * 1000;
            vi.advanceTimersByTime(delay);
            ws = MockWebSocket.getLatest()!;
            ws.simulateClose(false);
          }
          
          const attemptsBeforeDelay = MockWebSocket.getConnectionAttempts();
          
          // Expected delay for this attempt: 2^(attemptNumber-1) * 1000ms
          const expectedDelay = Math.pow(2, attemptNumber - 1) * 1000;
          
          // Advance time by slightly less than expected delay
          vi.advanceTimersByTime(expectedDelay - 100);
          const attemptsBeforeExpected = MockWebSocket.getConnectionAttempts();
          
          // Advance the remaining time
          vi.advanceTimersByTime(100);
          const attemptsAfterExpected = MockWebSocket.getConnectionAttempts();
          
          // Cleanup
          service.disconnect();
          
          // Verify: no new attempt before expected delay, new attempt after
          return (
            attemptsBeforeExpected === attemptsBeforeDelay &&
            attemptsAfterExpected === attemptsBeforeDelay + 1
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4.6: For any state during reconnection, the service SHALL
   * report 'connecting' state while attempting to reconnect.
   */
  it('reports connecting state during reconnection attempts', () => {
    fc.assert(
      fc.property(
        // Generate which attempt to check (1, 2, or 3)
        fc.integer({ min: 1, max: 3 }),
        (attemptNumber) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          const statesDuringReconnect: ConnectionState[] = [];

          service.onStateChange((state) => {
            statesDuringReconnect.push(state);
          });

          // Initial connection
          service.connect('ws://localhost:8080');
          let ws = MockWebSocket.getLatest()!;
          ws.simulateOpen();
          
          // Clear state history
          statesDuringReconnect.length = 0;
          
          // Simulate unexpected disconnection
          ws.simulateClose(false);
          
          // Advance through reconnection attempts
          for (let i = 1; i <= attemptNumber; i++) {
            const delay = Math.pow(2, i - 1) * 1000;
            vi.advanceTimersByTime(delay);
            ws = MockWebSocket.getLatest()!;
            if (i < attemptNumber) {
              ws.simulateClose(false);
            }
          }
          
          // Cleanup
          service.disconnect();
          
          // Verify: 'connecting' state was reported during reconnection
          return statesDuringReconnect.includes('connecting');
        }
      ),
      { numRuns: 100 }
    );
  });
});

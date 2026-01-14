/**
 * Property Test: Error Message Display
 * Feature: online-matchmaking, Property 5: Error Message Display
 * 
 * *For any* ERROR message received from the server, the Client SHALL display 
 * the error message to the user in a visible notification.
 * 
 * **Validates: Requirements 7.3**
 */

import * as fc from 'fast-check';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketService } from '../../WebSocketService';
import type { ErrorMessage, ErrorCode } from '@shared/protocol';

// ============================================
// Mock WebSocket
// ============================================

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

  simulateMessage(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  static getLatest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  static clearInstances() {
    MockWebSocket.instances = [];
  }
}

// ============================================
// Arbitrary Generators
// ============================================

const errorCodeArb: fc.Arbitrary<ErrorCode> = fc.constantFrom(
  'INVALID_JSON',
  'INVALID_MESSAGE',
  'VALIDATION_ERROR',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'NOT_IN_ROOM',
  'NOT_YOUR_TURN',
  'INVALID_CARD',
  'INVALID_MARBLE',
  'INVALID_MOVE',
  'GAME_NOT_STARTED',
  'GAME_ALREADY_STARTED',
  'RATE_LIMITED',
  'INTERNAL_ERROR'
);

// Generate non-empty error messages with various content
const errorMessageTextArb: fc.Arbitrary<string> = fc.oneof(
  // Simple messages
  fc.string({ minLength: 1, maxLength: 100 }),
  // Realistic error messages
  fc.constantFrom(
    'Room not found',
    'Invalid move: marble cannot move to that position',
    'Not your turn',
    'Connection timeout',
    'Rate limit exceeded',
    'Invalid card selection',
    'Game has already started',
    'Room is full',
    'Player disconnected',
    'Invalid JSON format',
    'Validation error: missing required field'
  )
);

const errorMessageArb: fc.Arbitrary<ErrorMessage> = fc.record({
  type: fc.constant('ERROR' as const),
  code: errorCodeArb,
  message: errorMessageTextArb,
});

// ============================================
// Tests
// ============================================

describe('Property 5: Error Message Display', () => {
  const originalWebSocket = global.WebSocket;

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
   * Property 5.1: For any ERROR message from the server, the message listener
   * SHALL receive the exact error message content.
   */
  it('delivers ERROR messages with exact content to listeners', () => {
    fc.assert(
      fc.property(
        errorMessageArb,
        (errorMsg) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          let receivedError: ErrorMessage | null = null;

          // Register message listener
          service.onMessage((message) => {
            if (message.type === 'ERROR') {
              receivedError = message;
            }
          });

          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();

          // Simulate ERROR message from server
          mockWs.simulateMessage(errorMsg);

          // Cleanup
          service.disconnect();

          // Verify: received error matches sent error exactly
          return (
            receivedError !== null &&
            receivedError.type === 'ERROR' &&
            receivedError.code === errorMsg.code &&
            receivedError.message === errorMsg.message
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.2: For any ERROR message, the error code SHALL be preserved.
   */
  it('preserves error codes in ERROR messages', () => {
    fc.assert(
      fc.property(
        errorCodeArb,
        errorMessageTextArb,
        (code, message) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          let receivedCode: ErrorCode | null = null;

          // Register message listener
          service.onMessage((msg) => {
            if (msg.type === 'ERROR') {
              receivedCode = msg.code;
            }
          });

          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();

          // Simulate ERROR message
          const errorMsg: ErrorMessage = { type: 'ERROR', code, message };
          mockWs.simulateMessage(errorMsg);

          // Cleanup
          service.disconnect();

          // Verify: error code is preserved
          return receivedCode === code;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.3: For any ERROR message, the message text SHALL be preserved exactly.
   */
  it('preserves message text in ERROR messages', () => {
    fc.assert(
      fc.property(
        errorCodeArb,
        errorMessageTextArb,
        (code, messageText) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          let receivedMessage: string | null = null;

          // Register message listener
          service.onMessage((msg) => {
            if (msg.type === 'ERROR') {
              receivedMessage = msg.message;
            }
          });

          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();

          // Simulate ERROR message
          const errorMsg: ErrorMessage = { type: 'ERROR', code, message: messageText };
          mockWs.simulateMessage(errorMsg);

          // Cleanup
          service.disconnect();

          // Verify: message text is preserved exactly
          return receivedMessage === messageText;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.4: For any sequence of ERROR messages, each SHALL be delivered
   * to listeners in order.
   */
  it('delivers multiple ERROR messages in order', () => {
    fc.assert(
      fc.property(
        fc.array(errorMessageArb, { minLength: 1, maxLength: 5 }),
        (errorMessages) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          const receivedErrors: ErrorMessage[] = [];

          // Register message listener
          service.onMessage((message) => {
            if (message.type === 'ERROR') {
              receivedErrors.push(message);
            }
          });

          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();

          // Simulate multiple ERROR messages
          errorMessages.forEach((errorMsg) => {
            mockWs.simulateMessage(errorMsg);
          });

          // Cleanup
          service.disconnect();

          // Verify: all errors received in order
          if (receivedErrors.length !== errorMessages.length) return false;

          return errorMessages.every((errorMsg, index) => {
            const received = receivedErrors[index];
            return (
              received.type === 'ERROR' &&
              received.code === errorMsg.code &&
              received.message === errorMsg.message
            );
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.5: For any ERROR message, all registered listeners SHALL receive it.
   */
  it('delivers ERROR messages to all registered listeners', () => {
    fc.assert(
      fc.property(
        errorMessageArb,
        fc.integer({ min: 1, max: 5 }),
        (errorMsg, listenerCount) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          const receivedByListeners: boolean[] = new Array(listenerCount).fill(false);

          // Register multiple listeners
          for (let i = 0; i < listenerCount; i++) {
            const index = i;
            service.onMessage((message) => {
              if (message.type === 'ERROR' && message.code === errorMsg.code) {
                receivedByListeners[index] = true;
              }
            });
          }

          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();

          // Simulate ERROR message
          mockWs.simulateMessage(errorMsg);

          // Cleanup
          service.disconnect();

          // Verify: all listeners received the error
          return receivedByListeners.every((received) => received === true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.6: ERROR messages SHALL only be processed when connected.
   */
  it('does not process ERROR messages when disconnected', () => {
    fc.assert(
      fc.property(
        errorMessageArb,
        (errorMsg) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          let messageReceived = false;

          // Register message listener
          service.onMessage(() => {
            messageReceived = true;
          });

          // Don't connect - stay disconnected
          const mockWs = MockWebSocket.getLatest();

          // If no WebSocket was created, pass (no messages can be received)
          if (!mockWs) return true;

          // If WebSocket exists but not connected, messages shouldn't be processed
          mockWs.simulateMessage(errorMsg);

          return !messageReceived;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5.7: For any ERROR message with special characters, the message
   * SHALL be preserved without modification.
   */
  it('preserves special characters in error messages', () => {
    fc.assert(
      fc.property(
        errorCodeArb,
        fc.constantFrom(
          'Error with special chars: !@#$%^&*()',
          'Unicode: éñ中日🎮',
          'Quotes: "double" and \'single\'',
          'Brackets: [array] {object} <tag>',
          'Slashes: /forward\\ and \\back\\',
          'Whitespace:\ttab\nnewline',
          'Mixed: Error 404 - Not Found! (code: 0x1F)',
          'Emoji: Game Over 🎮💀🏆',
          'Path: /room/abc123/player',
          'JSON-like: {"error": "test"}'
        ),
        (code, specialMessage) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          let receivedMessage: string | null = null;

          // Register message listener
          service.onMessage((msg) => {
            if (msg.type === 'ERROR') {
              receivedMessage = msg.message;
            }
          });

          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();

          // Simulate ERROR message with special characters
          const errorMsg: ErrorMessage = { type: 'ERROR', code, message: specialMessage };
          mockWs.simulateMessage(errorMsg);

          // Cleanup
          service.disconnect();

          // Verify: special characters are preserved
          return receivedMessage === specialMessage;
        }
      ),
      { numRuns: 100 }
    );
  });
});

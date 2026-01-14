/**
 * Property Test: Game Action Transmission
 * Feature: online-matchmaking, Property 2: Game Action Transmission
 * 
 * *For any* game action performed by the player in online mode, the Client SHALL send 
 * a correctly formatted GAME_ACTION message to the server containing the action details.
 * 
 * **Validates: Requirements 5.1**
 */

import * as fc from 'fast-check';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketService } from '../../WebSocketService';
import type { GameAction } from '@shared/types';
import { validateClientMessage } from '@shared/protocol';

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

  static getLatest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  static clearInstances() {
    MockWebSocket.instances = [];
  }

  getGameActionMessages(): Array<{ type: string; action: GameAction }> {
    return this.sentMessages
      .map(msg => {
        try {
          return JSON.parse(msg);
        } catch {
          return null;
        }
      })
      .filter(msg => msg && msg.type === 'GAME_ACTION');
  }
}

// Arbitrary generators for GameAction types
const cardIdArb = fc.stringMatching(/^[a-z0-9-]{1,36}$/);
const marbleIdArb = fc.stringMatching(/^[a-z0-9-]{1,36}$/);
const nodeIdArb = fc.stringMatching(/^[a-z0-9_-]{1,36}$/);
const stepsArb = fc.integer({ min: 1, max: 7 });

// Generator for all valid GameAction types
const gameActionArb: fc.Arbitrary<GameAction> = fc.oneof(
  fc.constant({ type: 'START_GAME' } as GameAction),
  cardIdArb.map(cardId => ({ type: 'SELECT_CARD', cardId } as GameAction)),
  fc.constantFrom('MOVE', 'ATTACK').map(choice => ({ type: 'RESOLVE_10_DECISION', choice } as GameAction)),
  fc.constantFrom('ATTACK', 'CANCEL').map(choice => ({ type: 'RESOLVE_RED_Q_DECISION', choice } as GameAction)),
  stepsArb.map(steps => ({ type: 'SELECT_STEP_COUNT', steps } as GameAction)),
  fc.constant({ type: 'DESELECT_CARD' } as GameAction),
  marbleIdArb.map(marbleId => ({ type: 'SELECT_MARBLE', marbleId } as GameAction)),
  nodeIdArb.map(nodeId => ({ type: 'SELECT_TARGET_NODE', nodeId } as GameAction)),
  fc.constant({ type: 'CONFIRM_MOVE' } as GameAction),
  fc.constant({ type: 'BURN_CARD' } as GameAction),
  fc.constant({ type: 'CANCEL_SELECTION' } as GameAction),
  fc.constant({ type: 'RESOLVE_TURN' } as GameAction)
);

describe('Property 2: Game Action Transmission', () => {
  const originalWebSocket = global.WebSocket;

  beforeEach(() => {
    MockWebSocket.clearInstances();
    (global as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.WebSocket = originalWebSocket;
  });

  /**
   * Property 2.1: For any valid game action, the WebSocketService SHALL send
   * a GAME_ACTION message containing that action.
   */
  it('sends GAME_ACTION message for any valid game action', () => {
    fc.assert(
      fc.property(
        gameActionArb,
        (action) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          
          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();
          mockWs.sentMessages = [];
          
          // Send game action
          service.send({ type: 'GAME_ACTION', action });
          
          // Verify: message was sent
          const gameActionMessages = mockWs.getGameActionMessages();
          
          // Cleanup
          service.disconnect();
          
          return gameActionMessages.length === 1;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.2: For any game action sent, the message SHALL contain
   * the exact action details provided.
   */
  it('preserves action details in the transmitted message', () => {
    fc.assert(
      fc.property(
        gameActionArb,
        (action) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          
          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();
          mockWs.sentMessages = [];
          
          // Send game action
          service.send({ type: 'GAME_ACTION', action });
          
          // Verify: action details are preserved
          const gameActionMessages = mockWs.getGameActionMessages();
          
          // Cleanup
          service.disconnect();
          
          if (gameActionMessages.length !== 1) return false;
          
          const sentAction = gameActionMessages[0].action;
          return JSON.stringify(sentAction) === JSON.stringify(action);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.3: For any game action sent, the message SHALL be
   * valid according to the protocol validation.
   */
  it('sends protocol-valid GAME_ACTION messages', () => {
    fc.assert(
      fc.property(
        gameActionArb,
        (action) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          
          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();
          mockWs.sentMessages = [];
          
          // Send game action
          service.send({ type: 'GAME_ACTION', action });
          
          // Verify: message passes protocol validation
          const sentMessage = mockWs.sentMessages[0];
          
          // Cleanup
          service.disconnect();
          
          if (!sentMessage) return false;
          
          try {
            const parsed = JSON.parse(sentMessage);
            const validationResult = validateClientMessage(parsed);
            return validationResult.valid;
          } catch {
            return false;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.4: For any sequence of game actions, all actions SHALL
   * be transmitted in order.
   */
  it('transmits multiple game actions in order', () => {
    fc.assert(
      fc.property(
        fc.array(gameActionArb, { minLength: 1, maxLength: 10 }),
        (actions) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          
          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();
          mockWs.sentMessages = [];
          
          // Send all game actions
          actions.forEach(action => {
            service.send({ type: 'GAME_ACTION', action });
          });
          
          // Verify: all actions transmitted in order
          const gameActionMessages = mockWs.getGameActionMessages();
          
          // Cleanup
          service.disconnect();
          
          if (gameActionMessages.length !== actions.length) return false;
          
          return actions.every((action, index) => {
            const sentAction = gameActionMessages[index].action;
            return JSON.stringify(sentAction) === JSON.stringify(action);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.5: GAME_ACTION messages SHALL only be sent when connected.
   */
  it('does not send GAME_ACTION when disconnected', () => {
    fc.assert(
      fc.property(
        gameActionArb,
        (action) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          
          // Don't connect - stay disconnected
          // Try to send game action
          service.send({ type: 'GAME_ACTION', action });
          
          // Verify: no WebSocket was created, no messages sent
          const mockWs = MockWebSocket.getLatest();
          
          // If no WebSocket was created, pass
          if (!mockWs) return true;
          
          // If WebSocket exists but not connected, no messages should be sent
          return mockWs.sentMessages.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2.6: For any game action with parameters, the message SHALL
   * include all required fields for that action type.
   */
  it('includes all required fields for parameterized actions', () => {
    fc.assert(
      fc.property(
        gameActionArb,
        (action) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          
          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();
          mockWs.sentMessages = [];
          
          // Send game action
          service.send({ type: 'GAME_ACTION', action });
          
          // Verify: all required fields are present
          const gameActionMessages = mockWs.getGameActionMessages();
          
          // Cleanup
          service.disconnect();
          
          if (gameActionMessages.length !== 1) return false;
          
          const sentAction = gameActionMessages[0].action;
          
          // Check required fields based on action type
          switch (sentAction.type) {
            case 'SELECT_CARD':
              return 'cardId' in sentAction && typeof sentAction.cardId === 'string';
            case 'SELECT_MARBLE':
              return 'marbleId' in sentAction && typeof sentAction.marbleId === 'string';
            case 'SELECT_TARGET_NODE':
              return 'nodeId' in sentAction && typeof sentAction.nodeId === 'string';
            case 'SELECT_STEP_COUNT':
              return 'steps' in sentAction && typeof sentAction.steps === 'number';
            case 'RESOLVE_10_DECISION':
              return 'choice' in sentAction && (sentAction.choice === 'MOVE' || sentAction.choice === 'ATTACK');
            case 'RESOLVE_RED_Q_DECISION':
              return 'choice' in sentAction && (sentAction.choice === 'ATTACK' || sentAction.choice === 'CANCEL');
            default:
              // Actions without parameters just need the type
              return 'type' in sentAction;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

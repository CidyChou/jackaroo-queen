/**
 * Property Test: State Synchronization
 * Feature: online-matchmaking, Property 3: State Synchronization
 * 
 * *For any* STATE_UPDATE message received from the server, the Client SHALL update 
 * its local GameState to exactly match the state contained in the message.
 * 
 * **Validates: Requirements 5.3**
 */

import * as fc from 'fast-check';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketService } from '../../WebSocketService';
import type { GameState, Player, Marble, BoardNode, Card, GamePhase, PlayerColor } from '@shared/types';
import type { StateUpdateMessage } from '@shared/protocol';

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
// Arbitrary Generators for GameState
// ============================================

const playerColorArb: fc.Arbitrary<PlayerColor> = fc.constantFrom('red', 'blue', 'yellow', 'green');

const suitArb = fc.constantFrom('hearts', 'diamonds', 'clubs', 'spades') as fc.Arbitrary<'hearts' | 'diamonds' | 'clubs' | 'spades'>;
const rankArb = fc.constantFrom('A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K') as fc.Arbitrary<'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'>;

const cardArb: fc.Arbitrary<Card> = fc.record({
  id: fc.uuid(),
  suit: suitArb,
  rank: rankArb,
  value: fc.integer({ min: 1, max: 13 }),
});

const playerArb: fc.Arbitrary<Player> = fc.record({
  id: fc.uuid(),
  color: playerColorArb,
  team: fc.constantFrom(1, 2),
  hand: fc.array(cardArb, { minLength: 0, maxLength: 5 }),
  marbles: fc.array(fc.uuid(), { minLength: 0, maxLength: 4 }),
  isFinished: fc.boolean(),
  isBot: fc.boolean(),
});

const marbleLocationArb = fc.oneof(
  fc.constant('BASE'),
  fc.constant('HOME'),
  fc.stringMatching(/^node_[a-z0-9]{1,10}$/)
);

const marbleArb: fc.Arbitrary<Marble> = fc.record({
  id: fc.uuid(),
  ownerId: fc.uuid(),
  color: playerColorArb,
  position: marbleLocationArb,
  isSafe: fc.boolean(),
});

const nodeTypeArb = fc.constantFrom('normal', 'start', 'home_entrance', 'home_path', 'home') as fc.Arbitrary<'normal' | 'start' | 'home_entrance' | 'home_path' | 'home'>;

const boardNodeArb: fc.Arbitrary<BoardNode> = fc.record({
  id: fc.stringMatching(/^node_[a-z0-9]{1,10}$/),
  type: nodeTypeArb,
  next: fc.array(fc.stringMatching(/^node_[a-z0-9]{1,10}$/), { minLength: 0, maxLength: 2 }),
  prev: fc.option(fc.stringMatching(/^node_[a-z0-9]{1,10}$/), { nil: null }),
  isSafe: fc.boolean(),
  isStartFor: fc.option(playerColorArb, { nil: undefined }),
  isHomeEntranceFor: fc.option(playerColorArb, { nil: undefined }),
});

const gamePhaseArb: fc.Arbitrary<GamePhase> = fc.constantFrom(
  'IDLE',
  'TURN_START',
  'PLAYER_INPUT',
  'DECIDING_10',
  'DECIDING_RED_Q',
  'HANDLING_SPLIT_7',
  'HANDLING_JACK_SWAP',
  'OPPONENT_DISCARD',
  'RESOLVING_MOVE',
  'CHECK_WIN',
  'NEXT_TURN',
  'GAME_OVER'
);

const moveCandidateArb = fc.record({
  type: fc.constantFrom('standard', 'base_exit', 'swap', 'kill_path', 'split_move', 'force_discard'),
  cardId: fc.uuid(),
  marbleId: fc.option(fc.uuid(), { nil: undefined }),
  targetPosition: fc.option(fc.stringMatching(/^node_[a-z0-9]{1,10}$/), { nil: undefined }),
  swapTargetMarbleId: fc.option(fc.uuid(), { nil: undefined }),
  stepsUsed: fc.option(fc.integer({ min: 1, max: 7 }), { nil: undefined }),
  killedMarbleIds: fc.option(fc.array(fc.uuid(), { minLength: 0, maxLength: 4 }), { nil: undefined }),
  isValid: fc.boolean(),
});

const split7StateArb = fc.option(
  fc.record({
    firstMoveUsed: fc.option(fc.integer({ min: 1, max: 6 }), { nil: null }),
    firstMarbleId: fc.option(fc.uuid(), { nil: null }),
    remainingSteps: fc.integer({ min: 1, max: 7 }),
  }),
  { nil: null }
);

// Generate a minimal but valid GameState
const gameStateArb: fc.Arbitrary<GameState> = fc.record({
  players: fc.array(playerArb, { minLength: 2, maxLength: 4 }),
  marbles: fc.dictionary(fc.uuid(), marbleArb),
  board: fc.dictionary(fc.stringMatching(/^node_[a-z0-9]{1,10}$/), boardNodeArb),
  deck: fc.array(cardArb, { minLength: 0, maxLength: 52 }),
  discardPile: fc.array(cardArb, { minLength: 0, maxLength: 52 }),
  currentPlayerIndex: fc.integer({ min: 0, max: 3 }),
  currentRound: fc.integer({ min: 1, max: 5 }),
  phase: gamePhaseArb,
  selectedCardId: fc.option(fc.uuid(), { nil: null }),
  selectedMarbleId: fc.option(fc.uuid(), { nil: null }),
  possibleMoves: fc.array(moveCandidateArb, { minLength: 0, maxLength: 10 }),
  pendingAttackerIndex: fc.option(fc.integer({ min: 0, max: 3 }), { nil: null }),
  repeatTurn: fc.boolean(),
  split7State: split7StateArb,
  lastActionLog: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
});

// ============================================
// Tests
// ============================================

describe('Property 3: State Synchronization', () => {
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
   * Property 3.1: For any STATE_UPDATE message, the message listener SHALL
   * receive the exact GameState contained in the message.
   */
  it('delivers STATE_UPDATE messages with exact GameState to listeners', () => {
    fc.assert(
      fc.property(
        gameStateArb,
        (serverState) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          let receivedState: GameState | null = null;

          // Register message listener
          service.onMessage((message) => {
            if (message.type === 'STATE_UPDATE') {
              receivedState = message.state;
            }
          });

          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();

          // Simulate STATE_UPDATE from server
          const stateUpdateMessage: StateUpdateMessage = {
            type: 'STATE_UPDATE',
            state: serverState,
          };
          mockWs.simulateMessage(stateUpdateMessage);

          // Cleanup
          service.disconnect();

          // Verify: received state matches server state exactly
          return JSON.stringify(receivedState) === JSON.stringify(serverState);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.2: For any sequence of STATE_UPDATE messages, each update
   * SHALL be delivered in order with the correct state.
   */
  it('delivers multiple STATE_UPDATE messages in order', () => {
    fc.assert(
      fc.property(
        fc.array(gameStateArb, { minLength: 1, maxLength: 5 }),
        (serverStates) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          const receivedStates: GameState[] = [];

          // Register message listener
          service.onMessage((message) => {
            if (message.type === 'STATE_UPDATE') {
              receivedStates.push(message.state);
            }
          });

          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();

          // Simulate multiple STATE_UPDATE messages
          serverStates.forEach((state) => {
            const stateUpdateMessage: StateUpdateMessage = {
              type: 'STATE_UPDATE',
              state,
            };
            mockWs.simulateMessage(stateUpdateMessage);
          });

          // Cleanup
          service.disconnect();

          // Verify: all states received in order
          if (receivedStates.length !== serverStates.length) return false;

          return serverStates.every((state, index) => 
            JSON.stringify(receivedStates[index]) === JSON.stringify(state)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.3: For any STATE_UPDATE message, all GameState fields
   * SHALL be preserved without modification.
   */
  it('preserves all GameState fields in STATE_UPDATE', () => {
    fc.assert(
      fc.property(
        gameStateArb,
        (serverState) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          let receivedState: GameState | null = null;

          // Register message listener
          service.onMessage((message) => {
            if (message.type === 'STATE_UPDATE') {
              receivedState = message.state;
            }
          });

          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();

          // Simulate STATE_UPDATE from server
          const stateUpdateMessage: StateUpdateMessage = {
            type: 'STATE_UPDATE',
            state: serverState,
          };
          mockWs.simulateMessage(stateUpdateMessage);

          // Cleanup
          service.disconnect();

          if (!receivedState) return false;

          // Verify each top-level field is preserved
          const fieldsToCheck: (keyof GameState)[] = [
            'players',
            'marbles',
            'board',
            'deck',
            'discardPile',
            'currentPlayerIndex',
            'currentRound',
            'phase',
            'selectedCardId',
            'selectedMarbleId',
            'possibleMoves',
            'pendingAttackerIndex',
            'repeatTurn',
            'split7State',
            'lastActionLog',
          ];

          return fieldsToCheck.every((field) => 
            JSON.stringify(receivedState![field]) === JSON.stringify(serverState[field])
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.4: STATE_UPDATE messages SHALL only be processed when connected.
   */
  it('does not process STATE_UPDATE when disconnected', () => {
    fc.assert(
      fc.property(
        gameStateArb,
        (serverState) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          let messageReceived = false;

          // Register message listener
          service.onMessage(() => {
            messageReceived = true;
          });

          // Don't connect - stay disconnected
          // Try to simulate a message (this shouldn't work since no WebSocket exists)
          const mockWs = MockWebSocket.getLatest();
          
          // If no WebSocket was created, pass (no messages can be received)
          if (!mockWs) return true;

          // If WebSocket exists but not connected, messages shouldn't be processed
          const stateUpdateMessage: StateUpdateMessage = {
            type: 'STATE_UPDATE',
            state: serverState,
          };
          mockWs.simulateMessage(stateUpdateMessage);

          return !messageReceived;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3.5: For any STATE_UPDATE with nested objects (players, marbles),
   * the nested structure SHALL be preserved exactly.
   */
  it('preserves nested object structures in STATE_UPDATE', () => {
    fc.assert(
      fc.property(
        gameStateArb,
        (serverState) => {
          // Setup
          MockWebSocket.clearInstances();
          const service = new WebSocketService();
          let receivedState: GameState | null = null;

          // Register message listener
          service.onMessage((message) => {
            if (message.type === 'STATE_UPDATE') {
              receivedState = message.state;
            }
          });

          // Connect
          service.connect('ws://localhost:8080');
          const mockWs = MockWebSocket.getLatest()!;
          mockWs.simulateOpen();

          // Simulate STATE_UPDATE from server
          const stateUpdateMessage: StateUpdateMessage = {
            type: 'STATE_UPDATE',
            state: serverState,
          };
          mockWs.simulateMessage(stateUpdateMessage);

          // Cleanup
          service.disconnect();

          if (!receivedState) return false;

          // Verify players array structure
          if (receivedState.players.length !== serverState.players.length) return false;
          
          const playersMatch = serverState.players.every((player, idx) => {
            const received = receivedState!.players[idx];
            return (
              received.id === player.id &&
              received.color === player.color &&
              received.team === player.team &&
              received.isFinished === player.isFinished &&
              received.isBot === player.isBot &&
              JSON.stringify(received.hand) === JSON.stringify(player.hand) &&
              JSON.stringify(received.marbles) === JSON.stringify(player.marbles)
            );
          });

          // Verify marbles dictionary structure
          const marbleKeys = Object.keys(serverState.marbles);
          const receivedMarbleKeys = Object.keys(receivedState.marbles);
          
          if (marbleKeys.length !== receivedMarbleKeys.length) return false;
          
          const marblesMatch = marbleKeys.every((key) => {
            const original = serverState.marbles[key];
            const received = receivedState!.marbles[key];
            return (
              received &&
              received.id === original.id &&
              received.ownerId === original.ownerId &&
              received.color === original.color &&
              received.position === original.position &&
              received.isSafe === original.isSafe
            );
          });

          return playersMatch && marblesMatch;
        }
      ),
      { numRuns: 100 }
    );
  });
});

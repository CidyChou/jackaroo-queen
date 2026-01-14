/**
 * Message Protocol for Jackaroo Game
 * Shared between client and server
 * Defines all client-server message types and validation
 */

import { GameState, GameAction } from './types.js';

// ============================================
// Client -> Server Messages
// ============================================

export type ClientMessageType =
  | 'CREATE_ROOM'
  | 'JOIN_ROOM'
  | 'LEAVE_ROOM'
  | 'GAME_ACTION'
  | 'PING';

export interface CreateRoomMessage {
  type: 'CREATE_ROOM';
  playerCount: 2 | 4;
}

export interface JoinRoomMessage {
  type: 'JOIN_ROOM';
  roomCode: string;
}

export interface LeaveRoomMessage {
  type: 'LEAVE_ROOM';
}

export interface GameActionMessage {
  type: 'GAME_ACTION';
  action: GameAction;
}

export interface PingMessage {
  type: 'PING';
}

export type ClientMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | LeaveRoomMessage
  | GameActionMessage
  | PingMessage;

// ============================================
// Server -> Client Messages
// ============================================

export type ServerMessageType =
  | 'ROOM_CREATED'
  | 'ROOM_JOINED'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'GAME_STARTED'
  | 'STATE_UPDATE'
  | 'TIMER_UPDATE'
  | 'AUTO_MODE_CHANGED'
  | 'ERROR'
  | 'PONG';

export interface RoomCreatedMessage {
  type: 'ROOM_CREATED';
  roomCode: string;
  playerIndex: number;
}

export interface RoomJoinedMessage {
  type: 'ROOM_JOINED';
  roomCode: string;
  playerIndex: number;
  players: { index: number; connected: boolean }[];
}

export interface PlayerJoinedMessage {
  type: 'PLAYER_JOINED';
  playerIndex: number;
}

export interface PlayerLeftMessage {
  type: 'PLAYER_LEFT';
  playerIndex: number;
}

export interface GameStartedMessage {
  type: 'GAME_STARTED';
  state: GameState;
}

export interface StateUpdateMessage {
  type: 'STATE_UPDATE';
  state: GameState;
}

export interface ErrorMessage {
  type: 'ERROR';
  code: ErrorCode;
  message: string;
}

export interface PongMessage {
  type: 'PONG';
}

export interface TimerUpdateMessage {
  type: 'TIMER_UPDATE';
  timeRemaining: number; // Seconds remaining
  currentPlayerIndex: number;
}

export interface AutoModeChangedMessage {
  type: 'AUTO_MODE_CHANGED';
  playerIndex: number;
  isAutoMode: boolean;
}

export type ServerMessage =
  | RoomCreatedMessage
  | RoomJoinedMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | GameStartedMessage
  | StateUpdateMessage
  | TimerUpdateMessage
  | AutoModeChangedMessage
  | ErrorMessage
  | PongMessage;

// ============================================
// Error Codes
// ============================================

export type ErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_MESSAGE'
  | 'VALIDATION_ERROR'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NOT_IN_ROOM'
  | 'NOT_YOUR_TURN'
  | 'INVALID_CARD'
  | 'INVALID_MARBLE'
  | 'INVALID_MOVE'
  | 'GAME_NOT_STARTED'
  | 'GAME_ALREADY_STARTED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

// ============================================
// Message Validation
// ============================================

const CLIENT_MESSAGE_TYPES: ClientMessageType[] = [
  'CREATE_ROOM',
  'JOIN_ROOM',
  'LEAVE_ROOM',
  'GAME_ACTION',
  'PING',
];

const VALID_PLAYER_COUNTS = [2, 4] as const;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that a value is a valid ClientMessage
 */
export function validateClientMessage(data: unknown): ValidationResult {
  if (data === null || typeof data !== 'object') {
    return { valid: false, error: 'Message must be an object' };
  }

  const msg = data as Record<string, unknown>;

  if (typeof msg.type !== 'string') {
    return { valid: false, error: 'Message must have a type field' };
  }

  if (!CLIENT_MESSAGE_TYPES.includes(msg.type as ClientMessageType)) {
    return { valid: false, error: `Invalid message type: ${msg.type}` };
  }

  // Type-specific validation
  switch (msg.type) {
    case 'CREATE_ROOM':
      return validateCreateRoomMessage(msg);
    case 'JOIN_ROOM':
      return validateJoinRoomMessage(msg);
    case 'GAME_ACTION':
      return validateGameActionMessage(msg);
    case 'LEAVE_ROOM':
    case 'PING':
      return { valid: true };
    default:
      return { valid: false, error: `Unknown message type: ${msg.type}` };
  }
}

function validateCreateRoomMessage(msg: Record<string, unknown>): ValidationResult {
  if (typeof msg.playerCount !== 'number') {
    return { valid: false, error: 'playerCount must be a number' };
  }
  if (!VALID_PLAYER_COUNTS.includes(msg.playerCount as 2 | 4)) {
    return { valid: false, error: 'playerCount must be 2 or 4' };
  }
  return { valid: true };
}

function validateJoinRoomMessage(msg: Record<string, unknown>): ValidationResult {
  if (typeof msg.roomCode !== 'string') {
    return { valid: false, error: 'roomCode must be a string' };
  }
  if (msg.roomCode.length === 0) {
    return { valid: false, error: 'roomCode cannot be empty' };
  }
  return { valid: true };
}

function validateGameActionMessage(msg: Record<string, unknown>): ValidationResult {
  if (msg.action === null || typeof msg.action !== 'object') {
    return { valid: false, error: 'action must be an object' };
  }

  const action = msg.action as Record<string, unknown>;
  if (typeof action.type !== 'string') {
    return { valid: false, error: 'action must have a type field' };
  }

  // Basic validation - detailed action validation happens in game logic
  const validActionTypes = [
    'START_GAME',
    'SELECT_CARD',
    'RESOLVE_10_DECISION',
    'RESOLVE_RED_Q_DECISION',
    'SELECT_STEP_COUNT',
    'DESELECT_CARD',
    'SELECT_MARBLE',
    'SELECT_TARGET_NODE',
    'CONFIRM_MOVE',
    'BURN_CARD',
    'CANCEL_SELECTION',
    'RESOLVE_TURN',
  ];

  if (!validActionTypes.includes(action.type as string)) {
    return { valid: false, error: `Invalid action type: ${action.type}` };
  }

  return { valid: true };
}

/**
 * Parses a raw JSON string into a ClientMessage
 * Returns null if parsing or validation fails
 */
export function parseClientMessage(rawMessage: string): ClientMessage | null {
  try {
    const data = JSON.parse(rawMessage);
    const result = validateClientMessage(data);
    if (result.valid) {
      return data as ClientMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Serializes a ServerMessage to JSON string
 */
export function serializeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

/**
 * Creates an error message
 */
export function createErrorMessage(code: ErrorCode, message: string): ErrorMessage {
  return { type: 'ERROR', code, message };
}

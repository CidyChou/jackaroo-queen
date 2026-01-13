/**
 * RoomManager - Manages all game rooms
 * 
 * Handles:
 * - Room creation with unique codes
 * - Room joining/leaving
 * - Empty room cleanup
 * 
 * Requirements: 3.1, 3.4, 3.5, 3.6
 */

import { Room, RoomConfig } from './Room.js';
import { PlayerSession } from './PlayerSession.js';
import { Logger } from './Logger.js';

// Room cleanup interval (check every minute)
const CLEANUP_INTERVAL_MS = 60 * 1000;

// Time to wait before destroying empty room (5 minutes)
const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;

// Characters for room code generation (uppercase letters and numbers, excluding confusing chars)
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

export class RoomManager {
  private rooms: Map<string, Room>;
  private sessionToRoom: Map<string, string>; // sessionId -> roomCode
  private logger: Logger;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor() {
    this.rooms = new Map();
    this.sessionToRoom = new Map();
    this.logger = new Logger('RoomManager');
    this.cleanupInterval = null;
  }

  /**
   * Starts the periodic cleanup of empty rooms
   */
  startCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupEmptyRooms();
    }, CLEANUP_INTERVAL_MS);

    this.logger.info('Room cleanup started');
  }

  /**
   * Stops the periodic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.info('Room cleanup stopped');
    }
  }

  // ============================================
  // Room Operations
  // ============================================

  /**
   * Creates a new room with a unique code
   */
  createRoom(creatorSession: PlayerSession, playerCount: 2 | 4): Room {
    const roomCode = this.generateUniqueRoomCode();

    const config: RoomConfig = {
      roomCode,
      maxPlayers: playerCount,
    };

    const room = new Room(config);
    this.rooms.set(roomCode, room);

    // Add creator to the room
    room.addPlayer(creatorSession);
    this.sessionToRoom.set(creatorSession.sessionId, roomCode);

    this.logger.info(`Room ${roomCode} created by ${creatorSession.sessionId}`);
    return room;
  }

  /**
   * Joins an existing room
   * Returns the room if successful, null if room not found or full
   */
  joinRoom(roomCode: string, session: PlayerSession): Room | null {
    const room = this.rooms.get(roomCode);
    if (!room) {
      this.logger.warn(`Room ${roomCode} not found`);
      return null;
    }

    if (!room.addPlayer(session)) {
      return null;
    }

    this.sessionToRoom.set(session.sessionId, roomCode);
    this.logger.info(`Player ${session.sessionId} joined room ${roomCode}`);
    return room;
  }

  /**
   * Removes a player from their current room
   */
  leaveRoom(sessionId: string): void {
    const roomCode = this.sessionToRoom.get(sessionId);
    if (!roomCode) {
      return;
    }

    const room = this.rooms.get(roomCode);
    if (room) {
      room.removePlayer(sessionId);
      this.logger.info(`Player ${sessionId} left room ${roomCode}`);
    }

    this.sessionToRoom.delete(sessionId);
  }

  // ============================================
  // Queries
  // ============================================

  /**
   * Gets a room by its code
   */
  getRoom(roomCode: string): Room | null {
    return this.rooms.get(roomCode) ?? null;
  }

  /**
   * Gets the room a session is in
   */
  getRoomBySessionId(sessionId: string): Room | null {
    const roomCode = this.sessionToRoom.get(sessionId);
    if (!roomCode) {
      return null;
    }
    return this.rooms.get(roomCode) ?? null;
  }

  /**
   * Returns the total number of rooms
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Returns all room codes
   */
  getAllRoomCodes(): string[] {
    return Array.from(this.rooms.keys());
  }

  // ============================================
  // Cleanup
  // ============================================

  /**
   * Removes empty rooms that have been inactive for too long
   */
  cleanupEmptyRooms(): void {
    const now = Date.now();
    const roomsToDelete: string[] = [];

    for (const [roomCode, room] of this.rooms) {
      if (room.isEmpty()) {
        const inactiveTime = now - room.getLastActivityAt();
        if (inactiveTime >= EMPTY_ROOM_TTL_MS) {
          roomsToDelete.push(roomCode);
        }
      }
    }

    for (const roomCode of roomsToDelete) {
      this.rooms.delete(roomCode);
      this.logger.info(`Room ${roomCode} cleaned up (empty for too long)`);
    }

    if (roomsToDelete.length > 0) {
      this.logger.info(`Cleaned up ${roomsToDelete.length} empty rooms`);
    }
  }

  /**
   * Destroys all rooms (for shutdown)
   */
  destroyAllRooms(): void {
    this.rooms.clear();
    this.sessionToRoom.clear();
    this.logger.info('All rooms destroyed');
  }

  // ============================================
  // Room Code Generation
  // ============================================

  /**
   * Generates a unique room code
   */
  private generateUniqueRoomCode(): string {
    let code: string;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      code = this.generateRoomCode();
      attempts++;
      if (attempts >= maxAttempts) {
        // Fallback: append timestamp to ensure uniqueness
        code = code + Date.now().toString(36).slice(-2).toUpperCase();
        break;
      }
    } while (this.rooms.has(code));

    return code;
  }

  /**
   * Generates a random room code
   */
  private generateRoomCode(): string {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const randomIndex = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
      code += ROOM_CODE_CHARS[randomIndex];
    }
    return code;
  }
}

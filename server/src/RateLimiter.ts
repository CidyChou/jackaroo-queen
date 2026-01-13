/**
 * RateLimiter - Implements sliding window rate limiting per session
 * 
 * Uses a sliding window algorithm to track request counts.
 * Each session has its own rate limit counter.
 * 
 * Requirements: 7.4
 */

import { Logger } from './Logger.js';

export interface RateLimiterConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
}

interface SessionRateData {
  /** Timestamps of requests in the current window */
  timestamps: number[];
  /** Whether the session is currently blocked */
  blocked: boolean;
  /** When the block expires (if blocked) */
  blockedUntil: number | null;
}

// Default configuration
const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequests: 100,  // 100 requests
  windowMs: 10000,   // per 10 seconds
};

// Block duration when rate limit is exceeded
const BLOCK_DURATION_MS = 5000; // 5 seconds

export class RateLimiter {
  private config: RateLimiterConfig;
  private sessions: Map<string, SessionRateData>;
  private logger: Logger;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessions = new Map();
    this.logger = new Logger('RateLimiter');
    this.cleanupInterval = null;
  }

  /**
   * Starts periodic cleanup of old session data
   */
  start(): void {
    if (this.cleanupInterval) {
      return;
    }

    // Clean up every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);

    this.logger.info('Rate limiter started', {
      maxRequests: this.config.maxRequests,
      windowMs: this.config.windowMs,
    });
  }

  /**
   * Stops the rate limiter
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
    this.logger.info('Rate limiter stopped');
  }

  /**
   * Checks if a request from a session should be allowed
   * Returns true if allowed, false if rate limited
   * 
   * Requirements: 7.4
   */
  checkLimit(sessionId: string): boolean {
    const now = Date.now();
    let data = this.sessions.get(sessionId);

    // Initialize session data if not exists
    if (!data) {
      data = {
        timestamps: [],
        blocked: false,
        blockedUntil: null,
      };
      this.sessions.set(sessionId, data);
    }

    // Check if session is blocked
    if (data.blocked) {
      if (data.blockedUntil && now >= data.blockedUntil) {
        // Block has expired, unblock the session
        data.blocked = false;
        data.blockedUntil = null;
        data.timestamps = [];
        this.logger.debug(`Session ${sessionId.slice(0, 8)} unblocked`);
      } else {
        // Still blocked
        return false;
      }
    }

    // Remove timestamps outside the window (sliding window)
    const windowStart = now - this.config.windowMs;
    data.timestamps = data.timestamps.filter(ts => ts > windowStart);

    // Check if limit exceeded
    if (data.timestamps.length >= this.config.maxRequests) {
      // Rate limit exceeded - block the session
      data.blocked = true;
      data.blockedUntil = now + BLOCK_DURATION_MS;
      this.logger.warn(`Session ${sessionId.slice(0, 8)} rate limited`, {
        requestCount: data.timestamps.length,
        maxRequests: this.config.maxRequests,
        blockedUntilMs: BLOCK_DURATION_MS,
      });
      return false;
    }

    // Add current request timestamp
    data.timestamps.push(now);
    return true;
  }

  /**
   * Records a request for a session (alternative to checkLimit that always records)
   * Returns the current request count in the window
   */
  recordRequest(sessionId: string): number {
    const now = Date.now();
    let data = this.sessions.get(sessionId);

    if (!data) {
      data = {
        timestamps: [],
        blocked: false,
        blockedUntil: null,
      };
      this.sessions.set(sessionId, data);
    }

    // Remove timestamps outside the window
    const windowStart = now - this.config.windowMs;
    data.timestamps = data.timestamps.filter(ts => ts > windowStart);

    // Add current request
    data.timestamps.push(now);

    return data.timestamps.length;
  }

  /**
   * Gets the current request count for a session
   */
  getRequestCount(sessionId: string): number {
    const data = this.sessions.get(sessionId);
    if (!data) {
      return 0;
    }

    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    return data.timestamps.filter(ts => ts > windowStart).length;
  }

  /**
   * Checks if a session is currently blocked
   */
  isBlocked(sessionId: string): boolean {
    const data = this.sessions.get(sessionId);
    if (!data) {
      return false;
    }

    if (!data.blocked) {
      return false;
    }

    // Check if block has expired
    if (data.blockedUntil && Date.now() >= data.blockedUntil) {
      data.blocked = false;
      data.blockedUntil = null;
      return false;
    }

    return true;
  }

  /**
   * Gets the remaining time until a session is unblocked (in ms)
   * Returns 0 if not blocked
   */
  getBlockTimeRemaining(sessionId: string): number {
    const data = this.sessions.get(sessionId);
    if (!data || !data.blocked || !data.blockedUntil) {
      return 0;
    }

    const remaining = data.blockedUntil - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Removes a session from tracking
   */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Cleans up old session data
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    let cleaned = 0;

    for (const [sessionId, data] of this.sessions) {
      // Remove sessions with no recent activity and not blocked
      if (!data.blocked && data.timestamps.every(ts => ts <= windowStart)) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} inactive rate limit entries`);
    }
  }

  /**
   * Gets statistics about the rate limiter
   */
  getStats(): { trackedSessions: number; blockedSessions: number } {
    let blockedCount = 0;
    for (const data of this.sessions.values()) {
      if (data.blocked) {
        blockedCount++;
      }
    }

    return {
      trackedSessions: this.sessions.size,
      blockedSessions: blockedCount,
    };
  }
}

/**
 * HealthCheckServer - HTTP server for health check endpoint
 * 
 * Provides a simple HTTP endpoint for monitoring and load balancer health checks.
 * Returns server status information including:
 * - Server uptime
 * - Active connections
 * - Room count
 * - Rate limiter stats
 * 
 * Requirements: 7.5
 */

import * as http from 'http';
import { Logger } from './Logger.js';

export interface HealthCheckConfig {
  /** HTTP port for health check endpoint */
  port: number;
}

export interface ServerStats {
  /** Number of active WebSocket sessions */
  activeSessions: number;
  /** Number of active game rooms */
  activeRooms: number;
  /** Rate limiter statistics */
  rateLimiter?: {
    trackedSessions: number;
    blockedSessions: number;
  };
}

export type StatsProvider = () => ServerStats;

export class HealthCheckServer {
  private server: http.Server | null = null;
  private config: HealthCheckConfig;
  private logger: Logger;
  private startTime: number;
  private statsProvider: StatsProvider | null = null;

  constructor(config: HealthCheckConfig) {
    this.config = config;
    this.logger = new Logger('HealthCheck');
    this.startTime = Date.now();
  }

  /**
   * Sets the stats provider function
   */
  setStatsProvider(provider: StatsProvider): void {
    this.statsProvider = provider;
  }

  /**
   * Starts the HTTP health check server
   */
  start(): void {
    if (this.server) {
      this.logger.warn('Health check server already started');
      return;
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.listen(this.config.port, () => {
      this.logger.info(`Health check server started on port ${this.config.port}`);
    });

    this.server.on('error', (error: Error) => {
      this.logger.error('Health check server error', error);
    });
  }

  /**
   * Stops the HTTP health check server
   */
  stop(): void {
    if (this.server) {
      this.server.close(() => {
        this.logger.info('Health check server stopped');
      });
      this.server = null;
    }
  }

  /**
   * Handles incoming HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/';

    // Only respond to GET requests on /health or /
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    if (url === '/health' || url === '/') {
      this.handleHealthCheck(res);
    } else if (url === '/ready') {
      this.handleReadyCheck(res);
    } else if (url === '/live') {
      this.handleLiveCheck(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  /**
   * Handles the main health check endpoint
   * Returns detailed server status
   */
  private handleHealthCheck(res: http.ServerResponse): void {
    const uptimeMs = Date.now() - this.startTime;
    const stats = this.statsProvider ? this.statsProvider() : null;

    const healthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: {
        ms: uptimeMs,
        seconds: Math.floor(uptimeMs / 1000),
        formatted: this.formatUptime(uptimeMs),
      },
      server: {
        activeSessions: stats?.activeSessions ?? 0,
        activeRooms: stats?.activeRooms ?? 0,
      },
      rateLimiter: stats?.rateLimiter ?? null,
    };

    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(JSON.stringify(healthResponse, null, 2));
  }

  /**
   * Handles the readiness check endpoint
   * Used by Kubernetes/load balancers to check if server is ready to accept traffic
   */
  private handleReadyCheck(res: http.ServerResponse): void {
    // Server is ready if it's running
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ready' }));
  }

  /**
   * Handles the liveness check endpoint
   * Used by Kubernetes to check if server is alive
   */
  private handleLiveCheck(res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'alive' }));
  }

  /**
   * Formats uptime in human-readable format
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

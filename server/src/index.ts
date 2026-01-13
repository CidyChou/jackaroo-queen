import { WebSocketServer } from './WebSocketServer.js';
import { RoomManager } from './RoomManager.js';
import { MessageHandler } from './MessageHandler.js';
import { HealthCheckServer } from './HealthCheckServer.js';
import { Logger } from './Logger.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '8081', 10);
const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '100', 10);

const logger = new Logger('Main');

// Track error counts for monitoring
let errorCount = 0;

/**
 * Sets up global error handling to prevent server crashes
 * Requirements: 7.1
 */
function setupGlobalErrorHandling(): void {
  // Set up Logger's global error handler
  Logger.setGlobalErrorHandler((error: Error, context: string) => {
    errorCount++;
    logger.error(`Global error handler caught error in ${context}`, {
      error: error.message,
      stack: error.stack,
      totalErrors: errorCount,
    });
  });

  // Handle uncaught exceptions - log but don't crash
  process.on('uncaughtException', (error: Error) => {
    errorCount++;
    logger.error('Uncaught exception - server continuing', {
      error: error.message,
      stack: error.stack,
      totalErrors: errorCount,
    });
    // Don't exit - let the server continue running
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    errorCount++;
    const errorMessage = reason instanceof Error ? reason.message : String(reason);
    const errorStack = reason instanceof Error ? reason.stack : undefined;
    logger.error('Unhandled promise rejection - server continuing', {
      reason: errorMessage,
      stack: errorStack,
      totalErrors: errorCount,
    });
    // Don't exit - let the server continue running
  });

  logger.info('Global error handling configured');
}

async function main() {
  logger.info('Starting Jackaroo Game Server...');

  // Set up global error handling first
  setupGlobalErrorHandling();

  const roomManager = new RoomManager();
  const messageHandler = new MessageHandler(roomManager);

  const server = new WebSocketServer({
    port: PORT,
    maxConnections: MAX_CONNECTIONS,
    messageHandler,
    roomManager,
  });

  // Set up health check server (Requirements: 7.5)
  const healthServer = new HealthCheckServer({ port: HEALTH_PORT });
  healthServer.setStatsProvider(() => ({
    activeSessions: server.getSessionCount(),
    activeRooms: roomManager.getRoomCount(),
    rateLimiter: messageHandler.getRateLimiterStats(),
  }));

  server.start();
  healthServer.start();

  logger.info(`Server started on port ${PORT}`);
  logger.info(`Health check available on port ${HEALTH_PORT}`);

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down server...');
    healthServer.stop();
    messageHandler.stop();
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  logger.error('Failed to start server', error);
  process.exit(1);
});

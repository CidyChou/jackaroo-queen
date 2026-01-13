export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

export class Logger {
  private static globalErrorHandler: ((error: Error, context: string) => void) | null = null;

  constructor(private context: string) {}

  /**
   * Sets a global error handler for uncaught errors
   */
  static setGlobalErrorHandler(handler: (error: Error, context: string) => void): void {
    Logger.globalErrorHandler = handler;
  }

  /**
   * Reports an error to the global error handler
   */
  static reportError(error: Error, context: string): void {
    if (Logger.globalErrorHandler) {
      Logger.globalErrorHandler(error, context);
    }
  }

  private formatLogEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      data,
    };
  }

  private formatOutput(entry: LogEntry): string {
    const dataStr = entry.data !== undefined ? ` ${JSON.stringify(entry.data)}` : '';
    return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.context}] ${entry.message}${dataStr}`;
  }

  info(message: string, data?: unknown): void {
    const entry = this.formatLogEntry('info', message, data);
    console.log(this.formatOutput(entry));
  }

  warn(message: string, data?: unknown): void {
    const entry = this.formatLogEntry('warn', message, data);
    console.warn(this.formatOutput(entry));
  }

  error(message: string, error?: unknown): void {
    const entry = this.formatLogEntry('error', message, error);
    console.error(this.formatOutput(entry));
    
    // Report to global error handler if it's an Error instance
    if (error instanceof Error) {
      Logger.reportError(error, this.context);
    }
  }

  debug(message: string, data?: unknown): void {
    if (process.env.DEBUG) {
      const entry = this.formatLogEntry('debug', message, data);
      console.log(this.formatOutput(entry));
    }
  }

  /**
   * Logs a game action with full context
   * Requirements: 7.2
   */
  logGameAction(sessionId: string, roomCode: string, actionType: string, details?: unknown): void {
    this.info(`Game action: ${actionType}`, {
      sessionId: sessionId.slice(0, 8),
      roomCode,
      actionType,
      details,
    });
  }

  /**
   * Logs a connection event
   * Requirements: 7.3
   */
  logConnectionEvent(event: 'connect' | 'disconnect' | 'reconnect', sessionId: string, details?: unknown): void {
    this.info(`Connection event: ${event}`, {
      sessionId: sessionId.slice(0, 8),
      event,
      details,
    });
  }
}

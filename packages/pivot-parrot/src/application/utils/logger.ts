/**
 * Structured logging utility
 *
 * Usage:
 *   const logger = createLogger('ModuleName');
 *   logger.debug('Message', { context });
 *   logger.info('Message', { context });
 *   logger.warn('Message', { context });
 *   logger.error('Message', { context });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  enabled: boolean;
}

// Global configuration
let config: LoggerConfig = {
  level: typeof process !== 'undefined' && process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  enabled: typeof process !== 'undefined' && process.env.NODE_ENV !== 'test'
};

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * Configure global logging behavior
 */
export function configureLogger(options: Partial<LoggerConfig>): void {
  config = { ...config, ...options };
}

/**
 * Logger instance for a specific module
 */
export class Logger {
  constructor(private module: string) {}

  private shouldLog(level: LogLevel): boolean {
    return config.enabled && LOG_LEVELS[level] >= LOG_LEVELS[config.level];
  }

  private formatMessage(level: LogLevel, message: string, context?: object): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.module}]`;

    if (context && Object.keys(context).length > 0) {
      return `${prefix} ${message}`;
    }
    return `${prefix} ${message}`;
  }

  debug(message: string, context?: object): void {
    if (this.shouldLog('debug')) {
      const formatted = this.formatMessage('debug', message, context);
      if (context) {
        console.log(formatted, context);
      } else {
        console.log(formatted);
      }
    }
  }

  info(message: string, context?: object): void {
    if (this.shouldLog('info')) {
      const formatted = this.formatMessage('info', message, context);
      if (context) {
        console.log(formatted, context);
      } else {
        console.log(formatted);
      }
    }
  }

  warn(message: string, context?: object): void {
    if (this.shouldLog('warn')) {
      const formatted = this.formatMessage('warn', message, context);
      if (context) {
        console.warn(formatted, context);
      } else {
        console.warn(formatted);
      }
    }
  }

  error(message: string, context?: object): void {
    if (this.shouldLog('error')) {
      const formatted = this.formatMessage('error', message, context);
      if (context) {
        console.error(formatted, context);
      } else {
        console.error(formatted);
      }
    }
  }
}

/**
 * Create a logger instance for a module
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

// Export a default logger for ad-hoc use
export const logger = createLogger('App');

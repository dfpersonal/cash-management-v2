/**
 * Enhanced Logger for Recommendation Engine
 * Implements consistent logging standards across all components
 */

// Import LogCategory enum directly to avoid rootDir issues
export enum LogCategory {
  DEBUG = '[Debug]',
  INFO = '[Info]',
  PROGRESS = '[Progress]',
  WARNING = '[Warning]',
  ERROR = '[Error]'
}

export interface LoggerConfig {
  outputMode?: 'console' | 'json' | 'both';
  component?: string;
  silent?: boolean;
}

export class EnhancedLogger {
  private config: LoggerConfig;
  private logs: Array<{
    timestamp: Date;
    category: LogCategory;
    message: string;
    component?: string;
  }> = [];

  constructor(config: LoggerConfig = {}) {
    this.config = {
      outputMode: config.outputMode || 'console',
      component: config.component || 'recommendation-engine',
      silent: config.silent || false
    };
  }

  private log(category: LogCategory, message: string): void {
    if (this.config.silent) return;

    const logEntry = {
      timestamp: new Date(),
      category,
      message,
      ...(this.config.component && { component: this.config.component })
    };

    this.logs.push(logEntry);

    if (this.config.outputMode === 'console' || this.config.outputMode === 'both') {
      // Use stderr for debug messages to avoid contaminating JSON output
      if (category === LogCategory.DEBUG) {
        console.error(`${category} ${message}`);
      } else {
        console.log(`${category} ${message}`);
      }
    }

    if (this.config.outputMode === 'json' || this.config.outputMode === 'both') {
      // Store for later JSON output
    }
  }

  debug(message: string): void {
    this.log(LogCategory.DEBUG, message);
  }

  info(message: string): void {
    this.log(LogCategory.INFO, message);
  }

  progress(message: string): void {
    this.log(LogCategory.PROGRESS, message);
  }

  warning(message: string): void {
    this.log(LogCategory.WARNING, message);
  }

  error(message: string): void {
    this.log(LogCategory.ERROR, message);
  }

  /**
   * Get all logs as JSON
   */
  getLogsAsJson(): string {
    return JSON.stringify({
      logs: this.logs,
      summary: {
        total: this.logs.length,
        debug: this.logs.filter(l => l.category === LogCategory.DEBUG).length,
        info: this.logs.filter(l => l.category === LogCategory.INFO).length,
        progress: this.logs.filter(l => l.category === LogCategory.PROGRESS).length,
        warning: this.logs.filter(l => l.category === LogCategory.WARNING).length,
        error: this.logs.filter(l => l.category === LogCategory.ERROR).length
      }
    }, null, 2);
  }

  /**
   * Clear all stored logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Set output mode dynamically
   */
  setOutputMode(mode: 'console' | 'json' | 'both'): void {
    this.config.outputMode = mode;
  }

  /**
   * Enable/disable logging
   */
  setSilent(silent: boolean): void {
    this.config.silent = silent;
  }
}

// Singleton instance for global usage
let globalLogger: EnhancedLogger | null = null;

export function getLogger(config?: LoggerConfig): EnhancedLogger {
  if (!globalLogger) {
    globalLogger = new EnhancedLogger(config);
  } else if (config) {
    // Update config if provided
    if (config.outputMode) globalLogger.setOutputMode(config.outputMode);
    if (config.silent !== undefined) globalLogger.setSilent(config.silent);
  }
  return globalLogger;
}

// Export a default logger instance
export const logger = getLogger();
/**
 * Pipeline Logger - Controlled logging for pipeline services
 *
 * Log Levels (from least to most verbose):
 * - ERROR: Critical errors only (always shown)
 * - WARN: Important warnings (always shown)
 * - INFO: Stage summaries, initialization (PIPELINE_VERBOSE=true)
 * - DEBUG: Detailed operations, file-by-file progress (PIPELINE_DEBUG=true)
 *
 * Environment Variables:
 * - PIPELINE_VERBOSE=true: Show INFO + WARN + ERROR
 * - PIPELINE_DEBUG=true: Show DEBUG + INFO + WARN + ERROR
 * - Default: Show WARN + ERROR only
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

class PipelineLogger {
  private level: LogLevel;

  constructor() {
    // Determine log level from environment variables
    if (process.env.PIPELINE_DEBUG === 'true') {
      this.level = LogLevel.DEBUG;
    } else if (process.env.PIPELINE_VERBOSE === 'true') {
      this.level = LogLevel.INFO;
    } else {
      this.level = LogLevel.WARN; // Default: only warnings and errors
    }
  }

  /**
   * Critical errors - always shown
   */
  error(message: string, ...args: any[]): void {
    console.error(message, ...args);
  }

  /**
   * Important warnings - always shown
   */
  warn(message: string, ...args: any[]): void {
    console.warn(message, ...args);
  }

  /**
   * Informational messages - shown with PIPELINE_VERBOSE=true
   * Use for: stage summaries, initialization, high-level progress
   */
  info(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.INFO) {
      console.log(message, ...args);
    }
  }

  /**
   * Debug messages - shown with PIPELINE_DEBUG=true
   * Use for: detailed operations, file-by-file progress, verbose details
   */
  debug(message: string, ...args: any[]): void {
    if (this.level >= LogLevel.DEBUG) {
      console.log(message, ...args);
    }
  }

  /**
   * Get current log level for conditional logic
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Check if a specific level is enabled
   */
  isEnabled(level: LogLevel): boolean {
    return this.level >= level;
  }
}

// Export singleton instance
export const logger = new PipelineLogger();

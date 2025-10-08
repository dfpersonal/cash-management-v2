/**
 * Enhanced Logger - TypeScript implementation
 * Standardized logging with categories and file output
 * Follows system-wide logging standards
 */

import * as fs from 'fs';
import * as path from 'path';

// Logging categories following system standards
export enum LogCategory {
  DEBUG = '[Debug]',
  INFO = '[Info]',
  PROGRESS = '[Progress]',
  WARNING = '[Warning]',
  ERROR = '[Error]'
}

export interface LoggerOptions {
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none';
  enableFileLogging?: boolean;
  logDir?: string;
  componentName?: string;
  platformName?: string;
  verboseMode?: boolean;
}

export class EnhancedLogger {
  private logLevel: string;
  private enableFileLogging: boolean;
  private logDir: string;
  private logFile: string | null = null;
  private componentName: string;
  private platformName: string | null;
  private verboseMode: boolean;

  constructor(options: LoggerOptions = {}) {
    this.logLevel = options.logLevel || 'info';
    this.enableFileLogging = options.enableFileLogging !== false;
    this.logDir = options.logDir || './logs';
    this.componentName = options.componentName || 'component';
    this.platformName = options.platformName || null;
    this.verboseMode = options.verboseMode || false;

    if (this.enableFileLogging) {
      this.initializeLogFile();
    }
  }

  private initializeLogFile(): void {
    try {
      // Ensure logs directory exists
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Create timestamped log file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${this.componentName}-${timestamp}.log`;
      this.logFile = path.join(this.logDir, filename);

      // Initialize log file with header
      const header = `=== ${this.componentName.toUpperCase()} LOG STARTED AT ${new Date().toISOString()} ===\n`;
      fs.writeFileSync(this.logFile, header);

    } catch (error) {
      console.error('Failed to initialize log file:', error);
      this.enableFileLogging = false;
    }
  }

  // Categorized logging methods following system standards
  debug(message: string): void {
    this.log(LogCategory.DEBUG, message, 'debug');
  }

  info(message: string): void {
    this.log(LogCategory.INFO, message, 'info');
  }

  progress(message: string): void {
    this.log(LogCategory.PROGRESS, message, 'info');
  }

  warning(message: string): void {
    this.log(LogCategory.WARNING, message, 'warn');
  }

  error(message: string): void {
    this.log(LogCategory.ERROR, message, 'error');
  }

  private log(category: LogCategory, message: string, level: string): void {
    const timestamp = new Date().toISOString();
    let logMessage = `${timestamp} ${category}`;

    // Add component prefix if available
    if (this.componentName) {
      logMessage += ` [${this.componentName}]`;
    }

    // Add platform prefix if available
    if (this.platformName) {
      logMessage += ` [${this.platformName}]`;
    }

    logMessage += ` ${message}`;

    // Console output based on log level
    if (this.shouldLog(level)) {
      console.log(logMessage);
    }

    // File output (always logged if enabled)
    if (this.enableFileLogging && this.logFile) {
      try {
        fs.appendFileSync(this.logFile, logMessage + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }
  }

  private shouldLog(level: string): boolean {
    const levels: Record<string, number> = {
      'none': 0,
      'error': 1,
      'warn': 2,
      'info': 3,
      'debug': 4
    };

    const currentLevel = levels[this.logLevel] || 3;
    const messageLevel = levels[level] || 3;

    return messageLevel <= currentLevel;
  }

  // Utility methods
  setLogLevel(level: string): void {
    this.logLevel = level;
  }

  getLogFile(): string | null {
    return this.logFile;
  }

  flush(): void {
    // For future implementation if needed
  }
}
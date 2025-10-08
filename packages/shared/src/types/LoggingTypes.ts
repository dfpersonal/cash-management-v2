/**
 * SYSTEM-WIDE LOGGING STANDARDS
 * 
 * These categories MUST be used consistently across all components:
 * - Scrapers (JavaScript/Node.js)
 * - Electron App (TypeScript)
 * - Python Reporter (via JSON output parsing)
 * 
 * Last Updated: 2025-08-25
 * Used By: All enhancement plans (Deduplication, UI, Configuration, FRN Migration)
 */

export enum LogCategory {
  DEBUG = '[Debug]',     // Detailed technical info - shown only on failure
  INFO = '[Info]',       // General information - always shown
  PROGRESS = '[Progress]', // User-friendly progress updates - always shown
  WARNING = '[Warning]',  // Non-critical issues - always shown
  ERROR = '[Error]'      // Critical errors - always shown
}

export const LOG_CATEGORIES = {
  DEBUG: '[Debug]',
  INFO: '[Info]',
  PROGRESS: '[Progress]',
  WARNING: '[Warning]',
  ERROR: '[Error]'
} as const;

/**
 * UI Display Rules:
 * - SUCCESS: Show Progress, Info, Warning + result summary
 * - FAILURE: Show ALL categories including Debug for diagnostics
 * - REAL-TIME: Filter Debug during execution, show all on completion
 */

export interface LogMessage {
  timestamp: Date;
  category: LogCategory;
  message: string;
  component: 'scraper' | 'ui' | 'reporter';
  processId?: string;
}

/**
 * Enhanced logging interface for consistent implementation across components
 */
export interface EnhancedLoggerInterface {
  debug(message: string): void;
  info(message: string): void;
  progress(message: string): void;
  warning(message: string): void;
  error(message: string): void;
  
  // Specialized logging methods
  logDeduplicationDetails(removedData: any[]): void;
  logPerformanceMetrics(metrics: PerformanceMetrics): void;
}

export interface PerformanceMetrics {
  operation: string;
  startTime: number;
  endTime: number;
  duration: number;
  recordCount?: number;
  successRate?: number;
}

/**
 * Categorized log output for UI consumption
 */
export interface CategorizedLogOutput {
  all: string[];           // Complete log output
  filtered: string[];      // UI-friendly filtered output (no Debug during success)
  categories: {
    debug: string[];
    info: string[];
    progress: string[];
    warning: string[];
    error: string[];
  };
}

/**
 * Validation function to ensure log messages follow standards
 */
export function validateLogMessage(message: string): {
  isValid: boolean;
  category?: LogCategory;
  content?: string;
  error?: string;
} {
  const categoryRegex = /^\[(Debug|Info|Progress|Warning|Error)\]\s+(.+)$/;
  const match = message.match(categoryRegex);
  
  if (!match) {
    return {
      isValid: false,
      error: 'Log message must start with a valid category: [Debug], [Info], [Progress], [Warning], or [Error]'
    };
  }
  
  const [, categoryName, content] = match;
  const category = `[${categoryName}]` as LogCategory;
  
  return {
    isValid: true,
    category,
    content: content.trim()
  };
}

/**
 * Utility function to parse categorized logs from console output
 */
export function parseLogOutput(output: string): CategorizedLogOutput {
  const lines = output.split('\n').filter(line => line.trim());
  const result: CategorizedLogOutput = {
    all: lines,
    filtered: [],
    categories: {
      debug: [],
      info: [],
      progress: [],
      warning: [],
      error: []
    }
  };
  
  for (const line of lines) {
    const validation = validateLogMessage(line);
    
    if (validation.isValid && validation.category) {
      // Add to appropriate category
      switch (validation.category) {
        case LogCategory.DEBUG:
          result.categories.debug.push(line);
          break;
        case LogCategory.INFO:
          result.categories.info.push(line);
          result.filtered.push(line);
          break;
        case LogCategory.PROGRESS:
          result.categories.progress.push(line);
          result.filtered.push(line);
          break;
        case LogCategory.WARNING:
          result.categories.warning.push(line);
          result.filtered.push(line);
          break;
        case LogCategory.ERROR:
          result.categories.error.push(line);
          result.filtered.push(line);
          break;
      }
    } else {
      // Uncategorized output - treat as info for filtered view
      result.filtered.push(line);
    }
  }
  
  return result;
}

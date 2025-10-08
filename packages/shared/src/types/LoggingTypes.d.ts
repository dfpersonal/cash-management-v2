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
export declare enum LogCategory {
    DEBUG = "[Debug]",// Detailed technical info - shown only on failure
    INFO = "[Info]",// General information - always shown
    PROGRESS = "[Progress]",// User-friendly progress updates - always shown
    WARNING = "[Warning]",// Non-critical issues - always shown
    ERROR = "[Error]"
}
export declare const LOG_CATEGORIES: {
    readonly DEBUG: "[Debug]";
    readonly INFO: "[Info]";
    readonly PROGRESS: "[Progress]";
    readonly WARNING: "[Warning]";
    readonly ERROR: "[Error]";
};
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
    all: string[];
    filtered: string[];
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
export declare function validateLogMessage(message: string): {
    isValid: boolean;
    category?: LogCategory;
    content?: string;
    error?: string;
};
/**
 * Utility function to parse categorized logs from console output
 */
export declare function parseLogOutput(output: string): CategorizedLogOutput;
//# sourceMappingURL=LoggingTypes.d.ts.map
/**
 * Enhanced Logger - Standardized logging with categories and file output
 * Follows system-wide logging standards from /src/shared/types/LoggingTypes.ts
 */

import fs from 'fs';
import path from 'path';

// Import standardized logging categories
// Note: Using exact category names as defined in system standards
const LogCategory = {
  DEBUG: '[Debug]',
  INFO: '[Info]', 
  PROGRESS: '[Progress]',
  WARNING: '[Warning]',
  ERROR: '[Error]'
};

export class EnhancedLogger {
  constructor(options = {}) {
    this.logLevel = options.logLevel || 'info'; // debug, info, warn, error, none
    this.enableFileLogging = options.enableFileLogging !== false;
    this.logDir = options.logDir || './logs';
    this.logFile = null;
    this.componentName = options.componentName || 'scraper';
    this.platformName = options.platformName || null; // For platform-specific prefixes
    this.verboseMode = options.verboseMode || false; // Control detailed output
    
    if (this.enableFileLogging) {
      this.initializeLogFile();
    }
  }

  initializeLogFile() {
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
  debug(message) { 
    this.log(LogCategory.DEBUG, message, 'debug'); 
  }
  
  info(message) { 
    this.log(LogCategory.INFO, message, 'info'); 
  }
  
  progress(message) { 
    this.log(LogCategory.PROGRESS, message, 'info'); 
  }
  
  warning(message) { 
    this.log(LogCategory.WARNING, message, 'warn'); 
  }
  
  error(message) { 
    this.log(LogCategory.ERROR, message, 'error'); 
  }

  log(category, message, level) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} ${category} ${message}`;
    
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

  shouldLog(level) {
    const levels = {
      'none': 0,
      'error': 1,
      'warn': 2, 
      'info': 3,
      'debug': 4
    };
    
    return levels[level] <= levels[this.logLevel];
  }

  // New methods for standardized logging
  setPlatform(platformName) {
    this.platformName = platformName;
  }

  setVerbosity(verbose = false) {
    this.verboseMode = verbose;
    if (verbose) {
      this.logLevel = 'debug';
    }
  }

  // Platform-aware logging methods
  logPlatform(level, message) {
    const prefix = this.platformName ? `${this.platformName}: ` : '';
    const finalMessage = `${prefix}${message}`;
    
    switch(level) {
      case 'debug':
        this.debug(finalMessage);
        break;
      case 'info':
        this.info(finalMessage);
        break;
      case 'progress':
        this.progress(finalMessage);
        break;
      case 'warning':
        this.warning(finalMessage);
        break;
      case 'error':
        this.error(finalMessage);
        break;
      default:
        this.info(finalMessage);
    }
  }

  // Simplified platform logging methods
  logPlatformProgress(message) {
    this.logPlatform('progress', message);
  }

  logPlatformInfo(message) {
    this.logPlatform('info', message);
  }

  logPlatformDebug(message) {
    // Only show debug messages in verbose mode
    if (this.verboseMode) {
      this.logPlatform('debug', message);
    }
  }

  // Specialized logging methods for deduplication
  logDeduplicationDetails(removedData) {
    if (!Array.isArray(removedData) || removedData.length === 0) {
      this.debug('No duplicates found during deduplication');
      return;
    }
    
    this.info(`Deduplication removed ${removedData.length} duplicates:`);
    
    // Show first 3 examples in console
    const examples = removedData.slice(0, 3);
    for (const item of examples) {
      const bank = item.removed?.bankName || 'Unknown Bank';
      const rate = item.removed?.aerRate ? `${item.removed.aerRate}%` : 'N/A';
      const reason = item.reason || 'Unknown reason';
      this.info(`   - ${bank} (${rate}) - ${reason}`);
    }
    
    if (removedData.length > 3) {
      this.info(`   ... and ${removedData.length - 3} more (see log file for details)`);
    }
    
    // Log all details to file
    if (this.enableFileLogging) {
      this.debug('=== DETAILED DEDUPLICATION RESULTS ===');
      for (const item of removedData) {
        const removed = item.removed || {};
        const kept = item.keptInstead || {};
        const reason = item.reason || 'Unknown reason';
        const businessKey = item.businessKey || 'No business key';
        
        this.debug(`REMOVED: ${removed.bankName || 'Unknown'} (${removed.aerRate || 'N/A'}%) - ${reason}`);
        this.debug(`  Business Key: ${businessKey}`);
        this.debug(`  Kept Instead: ${kept.bankName || 'Unknown'} (${kept.aerRate || 'N/A'}%)`);
        this.debug(`  Original Data: ${JSON.stringify(removed.originalData || {})}`);
        this.debug('---');
      }
      this.debug('=== END DEDUPLICATION DETAILS ===');
    }
  }

  logPipelineResults(results) {
    if (!results) return;
    
    // Simple summary to match other scrapers - detailed info goes to log file only
    const totalProducts = results.rawProducts || results.databaseProducts || 0;
    this.info(`${this.platformName}: ${totalProducts} products extracted, 0 failed`);

    // Log detailed results to file
    if (this.enableFileLogging && results.deduplicationSummary) {
      this.debug('=== PIPELINE CONFIGURATION ===');
      const summary = results.deduplicationSummary;
      this.debug(`Rate Tolerance: ${summary.rateTolerance ? (summary.rateTolerance * 10000) + ' BP' : 'Disabled'}`);
      this.debug(`Cross-Platform Deduplication: ${summary.crossPlatformEnabled ? 'Enabled' : 'Disabled'}`);
      this.debug('=== END PIPELINE CONFIGURATION ===');
    }
  }

  logScraperStart(scraperName, config = {}) {
    this.progress(`Starting ${scraperName} scraper...`);
    
    if (Object.keys(config).length > 0) {
      this.debug('=== SCRAPER CONFIGURATION ===');
      for (const [key, value] of Object.entries(config)) {
        this.debug(`${key}: ${JSON.stringify(value)}`);
      }
      this.debug('=== END CONFIGURATION ===');
    }
  }

  logScraperComplete(scraperName, duration, results) {
    const durationStr = duration ? ` (${Math.round(duration / 1000)}s)` : '';
    this.progress(`${scraperName} scraper completed${durationStr}`);
    
    if (results) {
      this.logPipelineResults(results);
    }
  }

  logScraperError(scraperName, error, context = {}) {
    this.error(`❌ ${scraperName} scraper failed: ${error.message || error}`);
    
    if (error.stack) {
      this.debug(`Stack trace: ${error.stack}`);
    }
    
    if (Object.keys(context).length > 0) {
      this.debug('=== ERROR CONTEXT ===');
      for (const [key, value] of Object.entries(context)) {
        this.debug(`${key}: ${JSON.stringify(value)}`);
      }
      this.debug('=== END ERROR CONTEXT ===');
    }
  }

  // Utility method to get log file path for UI integration
  getLogFilePath() {
    return this.logFile;
  }
}

// Export log categories for use by other modules
export { LogCategory };
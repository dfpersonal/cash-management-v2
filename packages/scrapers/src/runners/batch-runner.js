#!/usr/bin/env node

/**
 * Unified Scraper Runner
 * 
 * Consolidates all scraper main() functions into a single runner
 * Part of the scraper refactoring initiative (Phase 1: Low-Risk Foundation)
 * 
 * Usage:
 *   node scraper-runner.js <scraper> [options]
 *   node scraper-runner.js ajbell --verbose
 *   node scraper-runner.js flagstone --headless
 *   node scraper-runner.js hl --test
 */

import { AJBellScraper } from './ajbell-scraper.js';
import { HLScraper } from './hl-scraper.js';
import { MoneyFactsScraper } from './moneyfacts-scraper.js';
import { FlagstoneScraper } from './flagstone-scraper.js';

class ScraperRunner {
  /**
   * Map of scraper names to their classes
   */
  static scraperMap = {
    'ajbell': AJBellScraper,
    'aj-bell': AJBellScraper,
    'hl': HLScraper,
    'hargreaves-lansdown': HLScraper,
    'hargreaves': HLScraper,
    'moneyfacts': MoneyFactsScraper,
    'flagstone': FlagstoneScraper
  };

  /**
   * Get the scraper class for a given name
   */
  static getScraperClass(scraperName) {
    const normalizedName = scraperName.toLowerCase().trim();
    const ScraperClass = this.scraperMap[normalizedName];
    
    if (!ScraperClass) {
      const availableScrapers = Object.keys(this.scraperMap).join(', ');
      throw new Error(`Unknown scraper: ${scraperName}. Available scrapers: ${availableScrapers}`);
    }
    
    return ScraperClass;
  }

  /**
   * Parse command line arguments
   */
  static parseArgs() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
      this.showHelp();
      process.exit(0);
    }
    
    const scraperName = args[0];
    const options = {
      verbose: false,
      headless: true,
      outputDir: null,
      saveToDatabase: false, // Default to JSON-only for dev/test
      saveToFiles: true,
      test: false,
      timeout: null,
      allFilters: false
    };
    
    // Parse remaining arguments
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--verbose':
        case '-v':
          options.verbose = true;
          break;
        case '--visible':
        case '--no-headless':
          options.headless = false;
          break;
        case '--test':
          options.test = true;
          options.saveToDatabase = false; // Don't save test runs to DB
          options.outputDir = './test-output';
          break;
        case '--with-database':
          options.saveToDatabase = true;
          break;
        case '--no-database':
          options.saveToDatabase = false;
          break;
        case '--no-files':
          options.saveToFiles = false;
          break;
        case '--all-filters':
          options.allFilters = true; // For Flagstone
          break;
        default:
          if (arg.startsWith('--output=')) {
            options.outputDir = arg.split('=')[1];
          } else if (arg.startsWith('--timeout=')) {
            options.timeout = parseInt(arg.split('=')[1]);
          }
      }
    }
    
    return { scraperName, options };
  }

  /**
   * Show help message
   */
  static showHelp() {
    console.log(`
Unified Scraper Runner
======================

Usage: node scraper-runner.js <scraper> [options]

Scrapers:
  ajbell, aj-bell          AJ Bell scraper
  hl, hargreaves          Hargreaves Lansdown scraper
  moneyfacts              MoneyFacts scraper
  flagstone               Flagstone scraper

Options:
  --verbose, -v           Enable verbose debug logging
  --visible               Run browser in visible mode (default: headless)
  --test                  Test mode (saves to test-output/, no DB write)
  --with-database         Enable database writing (default: JSON-only)
  --no-database          Skip database writing (default behavior)
  --no-files             Skip file output
  --output=<dir>         Custom output directory
  --timeout=<ms>         Custom timeout in milliseconds
  --all-filters          (Flagstone only) Scrape all filter combinations
  --help, -h             Show this help message

Note: CLI runs in development mode by default (JSON output only).
For production use, run scrapers through the Electron application.

Examples:
  node scraper-runner.js ajbell --verbose
  node scraper-runner.js flagstone --visible --all-filters
  node scraper-runner.js hl --test
  node scraper-runner.js moneyfacts --with-database --output=./custom-output

Environment Variables:
  USE_UNIFIED_RUNNER=true    Enable this runner (for gradual rollout)
  SCRAPER_TEST_MODE=true     Test mode with separate database
  COMPARE_OUTPUTS=true       Run both old and new implementations
`);
  }

  /**
   * Report results in a consistent format
   */
  static reportResults(result, scraperName, logger) {
    if (result.success) {
      const productCount = result.ratesFound || result.productCount || 0;
      const dbCount = result.processedProducts || result.finalDatabaseCount || result.databaseProducts || 0;
      
      logger.info(`✅ ${scraperName}: Scraping completed successfully`);
      logger.info(`📊 Products extracted: ${productCount}`);
      
      if (dbCount > 0) {
        logger.info(`💾 Database: ${dbCount} products saved`);
      }
      
      // Report deduplication stats if available
      if (result.deduplicationStats) {
        const stats = result.deduplicationStats;
        if (stats.duplicatesRemoved > 0) {
          logger.debug(`🔍 Deduplication: ${stats.duplicatesRemoved} duplicates removed`);
        }
      }
      
      // Report FRN stats if available
      if (result.frnValidation) {
        const frnStats = result.frnValidation.overallStats;
        if (frnStats) {
          logger.info(`🏦 FRN Resolution: ${frnStats.totalResolved}/${frnStats.totalProducts} matched (${frnStats.successRate}%)`);
        }
      }
      
      // Report files saved if available
      if (result.files) {
        const fileCount = Object.keys(result.files).filter(key => result.files[key]).length;
        if (fileCount > 0) {
          logger.debug(`📁 Files saved: ${fileCount}`);
        }
      }
      
    } else {
      logger.error(`❌ ${scraperName}: Scraping failed`);
      logger.error(`Error: ${result.error || 'Unknown error'}`);
    }
  }

  /**
   * Main runner method
   */
  static async run(scraperName, options) {
    try {
      // Get the appropriate scraper class
      const ScraperClass = this.getScraperClass(scraperName);
      
      // Build scraper options
      const scraperOptions = {
        headless: options.headless,
        saveToDatabase: options.saveToDatabase,
        saveToFiles: options.saveToFiles,
        logLevel: options.verbose ? 'debug' : 'info'
      };
      
      if (options.outputDir) {
        scraperOptions.outputDir = options.outputDir;
      }
      
      if (options.timeout) {
        scraperOptions.timeout = options.timeout;
      }
      
      // Create scraper instance
      const scraper = new ScraperClass(scraperOptions);
      
      // Enable verbose logging if requested
      if (options.verbose) {
        scraper.logger.logLevel = 'debug';
        scraper.logger.debug(`🔧 Debug mode enabled for ${scraperName}`);
        scraper.logger.debug(`Options: ${JSON.stringify(options)}`);
      }
      
      // Log startup
      const displayName = scraperName.charAt(0).toUpperCase() + scraperName.slice(1);
      scraper.logger.info(`🚀 Starting ${displayName} scraper...`);
      
      // Handle special cases
      let result;
      if (scraperName === 'flagstone' && typeof scraper.scrape === 'function') {
        // Flagstone has its own scrape method
        result = await scraper.scrape({ allFilters: options.allFilters });
      } else if (typeof scraper.scrape === 'function') {
        // Standard scraper base scrape method
        result = await scraper.scrape();
      } else {
        throw new Error(`Scraper ${scraperName} does not have a scrape() method`);
      }
      
      // Report results
      this.reportResults(result, displayName, scraper.logger);
      
      // Return result for programmatic use
      return result;
      
    } catch (error) {
      console.error(`❌ Fatal error in scraper runner:`, error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }
}

// Main execution when run directly
async function main() {
  const { scraperName, options } = ScraperRunner.parseArgs();
  
  // Check if unified runner is enabled (for gradual rollout)
  const useUnifiedRunner = process.env.USE_UNIFIED_RUNNER !== 'false';
  if (!useUnifiedRunner) {
    console.log('⚠️  Unified runner is disabled. Set USE_UNIFIED_RUNNER=true to enable.');
    console.log('Falling back to individual scraper files...');
    process.exit(1);
  }
  
  console.log(`📋 Running ${scraperName} scraper via unified runner...`);

  // Show development mode message
  if (!options.saveToDatabase) {
    console.log('🔧 Development mode: JSON output only (no database writes)');
    console.log('   Use --with-database to enable database writes');
  } else {
    console.log('💾 Database mode: Writing to database and creating JSON files');
  }
  
  const startTime = Date.now();
  const result = await ScraperRunner.run(scraperName, options);
  const duration = Date.now() - startTime;
  
  console.log(`⏱️  Execution time: ${(duration / 1000).toFixed(1)}s`);
  
  // Exit with appropriate code
  process.exit(result.success ? 0 : 1);
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

// Export for programmatic use
export { ScraperRunner };
#!/usr/bin/env node

/**
 * Rates Scraper Orchestrator
 * Coordinates multiple platform scrapers with unified interface
 */

import { FlagstoneScraper } from '../scrapers/flagstone.js';
import { HLScraper } from '../scrapers/hargreaves-lansdown.js';
import { AJBellScraper } from '../scrapers/ajbell.js';
import { MoneyFactsScraper } from '../scrapers/moneyfacts.js';
import { getScraperConfig } from '../../config/environments.js';
import { createRequire } from 'module';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);

class RatesScraper {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== false, // Default to headless
      timeout: options.timeout || 30000,
      saveToDatabase: options.saveToDatabase !== false,
      saveToFiles: options.saveToFiles !== false,
      ...options
    };

    this.availablePlatforms = {
      flagstone: {
        name: 'Flagstone',
        scraper: FlagstoneScraper
      },
      hl: {
        name: 'Hargreaves Lansdown',
        scraper: HLScraper
      },
      ajbell: {
        name: 'AJ Bell',
        scraper: AJBellScraper
      },
      moneyfacts: {
        name: 'MoneyFacts',
        scraper: MoneyFactsScraper
      }
    };

    this.results = {
      success: false,
      platforms: {},
      summary: {
        totalPlatforms: 0,
        successfulPlatforms: 0,
        failedPlatforms: 0,
        totalRates: 0,
        totalProcessedProducts: 0
      },
      cleanup: {
        executed: false,
        processed: 0,
        compressed: 0,
        archived: 0,
        deleted: 0,
        spaceSaved: 0
      },
      startTime: null,
      endTime: null,
      errors: []
    };
  }

  /**
   * Export platform data from database to JSON file
   * This is needed for MoneyFacts scraper to have up-to-date platform information
   */
  async exportPlatformsForMoneyFacts() {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      // Navigate from scrapers/src/runners to project root
      const projectRoot = path.resolve(__dirname, '../../../');
      const dbPath = path.join(projectRoot, 'data/database/cash_savings.db');
      const outputPath = path.join(projectRoot, 'packages/scrapers/data/known-platforms.json');

      // Check if database exists
      if (!existsSync(dbPath)) {
        console.warn(`⚠️  Database not found at ${dbPath}`);
        console.warn('MoneyFacts will use existing platform data if available');
        return { success: false, error: 'Database not found' };
      }

      // Import the compiled JavaScript version of exportPlatforms
      const electronAppPath = path.join(projectRoot, 'packages/electron-app/dist/main/utils/exportPlatforms.js');

      if (!existsSync(electronAppPath)) {
        console.warn(`⚠️  Export utility not found at ${electronAppPath}`);
        console.warn('Please run "npm run build" in the electron-app package');
        console.warn('MoneyFacts will use existing platform data if available');
        return { success: false, error: 'Export utility not found' };
      }

      // Dynamic import of the compiled TypeScript module
      const { exportPlatformsToJson } = await import(electronAppPath);

      console.log('🔄 Exporting platform data for MoneyFacts scraper...');
      const result = await exportPlatformsToJson(dbPath, outputPath);

      if (result.success) {
        console.log(`✅ Exported ${result.count} platforms to known-platforms.json`);
      } else {
        console.warn(`⚠️  Platform export failed: ${result.error}`);
        console.warn('MoneyFacts will continue but may have issues with platform normalization');
      }

      return result;

    } catch (error) {
      console.error(`❌ Error exporting platforms: ${error.message}`);
      console.warn('MoneyFacts will use existing platform data if available');
      return { success: false, error: error.message };
    }
  }

  async scrapePlatform(platformKey) {
    const platform = this.availablePlatforms[platformKey];
    if (!platform) {
      throw new Error(`Unknown platform: ${platformKey}`);
    }

    // Export platform data if this is MoneyFacts (needs platform lookup)
    if (platformKey === 'moneyfacts') {
      await this.exportPlatformsForMoneyFacts();
    }

    // Check if this is MoneyFacts without specific type filters - run sequentially
    if (platformKey === 'moneyfacts' &&
        !this.options.moneyFactsTypes &&
        (!this.options.moneyFactsExclude || this.options.moneyFactsExclude.length === 0)) {
      console.log(`\n${platform.name}: Running sequential processing for all account types...`);
      return await this.scrapeMoneyFactsSequentially();
    }

    console.log(`\n${platform.name}: Starting extraction...`);
    
    // Get the centrally managed configuration for this platform
    const scraperConfig = getScraperConfig(platformKey, this.options);
    
    const scraperOptions = {
      ...scraperConfig,
      verbose: this.options.verbose // Ensure verbose flag is passed through
    };

    // Add MoneyFacts-specific options
    if (platformKey === 'moneyfacts') {
      if (this.options.moneyFactsTypes) {
        scraperOptions.accountTypes = this.options.moneyFactsTypes;
        if (this.options.verbose) {
          console.log(`MoneyFacts account types specified: ${this.options.moneyFactsTypes.join(', ')}`);
        }
      }
      if (this.options.moneyFactsExclude && this.options.moneyFactsExclude.length > 0) {
        scraperOptions.excludeTypes = this.options.moneyFactsExclude;
        if (this.options.verbose) {
          console.log(`MoneyFacts excluding account types: ${this.options.moneyFactsExclude.join(', ')}`);
        }
      }
    }

    const scraper = new platform.scraper(scraperOptions);
    
    try {
      const result = await scraper.scrape();
      
      if (result.success) {
        console.log(`${platform.name}: Completed successfully`);
        console.log(`Found ${result.ratesFound} rates`);
      } else {
        console.log(`${platform.name}: Failed - ${result.error}`);
      }
      
      return result;
      
    } catch (error) {
      console.error(`${platform.name}: Scraping failed -`, error.message);
      return {
        success: false,
        error: error.message,
        platform: platformKey
      };
    }
  }

  async scrapeMoneyFactsSequentially() {
    console.log('Starting sequential MoneyFacts account type processing...');

    // Export platform data before processing
    await this.exportPlatformsForMoneyFacts();

    const accountTypes = [
      { type: 'easy-access', name: 'Easy Access' },
      { type: 'notice', name: 'Notice Accounts' },
      { type: 'fixed-term', name: 'Fixed Term' }
    ];
    
    const aggregatedResult = {
      success: false,
      ratesFound: 0,
      processedProducts: 0,
      platform: 'moneyfacts',
      timestamp: new Date().toISOString(),
      accountTypeResults: {},
      errors: []
    };
    
    let successfulTypes = 0;
    
    for (const accountType of accountTypes) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`MoneyFacts ${accountType.name}: Starting separate instance...`);
      console.log('='.repeat(50));
      
      // Get the centrally managed configuration for moneyfacts
      const baseConfig = getScraperConfig('moneyfacts', this.options);
      
      const scraperOptions = {
        ...baseConfig,
        accountTypes: [accountType.type] // Process only this type
      };
      
      const scraper = new this.availablePlatforms.moneyfacts.scraper(scraperOptions);
      
      try {
        const result = await scraper.scrape();
        
        aggregatedResult.accountTypeResults[accountType.type] = {
          success: result.success,
          ratesFound: result.ratesFound || 0,
          processedProducts: result.processedProducts || 0,
          error: result.error
        };
        
        if (result.success) {
          successfulTypes++;
          aggregatedResult.ratesFound += result.ratesFound || 0;
          aggregatedResult.processedProducts += result.processedProducts || 0;
          
          console.log(`MoneyFacts ${accountType.name}: ✓ Completed`);
          console.log(`  - Rates found: ${result.ratesFound}`);
        } else {
          console.log(`MoneyFacts ${accountType.name}: ✗ Failed`);
          console.log(`  - Error: ${result.error}`);
          aggregatedResult.errors.push({
            accountType: accountType.type,
            error: result.error
          });
        }
        
        // Add delay between account types to avoid rate limiting
        if (accountTypes.indexOf(accountType) < accountTypes.length - 1) {
          console.log('\nWaiting 15 seconds before next account type...');
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
        
      } catch (error) {
        console.error(`MoneyFacts ${accountType.name}: Critical error -`, error.message);
        aggregatedResult.accountTypeResults[accountType.type] = {
          success: false,
          ratesFound: 0,
          processedProducts: 0,
          error: error.message
        };
        aggregatedResult.errors.push({
          accountType: accountType.type,
          error: error.message
        });
      }
    }
    
    // Set overall success if at least one type succeeded
    aggregatedResult.success = successfulTypes > 0;
    
    // Print summary
    console.log(`\n${'='.repeat(50)}`);
    console.log('MoneyFacts Sequential Processing Summary');
    console.log('='.repeat(50));
    console.log(`Successful account types: ${successfulTypes}/${accountTypes.length}`);
    console.log(`Total rates found: ${aggregatedResult.ratesFound}`);
    console.log(`Total products saved: ${aggregatedResult.processedProducts}`);
    
    if (aggregatedResult.errors.length > 0) {
      console.log('\nErrors:');
      aggregatedResult.errors.forEach(err => {
        console.log(`  - ${err.accountType}: ${err.error}`);
      });
    }
    
    return aggregatedResult;
  }

  async scrapeAll(platforms = null) {
    const targetPlatforms = platforms || Object.keys(this.availablePlatforms);
    
    console.log('Starting multi-platform rate scraping...');
    console.log(`Target platforms: ${targetPlatforms.map(p => this.availablePlatforms[p].name).join(', ')}`);
    
    this.results.startTime = new Date().toISOString();
    this.results.summary.totalPlatforms = targetPlatforms.length;
    
    for (const platformKey of targetPlatforms) {
      try {
        const result = await this.scrapePlatform(platformKey);
        
        this.results.platforms[platformKey] = result;
        
        if (result.success) {
          this.results.summary.successfulPlatforms++;
          this.results.summary.totalRates += result.ratesFound || 0;
          this.results.summary.totalProcessedProducts += result.processedProducts || 0;
        } else {
          this.results.summary.failedPlatforms++;
          this.results.errors.push({
            platform: platformKey,
            error: result.error
          });
        }
        
      } catch (error) {
        this.results.summary.failedPlatforms++;
        this.results.errors.push({
          platform: platformKey,
          error: error.message
        });
        
        console.error(`Critical error with ${platformKey}:`, error.message);
      }
    }
    
    this.results.endTime = new Date().toISOString();
    this.results.success = this.results.summary.successfulPlatforms > 0;
    
    // FRN research and database operations now handled by TypeScript service pipeline
    
    // File cleanup removed - handled per architecture path
    
    return this.results;
  }



  printSummary() {
    const { summary, cleanup, startTime, endTime, errors } = this.results;
    
    console.log('\n' + '='.repeat(60));
    console.log('SCRAPING SUMMARY');
    console.log('='.repeat(60));
    
    console.log(`Duration: ${startTime} to ${endTime}`);
    console.log(`Platforms: ${summary.successfulPlatforms}/${summary.totalPlatforms} successful`);
    console.log(`Total rates found: ${summary.totalRates}`);
    console.log(`Total products processed: ${summary.totalProcessedProducts}`);
    
    if (cleanup.executed) {
      console.log(`\nFile Cleanup Results:`);
      console.log(`   Files processed: ${cleanup.processed}`);
      console.log(`   Files compressed: ${cleanup.compressed}`);
      console.log(`   Files archived: ${cleanup.archived}`);
      console.log(`   Files deleted: ${cleanup.deleted}`);
      console.log(`   Database records deleted: ${cleanup.databaseRecordsDeleted || 0}`);
      if (cleanup.spaceSaved > 0) {
        const spaceMB = (cleanup.spaceSaved / 1024 / 1024).toFixed(2);
        console.log(`   Space saved: ${spaceMB} MB`);
      }
    }
    
    if (errors.length > 0) {
      console.log(`\nErrors (${errors.length}):`);
      errors.forEach(err => {
        console.log(`   - ${err.platform}: ${err.error}`);
      });
    }
    
    console.log('\nPlatform Results:');
    Object.entries(this.results.platforms).forEach(([platform, result]) => {
      const platformName = this.availablePlatforms[platform].name;
      if (result.success) {
        console.log(`   ${platformName}: ${result.ratesFound} rates`);
        if (result.files) {
          const files = typeof result.files === 'object' ? result.files : {};
          const fileList = Object.values(files).filter(f => typeof f === 'string').join(', ');
          if (fileList) {
            console.log(`      Files: ${fileList}`);
          }
        }
      } else {
        console.log(`   ${platformName}: ${result.error}`);
      }
    });
    
    console.log('\n' + '='.repeat(60));
  }

  // CLI argument parsing
  static parseArgs(args) {
    const options = {
      platforms: null,
      headless: true,
      // MoneyFacts account type options
      moneyFactsTypes: null, // null means all types
      moneyFactsExclude: [],
      // File cleanup removed - handled per architecture path
      // New maintenance and display options
      cleanupOnly: false,
      showConfig: false,
      showFilePolicy: false,
      showRateThresholds: false,
      showCleanupStats: false,
      verbose: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg === '--platform' && i + 1 < args.length) {
        options.platforms = [args[i + 1]];
        i++;
      } else if (arg === '--platforms' && i + 1 < args.length) {
        options.platforms = args[i + 1].split(',');
        i++;
      } else if (arg === '--all') {
        options.platforms = null; // null means all platforms
      } else if (arg === '--headless=false' || arg === '--no-headless') {
        options.headless = false;
      } else if (arg === '--no-database') {
        options.saveToDatabase = false;
      } else if (arg === '--no-files') {
        options.saveToFiles = false;
      } else if (arg === '--no-cleanup' || arg === '--cleanup-dry-run' || arg === '--no-database-cleanup') {
        console.log(`Option ${arg} is no longer supported (file cleanup system removed)`);
      } else if (arg === '--cleanup-only') {
        console.log('Cleanup-only mode is no longer supported (file cleanup system removed)');
      } else if (arg === '--show-config') {
        options.showConfig = true;
      } else if (arg === '--show-file-policy' || arg === '--show-file-policies') {
        options.showFilePolicy = true;
      } else if (arg === '--show-rate-thresholds') {
        options.showRateThresholds = true;
      } else if (arg === '--show-cleanup-stats') {
        options.showCleanupStats = true;
      } else if (arg === '--verbose' || arg === '-v') {
        options.verbose = true;
      } else if (arg === '--debug') {
        options.verbose = true; // Debug is same as verbose
      } else if (arg === '--types' && i + 1 < args.length) {
        // MoneyFacts account types: --types=fixed-term,notice,easy-access
        const types = args[i + 1].split(',').map(t => t.trim());
        options.moneyFactsTypes = types;
        i++;
      } else if (arg.startsWith('--types=')) {
        // Handle --types=value format
        const types = arg.substring(8).split(',').map(t => t.trim());
        options.moneyFactsTypes = types;
      } else if (arg === '--type' && i + 1 < args.length) {
        // Single MoneyFacts account type: --type=notice
        options.moneyFactsTypes = [args[i + 1].trim()];
        i++;
      } else if (arg.startsWith('--type=')) {
        // Handle --type=value format
        options.moneyFactsTypes = [arg.substring(7).trim()];
      } else if (arg === '--exclude' && i + 1 < args.length) {
        // Exclude MoneyFacts account types: --exclude=fixed-term
        const excludeTypes = args[i + 1].split(',').map(t => t.trim());
        options.moneyFactsExclude = excludeTypes;
        i++;
      } else if (arg.startsWith('--exclude=')) {
        // Handle --exclude=value format
        const excludeTypes = arg.substring(10).split(',').map(t => t.trim());
        options.moneyFactsExclude = excludeTypes;
      } else if (arg === '--help' || arg === '-h') {
        console.log(`
Usage: node src/runners/cli-runner.js [options]

Platform Options:
  --platform <name>     Scrape single platform (flagstone, hl, ajbell, moneyfacts)
  --platforms <list>    Scrape multiple platforms (comma-separated)
  --all                 Scrape all platforms (default)

MoneyFacts Account Type Options:
  --types <list>        MoneyFacts account types (fixed-term,notice,easy-access)
  --type <name>         Single MoneyFacts account type
  --exclude <list>      Exclude MoneyFacts account types (comma-separated)

General Options:
  --headless=false      Run with visible browser
  --no-headless         Same as --headless=false
  --no-database         Skip database saving
  --no-files            Skip file saving
  --no-cleanup          Skip file cleanup after scraping
  --cleanup-dry-run     Run file cleanup in preview mode (shows what would be done)
  --no-database-cleanup Skip database record cleanup (files still cleaned up)
  --verbose, -v         Enable verbose logging with detailed technical information
  --debug               Same as --verbose
  --help, -h            Show this help message

Maintenance Operations:
  --cleanup-only        Run file cleanup without scraping (uses database config)
  --show-cleanup-stats  Display current cleanup policies and recent activity

Configuration Display:
  --show-config         Display current database configuration settings
  --show-file-policy    Display file cleanup policies and retention settings
  --show-rate-thresholds Display current rate filtering thresholds
  
Note: Configuration editing is done via the Electron app, not CLI

Examples:
  # Scraping Operations
  node src/runners/cli-runner.js --all
  node src/runners/cli-runner.js --platform flagstone
  node src/runners/cli-runner.js --platform moneyfacts --type=notice
  node src/runners/cli-runner.js --platform moneyfacts --types=fixed-term,easy-access
  node src/runners/cli-runner.js --platform moneyfacts --exclude=fixed-term
  node src/runners/cli-runner.js --platforms flagstone,hl,ajbell,moneyfacts
  node src/runners/cli-runner.js --platform hl --headless=false
  node src/runners/cli-runner.js --all --cleanup-dry-run
  node src/runners/cli-runner.js --all --no-cleanup
  node src/runners/cli-runner.js --all --no-database-cleanup

  # Maintenance Operations
  node src/runners/cli-runner.js --cleanup-only
  node src/runners/cli-runner.js --show-cleanup-stats
  
  # Configuration Display
  node src/runners/cli-runner.js --show-config
  node src/runners/cli-runner.js --show-file-policy
  node src/runners/cli-runner.js --show-rate-thresholds

MoneyFacts Account Types:
  - fixed-term    : Fixed Rate Bonds
  - notice        : Notice Accounts  
  - easy-access   : Easy Access Savings Accounts
        `);
        process.exit(0);
      }
    }

    return options;
  }

  // Configuration display methods
  async showConfig() {
    console.log('\nCurrent Configuration');
    console.log('=' .repeat(50));

    console.log('\nJSON-only pipeline configuration:');
    console.log('  - Raw data saved to individual scraper output directories');
    console.log('  - Normalized data processed through DataNormalizer');
    console.log('  - Database operations handled by TypeScript JSONIngestionService');
    console.log('\nConfiguration is now managed through environment files in config/');
  }

  async showFilePolicy() {
    console.log('\nFile Cleanup Policies');
    console.log('=' .repeat(40));
    
    try {
      console.log('File cleanup system has been removed.');
      return;
      
      await manager.initialize();
      
      console.log(`\nCurrent File Retention Policy:`);
      console.log(`  Active Phase (uncompressed): ${manager.policies.activePhaseDays} days`);
      console.log(`  Compressed Phase (gzipped): ${manager.policies.compressedPhaseDays} days`);
      console.log(`  Archived Phase (organized): ${manager.policies.archivedPhaseDays} days`);
      console.log(`  Cleanup After: ${manager.policies.cleanupAfterDays} days`);
      console.log(`  Always Preserve: ${manager.policies.preserveRecentFiles} most recent files`);
      console.log(`  Database Retention: ${manager.policies.databaseRetentionDays} days`);
      console.log(`\nFeatures Enabled:`);
      console.log(`  Compression: ${manager.policies.enableCompression ? 'Yes' : 'No'}`);
      console.log(`  Archiving: ${manager.policies.enableArchiving ? 'Yes' : 'No'}`);
      console.log(`  File Cleanup: ${manager.policies.enableCleanup ? 'Yes' : 'No'}`);
      console.log(`  Database Cleanup: ${manager.policies.enableDatabaseCleanup ? 'Yes' : 'No'}`);

      await manager.close();
    } catch (error) {
      console.error('Error loading file policies:', error.message);
    }
  }

  async showRateThresholds() {
    console.log('\nRate Filtering Thresholds');
    console.log('=' .repeat(45));

    console.log('\nRate filtering is now handled by the TypeScript JSONIngestionService.');
    console.log('Rate thresholds and filtering rules are configured in the main application.');
    console.log('All scraped rates are saved to JSON files, then filtered during ingestion.');
  }

  async showCleanupStats() {
    console.log('\nFile Cleanup Statistics');
    console.log('=' .repeat(42));
    
    try {
      console.log('File cleanup system has been removed.');
      return;
      
      await manager.initialize();
      
      // Show recent cleanup activity
      const recentActivity = await manager.db.all(`
        SELECT 
          DATE(created_at) as cleanup_date,
          platform,
          operation,
          COUNT(*) as file_count,
          SUM(space_saved_bytes) as total_space_saved
        FROM file_cleanup_log 
        WHERE created_at > datetime('now', '-30 days')
        GROUP BY DATE(created_at), platform, operation
        ORDER BY cleanup_date DESC, platform, operation
        LIMIT 20
      `);

      console.log(`\nRecent Activity (Last 30 Days):`);
      if (recentActivity.length === 0) {
        console.log('  No recent cleanup activity found');
      } else {
        console.log('  Date       Platform    Operation   Files  Space Saved');
        console.log('  ' + '-'.repeat(55));
        for (const activity of recentActivity) {
          const spaceMB = activity.total_space_saved ? (activity.total_space_saved / 1024 / 1024).toFixed(2) + ' MB' : '0 MB';
          console.log(`  ${activity.cleanup_date}  ${activity.platform.padEnd(10)}  ${activity.operation.padEnd(10)}  ${String(activity.file_count).padStart(5)}  ${spaceMB}`);
        }
      }

      await manager.close();
    } catch (error) {
      console.error('Error loading cleanup stats:', error.message);
    }
  }

  async runMaintenanceOnly() {
    console.log('Running Maintenance-Only Mode');
    console.log('=' .repeat(50));
    
    this.results.startTime = new Date().toISOString();
    
    console.log('File cleanup system removed - handled per architecture path');
    
    this.results.endTime = new Date().toISOString();
    
    console.log('\nMaintenance completed');
    console.log(`Duration: ${this.results.startTime} to ${this.results.endTime}`);
    
    if (this.results.cleanup.executed) {
      console.log(`Cleanup Results:`);
      console.log(`   Files processed: ${this.results.cleanup.processed}`);
      console.log(`   Files compressed: ${this.results.cleanup.compressed}`);
      console.log(`   Files archived: ${this.results.cleanup.archived}`);
      console.log(`   Files deleted: ${this.results.cleanup.deleted}`);
      console.log(`   Database records deleted: ${this.results.cleanup.databaseRecordsDeleted || 0}`);
      if (this.results.cleanup.spaceSaved > 0) {
        const spaceMB = (this.results.cleanup.spaceSaved / 1024 / 1024).toFixed(2);
        console.log(`   Space saved: ${spaceMB} MB`);
      }
    }
    
    return { success: true };
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const options = RatesScraper.parseArgs(args);
  
  const scraper = new RatesScraper(options);
  
  try {
    // Handle configuration display options
    if (options.showConfig) {
      await scraper.showConfig();
      process.exit(0);
    }
    
    if (options.showFilePolicy) {
      await scraper.showFilePolicy();
      process.exit(0);
    }
    
    if (options.showRateThresholds) {
      await scraper.showRateThresholds();
      process.exit(0);
    }
    
    if (options.showCleanupStats) {
      await scraper.showCleanupStats();
      process.exit(0);
    }
    
    // Handle maintenance-only mode
    if (options.cleanupOnly) {
      const results = await scraper.runMaintenanceOnly();
      process.exit(results.success ? 0 : 1);
    }
    
    // Normal scraping execution
    const results = await scraper.scrapeAll(options.platforms);
    
    scraper.printSummary();
    
    // Exit with appropriate code
    process.exit(results.success ? 0 : 1);
    
  } catch (error) {
    console.error('Critical orchestrator error:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { RatesScraper };
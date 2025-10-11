/**
 * Scraper Base - Abstract base class for all scrapers
 * Provides common functionality and lifecycle management
 * Updated with new four-tier pipeline for comprehensive deduplication plan
 */

import { BrowserManager } from './browser-manager.js';
import { FileUtils } from '../utils/file-utils.js';
import { DataNormalizer } from '../utils/data-normalizer.js';
import { EnhancedLogger } from './enhanced-logger.js';
import fs from 'fs';
import path from 'path';

export class ScraperBase {
  constructor(platform, options = {}) {
    this.platform = platform;
    this.options = options;
    this.outputDir = options.outputDir || `./data`;

    // Generate single timestamp for entire scraper run (used by all files: log, raw, normalized)
    this.runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Initialize shared utilities
    this.browserManager = new BrowserManager({
      headless: options.headless,
      timeout: options.timeout
    });
    
    this.fileUtils = new FileUtils(options.outputDir);

    // Initialize new pipeline components
    this.normalizer = new DataNormalizer();
    this.logger = new EnhancedLogger({
      logLevel: options.logLevel || 'info',
      enableFileLogging: options.enableFileLogging !== false,
      logDir: options.logDir || this.outputDir,
      componentName: platform.toLowerCase(), // Force lowercase for consistent file naming
      platformName: this.getPlatformDisplayName(),
      verboseMode: options.verbose || false,
      timestamp: this.runTimestamp // Pass shared timestamp for log file
    });
    // Deduplication now handled by TypeScript service
    // Legacy config manager and deduplicator removed
    
    // Configuration options
    this.saveToFiles = options.saveToFiles !== false; // Default to true
    
    // Results tracking
    this.results = {
      success: false,
      ratesFound: 0,
      processedProducts: 0,
      data: [],
      files: {},
      errors: []
    };
  }

  // Abstract methods that must be implemented by subclasses
  async extractRateData() {
    throw new Error('extractRateData() must be implemented by subclass');
  }

  getBaseUrl() {
    throw new Error('getBaseUrl() must be implemented by subclass');
  }

  // Get human-readable platform name for logging
  getPlatformDisplayName() {
    const displayNames = {
      'flagstone': 'Flagstone',
      'hl': 'Hargreaves Lansdown', 
      'hargreaves_lansdown': 'Hargreaves Lansdown',
      'ajbell': 'AJ Bell',
      'moneyfacts': 'MoneyFacts'
    };
    return displayNames[this.platform] || this.platform;
  }

  // Optional methods that can be overridden
  async customInitialization() {
    // Override in subclass for platform-specific initialization
  }

  async customNavigation() {
    // Override in subclass for platform-specific navigation
    return await this.browserManager.navigateToPage(this.getBaseUrl());
  }

  async customCleanup() {
    // Override in subclass for platform-specific cleanup
  }

  // Common lifecycle methods
  async initialize() {
    this.logger.logPlatformProgress('Initializing...');
    
    await this.browserManager.initialize();
    await this.customInitialization();
    
    return this.browserManager.getPage();
  }

  async navigateToPage() {
    const url = this.getBaseUrl();
    this.logger.logPlatformProgress(`Navigating to ${url}...`);
    return await this.customNavigation();
  }

  async cleanup() {
    await this.customCleanup();
    await this.browserManager.cleanup();
    this.logger.logPlatformDebug('Cleanup complete');
  }

  // Data processing pipeline
  async processData(rawData) {
    this.logger.logPlatformDebug(`Processing ${rawData.length} raw entries...`);
    
    // Remove duplicates - can be overridden by subclasses
    const uniqueData = this.removeDuplicates(rawData);
    this.logger.logPlatformDebug(`Removed ${rawData.length - uniqueData.length} duplicates`);
    
    return uniqueData;
  }

  // Default deduplication logic - can be overridden
  removeDuplicates(data) {
    const seen = new Set();
    return data.filter(item => {
      const key = `${item.bankName}-${item.aer}-${item.term}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // File operations
  async saveFiles(data, prefix = 'rates') {
    if (!this.saveToFiles) {
      this.logger.logPlatformDebug('File saving disabled, skipping...');
      return {};
    }

    this.logger.logPlatformDebug('Saving data to files...');
    
    const files = await this.fileUtils.savePlatformData(
      data, 
      this.platform, 
      prefix,
      this.options.outputDir
    );
    
    return files;
  }

  // Database operations removed - now handled by JSONIngestionService

  // Error handling
  handleError(error, context = 'scraping') {
    const errorMsg = `${this.platform} ${context} failed: ${error.message}`;
    console.error(errorMsg);
    
    this.results.errors.push({
      context,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: false,
      error: error.message,
      platform: this.platform
    };
  }

  // Main scraping orchestration
  async scrape() {
    try {
      // Initialize
      await this.initialize();
      
      // Navigate to page
      await this.navigateToPage();
      
      // Extract data (implemented by subclass)
      const extractResult = await this.extractRateData();
      
      // Check if extractRateData returned pipeline results or raw data
      if (extractResult && typeof extractResult === 'object' && extractResult.success !== undefined) {
        // New pipeline results from updated scrapers
        this.results = {
          success: true,
          ratesFound: extractResult.rawProducts || 0,
          processedProducts: extractResult.databaseProducts || 0,
          data: extractResult.data || [],
          files: extractResult.files || {},
          platform: this.platform,
          timestamp: new Date().toISOString(),
          errors: this.results.errors,
          pipelineResults: extractResult
        };
      } else {
        // Legacy raw data from scrapers not yet updated
        const rawData = extractResult;
        
        // Process data
        const processedData = await this.processData(rawData);
        
        // Save to files
        const files = await this.saveFiles(processedData);

        // Database operations now handled by JSONIngestionService

        // Build results
        this.results = {
          success: true,
          ratesFound: Array.isArray(processedData) ? processedData.length : 0,
          processedProducts: 0, // Database operations now handled by JSONIngestionService
          data: processedData,
          files: files,
          platform: this.platform,
          timestamp: new Date().toISOString(),
          errors: this.results.errors
        };
      }
      
      this.logger.logPlatformProgress(`Extraction complete: ${this.results.ratesFound} products found`);
      this.logger.logPlatformDebug(`Processed ${this.results.processedProducts} products for database`);
      
      return this.results;
      
    } catch (error) {
      return this.handleError(error, 'scraping');
    } finally {
      await this.cleanup();
    }
  }

  // Utility methods for subclasses
  getPage() {
    return this.browserManager.getPage();
  }

  getBrowser() {
    return this.browserManager.getBrowser();
  }

  async waitForContent(selector, timeout = null) {
    return await this.browserManager.waitForContent(selector, timeout);
  }

  async scrollToLoad(delay = 3000) {
    return await this.browserManager.scrollToLoad(delay);
  }

  enableConsoleLogging(filter = null) {
    return this.browserManager.enableConsoleLogging(filter);
  }

  // New pipeline methods for four-tier output system
  
  /**
   * Save raw JSON data (Tier 1 - Complete audit trail)
   * Updated for metadata header format
   */
  async saveRawJSON(rawData) {
    if (!this.saveToFiles) return null;

    // Use shared timestamp and lowercase platform name for consistent file naming
    const filename = `${this.platform.toLowerCase()}-raw-${this.runTimestamp}.json`;
    const filepath = path.join(this.outputDir, filename);
    
    try {
      // Ensure output directory exists
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
      
      // Wrap data in new metadata format
      const scraperInfo = this.getScraperIdentifier();
      const outputData = {
        metadata: {
          source: scraperInfo.source,
          method: scraperInfo.method
        },
        products: rawData
      };
      
      await fs.promises.writeFile(filepath, JSON.stringify(outputData, null, 2));
      this.logger.info(`Raw JSON saved: ${filename} (${rawData.length} records)`);
      
      return filepath;
    } catch (error) {
      this.logger.error(`Failed to save raw JSON: ${error.message}`);
      return null;
    }
  }

  /**
   * Save normalized JSON data (Tier 2 - Consistent schema)
   * Updated for metadata header format
   */
  async saveNormalizedJSON(normalizedData) {
    if (!this.saveToFiles) return null;

    // Use shared timestamp and lowercase platform name for consistent file naming
    const filename = `${this.platform.toLowerCase()}-normalized-${this.runTimestamp}.json`;
    const filepath = path.join(this.outputDir, filename);
    
    try {
      // Ensure output directory exists
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
      
      // Wrap data in new metadata format
      const scraperInfo = this.getScraperIdentifier();
      const outputData = {
        metadata: {
          source: scraperInfo.source,
          method: scraperInfo.method
        },
        products: normalizedData
      };
      
      await fs.promises.writeFile(filepath, JSON.stringify(outputData, null, 2));
      this.logger.info(`Normalized JSON saved: ${filename} (${normalizedData.length} records)`);
      
      return filepath;
    } catch (error) {
      this.logger.error(`Failed to save normalized JSON: ${error.message}`);
      return null;
    }
  }

  /**
   * Get scraper identifier for metadata header
   * Override in subclasses for variant-specific identifiers
   * @returns {Object} - { source: string, method: string }
   */
  getScraperIdentifier() {
    // Default implementation - subclasses should override for specific source/method combinations
    return {
      source: this.platform.toLowerCase(),
      method: `${this.platform.toLowerCase()}-scraper`
    };
  }

  /**
   * Main new pipeline processing method (replaces old processData)
   * Implements four-tier output: Raw → Normalized → Deduplication → Database
   */
  async processWithNewPipeline(rawData) {
    const startTime = Date.now();
    
    this.logger.logScraperStart(this.platform, {
      rawProductCount: rawData.length,
      outputDir: this.outputDir,
      saveToFiles: this.saveToFiles
    });
    
    this.logger.progress(`Processing ${rawData.length} raw products through new pipeline...`);
    
    try {
      // Phase 1: Save raw data (complete audit trail)
      const rawFile = await this.saveRawJSON(rawData);
      
      // Phase 2: Normalize data
      const normalizedData = await this.normalizer.normalize(rawData, this.platform);
      const normalizedFile = await this.saveNormalizedJSON(normalizedData);
      
      // Phase 3: Deduplication handled by TypeScript service
      // Simple pass-through since deduplication happens in TypeScript
      const deduplicationResult = {
        uniqueData: normalizedData,
        removedData: [],
        summary: { note: 'Deduplication handled by TypeScript service' }
      };
      
      // Phase 4: Database operations handled by JSONIngestionService
      let dbResult = { success: true, insertedCount: 0, upsertedCount: 0 };
      
      const duration = Date.now() - startTime;
      const results = {
        success: true,
        rawProducts: rawData.length,
        normalizedProducts: normalizedData.length,
        uniqueProducts: deduplicationResult.uniqueData.length,
        databaseProducts: dbResult.upsertedCount,
        duplicatesRemoved: deduplicationResult.removedData.length,
        files: {
          raw: rawFile,
          normalized: normalizedFile,
          logFile: this.logger.getLogFilePath()
        },
        deduplicationSummary: deduplicationResult.summary
      };
      
      this.logger.logScraperComplete(this.platform, duration, results);
      
      return results;
      
    } catch (error) {
      this.logger.logScraperError(this.platform, error, {
        rawDataCount: rawData.length,
        outputDir: this.outputDir
      });
      throw error;
    }
  }
}
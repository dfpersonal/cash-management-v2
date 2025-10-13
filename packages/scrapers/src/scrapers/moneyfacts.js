/**
 * MoneyFacts Scraper - Production scraper with pagination and extraction
 * Based on investigation findings: uses li.savings-table-item containers and strong elements for rates
 */

import { ScraperBase } from '../core/scraper-base.js';
import { parseBankAndPlatform, validatePlatformParsing } from '../parsers/common-parser.js';
import { DataNormalizer } from '../utils/data-normalizer.js';
import { PlatformLookup } from '../utils/platform-lookup.js';
import fs from 'fs/promises';
import path from 'path';

class MoneyFactsScraper extends ScraperBase {
  constructor(options = {}) {
    // Create component name that includes account type for better log file naming
    let componentName = 'moneyfacts';
    if (options.accountTypes && options.accountTypes.length === 1) {
      // Convert hyphen to underscore for consistent naming (e.g., 'easy-access' → 'easy_access')
      componentName = `moneyfacts-${options.accountTypes[0].replace('-', '_')}`;
    }
    
    super(componentName, {
      outputDir: './data/moneyfacts',
      timeout: 60000, // Increased timeout for pagination
      ...options
    });
    
    // Define all available account types
    this.allAccountTypes = {
      'fixed-term': {
        url: 'https://moneyfactscompare.co.uk/savings-accounts/fixed-rate-bonds/',
        accountType: 'fixed_term',
        name: 'Fixed Rate Bonds'
      },
      'notice': {
        url: 'https://moneyfactscompare.co.uk/savings-accounts/best-notice-accounts/',
        accountType: 'notice',
        name: 'Notice Accounts'
      },
      'easy-access': {
        url: 'https://moneyfactscompare.co.uk/savings-accounts/easy-access-savings-accounts/',
        accountType: 'easy_access',
        name: 'Easy Access'
      }
    };
    
    // Determine which account types to process
    this.urls = this.getAccountTypesToProcess(options);
    
    // Store account type for metadata generation
    this.currentAccountType = options.accountTypes && options.accountTypes.length === 1 
      ? options.accountTypes[0].replace('-', '_') // Convert 'easy-access' to 'easy_access' for identifier
      : null;
    
    // Pagination control - allows limiting clicks for testing
    this.maxPaginationClicks = options.maxPaginationClicks || 100;

    this.knownPlatforms = null;
    this.platformLookup = new PlatformLookup(options.jsonPath);
  }

  getAccountTypesToProcess(options) {
    const allTypes = Object.keys(this.allAccountTypes);
    let targetTypes = allTypes; // Default to all types
    
    this.logger.debug(`Debug - options.accountTypes: ${options.accountTypes}`);
    this.logger.debug(`Debug - options.excludeTypes: ${options.excludeTypes}`);
    this.logger.debug(`Debug - allTypes: ${allTypes.join(', ')}`);
    
    // Apply include filter if specified
    if (options.accountTypes && Array.isArray(options.accountTypes)) {
      targetTypes = options.accountTypes.filter(type => allTypes.includes(type));
      this.logger.debug(`Debug - after include filter: ${targetTypes.join(', ')}`);
      if (targetTypes.length === 0) {
        this.logger.warning('No valid account types specified, using all types');
        targetTypes = allTypes;
      }
    }
    
    // Apply exclude filter if specified
    if (options.excludeTypes && Array.isArray(options.excludeTypes)) {
      targetTypes = targetTypes.filter(type => !options.excludeTypes.includes(type));
      this.logger.debug(`Debug - after exclude filter: ${targetTypes.join(', ')}`);
      if (targetTypes.length === 0) {
        this.logger.warning('All account types excluded, using all types');
        targetTypes = allTypes;
      }
    }
    
    this.logger.info(`MoneyFacts will process: ${targetTypes.join(', ')}`);
    
    // Convert to URL objects
    return targetTypes.map(type => this.allAccountTypes[type]);
  }

  getBaseUrl() {
    return 'https://moneyfactscompare.co.uk';
  }

  /**
   * Override scraper identifier for variant-specific metadata
   * @returns {Object} - { source: string, method: string }
   */
  getScraperIdentifier() {
    if (this.currentAccountType) {
      return {
        source: 'moneyfacts',
        method: `moneyfacts-${this.currentAccountType}`
      };
    }
    // Fallback for multi-type processing
    return {
      source: 'moneyfacts',
      method: 'moneyfacts-scraper'
    };
  }

  // Override base scrape() method to prevent duplicate database saves
  // MoneyFacts uses modular processing with immediate database writes
  async scrape() {
    try {
      // Initialize browser and database connections
      await this.initialize();
      
      // Navigate to base page for MoneyFacts
      await this.navigateToPage();
      
      // Custom initialization to load known platforms
      await this.customInitialization();
      
      // Extract data using modular processing (pipeline files generated per account type)
      const extractionResults = await this.extractRateData();

      // Pipeline files already generated per account type for better resilience
      // No additional file generation needed here

      // Build results from modular processing only (no double processing)
      this.results = {
        success: true,
        ratesFound: extractionResults.totalRaw || 0,
        processedProducts: extractionResults.totalSaved || 0,
        data: extractionResults.allProducts || [], // Keep raw data for legacy compatibility
        files: extractionResults.files || {},
        platform: this.platform,
        timestamp: new Date().toISOString(),
        duration: Date.now() - this.startTime,
        modularProcessingNote: 'Pipeline files generated per account type for better resilience'
      };
      
      this.logger.info(`MoneyFacts: ${this.results.ratesFound} products extracted, 0 failed`);
      this.logger.debug(`Pipeline: ${this.results.ratesFound} raw → ${this.results.processedProducts} final products`);
      
      return this.results;
      
    } catch (error) {
      this.logger.error(`MoneyFacts: Scraping failed - ${error.message}`);
      return this.handleError(error);
    } finally {
      await this.cleanup();
    }
  }

  // Fast-forward pagination to resume from a specific point
  async fastForwardPagination(page, targetClicks) {
    let currentClick = 0;
    const fastClickDelay = 1000; // Faster clicking for recovery
    
    while (currentClick < targetClicks) {
      try {
        const beforeCount = await page.evaluate(() => 
          document.querySelectorAll('li.savings-table-item').length
        );
        
        const buttonClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, a, [onclick], [role="button"]'));
          const showMoreBtn = buttons.find(btn => {
            const text = (btn.textContent || '').toLowerCase();
            return text.includes('show') && (text.includes('more') || text.includes('load')) && 
                   btn.offsetParent !== null && !btn.disabled;
          });
          
          if (showMoreBtn) {
            showMoreBtn.click();
            return true;
          }
          return false;
        });
        
        if (!buttonClicked) {
          this.logger.debug(`Fast-forward stopped at click ${currentClick} - no more buttons`);
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, fastClickDelay));
        currentClick++;
        
        if (currentClick % 5 === 0) {
          this.logger.progress(`Fast-forward progress: ${currentClick}/${targetClicks} clicks`);
        }
        
      } catch (error) {
        this.logger.warning(`Fast-forward error at click ${currentClick}: ${error.message}`);
        break;
      }
    }
    
    this.logger.debug(`Fast-forward completed: ${currentClick}/${targetClicks} clicks`);
  }

  // Chunked extraction strategy for maximum robustness
  async performChunkedExtraction(pageConfig) {
    this.logger.progress(`MoneyFacts-${pageConfig.accountType}: Starting extraction...`);
    
    const chunkSize = 50; // Extract in chunks of 50 products
    const allProducts = [];
    let totalExtracted = 0;
    
    // Start fresh
    const page = this.getPage();
    await page.goto(pageConfig.url, { waitUntil: 'domcontentloaded', timeout: this.options.timeout });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    let chunkNumber = 1;
    let consecutiveEmptyChunks = 0;
    const maxEmptyChunks = 3;
    
    while (consecutiveEmptyChunks < maxEmptyChunks) {
      try {
        // Load products for this chunk
        for (let i = 0; i < chunkSize / 10; i++) { // Load 10 at a time
          const beforeCount = await page.evaluate(() => 
            document.querySelectorAll('li.savings-table-item').length
          );
          
          const buttonClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a, [onclick], [role="button"]'));
            const showMoreBtn = buttons.find(btn => {
              const text = (btn.textContent || '').toLowerCase();
              return text.includes('show') && (text.includes('more') || text.includes('load')) && 
                     btn.offsetParent !== null && !btn.disabled;
            });
            
            if (showMoreBtn) {
              showMoreBtn.click();
              return true;
            }
            return false;
          });
          
          if (!buttonClicked) {
            break; // No more content to load
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Extract current chunk
        const chunkProducts = await this.extractProductsFromCurrentPage(page, pageConfig);
        
        if (chunkProducts.length === 0) {
          consecutiveEmptyChunks++;
          this.logger.debug(`Chunk ${chunkNumber} extracted 0 products (${consecutiveEmptyChunks}/${maxEmptyChunks})`);
        } else {
          consecutiveEmptyChunks = 0;
          allProducts.push(...chunkProducts);
          totalExtracted = allProducts.length;
          this.logger.progress(`MoneyFacts-${pageConfig.accountType}: ${totalExtracted} products extracted`);
        }
        
        chunkNumber++;
        
      } catch (chunkError) {
        this.logger.error(`Chunk ${chunkNumber} failed: ${chunkError.message}`);
        consecutiveEmptyChunks++;
      }
    }
    
    this.logger.info(`Chunked extraction complete: ${totalExtracted} products extracted`);
    return allProducts;
  }

  // Extract products from the current page state
  async extractProductsFromCurrentPage(page, pageConfig) {
    const platformVariants = this.knownPlatforms.map(p => p.platform_variant);
    
    return await page.evaluate((platformVariants, accountType) => {
      const containers = document.querySelectorAll('li.savings-table-item');
      const products = [];
      
      containers.forEach(container => {
        try {
          // Extract rate data
          const strongElements = container.querySelectorAll('strong');
          let aer = null;
          let gross = null;
          
          strongElements.forEach(strong => {
            const text = strong.textContent.trim();
            if (text.includes('%')) {
              if (strong.previousSibling?.textContent?.toLowerCase().includes('aer') ||
                  container.textContent.toLowerCase().includes('aer')) {
                aer = text;
              } else {
                gross = text;
              }
            }
          });
          
          // Extract bank name
          const bankElement = container.querySelector('h3, h4, .bank-name, [class*="name"]') ||
                            container.querySelector('strong:not([class*="rate"])');
          let bankName = bankElement ? bankElement.textContent.trim() : 'Unknown Bank';
          
          // Extract other details
          const detailsText = container.textContent.toLowerCase();
          let minDeposit = null;
          let maxDeposit = null;
          let termMonths = null;
          
          // Extract deposit amounts
          const depositMatch = container.textContent.match(/£[\d,]+/g);
          if (depositMatch && depositMatch.length >= 1) {
            minDeposit = depositMatch[0];
            if (depositMatch.length >= 2) {
              maxDeposit = depositMatch[1];
            }
          }
          
          if (aer || gross) {
            products.push({
              bankName,
              accountType,
              aer,
              gross,
              minDeposit,
              maxDeposit,
              termMonths,
              scrapedAt: new Date().toISOString(),
              source: 'moneyfacts'
            });
          }
        } catch (error) {
          console.warn('Product extraction error:', error);
        }
      });
      
      return products;
    }, platformVariants, pageConfig.accountType);
  }

  async customInitialization() {
    // Load known platforms from JSON file for platform parsing
    this.knownPlatforms = await this.platformLookup.getKnownPlatforms();
    this.logger.debug(`Loaded ${this.knownPlatforms.length} known platforms for parsing`);
  }

  /**
   * Generate pipeline files for a specific account type
   * Provides resilience - if one account type fails, others still process
   */
  async generatePipelineFilesForAccountType(rawData, accountType) {
    try {
      this.logger.debug(`Generating pipeline files for ${accountType}...`);

      // Use shared timestamp for consistent file naming
      const timestamp = this.runTimestamp;

      // Create raw JSON file for this account type with metadata wrapper (lowercase platform name)
      const rawFilename = `moneyfacts-${accountType}-raw-${timestamp}.json`;
      const rawFilepath = path.join(this.outputDir, rawFilename);

      // Wrap raw data in metadata format
      const rawOutputData = {
        metadata: this.getScraperIdentifier(),
        products: rawData
      };

      await fs.writeFile(rawFilepath, JSON.stringify(rawOutputData, null, 2));
      this.logger.info(`Raw JSON saved: ${rawFilename} (${rawData.length} records)`);

      // Create normalized JSON file using DataNormalizer
      const normalizer = new DataNormalizer();
      const normalizedData = await normalizer.normalize(rawData, 'moneyfacts');

      // Use lowercase platform name for consistent file naming
      const normalizedFilename = `moneyfacts-${accountType}-normalized-${timestamp}.json`;
      const normalizedFilepath = path.join(this.outputDir, normalizedFilename);

      // Wrap normalized data in metadata format
      const normalizedOutputData = {
        metadata: this.getScraperIdentifier(),
        products: normalizedData
      };

      await fs.writeFile(normalizedFilepath, JSON.stringify(normalizedOutputData, null, 2));
      this.logger.info(`Normalized JSON saved: ${normalizedFilename} (${normalizedData.length} records)`);

      this.logger.debug(`Pipeline files generated successfully for ${accountType}`);

    } catch (error) {
      this.logger.error(`Failed to generate pipeline files for ${accountType}: ${error.message}`);
      // Don't throw - this shouldn't break the main scraping logic for other account types
    }
  }

  /**
   * DEPRECATED: Legacy combined pipeline file generation
   * Now using per-account-type generation for better resilience
   */
  async generatePipelineFiles(rawData) {
    this.logger.debug('Legacy combined pipeline generation - data already processed per account type');
    // No-op - files already generated per account type
  }

  async extractRateData() {
    // Extract all products from all account types
    const allProducts = [];

    for (let i = 0; i < this.urls.length; i++) {
      const pageConfig = this.urls[i];
      this.logger.logPlatformProgress(`Processing ${pageConfig.name}...`);

      try {
        const products = await this.extractPageData(pageConfig);

        if (products.length > 0) {
          // Generate pipeline files immediately for this account type
          await this.generatePipelineFilesForAccountType(products, pageConfig.accountType);

          // Add to overall results for legacy compatibility
          allProducts.push(...products);
          this.logger.debug(`${pageConfig.name}: ${products.length} products extracted and pipeline files generated`);
        } else {
          this.logger.warning(`${pageConfig.name}: No products extracted`);
        }

        // Longer delay and browser refresh between sections to avoid rate limiting
        if (i < this.urls.length - 1) { // Not the last section
          this.logger.progress('Refreshing browser between sections...');
          await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
          const page = this.getPage();
          await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
          this.logger.debug('Browser refreshed for next section');
        }
      } catch (error) {
        this.logger.error(`Failed to extract from ${pageConfig.name}: ${error.message}`);

        // For detached frame errors, try to refresh the page context
        if (error.message.includes('detached Frame')) {
          this.logger.debug('Attempting to recover from detached frame...');
          try {
            await this.browserManager.refreshPage();
            this.logger.debug('Page context recovered for next extraction');
          } catch (recoveryError) {
            this.logger.error(`Failed to recover page context: ${recoveryError.message}`);
          }
        }
      }
    }
    
    // NO EARLY DEDUPLICATION - return all raw products for pipeline processing
    // Count unknown banks for quality reporting
    const unknownBanks = allProducts.filter(product => product.bankName === 'Unknown Bank' || !product.bankName || product.bankName.trim() === '').length;
    
    this.logger.debug(`MoneyFacts extraction complete: ${allProducts.length} raw products extracted`);
    this.logger.debug(`Unknown banks: ${unknownBanks}/${allProducts.length} (${((unknownBanks/allProducts.length)*100).toFixed(1)}% extraction failure rate)`);

    return {
      allProducts: allProducts,
      totalRaw: allProducts.length,
      totalSaved: 0, // Database operations now handled by TypeScript service
      files: {} // File saving handled by pipeline generation
    };
  }

  async extractPageData(pageConfig) {
    // Get a fresh page context to avoid detached frame issues
    let page;
    try {
      // Try to get existing page first
      page = this.getPage();
      
      // Test if page is still attached by checking if we can evaluate
      await page.evaluate(() => document.readyState);
    } catch (error) {
      this.logger.warning('Page context detached, creating new page...');
      // If page is detached, create a new one
      await this.browserManager.refreshPage();
      page = this.getPage();
    }
    
    try {
      this.logger.info(`Navigating to ${pageConfig.url}...`);
      await page.goto(pageConfig.url, { waitUntil: 'networkidle0', timeout: this.options.timeout });
      
      // Wait for initial products to load
      this.logger.progress('Waiting for initial products to load...');
      try {
        await page.waitForSelector('li.savings-table-item', { timeout: 15000 });
      } catch (error) {
        this.logger.debug('savings-table-item not found, trying alternatives...');
        // Try alternative selectors
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // Wait additional time for rates to load (they may be loaded dynamically)
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Handle pagination - click "Show More" until all products are loaded
      this.logger.progress(`Loading products via pagination (max ${this.maxPaginationClicks} clicks)...`);
      let totalClicks = 0;
      let consecutiveFailures = 0;
      const maxFailures = 3; // Stop after 3 consecutive failures
      
      while (totalClicks < this.maxPaginationClicks && consecutiveFailures < maxFailures) {
        try {
          // Get container count before clicking
          const beforeCount = await page.evaluate(() => 
            document.querySelectorAll('li.savings-table-item').length
          );
          
          // Use dynamic button detection as recommended by investigation
          const buttonClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a, [onclick], [role="button"]'));
            const showMoreBtn = buttons.find(btn => {
              const text = (btn.textContent || '').toLowerCase();
              return text.includes('show') && (text.includes('more') || text.includes('load')) && 
                     btn.offsetParent !== null && !btn.disabled;
            });
            
            if (showMoreBtn) {
              showMoreBtn.click();
              return true;
            }
            return false;
          });
          
          if (!buttonClicked) {
            this.logger.debug('No more clickable "Show More" buttons - pagination complete');
            break;
          }
          
          totalClicks++;
          
          // Wait for AJAX response or content load with improved strategy
          await Promise.race([
            page.waitForResponse(response => 
              response.url().includes('ajax') || response.url().includes('load'), 
              { timeout: 8000 }
            ).catch(() => null),
            new Promise(resolve => setTimeout(resolve, 4000))
          ]);
          
          // Check if container count increased
          const afterCount = await page.evaluate(() => 
            document.querySelectorAll('li.savings-table-item').length
          );
          
          if (afterCount > beforeCount) {
            this.logger.debug(`Click ${totalClicks}: ${beforeCount} → ${afterCount} containers (+${afterCount - beforeCount})`);
            consecutiveFailures = 0; // Reset failure counter
          } else {
            consecutiveFailures++;
            this.logger.debug(`Click ${totalClicks}: No new containers loaded (${consecutiveFailures}/${maxFailures} failures)`);
            
            // Wait longer and recheck - sometimes content loads slowly
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const recheckCount = await page.evaluate(() => 
              document.querySelectorAll('li.savings-table-item').length
            );
            
            if (recheckCount > beforeCount) {
              this.logger.progress(`Delayed success: ${beforeCount} → ${recheckCount} containers`);
              consecutiveFailures = 0; // Reset failure counter
            }
          }
          
          if (totalClicks % 10 === 0) {
            this.logger.progress(`MoneyFacts-${pageConfig.accountType}: ${afterCount} products extracted`);
          }
          
        } catch (error) {
          this.logger.error(`Pagination error on click ${totalClicks + 1}: ${error.message}`);
          
          // Handle detached frame errors with smart recovery
          if (error.message.includes('detached Frame')) {
            this.logger.warning('Frame detached during pagination, attempting recovery...');
            
            // Extract current products before losing them
            const currentProducts = await this.extractProductsFromCurrentPage(page, pageConfig).catch(() => []);
            this.logger.debug(`Saved ${currentProducts.length} products before recovery`);
            
            try {
              // Use enhanced browser refresh that preserves context better
              await this.browserManager.refreshPage();
              page = this.getPage();
              
              // Re-navigate and try to resume pagination from a reasonable point
              this.logger.debug(`Re-navigating to ${pageConfig.url} for recovery...`);
              await page.goto(pageConfig.url, { waitUntil: 'domcontentloaded', timeout: this.options.timeout });
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Try to fast-forward pagination to get closer to where we were
              const targetClicks = Math.max(0, totalClicks - 10); // Go back 10 clicks for safety
              if (targetClicks > 0) {
                this.logger.info(`Fast-forwarding ${targetClicks} pagination clicks to resume...`);
                await this.fastForwardPagination(page, targetClicks);
              }
              
              this.logger.debug('Frame detachment recovery successful, continuing...');
              consecutiveFailures = 0; // Reset since we recovered
              continue; // Continue pagination from recovered state
              
            } catch (recoveryError) {
              this.logger.error(`Frame recovery failed: ${recoveryError.message}`);
              this.logger.warning('Attempting fallback: chunked extraction strategy...');
              
              // Fallback: restart with chunked extraction approach
              try {
                return await this.performChunkedExtraction(pageConfig);
              } catch (fallbackError) {
                this.logger.error(`All recovery attempts failed: ${fallbackError.message}`);
                throw new Error(`MoneyFacts pagination failed after multiple recovery attempts: ${error.message}`);
              }
            }
          }
          
          consecutiveFailures++;
          if (consecutiveFailures >= maxFailures) {
            this.logger.warning('Too many consecutive failures, stopping pagination');
            break;
          }
        }
      }
      
      this.logger.info(`Pagination completed after ${totalClicks} clicks`);
      
      // Extract products using corrected logic with error handling
      // Sort platform variants by length (longest first) to avoid partial matches
      // Example: Check "Raisin UK" (9 chars) before "Raisin" (5 chars)
      const platformVariants = this.knownPlatforms
        .map(p => p.platform_variant)
        .sort((a, b) => b.length - a.length);
      let products = [];
      
      try {
        products = await page.evaluate((accountType, pageName, platformVariants) => {
        const products = [];
        
        // Debug: try different selectors
        let productContainers = document.querySelectorAll('li.savings-table-item');
        console.log(`MoneyFacts: Found ${productContainers.length} li.savings-table-item containers`);
        
        if (productContainers.length === 0) {
          productContainers = document.querySelectorAll('li[class*="table-item"]');
          console.log(`MoneyFacts: Found ${productContainers.length} li[class*="table-item"] containers`);
        }
        
        if (productContainers.length === 0) {
          productContainers = document.querySelectorAll('.savings-table-item');
          console.log(`MoneyFacts: Found ${productContainers.length} .savings-table-item containers`);
        }
        
        if (productContainers.length === 0) {
          console.log(`MoneyFacts: No containers found, trying div selectors...`);
          productContainers = document.querySelectorAll('div[class*="product"]');
          console.log(`MoneyFacts: Found ${productContainers.length} div[class*="product"] containers`);
        }
        
        for (let i = 0; i < productContainers.length; i++) {
          const container = productContainers[i];
          
          try {
            // Extract full bank name including platform - enhanced for platform detection
            let bankName = '';
            
            // Enhanced Method: Extract from raw text using multi-line patterns
            const rawText = container.textContent || '';
            const lines = rawText.split('\n').map(line => line.trim()).filter(line => line);
            
            // Look for bank name and platform on separate lines (most common pattern)
            for (let lineIndex = 0; lineIndex < lines.length - 1; lineIndex++) {
              const currentLine = lines[lineIndex];
              const nextLine = lines[lineIndex + 1];
              
              // Check if current line looks like a bank name
              if (currentLine.length > 5 && currentLine.length < 80 && 
                  /^[A-Z][a-zA-Z\s&().-]+$/.test(currentLine) &&
                  !currentLine.includes('Following initial registration') && 
                  !currentLine.includes('Star Rating') && 
                  !currentLine.includes('View Further Details') &&
                  !currentLine.includes('Go To Provider') &&
                  !currentLine.includes('AER') &&
                  !currentLine.includes('Account Type')) {
                
                // Check if next line contains platform info (dynamic platform list)
                const platformPattern = new RegExp(`^(${platformVariants.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*[-–—]`, 'i');
                const platformMatch = nextLine.match(platformPattern);
                if (platformMatch) {
                  bankName = `${currentLine} ${platformMatch[1]}`;
                  break;
                }
                
                // Check if next line is exactly a platform name (dynamic platform list)
                const exactPlatformPattern = new RegExp(`^(${platformVariants.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*$`, 'i');
                if (exactPlatformPattern.test(nextLine)) {
                  bankName = `${currentLine} ${nextLine}`;
                  break;
                }
                
                // Remember the bank name for fallback
                if (!bankName) {
                  bankName = currentLine;
                }
              }
            }
            
            // Single line patterns (using dynamic platform list)
            if (!bankName) {
              for (const line of lines) {
                // Pattern: "Bank Name Platform - Description" (dynamic platform list)
                const singleLinePlatformPattern = new RegExp(`^(.+?)\\s+(${platformVariants.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*[-–—]`, 'i');
                const singleLineMatch = line.match(singleLinePlatformPattern);
                if (singleLineMatch) {
                  bankName = `${singleLineMatch[1].trim()} ${singleLineMatch[2].trim()}`;
                  break;
                }
                
                // Pattern: Just "Bank Name Platform" on single line (dynamic platform list)
                const directPlatformPattern = new RegExp(`^(.+?)\\s+(${platformVariants.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*$`, 'i');
                const directMatch = line.match(directPlatformPattern);
                if (directMatch && line.length < 100) {
                  bankName = `${directMatch[1].trim()} ${directMatch[2].trim()}`;
                  break;
                }
              }
            }
            
            // Original fallback methods if enhanced extraction fails
            if (!bankName) {
              // Method 1: Look for title text that includes bank + platform info
              const titleElements = container.querySelectorAll('h3, h4, .product-title, [class*="title"]');
              
              for (const titleEl of titleElements) {
                const titleText = titleEl.textContent?.trim();
                if (titleText && titleText.length > 5 && titleText.length < 100) {
                  // Check if it looks like a bank name with potential platform
                  const platformPatterns = [
                    /(.*?)\s+(Flagstone|Raisin UK|Raisin)\s*[-–—]\s*/i,
                    /(.*?)\s+(HL Active Savings)\s*[-–—]\s*/i
                  ];
                  
                  let foundMatch = false;
                  for (const pattern of platformPatterns) {
                    const match = titleText.match(pattern);
                    if (match) {
                      bankName = `${match[1].trim()} ${match[2].trim()}`;
                      foundMatch = true;
                      break;
                    }
                  }
                  
                  // If no platform found, use the title as is (if it looks like a bank name)
                  if (!foundMatch && /^[A-Z][a-zA-Z\s&()-]+$/.test(titleText)) {
                    bankName = titleText;
                    break;
                  }
                }
              }
              
              // Method 2: Look in table-item-overview div for clean text lines
              if (!bankName) {
                const overviewDiv = container.querySelector('div.table-item-overview');
                if (overviewDiv) {
                  const overviewLines = overviewDiv.textContent.split('\\n').map(line => line.trim()).filter(line => line && line.length < 100);
                  
                  if (overviewLines.length >= 1) {
                    bankName = overviewLines[0]; // Just use the first clean line
                  }
                }
              }
              
              // Method 3: Final fallback to original extraction
              if (!bankName) {
                const productDiv = container.querySelector('div[class*="product"]');
                if (productDiv) {
                  const strongElements = productDiv.querySelectorAll('strong, b');
                  if (strongElements.length > 0) {
                    bankName = strongElements[0].textContent?.trim();
                  } else {
                    const link = productDiv.querySelector('a');
                    if (link) {
                      bankName = link.textContent?.trim();
                    } else {
                      const fallbackLines = productDiv.textContent.split('\\n').map(line => line.trim()).filter(line => line);
                      if (fallbackLines.length > 0) {
                        bankName = fallbackLines[0];
                      }
                    }
                  }
                }
              }
            }
            
            if (!bankName || bankName.length < 3) {
              continue;
            }
            
            // Skip UI elements
            const uiElements = [
              "Go To Provider's Site", 'Account Type', 'Interest Paid', 'Opening Account',
              'Managing Account', 'Variable', 'None', 'Advertisement', 'Online', 'Telephone',
              'Monthly', 'Anniversary', 'Moneyfacts 5-star'
            ];
            
            if (uiElements.includes(bankName) || /^\d+\.\d+%$/.test(bankName)) {
              continue;
            }
            
            // Find AER rate - enhanced approaches based on investigation
            let aer = '';
            
            // Method 1: Look in [data-product] elements (found 44 of these in investigation)
            const dataProductElements = container.querySelectorAll('[data-product]');
            for (const dataEl of dataProductElements) {
              const text = dataEl.textContent?.trim();
              if (text && text.includes('%')) {
                const rateMatch = text.match(/(\d+\.\d+)%/);
                if (rateMatch) {
                  const rateValue = parseFloat(rateMatch[1]);
                  if (rateValue > 0 && rateValue < 20) {
                    aer = rateValue + '%';
                    break;
                  }
                }
              }
            }
            
            // Method 2: Look in strong elements
            if (!aer) {
              const allStrong = container.querySelectorAll('strong');
              for (const strongEl of allStrong) {
                const strongText = strongEl.textContent?.trim();
                if (strongText && strongText.includes('%')) {
                  const rateMatch = strongText.match(/(\d+\.\d+)%/);
                  if (rateMatch) {
                    const rateValue = parseFloat(rateMatch[1]);
                    if (rateValue > 0 && rateValue < 20) {
                      aer = rateValue + '%';
                      break;
                    }
                  }
                }
              }
            }
            
            // Method 3: Look for class attributes containing 'rate'
            if (!aer) {
              const rateElements = container.querySelectorAll('[class*="rate"], [class*="aer"], [class*="interest"], .cell');
              for (const el of rateElements) {
                const text = el.textContent?.trim();
                if (text && text.includes('%')) {
                  const rateMatch = text.match(/(\d+\.\d+)%/);
                  if (rateMatch) {
                    const rateValue = parseFloat(rateMatch[1]);
                    if (rateValue > 0 && rateValue < 20) {
                      aer = rateValue + '%';
                      break;
                    }
                  }
                }
              }
            }
            
            // Method 4: Look in span elements and other common elements
            if (!aer) {
              const allElements = container.querySelectorAll('span, div, td, th');
              for (const el of allElements) {
                const text = el.textContent?.trim();
                // More flexible pattern - not just exact matches
                if (text && text.includes('%')) {
                  const rateMatch = text.match(/(\d+\.\d+)%/);
                  if (rateMatch) {
                    const rateValue = parseFloat(rateMatch[1]);
                    if (rateValue > 0 && rateValue < 20) {
                      aer = rateMatch[0];
                      break;
                    }
                  }
                }
              }
            }
            
            // Method 5: Manual text parsing approach (most reliable)
            if (!aer) {
              const containerText = container.textContent || '';
              
              // Find all occurrences of % symbol
              let percentIndex = containerText.indexOf('%');
              while (percentIndex !== -1 && !aer) {
                // Look backwards from % to find the number
                let numStart = percentIndex - 1;
                let numStr = '';
                
                // Go backwards to collect digits and decimal point
                while (numStart >= 0) {
                  const char = containerText[numStart];
                  if (/[0-9.]/.test(char)) {
                    numStr = char + numStr;
                    numStart--;
                  } else {
                    break;
                  }
                }
                
                // Validate the number we found
                if (numStr && numStr.includes('.')) {
                  const rateValue = parseFloat(numStr);
                  if (rateValue > 0 && rateValue < 20 && !isNaN(rateValue)) {
                    aer = rateValue + '%';
                    break;
                  }
                }
                
                // Look for next % symbol
                percentIndex = containerText.indexOf('%', percentIndex + 1);
              }
            }
            
            // Debug logging for containers without rates
            if (!aer) {
              console.log(`MoneyFacts: No rate found for ${bankName}`);
              console.log(`  Container text: ${container.textContent.substring(0, 200)}`);
              console.log(`  [data-product] elements: ${container.querySelectorAll('[data-product]').length}`);
              console.log(`  Strong elements: ${container.querySelectorAll('strong').length}`);
            }
            
            if (!aer) {
              console.log(`MoneyFacts: No AER found for product ${i}: ${bankName}`);
              continue;
            }
            
            // Extract additional data
            let term = '';
            let termMonths = null;
            let noticePeriodDays = null;
            
            const containerText = container.textContent || '';
            
            if (accountType === 'fixed_term') {
              // ENHANCED: Try multiple patterns for MoneyFacts structure
              let termMatch = containerText.match(/(\d+)\s*Month\s*Bond/i);
              if (termMatch) {
                const months = parseInt(termMatch[1]);
                term = `${months} Month Bond`;
                termMonths = months;
              } else {
                termMatch = containerText.match(/(\d+)\s*Year\s*Bond/i);
                if (termMatch) {
                  const years = parseInt(termMatch[1]);
                  term = `${years} Year Bond`;
                  termMonths = years * 12;
                } else {
                  // Fallback to original patterns
                  termMatch = containerText.match(/(\d+)\s*(Year|Month)/i);
                  if (termMatch) {
                    const value = parseInt(termMatch[1]);
                    const unit = termMatch[2].toLowerCase();
                    if (unit === 'year') {
                      term = `${value} Year Bond`;
                      termMonths = value * 12;
                    } else {
                      term = `${value} Month Bond`;
                      termMonths = value;
                    }
                  }
                }
              }
            } else if (accountType === 'notice') {
              // ENHANCED: More notice period patterns
              let noticeMatch = containerText.match(/(\d+)\s*days?\s*notice/i);
              if (noticeMatch) {
                const days = parseInt(noticeMatch[1]);
                noticePeriodDays = days;
                term = `${days} Days Notice`;
              } else {
                // Try alternative patterns
                noticeMatch = containerText.match(/(\d+)\s*day\s*notice/i);
                if (noticeMatch) {
                  const days = parseInt(noticeMatch[1]);
                  noticePeriodDays = days;
                  term = `${days} Day Notice`;
                }
              }
            }
            
            // Extract minimum deposit
            let minDeposit = '';
            const depMatch = containerText.match(/£([\d,]+)/);
            if (depMatch) {
              minDeposit = depMatch[1];
            }
            
            // Extract interest payment frequency
            let interestPayment = '';
            if (containerText.match(/On Maturity/i)) interestPayment = 'On Maturity';
            else if (containerText.match(/Monthly/i)) interestPayment = 'Monthly';
            else if (containerText.match(/Annually/i)) interestPayment = 'Annually';
            
            // Extract original website title for debugging (first few meaningful lines)
            const titleLines = lines.slice(0, 3).filter(line => 
              line.length > 5 && 
              line.length < 100 && 
              !line.includes('Following initial registration') &&
              !line.includes('Star Rating') &&
              !line.includes('AER') &&
              !line.includes('Account Type')
            );
            const originalWebsiteTitle = titleLines.join(' | ');
            
            // Parse bank and platform for display (simplified parsing logic for browser context)
            let parsedBankName = bankName;
            let parsedPlatform = 'direct';
            
            // Simple platform detection for JSON/CSV output
            for (const platformVariant of platformVariants) {
              if (bankName.includes(platformVariant)) {
                // FIXED: Use proper regex to remove complete platform variant without leaving fragments
                // Pattern: require space before platform, match entire platform, then space or end of string
                parsedBankName = bankName.replace(new RegExp(`\\s+${platformVariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i'), '').trim();
                parsedPlatform = platformVariant;
                break;
              }
            }
            
            products.push({
              bankName: bankName, // Raw extracted bank name (with platform if detected)
              aer: aer,
              gross: aer, // Often same as AER on MoneyFacts
              accountType: accountType,
              term: term,
              termMonths: termMonths,
              noticePeriodDays: noticePeriodDays,
              minDeposit: minDeposit,
              interestPayment: interestPayment,
              productIndex: i,
              scrapedAt: new Date().toISOString(),
              page: window.location.href,
              pageName: pageName,
              extractionMethod: 'manual-parsing',
              rawText: containerText,
              originalWebsiteTitle: originalWebsiteTitle, // Enhanced: Show original title as seen on website
              parsedBankName: parsedBankName, // Enhanced: Cleaned bank name without platform
              parsedPlatform: parsedPlatform // Enhanced: Detected platform name
            });
            
            console.log(`MoneyFacts: Found product - ${bankName}: ${aer}`);
            
          } catch (error) {
            console.log(`MoneyFacts: Error processing product ${i}:`, error);
          }
        }
        
        console.log(`MoneyFacts: Extracted ${products.length} products from ${pageName}`);
        return products;
      }, pageConfig.accountType, pageConfig.name, platformVariants);
      } catch (evaluateError) {
        // Log error but we'll try recovery below
        // this.logger.error(`Error during product extraction: ${evaluateError.message}`);
        
        // If it's a detached frame error, try to recover
        if (evaluateError.message.includes('detached Frame')) {
          this.logger.warning('Frame detached during extraction, attempting recovery...');
          try {
            await this.browserManager.refreshPage();
            page = this.getPage();
            await page.goto(pageConfig.url, { waitUntil: 'networkidle0', timeout: this.options.timeout });
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Try extraction again after recovery
            products = await page.evaluate((accountType, pageName, platformVariants) => {
              const products = [];
              let productContainers = document.querySelectorAll('li.savings-table-item');
              console.log(`MoneyFacts: Found ${productContainers.length} containers after recovery`);
              
              // Simplified extraction for recovery attempt
              for (let container of productContainers) {
                try {
                  const bankElement = container.querySelector('h3, .bank-name, strong');
                  const rateElement = container.querySelector('strong');
                  
                  if (bankElement && rateElement) {
                    const bankName = bankElement.textContent?.trim();
                    const rate = rateElement.textContent?.trim();
                    
                    if (bankName && rate && rate.includes('%')) {
                      products.push({
                        bankName,
                        rate,
                        accountType,
                        platform: 'moneyfacts',
                        url: window.location.href,
                        scrapedAt: new Date().toISOString()
                      });
                    }
                  }
                } catch (itemError) {
                  console.log('Error processing item:', itemError.message);
                }
              }
              
              return products;
            }, pageConfig.accountType, pageConfig.name, platformVariants);
            
            this.logger.debug(`Recovery successful: extracted ${products.length} products`);
          } catch (recoveryError) {
            this.logger.error(`Recovery failed: ${recoveryError.message}`);
            products = []; // Return empty array instead of throwing
          }
        } else {
          products = []; // Return empty array for other errors
        }
      }
      
      return products;
      
    } catch (error) {
      this.logger.error(`Error extracting from ${pageConfig.url}: ${error.message}`);
      throw error;
    }
  }

  async processScrapedData(scrapedProducts) {
    this.logger.debug(`Processing ${scrapedProducts.length} scraped products for database...`);
    
    const processedProducts = [];
    
    await this.databaseManager.connect();
    
    try {
      for (const product of scrapedProducts) {
        // Parse bank name and platform
        const { bankName, detectedPlatform } = parseBankAndPlatform(
          product.bankName || product.bank_name,
          this.knownPlatforms
        );
        
        // Create database-ready product
        const processedProduct = {
          platform: detectedPlatform || 'direct',
          source: 'moneyfacts',
          bank_name: bankName,
          detected_platform: detectedPlatform,
          account_type: product.accountType || product.account_type,
          aer_rate: this.parseRate(product.aer || product.rate),
          gross_rate: this.parseRate(product.gross || product.rate),
          term_months: this.parseTermMonths(product.term),
          min_deposit: this.parseAmount(product.minDeposit),
          max_deposit: this.parseAmount(product.maxDeposit),
          fscs_protected: true, // Assume FSCS protected unless specified otherwise
          interest_payment_frequency: 'Unknown',
          scrape_date: new Date().toISOString().split('T')[0],
          scraped_at: product.scrapedAt || new Date().toISOString(),
          confidence_score: 0.9 // Base confidence for MoneyFacts
        };
        
        // Validate required fields
        if (processedProduct.bank_name && processedProduct.aer_rate > 0) {
          processedProducts.push(processedProduct);
        } else {
          this.logger.debug(`Skipping invalid product: ${product.bankName || 'Unknown'}`);
        }
      }
      
      this.logger.debug(`Processed ${processedProducts.length} valid products for database`);
      return processedProducts;
      
    } finally {
      await this.databaseManager.close();
    }
  }

  parseRate(rateString) {
    if (!rateString) return 0;
    const match = rateString.toString().match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
  }

  parseAmount(amountString) {
    if (!amountString) return null;
    const cleanAmount = amountString.replace(/[£,]/g, '');
    const match = cleanAmount.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  parseTermMonths(termString) {
    if (!termString) return null;
    
    // Handle different term formats
    if (termString.toLowerCase().includes('instant') || termString.toLowerCase().includes('easy access')) {
      return null; // Easy access has no fixed term
    }
    
    const monthMatch = termString.match(/(\d+)\s*months?/i);
    if (monthMatch) return parseInt(monthMatch[1]);
    
    const yearMatch = termString.match(/(\d+)\s*years?/i);
    if (yearMatch) return parseInt(yearMatch[1]) * 12;
    
    return null;
  }

  async customCleanup() {
    // Close platform lookup (no-op for JSON-based approach, but kept for API compatibility)
    if (this.platformLookup) {
      this.platformLookup.close();
      this.logger.debug('Platform lookup closed');
    }
  }

  // Database operations now handled by TypeScript service via pipeline JSON files

  parsePercentage(percentageStr) {
    if (!percentageStr || typeof percentageStr !== 'string') {
      return null;
    }
    
    const cleaned = percentageStr.replace('%', '').trim();
    const parsed = parseFloat(cleaned);
    
    return isNaN(parsed) ? null : parsed;
  }

  parseDepositAmount(depositStr) {
    if (!depositStr || typeof depositStr !== 'string') {
      return null;
    }
    
    const cleaned = depositStr.replace(/[£$€,]/g, '').trim();
    const parsed = parseInt(cleaned, 10);
    
    return isNaN(parsed) ? null : parsed;
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    verbose: false,
    headless: true,
    timeout: 300000
  };
  
  for (const arg of args) {
    switch (arg) {
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--visible':
        options.headless = false;
        break;
      case '--help':
      case '-h':
        console.log(`
MoneyFacts Scraper Usage:
  node moneyfacts-scraper.js [options]

Options:
  --verbose, -v      Enable verbose debug logging
  --visible          Run browser in visible mode (default: headless)
  --help, -h         Show this help message

Examples:
  node moneyfacts-scraper.js --verbose
  node moneyfacts-scraper.js --visible --verbose
`);
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--timeout=')) {
          options.timeout = parseInt(arg.split('=')[1]) * 1000;
        }
    }
  }
  
  return options;
}

// Usage example
async function main() {
  const options = parseArgs();
  
  const scraper = new MoneyFactsScraper({
    headless: options.headless,
    logLevel: options.verbose ? 'debug' : 'info',
    saveToFiles: true,
    timeout: options.timeout
  });
  
  if (options.verbose) {
    scraper.logger.logPlatformDebug('Debug mode enabled - verbose logging active');
  }
  
  // Removed duplicate - logging now handled by scraper-base.js
  
  try {
    const result = await scraper.scrape();
    
    if (result.success) {
      scraper.logger.logPlatformInfo(`${result.ratesFound} products extracted`);
      if (result.processedProducts) {
        scraper.logger.logPlatformInfo(`Database: ${result.processedProducts} products saved`);
      }
    } else {
      scraper.logger.logPlatform('error', `Scraping failed - ${result.error}`);
    }
  } catch (error) {
    scraper.logger.logPlatform('error', `Scraping failed - ${error.message}`);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { MoneyFactsScraper };
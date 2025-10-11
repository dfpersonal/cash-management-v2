import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { transformScrapedData, validateProductData, cleanBankName } from '../parsers/common-parser.js';
import { DataNormalizer } from '../utils/data-normalizer.js';
import { EnhancedLogger } from '../core/enhanced-logger.js';

class FlagstoneScraper {
  constructor(options = {}) {
    this.platform = 'Flagstone';
    this.baseUrl = 'https://clients.direct.flagstoneim.com/#/build-your-sample-portfolio?accounttype=individual';
    this.headless = options.headless !== false; // Default to headless
    this.timeout = options.timeout || 30000;
    this.outputDir = options.outputDir || './data/flagstone';
    this.saveToFiles = options.saveToFiles !== false; // Default to true

    // Generate single timestamp for entire scraper run (used by all files: log, raw, normalized)
    this.runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Configuration options
    // Legacy deduplication config removed - handled by TypeScript service

    // Initialize enhanced logger
    this.logger = new EnhancedLogger({
      componentName: 'flagstone', // Already lowercase
      platformName: 'Flagstone',
      logLevel: options.logLevel || 'info',
      enableFileLogging: options.enableFileLogging !== false,
      logDir: options.logDir || options.outputDir || './data/flagstone',
      verboseMode: options.verbose || false,
      timestamp: this.runTimestamp // Pass shared timestamp for log file
    });
  }

  /**
   * Get scraper identifier for metadata header
   * @returns {Object} - { source: string, method: string }
   */
  getScraperIdentifier() {
    return {
      source: 'flagstone',
      method: 'flagstone-scraper'
    };
  }

  async initialize() {
    // Configuration loading removed - deduplication handled by TypeScript service
    
    this.logger.progress('Launching browser...');
    this.browser = await puppeteer.launch({
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    this.page = await this.browser.newPage();
    
    // Set viewport for consistent rendering
    await this.page.setViewport({ width: 1920, height: 1080 });
    
    // Set user agent to avoid detection
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  }

  async loadConfiguration() {
    try {
      this.logger.debug('Loading configuration...');
      
      // Load JSON configuration
      const fs = await import('fs/promises');
      const jsonConfig = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
      
      // Use JSON config directly (database operations handled by TypeScript service)
      this.config = jsonConfig;
      this.logger.debug(`Configuration loaded from ${this.configPath}`);
    } catch (error) {
      this.logger.warning(`Configuration load failed: ${error.message}`);
      this.logger.debug('Using default configuration values');
      this.config = null;
    }
  }

  async navigateToPage() {
    this.logger.progress('Loading Flagstone data...');
    await this.page.goto(this.baseUrl, { 
      waitUntil: 'networkidle0',
      timeout: this.timeout 
    });

    // Wait for the rate table to load
    await this.page.waitForSelector('table', { timeout: this.timeout });
    
    // Additional wait to ensure all data is loaded
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  async extractRateData() {
    // Removed duplicate - already logged in scraper-base.js
    
    // Wait for content to fully load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // First, get the total number of results with improved selectors
    const totalResults = await this.page.evaluate(() => {
      if (window.flagstoneDebug) console.log('[Debug] === SEARCHING FOR TOTAL RESULTS ===');
      
      // Try multiple approaches to find the results count
      const approaches = [
        // Approach 1: Look for "Results (212)" text pattern
        () => {
          const textElements = Array.from(document.querySelectorAll('*')).filter(el => {
            return el.textContent && el.textContent.includes('Results (') && el.children.length === 0;
          });
          if (window.flagstoneDebug) console.log('[Debug] Text elements with "Results (":', textElements.length);
          
          for (const el of textElements) {
            const text = el.textContent.trim();
            if (window.flagstoneDebug) console.log('[Debug] Checking text:', text);
            const match = text.match(/Results\s*\((\d+)\)/i);
            if (match) {
              if (window.flagstoneDebug) console.log('[Debug] Found results count via approach 1:', match[1]);
              return parseInt(match[1]);
            }
          }
          return null;
        },
        
        // Approach 2: Look for "Showing X-Y" pattern
        () => {
          const showingElements = Array.from(document.querySelectorAll('*')).filter(el => {
            return el.textContent && el.textContent.includes('Showing') && el.children.length === 0;
          });
          if (window.flagstoneDebug) console.log('[Debug] Elements with "Showing":', showingElements.length);
          
          for (const el of showingElements) {
            const text = el.textContent.trim();
            if (window.flagstoneDebug) console.log('[Debug] Checking showing text:', text);
            // Look for patterns like "Showing 1-16 of 212"
            const match = text.match(/Showing\s+\d+-\d+.*?(\d+)/i);
            if (match) {
              if (window.flagstoneDebug) console.log('[Debug] Found results count via approach 2:', match[1]);
              return parseInt(match[1]);
            }
          }
          return null;
        },
        
        // Approach 3: Search all text content for number patterns
        () => {
          const allText = document.body.textContent || '';
          if (window.flagstoneDebug) console.log('[Debug] Searching full page text for patterns...');
          
          // Look for various patterns that might indicate total results
          const patterns = [
            /Results?\s*\((\d+)\)/i,
            /Showing\s+\d+-\d+.*?(\d+)/i,
            /(\d+)\s+results?\s+found/i,
            /Total:?\s*(\d+)/i
          ];
          
          for (const pattern of patterns) {
            const match = allText.match(pattern);
            if (match && parseInt(match[1]) > 50) { // Reasonable threshold
              if (window.flagstoneDebug) console.log(`[Debug] Found results count via approach 3 (${pattern}):`, match[1]);
              return parseInt(match[1]);
            }
          }
          return null;
        },
        
        // Approach 4: Count pagination to estimate total
        () => {
          const pageButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
            const text = btn.textContent.trim();
            return /^\d+$/.test(text);
          });
          
          if (pageButtons.length > 0) {
            const pageNumbers = pageButtons.map(btn => parseInt(btn.textContent.trim()));
            const maxPage = Math.max(...pageNumbers);
            if (window.flagstoneDebug) console.log('[Debug] Max page number found:', maxPage);
            
            if (maxPage > 1) {
              // Estimate: assume 16 items per page (typical for this site)
              const estimated = maxPage * 16;
              if (window.flagstoneDebug) console.log('[Debug] Estimated total via pagination:', estimated);
              return estimated;
            }
          }
          return null;
        }
      ];
      
      // Try each approach in order
      for (let i = 0; i < approaches.length; i++) {
        try {
          const result = approaches[i]();
          if (result && result > 0) {
            if (window.flagstoneDebug) console.log(`[Debug] Approach ${i + 1} succeeded with result:`, result);
            return result;
          }
        } catch (e) {
          if (window.flagstoneDebug) console.log(`[Debug] Approach ${i + 1} failed:`, e.message);
        }
      }
      
      // Final fallback: count visible rows but be more selective
      const rows = Array.from(document.querySelectorAll('tr, .product-row, [data-product], [data-rate]')).filter(row => {
        const text = row.textContent || '';
        return text.includes('%') && text.includes('£') && !text.includes('Bank name') && !text.includes('Header');
      });
      if (window.flagstoneDebug) console.log('[Debug] Fallback: counted visible product rows:', rows.length);
      return rows.length || 0;
    });
    
    this.logger.debug(`Found ${totalResults} total results`);
    
    const allRates = [];
    // REMOVED: seenRates Set - no longer doing early deduplication
    let currentPage = 1;
    let consecutiveEmptyPages = 0;
    let lastProgressUpdate = 0;
    
    // Calculate expected max pages based on total results
    const expectedMaxPages = Math.ceil(totalResults / 16) + 2; // Add buffer for safety
    this.logger.debug(`Expected pages: ~${expectedMaxPages} (${totalResults} results / 16 per page)`);
    
    while (consecutiveEmptyPages < 3 && currentPage <= expectedMaxPages) { // Stop after 3 empty pages OR max expected pages
      // Show progress every 5 pages or on important milestones
      const currentTotal = allRates.length;
      if (currentPage % 5 === 0 || currentPage === 1 || currentTotal - lastProgressUpdate >= 50) {
        const percent = totalResults > 0 ? Math.round((currentTotal / totalResults) * 100) : 0;
        this.logger.progress(`Extracting products: ${currentTotal}/${totalResults} (${percent}%)`);
        lastProgressUpdate = currentTotal;
      }
      
      // Dynamic wait strategy - longer waits for later pages
      let waitTime = 2000; // Base wait time
      if (currentPage > 13) {
        // Pages after 13 seem to need more time
        waitTime = 5000 + (currentPage - 13) * 500; // Increasing wait time
        this.logger.debug(`Extended wait for page ${currentPage}: ${waitTime}ms`);
      }
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Extract rates from current page with enhanced selectors and validation
      const pageRates = await this.page.evaluate((pageNum) => {
        if (window.flagstoneDebug) console.log(`[Debug] === EXTRACTING DATA FROM PAGE ${pageNum} ===`);
        
        // Enhanced approach to find rate data with better selectors
        const extractionApproaches = [
          // Approach 1: Standard table rows
          () => {
            if (window.flagstoneDebug) console.log('[Debug] Trying approach 1: Standard table rows');
            const tableRows = Array.from(document.querySelectorAll('tbody tr, table tr')).filter(row => {
              const text = row.textContent || '';
              return text.includes('%') && text.includes('£') && 
                     !text.toLowerCase().includes('bank name') && 
                     !text.toLowerCase().includes('header') &&
                     row.cells && row.cells.length >= 5;
            });
            if (window.flagstoneDebug) console.log(`[Debug] Found ${tableRows.length} table rows`);
            return tableRows;
          },
          
          // Approach 2: Any tr elements with rate data
          () => {
            if (window.flagstoneDebug) console.log('[Debug] Trying approach 2: Any tr elements');
            const allTrs = Array.from(document.querySelectorAll('tr')).filter(row => {
              const text = row.textContent || '';
              return text.includes('%') && text.includes('£') && 
                     !text.toLowerCase().includes('bank name') &&
                     text.includes('Fixed') || text.includes('Instant') || text.includes('Notice');
            });
            if (window.flagstoneDebug) console.log(`[Debug] Found ${allTrs.length} tr elements`);
            return allTrs;
          },
          
          // Approach 3: Card-based layout (divs/sections)
          () => {
            if (window.flagstoneDebug) console.log('[Debug] Trying approach 3: Card-based layout');
            const rateCards = Array.from(document.querySelectorAll('div, section, article')).filter(div => {
              const text = div.textContent || '';
              return text.includes('%') && text.includes('£') && 
                     (text.includes('Fixed') || text.includes('Instant') || text.includes('Notice')) &&
                     div.children.length > 0 && div.children.length < 10; // Reasonable container size
            });
            if (window.flagstoneDebug) console.log(`[Debug] Found ${rateCards.length} card elements`);
            return rateCards;
          },
          
          // Approach 4: Any element with data attributes
          () => {
            if (window.flagstoneDebug) console.log('[Debug] Trying approach 4: Elements with data attributes');
            const dataElements = Array.from(document.querySelectorAll('[data-product], [data-rate], [data-bank], [class*="product"], [class*="rate"]')).filter(el => {
              const text = el.textContent || '';
              return text.includes('%') && text.includes('£');
            });
            if (window.flagstoneDebug) console.log(`[Debug] Found ${dataElements.length} data elements`);
            return dataElements;
          }
        ];
        
        // Try each approach and use the one that finds the most data
        let bestRows = [];
        let bestApproach = '';
        
        for (let i = 0; i < extractionApproaches.length; i++) {
          try {
            const rows = extractionApproaches[i]();
            if (rows.length > bestRows.length) {
              bestRows = rows;
              bestApproach = `approach-${i + 1}`;
            }
          } catch (e) {
            if (window.flagstoneDebug) console.log(`[Debug] Extraction approach ${i + 1} failed:`, e.message);
          }
        }
        
        if (window.flagstoneDebug) console.log(`[Debug] Best approach found ${bestRows.length} rows using ${bestApproach}`);
        
        // Process the rows into rate data
        const processedRates = bestRows.map((row, index) => {
          try {
            let bankName, aer, gross, term, minDeposit, maxDeposit, fscsEligible;
            
            // Enhanced extraction for table rows
            if (row.tagName === 'TR' && row.cells) {
              const cells = Array.from(row.cells);
              if (window.flagstoneDebug) console.log(`[Debug] Processing table row with ${cells.length} cells`);
              
              if (cells.length >= 5) {
                bankName = cells[0]?.textContent?.trim().replace(/\s+/g, ' ');
                const rateText = cells[1]?.textContent?.trim();
                term = cells[2]?.textContent?.trim();
                minDeposit = cells[3]?.textContent?.trim();
                maxDeposit = cells[4]?.textContent?.trim();
                fscsEligible = cells[5]?.textContent?.trim();
                
                // Better rate parsing
                if (rateText) {
                  const rateParts = rateText.split('|').map(r => r.trim());
                  aer = rateParts[0] || '';
                  gross = rateParts[1] || rateParts[0] || '';
                }
              }
            }
            // Enhanced extraction for div/card elements
            else {
              const text = row.textContent || '';
              if (window.flagstoneDebug) console.log(`[Debug] Processing card/div element with text length: ${text.length}`);
              
              // Extract bank name (usually first significant text)
              const lines = text.split('\n').map(line => line.trim()).filter(line => line);
              bankName = lines[0] || 'Unknown';
              
              // Extract rates
              const rateMatches = text.match(/(\d+\.\d+%)/g) || [];
              aer = rateMatches[0] || '';
              gross = rateMatches[1] || rateMatches[0] || '';
              
              // Extract term
              const termMatch = text.match(/(Fixed \d+ months?|Instant access|Notice \d+ days?)/i);
              term = termMatch ? termMatch[0] : '';
              
              // Extract deposits
              const depositMatches = text.match(/£([\d,]+)/g) || [];
              minDeposit = depositMatches[0] || '';
              maxDeposit = depositMatches[1] || '';
              
              // FSCS status
              fscsEligible = text.toLowerCase().includes('fscs') && text.toLowerCase().includes('yes') ? 'Yes' : 'No';
            }
            
            // Validation
            if (!bankName || bankName === 'Unknown' || bankName.length < 2) {
              if (window.flagstoneDebug) console.log(`[Debug] Setting unknown bank for row ${index}: invalid bank name '${bankName}'`);
              bankName = 'Unknown Bank';
            }
            
            if (!aer || !aer.includes('%')) {
              if (window.flagstoneDebug) console.log(`[Debug] Skipping row ${index}: invalid rate '${aer}'`);
              return null;
            }
            
            return {
              bankName: bankName.replace(/\s+/g, ' '),
              aer: aer || '',
              gross: gross || aer || '',
              term: term || '',
              minDeposit: minDeposit || '',
              maxDeposit: maxDeposit || '',
              fscsEligible: fscsEligible || 'Unknown',
              scrapedAt: new Date().toISOString(),
              page: window.location.href,
              extractionMethod: bestApproach,
              pageNumber: pageNum,
              rowIndex: index
            };
          } catch (error) {
            if (window.flagstoneDebug) console.log(`[Error] Error processing row ${index}:`, error.message);
            return null;
          }
        }).filter(rate => rate !== null);
        
        if (window.flagstoneDebug) console.log(`[Debug] Successfully processed ${processedRates.length} rates`);
        
        // Validation: warn if we got significantly fewer than expected 16 items
        if (processedRates.length < 12 && pageNum <= 13) {
          if (window.flagstoneDebug) console.log(`[Warning] Only found ${processedRates.length} rates on page ${pageNum}, expected ~16`);
        }
        
        return processedRates;
      }, currentPage);
      
      this.logger.debug(`Page ${currentPage}: ${pageRates.length} products extracted`);
      
      if (pageRates.length === 0) {
        consecutiveEmptyPages++;
        this.logger.warning(`Empty page ${currentPage} (${consecutiveEmptyPages}/3) - retrying...`);
        
        // Progressive retry with multiple attempts
        // Later pages load slower, so we increase wait time progressively
        let retrySuccess = false;
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          // Progressive wait: base 2s + (page * 200ms) + (attempt * 1s), capped at 10s
          const retryWaitTime = Math.min(2000 + (currentPage * 200) + (attempt * 1000), 10000);
          this.logger.debug(`Retry attempt ${attempt}/${maxRetries} for page ${currentPage}, waiting ${retryWaitTime}ms`);
          
          await new Promise(resolve => setTimeout(resolve, retryWaitTime));
          
          const retryRates = await this.page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tr')).filter(row => {
              const text = row.textContent;
              return text.includes('%') && text.includes('£') && !text.includes('Bank name');
            });
            
            return rows.map((row, index) => {
              try {
                const cells = Array.from(row.cells || row.children);
                if (cells.length < 5) return null;
                
                const bankName = cells[0]?.textContent?.trim().replace(/\s+/g, ' ');
                const rateText = cells[1]?.textContent?.trim();
                const term = cells[2]?.textContent?.trim();
                const minDeposit = cells[3]?.textContent?.trim();
                const maxDeposit = cells[4]?.textContent?.trim();
                const fscsEligible = cells[5]?.textContent?.trim();
                
                const [aer, gross] = rateText ? rateText.split('|').map(r => r.trim()) : ['', ''];
                
                if (!bankName || !aer) return null;
                
                return {
                  bankName,
                  aer: aer || '',
                  gross: gross || aer || '',
                  term,
                  minDeposit,
                  maxDeposit,
                  fscsEligible,
                  scrapedAt: new Date().toISOString(),
                  page: window.location.href,
                  extractionMethod: 'table-row-retry',
                  rowIndex: index
                };
              } catch (error) {
                return null;
              }
            }).filter(rate => rate && rate.bankName);
          });
          
          if (retryRates.length > 0) {
            this.logger.debug(`Retry attempt ${attempt}: found ${retryRates.length} products on page ${currentPage}`);
            consecutiveEmptyPages = 0;
            retrySuccess = true;
            
            // NO EARLY DEDUPLICATION - add all rates for pipeline processing
            allRates.push(...retryRates);
            break; // Success, exit retry loop
          }
        }
        
        if (!retrySuccess) {
          this.logger.warning(`All ${maxRetries} retry attempts failed: Page ${currentPage} still empty`);
        }
      } else {
        consecutiveEmptyPages = 0;
        
        // NO EARLY DEDUPLICATION - add all rates for pipeline processing
        allRates.push(...pageRates);
      }
      
      // Check for next page with detailed debugging
      const paginationInfo = await this.page.evaluate(() => {
        // Get all buttons and links
        const allButtons = Array.from(document.querySelectorAll('button'));
        const allLinks = Array.from(document.querySelectorAll('a'));
        const allClickable = [...allButtons, ...allLinks];
        
        if (window.flagstoneDebug) {
          console.log('=== PAGINATION DEBUG ===');
          console.log('Total clickable elements:', allClickable.length);
        }
        
        // Find pagination candidates
        const candidates = allClickable.filter(el => {
          const text = el.textContent.toLowerCase().trim();
          const hasNextText = text.includes('next') || text === '>' || text === '→';
          const hasNumberText = /^\d+$/.test(text);
          const hasPageClass = el.className.toLowerCase().includes('page');
          return hasNextText || hasNumberText || hasPageClass;
        });
        
        const candidateInfo = candidates.map(el => ({
          tag: el.tagName,
          text: el.textContent.trim(),
          className: el.className,
          disabled: el.disabled,
          visible: el.offsetWidth > 0 && el.offsetHeight > 0
        }));
        
        if (window.flagstoneDebug) console.log('Pagination candidates:', candidateInfo);
        
        // Try to find a working next button
        let nextButton = null;
        const nextSelectors = [
          'button:not([disabled])',
          'a:not([disabled])',
          '[aria-label*="next" i]:not([disabled])',
          '[title*="next" i]:not([disabled])'
        ];
        
        for (const selector of nextSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent.toLowerCase().trim();
            if (text.includes('next') || text === '>') {
              nextButton = el;
              break;
            }
          }
          if (nextButton) break;
        }
        
        return {
          candidates: candidateInfo,
          hasNext: !!nextButton,
          nextButtonInfo: nextButton ? {
            tag: nextButton.tagName,
            text: nextButton.textContent.trim(),
            className: nextButton.className,
            disabled: nextButton.disabled
          } : null
        };
      });
      
      this.logger.debug('Pagination info: ' + JSON.stringify(paginationInfo, null, 2));
      
      // Try to click to next page using numbered pagination with robust waiting
      const clicked = await this.page.evaluate((currentPageNum) => {
        // Look for the next page number button
        const pageButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
          const text = btn.textContent.trim();
          return /^\d+$/.test(text);
        });
        
        if (window.flagstoneDebug) {
          console.log('Available page buttons:', pageButtons.map(b => ({
            text: b.textContent,
            disabled: b.disabled,
            classList: Array.from(b.classList)
          })));
        }
        
        // Find the button for the next page
        const nextPageButton = pageButtons.find(btn => {
          const pageNum = parseInt(btn.textContent.trim());
          return pageNum === currentPageNum + 1;
        });
        
        if (nextPageButton && !nextPageButton.disabled) {
          // Store current page indicators before clicking
          const currentPageIndicators = Array.from(document.querySelectorAll('button.primary, button[class*="primary"]')).map(btn => btn.textContent);
          
          if (window.flagstoneDebug) {
            console.log(`Clicking page ${nextPageButton.textContent}`);
            console.log('Current page indicators before click:', currentPageIndicators);
          }
          
          nextPageButton.click();
          return {
            clicked: true,
            targetPage: nextPageButton.textContent,
            previousIndicators: currentPageIndicators
          };
        }
        
        if (window.flagstoneDebug) console.log(`No button found for page ${currentPageNum + 1}`);
        return { clicked: false };
      }, currentPage);
      
      if (clicked.clicked) {
        this.logger.debug(`Clicked to page ${clicked.targetPage}, waiting for confirmation...`);
        
        // Wait for page change to be reflected in the DOM
        let pageChangeConfirmed = false;
        const maxWaitAttempts = 20; // 10 seconds max wait
        
        for (let attempt = 0; attempt < maxWaitAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const pageChangeCheck = await this.page.evaluate((targetPage, previousIndicators, attemptNum) => {
            // Check if the new page is now marked as current/primary
            const currentPageButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
              const text = btn.textContent.trim();
              return text === targetPage && (btn.disabled || btn.className.includes('primary'));
            });
            
            const newIndicators = Array.from(document.querySelectorAll('button.primary, button[class*="primary"]')).map(btn => btn.textContent);
            
            if (window.flagstoneDebug) {
              console.log(`Attempt ${attemptNum}: Looking for page ${targetPage} as current`);
              console.log('New page indicators:', newIndicators);
              console.log('Target page buttons found:', currentPageButtons.length);
            }
            
            // Page change confirmed if:
            // 1. We find the target page marked as primary/current, OR
            // 2. The page indicators have changed from before
            const indicatorsChanged = JSON.stringify(newIndicators) !== JSON.stringify(previousIndicators);
            const targetIsActive = currentPageButtons.length > 0;
            
            return targetIsActive || indicatorsChanged;
          }, clicked.targetPage, clicked.previousIndicators, attempt + 1);
          
          if (pageChangeCheck) {
            pageChangeConfirmed = true;
            this.logger.debug(`Page change confirmed after ${attempt + 1} attempts`);
            break;
          }
        }
        
        if (!pageChangeConfirmed) {
          this.logger.warning('Page change not confirmed, proceeding...');
        }
        
        // Additional wait for content to load after page change
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      if (!clicked.clicked) {
        this.logger.debug('No next page found - attempting scroll for more content');
        
        // Try scrolling to load more content (but be more careful about detection)
        this.logger.debug('Scrolling to load more content...');
        
        // Get current unique rate data before scrolling
        const beforeScrollData = await this.page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('tr')).filter(row => {
            const text = row.textContent;
            return text.includes('%') && text.includes('£') && !text.includes('Bank name');
          });
          
          // Create unique identifiers for each rate
          return rows.map(row => {
            const cells = Array.from(row.cells || row.children);
            if (cells.length >= 2) {
              return {
                bank: cells[0]?.textContent?.trim() || '',
                rate: cells[1]?.textContent?.trim() || '',
                term: cells[2]?.textContent?.trim() || ''
              };
            }
            return null;
          }).filter(item => item && item.bank && item.rate);
        });
        
        await this.page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 3000)); // Longer wait for potential loading
        
        // Check if we actually got NEW content
        const afterScrollData = await this.page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('tr')).filter(row => {
            const text = row.textContent;
            return text.includes('%') && text.includes('£') && !text.includes('Bank name');
          });
          
          return rows.map(row => {
            const cells = Array.from(row.cells || row.children);
            if (cells.length >= 2) {
              return {
                bank: cells[0]?.textContent?.trim() || '',
                rate: cells[1]?.textContent?.trim() || '',
                term: cells[2]?.textContent?.trim() || ''
              };
            }
            return null;
          }).filter(item => item && item.bank && item.rate);
        });
        
        // Check for genuinely NEW content (not just re-reading the same data)
        const beforeSet = new Set(beforeScrollData.map(item => `${item.bank}|${item.rate}|${item.term}`));
        const afterSet = new Set(afterScrollData.map(item => `${item.bank}|${item.rate}|${item.term}`));
        const genuinelyNew = afterScrollData.filter(item => !beforeSet.has(`${item.bank}|${item.rate}|${item.term}`));
        
        this.logger.debug(`Before scroll: ${beforeScrollData.length} rates, After scroll: ${afterScrollData.length} rates, New: ${genuinelyNew.length}`);
        
        if (genuinelyNew.length > 0) {
          this.logger.progress('New content loaded via scrolling, continuing...');
          currentPage++;
          continue;
        } else {
          this.logger.debug('No new content after scrolling - may be at end');
        }
        
        this.logger.debug('No more pages found');
        break;
      }
      
      // Wait for new data to load with dynamic timing
      let finalWaitTime = 3000;
      if (currentPage > 13) {
        finalWaitTime = 5000; // Longer wait for problematic later pages
        this.logger.debug(`Extended wait for page navigation: ${finalWaitTime}ms`);
      }
      await new Promise(resolve => setTimeout(resolve, finalWaitTime));
      
      currentPage++;
      
      // Safety check - shouldn't need this with expectedMaxPages limit but keeping as fallback  
      if (currentPage > expectedMaxPages + 5) {
        this.logger.warning('Hard safety limit reached - stopping pagination');
        break;
      }
    }
    
    // Count unknown banks for quality reporting
    const unknownBanks = allRates.filter(product => !product.bankName || product.bankName.trim() === '' || product.bankName === 'Unknown Bank' || product.bankName === 'Unknown').length;
    
    this.logger.info(`Flagstone: ${allRates.length} products extracted, ${unknownBanks} failed`);
    
    return allRates;
  }

  async scrapeAllFilters() {
    this.logger.progress('Testing filter combinations...');
    
    const allRates = [];
    
    // Define filter combinations to try
    const filterCombinations = [
      { name: 'all', filters: [] },
      { name: 'instant-access', filters: ['Instant access'] },
      { name: 'notice-account', filters: ['Notice account'] },
      { name: 'fixed-term', filters: ['Fixed term'] },
      { name: 'best-rates', filters: ['Best Flagstone rates'] }
    ];
    
    for (const combination of filterCombinations) {
      this.logger.progress(`Testing filter: ${combination.name}`);
      
      // Reset all filters first
      await this.page.evaluate(() => {
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
      });
      
      // Apply specific filters
      for (const filterName of combination.filters) {
        await this.page.evaluate((name) => {
          const checkboxes = document.querySelectorAll('input[type="checkbox"]');
          for (const cb of checkboxes) {
            const label = cb.nextElementSibling?.textContent || cb.closest('label')?.textContent;
            if (label && label.includes(name)) {
              cb.click();
              break;
            }
          }
        }, filterName);
        
        // Wait for filter to apply
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Extract rates for this filter combination
      const rates = await this.extractRateData();
      
      // Add filter information to each rate
      const ratesWithFilter = rates.map(rate => ({
        ...rate,
        filterApplied: combination.name
      }));
      
      allRates.push(...ratesWithFilter);
      this.logger.debug(`Filter ${combination.name}: ${rates.length} rates`);
    }
    
    return allRates;
  }

  async saveToFile(data) {
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `flagstone-rates-${timestamp}`;
    
    const filepath = path.join(this.outputDir, `${filename}.json`);
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    this.logger.info(`Saved ${data.length} entries to ${path.basename(filepath)}`);
    return filepath;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.logger.debug('Browser closed');
    }
  }

  /**
   * Normalize raw Flagstone data to standard format for cross-platform deduplication
   * This converts raw scraped data to the same format used by other scrapers
   * @param {Array} rates - Raw scraped rate data
   * @returns {Array} Normalized products in standard format
   */
  normalizeFlagstoneData(rates) {
    return rates.map(rate => {
      // Parse account type from term information
      let accountType = 'fixed_term'; // Default
      let termMonths = null;
      let noticePeriodDays = null;

      if (rate.term) {
        const termLower = rate.term.toLowerCase();
        if (termLower.includes('notice') || termLower.includes('day')) {
          accountType = 'notice';
          const dayMatch = termLower.match(/(\d+)\s*days?/);
          if (dayMatch) {
            noticePeriodDays = parseInt(dayMatch[1]);
          }
        } else if (termLower.includes('access') || termLower.includes('variable')) {
          accountType = 'easy_access';
        } else if (termLower.includes('month') || termLower.includes('year') || termLower.match(/\d/)) {
          accountType = 'fixed_term';
          // Parse months
          const monthMatch = termLower.match(/(\d+)\s*months?/);
          if (monthMatch) {
            termMonths = parseInt(monthMatch[1]);
          } else {
            // Parse years and convert to months
            const yearMatch = termLower.match(/(\d+)\s*years?/);
            if (yearMatch) {
              termMonths = parseInt(yearMatch[1]) * 12;
            }
          }
        }
      }

      // Parse rates - remove % and convert to number
      const aerRate = rate.aer ? parseFloat(rate.aer.replace('%', '').trim()) : null;
      const grossRate = rate.gross ? parseFloat(rate.gross.replace('%', '').trim()) : aerRate;

      // Parse minimum deposit
      const minDeposit = rate.minDeposit ? parseInt(rate.minDeposit.replace(/[£$€,]/g, '').trim()) : null;

      return {
        bankName: rate.bankName || 'Unknown Bank',
        aerRate: aerRate,
        grossRate: grossRate,
        accountType: accountType,
        termMonths: termMonths,
        noticePeriodDays: noticePeriodDays,
        minDeposit: minDeposit,
        maxDeposit: null, // Flagstone doesn't typically provide max deposit
        fscsProtected: rate.fscsEligible === 'Yes',
        interestPaymentFrequency: null, // Not available in raw Flagstone data
        applyByDate: null, // Not available in raw Flagstone data
        specialFeatures: null, // Could be enhanced later
        scrapedAt: new Date().toISOString()
      };
    });
  }

  async scrape(options = {}) {
    try {
      await this.initialize();
      await this.navigateToPage();
      
      let rates;
      if (options.allFilters) {
        rates = await this.scrapeAllFilters();
      } else {
        // Just scrape the default view to get all products
        rates = await this.extractRateData();
      }
      
      // NO EARLY DEDUPLICATION - return all raw products for pipeline processing
      // Count unknown banks for quality reporting
      const unknownBanks = rates.filter(product => !product.bankName || product.bankName.trim() === '' || product.bankName === 'Unknown Bank' || product.bankName === 'Unknown').length;
      
      // Final count will be reported in summary
      this.logger.debug(`Raw extraction: ${rates.length} products, ${unknownBanks} unknown banks`);
      this.logger.debug(`Extraction failure rate: ${((unknownBanks/rates.length)*100).toFixed(1)}%`);
      
      // Add pipeline file generation (like other scrapers)
      if (this.saveToFiles) {
        await this.generatePipelineFiles(rates);
      }

      // Normalize data for enhanced results reporting and pipeline processing
      const normalizedProducts = this.normalizeFlagstoneData(rates);

      const results = {
        success: true,
        ratesFound: rates.length,
        normalizedCount: normalizedProducts.length,
        data: rates,
        deduplicationStats: null // Will be populated by TypeScript service
      };
      
      // Database operations handled by TypeScript service via pipeline files
      this.logger.debug('Database operations will be handled by TypeScript service pipeline');
      
      // Files are saved by generatePipelineFiles() method above
      // Legacy saveToFile() call removed - redundant with pipeline files
      
      return results;

    } catch (error) {
      this.logger.error(`Scraping failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Generate pipeline files (raw + normalized) with metadata format
   * This creates the same 3-file output as the unified pipeline
   */
  async generatePipelineFiles(rawData) {
    try {
      // Create raw JSON file with metadata format
      // Use shared timestamp and lowercase platform name for consistent file naming
      const rawFilename = `flagstone-raw-${this.runTimestamp}.json`;
      const rawFilepath = path.join(this.outputDir, rawFilename);

      // Ensure output directory exists
      if (!existsSync(this.outputDir)) {
        await fs.mkdir(this.outputDir, { recursive: true });
      }

      // Wrap raw data in metadata format
      const rawOutputData = {
        metadata: this.getScraperIdentifier(),
        products: rawData
      };

      await fs.writeFile(rawFilepath, JSON.stringify(rawOutputData, null, 2));
      this.logger.info(`Raw JSON saved: ${rawFilename} (${rawData.length} records)`);

      // Create normalized JSON file using existing normalization logic
      const normalizer = new DataNormalizer();
      const normalizedData = await normalizer.normalize(rawData, 'Flagstone');

      // Use shared timestamp and lowercase platform name for consistent file naming
      const normalizedFilename = `flagstone-normalized-${this.runTimestamp}.json`;
      const normalizedFilepath = path.join(this.outputDir, normalizedFilename);

      // Wrap normalized data in metadata format
      const normalizedOutputData = {
        metadata: this.getScraperIdentifier(),
        products: normalizedData
      };

      await fs.writeFile(normalizedFilepath, JSON.stringify(normalizedOutputData, null, 2));
      this.logger.info(`Normalized JSON saved: ${normalizedFilename} (${normalizedData.length} records)`);

      // Log file is already created by EnhancedLogger
      this.logger.debug('Pipeline files generated successfully');

    } catch (error) {
      this.logger.error(`Failed to generate pipeline files: ${error.message}`);
      // Don't throw - this shouldn't break the main scraping logic
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    verbose: false,
    headless: true,
    allFilters: false
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
      case '--all-filters':
        options.allFilters = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Flagstone Scraper Usage:
  node flagstone-scraper.js [options]

Options:
  --verbose, -v      Enable verbose debug logging
  --visible          Run browser in visible mode (default: headless)
  --all-filters      Scrape all filter combinations
  --help, -h         Show this help message

Examples:
  node flagstone-scraper.js --verbose
  node flagstone-scraper.js --visible --verbose
  node flagstone-scraper.js --all-filters
`);
        process.exit(0);
        break;
    }
  }
  
  return options;
}

// Usage example
async function main() {
  const options = parseArgs();
  
  const scraper = new FlagstoneScraper({
    headless: options.headless
  });
  
  // Enable debug logging if --verbose flag is used
  if (options.verbose) {
    scraper.logger.logLevel = 'debug';
    scraper.logger.logPlatformDebug('Debug mode enabled - verbose logging active');
  }
  
  try {
    // Use the scrape method which handles both extraction and database saving
    const result = await scraper.scrape({
      allFilters: options.allFilters
    });
    
    if (result.success) {
      scraper.logger.logPlatformInfo(`${result.ratesFound} products extracted`);
      if (result.finalDatabaseCount) {
        scraper.logger.logPlatformInfo(`Database: ${result.finalDatabaseCount} products saved`);
      }
    } else {
      scraper.logger.logPlatform('error', `Scraping failed - ${result.error}`);
    }
    
  } catch (error) {
    scraper.logger.logPlatform('error', `Scraping failed - ${error.message}`);
  } finally {
    await scraper.cleanup();
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { FlagstoneScraper };
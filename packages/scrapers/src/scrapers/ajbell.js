/**
 * AJ Bell Scraper - Built using shared utilities
 * AJ Bell cash savings scraper with database integration
 */

import { ScraperBase } from '../core/scraper-base.js';
import { transformAJBellData, validateAJBellData } from '../parsers/ajbell-parser.js';

class AJBellScraper extends ScraperBase {
  constructor(options = {}) {
    super('AJBell', {
      outputDir: './data/ajbell',
      timeout: 90000, // Increased from 60s to 90s for better reliability
      ...options
    });
  }

  getBaseUrl() {
    return 'https://www.ajbell.co.uk/cash-savings/list#list';
  }

  /**
   * Override scraper identifier for metadata header
   * @returns {Object} - { source: string, method: string }
   */
  getScraperIdentifier() {
    return {
      source: 'ajbell',
      method: 'ajbell-scraper'
    };
  }

  async customInitialization() {
    // AJ Bell-specific initialization if needed
  }

  async customNavigation() {
    const page = await super.customNavigation();
    this.page = page; // Store page reference for extractRateData
    
    // Wait for page to load and render - longer in headless mode
    const waitTime = this.browserManager.headless ? 10000 : 5000;
    this.logger.progress('Loading AJ Bell data...');
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // Try to wait for the tab structure with extended timeout
    const tabsFound = await this.waitForContent('.tab, [role="tab"]', 30000);
    if (tabsFound) {
      this.logger.debug('Tab structure detected');
    } else {
      this.logger.warning('Tab structure not found, continuing...');
      // Extra wait time if tabs not found immediately
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    return page;
  }

  async extractRateData() {
    // Removed duplicate - already logged in scraper-base.js
    
    // Extract from both tabs
    this.logger.logPlatformDebug('Extracting Fixed Term products...');
    const fixedTermProducts = await this.extractFixedTermProducts();
    this.logger.logPlatformDebug('Extracting Notice products...');
    const noticeProducts = await this.extractNoticeProducts();
    
    // Combine results - NO EARLY DEDUPLICATION (this was the bug!)
    const allExtractedProducts = [...fixedTermProducts, ...noticeProducts];
    
    // Count unknown banks for quality reporting
    const unknownBanks = allExtractedProducts.filter(product => product.bankName === 'Unknown Bank').length;
    
    this.logger.logPlatformProgress(`${allExtractedProducts.length} products extracted`);
    this.logger.logPlatformDebug(`Fixed Term: ${fixedTermProducts.length}, Notice: ${noticeProducts.length}`);
    this.logger.logPlatformDebug(`Unknown banks: ${unknownBanks}/${allExtractedProducts.length} (${((unknownBanks/allExtractedProducts.length)*100).toFixed(1)}% extraction failure rate)`);
    
    // Process through new four-tier pipeline
    const pipelineResults = await this.processWithNewPipeline(allExtractedProducts);
    
    // Update results for compatibility
    this.results.ratesFound = pipelineResults.rawProducts;
    this.results.processedProducts = pipelineResults.databaseProducts;
    
    return pipelineResults;
  }

  // Database operations now handled by new pipeline in scraper-base.js

  // REMOVED: parsePercentage and parseDepositAmount methods
  // These are now handled by the DataNormalizer in the new pipeline

  /**
   * Dynamic bank name extraction from AJ Bell card elements
   * Uses DOM structure analysis instead of hardcoded regex patterns
   * @param {Element} card - The card DOM element 
   * @param {string} cardText - The card text content
   * @returns {string} The extracted bank name
   */
  extractBankNameFromCard(card, cardText) {
    // Strategy 1: Try to find bank name in specific DOM elements
    const bankNameSelectors = [
      'h3', 'h4', 'h5',
      '.bank-name', '.provider-name', '.institution-name',
      '[class*="bank"]', '[class*="provider"]', '[class*="institution"]',
      'strong', 'b',
      '.title', '.heading', '[class*="title"]', '[class*="heading"]'
    ];

    for (const selector of bankNameSelectors) {
      const element = card.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim();
        if (this.isValidBankName(text)) {
          return text;
        }
      }
    }

    // Strategy 2: Parse from text content using intelligent patterns
    return this.extractBankNameFromText(cardText);
  }

  /**
   * Extract bank name from card text using intelligent parsing
   * @param {string} cardText - The card text content
   * @returns {string} The extracted bank name
   */
  extractBankNameFromText(cardText) {
    // Clean and split text into lines
    const lines = cardText.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.length > 3);

    // Strategy 1: Look for lines that contain bank indicators
    const bankIndicators = /\b(Bank|Building Society|BS|Limited|Ltd|Plc|PLC)\b/i;
    
    for (const line of lines) {
      // Skip lines that are clearly rates, dates, or UI elements
      if (this.isIgnorableLine(line)) continue;
      
      // Look for lines with bank indicators
      if (bankIndicators.test(line)) {
        const cleanName = this.cleanBankName(line);
        if (this.isValidBankName(cleanName)) {
          return cleanName;
        }
      }
    }

    // Strategy 2: Look for capitalized words that might be bank names
    for (const line of lines) {
      if (this.isIgnorableLine(line)) continue;
      
      // Look for proper case text (bank names are usually properly capitalized)
      if (/^[A-Z][a-z]/.test(line) && line.length > 5) {
        const cleanName = this.cleanBankName(line);
        if (this.isValidBankName(cleanName)) {
          return cleanName;
        }
      }
    }

    // Strategy 3: Fallback to first substantial line
    const substantialLine = lines.find(line => 
      line.length > 5 && 
      !this.isIgnorableLine(line) &&
      !/^[\d\s%£]+$/.test(line)
    );
    
    if (substantialLine) {
      const cleanName = this.cleanBankName(substantialLine);
      if (this.isValidBankName(cleanName)) {
        return cleanName;
      }
    }

    // Final fallback
    return 'Unknown Bank';
  }

  /**
   * Check if a line should be ignored during bank name extraction
   * @param {string} line - Text line to check
   * @returns {boolean} True if line should be ignored
   */
  isIgnorableLine(line) {
    const ignorablePatterns = [
      /^\d+\.\d+%/,  // Rates like "4.29%"
      /^£[\d,]+/,    // Amounts like "£30,000" 
      /^Total interest/i,
      /^Find out more/i,
      /^Min deposit/i,
      /^AER.*interest/i,
      /^Fixed Deposit Term/i,
      /^Notice/i,
      /^\d+\s*(month|year|day)s?/i,
      /^Apply.*by/i,
      /^Details$/i
    ];

    return ignorablePatterns.some(pattern => pattern.test(line));
  }

  /**
   * Clean extracted bank name text
   * @param {string} rawName - Raw extracted name
   * @returns {string} Cleaned bank name
   */
  cleanBankName(rawName) {
    return rawName
      .replace(/^\d+\.\d+%.*?AER.*?interest\s*/i, '') // Remove rate prefixes
      .replace(/\s*Min deposit.*$/i, '') // Remove deposit suffixes
      .replace(/\s*Find out more.*$/i, '') // Remove UI text
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  /**
   * Validate if extracted text is a reasonable bank name
   * @param {string} name - Name to validate
   * @returns {boolean} True if valid bank name
   */
  isValidBankName(name) {
    if (!name || typeof name !== 'string') return false;
    
    const cleanName = name.trim();
    
    // Too short or empty
    if (cleanName.length < 3) return false;
    
    // Contains only numbers, percentages, or currency
    if (/^[\d\s%£$€.,]+$/.test(cleanName)) return false;
    
    // Common UI text that isn't a bank name
    const invalidNames = [
      'Find out more', 'Details', 'Apply now', 'Total interest',
      'Min deposit', 'AER interest', 'Fixed Deposit', 'Unknown',
      'Category'
    ];
    
    if (invalidNames.some(invalid => 
      cleanName.toLowerCase().includes(invalid.toLowerCase())
    )) {
      return false;
    }
    
    // Looks reasonable
    return true;
  }

  async extractFixedTermProducts() {
    this.logger.progress('Extracting Fixed Term products...');
    
    // Click on Fixed Term tab
    const fixedTermClicked = await this.page.evaluate(() => {
      const tabElements = document.querySelectorAll('.tab');
      for (const tab of tabElements) {
        if (tab.textContent?.toLowerCase().includes('fixed')) {
          if (window.ajbellDebug) console.log('AJ Bell: Clicking Fixed Term tab:', tab.textContent);
          tab.click();
          return true;
        }
      }
      return false;
    });

    if (fixedTermClicked) {
      this.logger.debug('Fixed Term tab clicked');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Extract products from current view
    const fixedTermProducts = await this.page.evaluate(() => {
      const products = [];
      const cardElements = document.querySelectorAll('.card');
      
      for (let i = 0; i < cardElements.length; i++) {
        const card = cardElements[i];
        const cardText = card.textContent?.trim();
        
        if (!cardText || cardText.length < 10) continue;
        
        // Skip category cards
        if (cardText.includes('View accounts')) continue;

        try {
          // Extract AER rate
          const aerMatch = cardText.match(/(\d+\.\d+)%\s*AER/i);
          const aer = aerMatch ? aerMatch[1] + '%' : '';
          
          if (!aer) continue;

          // Extract term information
          let term = '';
          let termMonths = null;
          let termCategory = '';
          
          const termMatch = cardText.match(/(\d+)\s*(month|year)s?\s*Fixed\s*Deposit\s*Term/i);
          if (termMatch) {
            const value = parseInt(termMatch[1]);
            const unit = termMatch[2].toLowerCase();
            
            if (unit === 'month') {
              term = `${value} month${value > 1 ? 's' : ''} Fixed Deposit Term`;
              termMonths = value;
            } else if (unit === 'year') {
              term = `${value} year${value > 1 ? 's' : ''} Fixed Deposit Term`;
              termMonths = value * 12;
            }
            
            // Categorize terms
            if (termMonths <= 6) {
              termCategory = 'short_term';
            } else if (termMonths <= 18) {
              termCategory = 'medium_term';
            } else if (termMonths <= 36) {
              termCategory = 'long_term';
            } else {
              termCategory = 'very_long_term';
            }
          }

          // DYNAMIC bank name extraction - no more hardcoded patterns!
          let bankName = '';
          
          // Strategy 1: Try to find bank name in specific DOM elements
          const bankNameSelectors = ['h3', 'h4', 'h5', 'strong', 'b', '.title', '.heading', '[class*="title"]', '[class*="heading"]'];
          for (const selector of bankNameSelectors) {
            const element = card.querySelector(selector);
            if (element) {
              const text = element.textContent?.trim();
              // Improved validation to exclude UI elements and button text
              if (text && text.length > 3 && 
                  !/^\d+\.\d+%/.test(text) && 
                  !text.includes('Find out more') && 
                  !['Details', 'View', 'More', 'Info', 'Click', 'Button', 'About this bank'].includes(text) &&
                  !/^(view|more|info|click|button|details|about this bank)$/i.test(text)) {
                bankName = text;
                break;
              }
            }
          }
          
          // Strategy 2: Extract from condensed cardText using intelligent patterns
          if (!bankName) {
            // First try to extract from the condensed cardText (more reliable)
            // Fixed Term Pattern: "4.29% AERinterest1 year Fixed DepositTermAldermore Bank Plc£1,287.00..."
            // Notice Pattern: "4.65% AERinterest40 daysNoticeMonument Bank limited£0.00..."
            let bankNameMatch = cardText.match(/(?:Fixed\s*Deposit\s*Term)\s*([A-Za-z][^£\d]*?)\s*£/i);
            if (!bankNameMatch) {
              // Try notice account pattern: "40 daysNotice[BankName]£"
              bankNameMatch = cardText.match(/\d+\s*days\s*Notice\s*([A-Za-z][^£\d]*?)\s*£/i);
            }
            if (bankNameMatch) {
              let extractedName = bankNameMatch[1].trim();
              // Clean up common suffixes/prefixes and add proper spacing
              extractedName = extractedName
                .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase: "BankPlc" -> "Bank Plc"
                .replace(/^(of|the|from)\s+/i, '')
                .trim();
              if (extractedName.length > 3) {
                bankName = extractedName;
              }
            }
            
            // If no match in cardText, try parsing from full text lines
            if (!bankName) {
              const lines = cardText.split('\n').map(line => line.trim()).filter(line => line && line.length > 3);
              
              // Look for lines with bank indicators, prioritizing shorter lines (more likely to be names)
              const bankIndicators = /\b(Bank|Building Society|BS|Limited|Ltd|Plc|PLC)\b/i;
              const candidateLines = [];
              
              for (const line of lines) {
                // Skip obvious non-bank lines
                if (/^\d+\.\d+%/.test(line) || /^£[\d,]+/.test(line) || /^Total interest/i.test(line) || 
                    /^Find out more/i.test(line) || /^Min deposit/i.test(line) || line.length > 100) continue;
                
                if (bankIndicators.test(line)) {
                  candidateLines.push({line, length: line.length});
                }
              }
              
              // Sort by length (shorter is better for bank names)
              candidateLines.sort((a, b) => a.length - b.length);
              
              if (candidateLines.length > 0) {
                bankName = candidateLines[0].line.replace(/^\d+\.\d+%.*?interest\s*/i, '').replace(/\s*Min deposit.*$/i, '').trim();
              }
            }
          }

          // Extract minimum deposit
          const minDepositMatch = cardText.match(/Min deposit amount £([\d,]+)/i);
          const minDeposit = minDepositMatch ? minDepositMatch[1] : '';

          products.push({
            bankName: bankName || 'Unknown Bank',
            aer: aer,
            gross: aer,
            accountType: 'fixed_term',
            term: term,
            termMonths: termMonths,
            termCategory: termCategory,
            minDeposit: minDeposit,
            noticePeriod: '',
            noticePeriodDays: null,
            tabSource: 'fixed_term',
            cardIndex: i,
            cardText: cardText.substring(0, 100),
            scrapedAt: new Date().toISOString(),
            page: window.location.href,
            extractionMethod: 'ajbell'
          });
        } catch (error) {
          if (window.ajbellDebug) console.log('AJ Bell: Error processing fixed term card:', error);
        }
      }

      return products;
    });

    return fixedTermProducts;
  }

  async extractNoticeProducts() {
    this.logger.progress('Extracting Notice products...');
    
    // Click on Notice tab with proper event handling
    const noticeClickResult = await this.page.evaluate(() => {
      let clicked = false;
      
      // Try the anchor tag within the tab
      const tabLinks = document.querySelectorAll('.tabs a');
      for (const link of tabLinks) {
        if (link.textContent?.toLowerCase().includes('notice')) {
          if (window.ajbellDebug) console.log('AJ Bell: Clicking Notice tab link:', link.textContent);
          link.click();
          
          // Also dispatch a proper click event
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          link.dispatchEvent(clickEvent);
          
          clicked = true;
          break;
        }
      }
      
      return clicked;
    });

    if (noticeClickResult) {
      this.logger.debug('Notice tab clicked');
      // Wait longer for JavaScript to process the tab change
      await new Promise(resolve => setTimeout(resolve, 7000));
    } else {
      this.logger.warning('Could not find Notice tab');
      return [];
    }

    // Extract products from notice tab
    const noticeProducts = await this.page.evaluate(() => {
      const products = [];
      const cardElements = document.querySelectorAll('.card');
      
      for (let i = 0; i < cardElements.length; i++) {
        const card = cardElements[i];
        const cardText = card.textContent?.trim();
        
        if (!cardText || cardText.length < 10) continue;
        
        // Skip category cards
        if (cardText.includes('View accounts')) continue;

        try {
          // Extract AER rate
          const aerMatch = cardText.match(/(\d+\.\d+)%\s*AER/i);
          const aer = aerMatch ? aerMatch[1] + '%' : '';
          
          if (!aer) continue;

          // Extract notice period information
          let noticePeriod = '';
          let noticePeriodDays = null;
          let noticeCategory = '';
          
          const noticeMatch = cardText.match(/(\d+)\s*days?\s*Notice/i);
          if (noticeMatch) {
            const days = parseInt(noticeMatch[1]);
            noticePeriod = `${days} days Notice`;
            noticePeriodDays = days;
            
            // Categorize notice periods
            if (days <= 40) {
              noticeCategory = 'short_notice';
            } else if (days <= 95) {
              noticeCategory = 'medium_notice';
            } else {
              noticeCategory = 'long_notice';
            }
          }

          // DYNAMIC bank name extraction - no more hardcoded patterns!
          let bankName = '';
          
          // Strategy 1: Try to find bank name in specific DOM elements
          const bankNameSelectors = ['h3', 'h4', 'h5', 'strong', 'b', '.title', '.heading', '[class*="title"]', '[class*="heading"]'];
          for (const selector of bankNameSelectors) {
            const element = card.querySelector(selector);
            if (element) {
              const text = element.textContent?.trim();
              // Improved validation to exclude UI elements and button text
              if (text && text.length > 3 && 
                  !/^\d+\.\d+%/.test(text) && 
                  !text.includes('Find out more') && 
                  !['Details', 'View', 'More', 'Info', 'Click', 'Button', 'About this bank'].includes(text) &&
                  !/^(view|more|info|click|button|details|about this bank)$/i.test(text)) {
                bankName = text;
                break;
              }
            }
          }
          
          // Strategy 2: Extract from condensed cardText using intelligent patterns
          if (!bankName) {
            // First try to extract from the condensed cardText (more reliable)
            // Fixed Term Pattern: "4.29% AERinterest1 year Fixed DepositTermAldermore Bank Plc£1,287.00..."
            // Notice Pattern: "4.65% AERinterest40 daysNoticeMonument Bank limited£0.00..."
            let bankNameMatch = cardText.match(/(?:Fixed\s*Deposit\s*Term)\s*([A-Za-z][^£\d]*?)\s*£/i);
            if (!bankNameMatch) {
              // Try notice account pattern: "40 daysNotice[BankName]£"
              bankNameMatch = cardText.match(/\d+\s*days\s*Notice\s*([A-Za-z][^£\d]*?)\s*£/i);
            }
            if (bankNameMatch) {
              let extractedName = bankNameMatch[1].trim();
              // Clean up common suffixes/prefixes and add proper spacing
              extractedName = extractedName
                .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase: "BankPlc" -> "Bank Plc"
                .replace(/^(of|the|from)\s+/i, '')
                .trim();
              if (extractedName.length > 3) {
                bankName = extractedName;
              }
            }
            
            // If no match in cardText, try parsing from full text lines
            if (!bankName) {
              const lines = cardText.split('\n').map(line => line.trim()).filter(line => line && line.length > 3);
              
              // Look for lines with bank indicators, prioritizing shorter lines (more likely to be names)
              const bankIndicators = /\b(Bank|Building Society|BS|Limited|Ltd|Plc|PLC)\b/i;
              const candidateLines = [];
              
              for (const line of lines) {
                // Skip obvious non-bank lines
                if (/^\d+\.\d+%/.test(line) || /^£[\d,]+/.test(line) || /^Total interest/i.test(line) || 
                    /^Find out more/i.test(line) || /^Min deposit/i.test(line) || line.length > 100) continue;
                
                if (bankIndicators.test(line)) {
                  candidateLines.push({line, length: line.length});
                }
              }
              
              // Sort by length (shorter is better for bank names)
              candidateLines.sort((a, b) => a.length - b.length);
              
              if (candidateLines.length > 0) {
                bankName = candidateLines[0].line.replace(/^\d+\.\d+%.*?interest\s*/i, '').replace(/\s*Min deposit.*$/i, '').trim();
              }
            }
          }

          // Extract minimum deposit
          const minDepositMatch = cardText.match(/Min deposit amount £([\d,]+)/i);
          const minDeposit = minDepositMatch ? minDepositMatch[1] : '';

          // Determine account type from card content
          let actualAccountType = 'fixed_term'; // Default
          if (noticePeriodDays !== null) {
            actualAccountType = 'notice';
          } else if (cardText.includes('Fixed Deposit Term')) {
            actualAccountType = 'fixed_term';
          }

          products.push({
            bankName: bankName || 'Unknown Bank',
            aer: aer,
            gross: aer,
            accountType: actualAccountType,
            term: '',
            termMonths: null,
            minDeposit: minDeposit,
            noticePeriod: noticePeriod,
            noticePeriodDays: noticePeriodDays,
            noticeCategory: noticeCategory,
            tabSource: 'notice',
            cardIndex: i,
            cardText: cardText.substring(0, 100),
            scrapedAt: new Date().toISOString(),
            page: window.location.href,
            extractionMethod: 'ajbell'
          });
        } catch (error) {
          if (window.ajbellDebug) console.log('AJ Bell: Error processing notice card:', error);
        }
      }

      return products;
    });

    return noticeProducts;
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    verbose: false,
    headless: true
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
AJ Bell Scraper Usage:
  node ajbell-scraper.js [options]

Options:
  --verbose, -v      Enable verbose debug logging
  --visible          Run browser in visible mode (default: headless)
  --help, -h         Show this help message

Examples:
  node ajbell-scraper.js --verbose
  node ajbell-scraper.js --visible --verbose
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
  
  const scraper = new AJBellScraper({
    headless: options.headless,
    logLevel: options.verbose ? 'debug' : 'info',
    saveToFiles: true
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

export { AJBellScraper };
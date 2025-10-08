/**
 * HL Scraper V2 - Built using shared utilities
 * Hargreaves Lansdown savings rates scraper with database integration
 */

import { ScraperBase } from '../core/scraper-base.js';
import { parsePercentage } from '../parsers/common-parser.js';

class HLScraper extends ScraperBase {
  constructor(options = {}) {
    super('Hargreaves Lansdown', {
      outputDir: './data/hl',
      timeout: 120000, // Extended timeout for dynamic content loading
      ...options
    });
  }

  getBaseUrl() {
    return 'https://www.hl.co.uk/savings/latest-savings-rates-and-products';
  }

  /**
   * Override scraper identifier for metadata header
   * @returns {Object} - { source: string, method: string }
   */
  getScraperIdentifier() {
    return {
      source: 'hargreaves-lansdown',
      method: 'hargreaves-lansdown-scraper'
    };
  }

  async customInitialization() {
    // HL-specific initialization if needed
  }

  async customNavigation() {
    const page = await super.customNavigation();

    this.logger.progress('Loading Hargreaves Lansdown data...');

    // Wait for initial page load
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Wait for loaders to disappear (sign that AJAX is complete)
    try {
      await page.waitForSelector('.sn-loader', { hidden: true, timeout: 60000 });
      this.logger.debug('Loader disappeared - content should be ready');
    } catch (error) {
      this.logger.warning('Loader timeout, checking for content anyway');
    }

    // Extended wait for dynamic content to fully load
    const extendedWaitTime = this.browserManager.headless ? 15000 : 10000;
    await new Promise(resolve => setTimeout(resolve, extendedWaitTime));

    // Try to wait for specific content indicators with shorter timeout
    const contentFound = await this.waitForContent('.sn-panel-rate', 30000);
    if (contentFound) {
      this.logger.debug('Rate content detected');
    } else {
      this.logger.warning('Content timeout - checking alternatives...');
      // Try alternative selectors
      const altContent = await this.waitForContent('.sn-panel-saving', 15000);
      if (altContent) {
        this.logger.debug('Alternative content structure detected');
      }
    }

    // Additional wait to ensure all AJAX calls complete
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Scroll to ensure all content is loaded - with retry logic
    try {
      await this.scrollToLoad();
      // Wait after scroll for any lazy loading
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      this.logger.warning('Page scroll failed, continuing...');
    }

    return page;
  }

  async extractRateData() {
    // Removed duplicate - already logged in scraper-base.js

    // Extract raw data using retry logic
    let allExtractedProducts;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        this.logger.debug(`Extraction attempt ${attempt}/3...`);
        allExtractedProducts = await this.extractRateDataWithRetry();
        break;
      } catch (error) {
        if (error.message.includes('detached Frame') && attempt < 3) {
          this.logger.warning(`Frame detached on attempt ${attempt}, retrying...`);
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 5000));
          // Get fresh page reference
          this.page = this.getPage();
          continue;
        }
        throw error;
      }
    }

    // Count unknown banks for quality reporting
    const unknownBanks = allExtractedProducts.filter(product => !product.bankName || product.bankName.trim() === '' || product.bankName === 'Unknown Bank').length;
    this.logger.debug(`Unknown banks: ${unknownBanks}/${allExtractedProducts.length} (${((unknownBanks/allExtractedProducts.length)*100).toFixed(1)}% extraction failure rate)`);

    // Process through new four-tier pipeline
    const pipelineResults = await this.processWithNewPipeline(allExtractedProducts);

    // Update results for compatibility
    this.results.ratesFound = pipelineResults.rawProducts;
    this.results.processedProducts = pipelineResults.databaseProducts;

    return pipelineResults;
  }

  async extractRateDataWithRetry() {
    const page = this.getPage();
    
    // Verify page is still attached
    try {
      await page.evaluate(() => document.readyState);
    } catch (error) {
      throw new Error('Page detached, cannot extract data');
    }
    
    // First check page structure
    const pageInfo = await page.evaluate(() => {
      const savingPanels = document.querySelectorAll('.sn-panel-saving');
      const sectionHeaders = document.querySelectorAll('.sn-panel-accordion-title');
      const rates = document.querySelectorAll('.sn-panel-rate');
      const loaders = document.querySelectorAll('.sn-loader');

      // Check for any "unavailable" or error messages
      const unavailableText = document.body.textContent?.toLowerCase().includes('unavailable') || false;
      const errorMessages = Array.from(document.querySelectorAll('[class*="error"], [class*="fail"]')).map(el => el.textContent?.trim()).filter(t => t);

      const allHeaders = Array.from(sectionHeaders).map(h => h.textContent?.trim());
      const isaHeaders = allHeaders.filter(h => h && h.toLowerCase().includes('isa'));

      // Debug: Get all elements that might contain savings data
      const debugElements = {
        snPanel: document.querySelectorAll('[class*="sn-panel"]').length,
        ratesContainer: document.querySelectorAll('[class*="rates"]').length,
        savingsContainer: document.querySelectorAll('[class*="saving"]').length,
        accordion: document.querySelectorAll('[class*="accordion"]').length,
        // Get actual class names of sn-panel elements
        snPanelClasses: Array.from(document.querySelectorAll('[class*="sn-panel"]')).slice(0, 10).map(el => el.className),
        // Look for any elements with percentages (filter out CSS and scripts)
        percentageElements: Array.from(document.querySelectorAll('*')).filter(el =>
          el.textContent && el.textContent.includes('%') && el.children.length === 0 &&
          el.tagName !== 'STYLE' && el.tagName !== 'SCRIPT').slice(0, 10).map(el => ({
            tagName: el.tagName,
            className: el.className,
            text: el.textContent.trim().substring(0, 100)
          })),
        // Check for any messages about unavailability, loading, etc.
        messageElements: Array.from(document.querySelectorAll('*')).filter(el =>
          el.textContent && (el.textContent.toLowerCase().includes('unavailable') ||
                            el.textContent.toLowerCase().includes('loading') ||
                            el.textContent.toLowerCase().includes('error') ||
                            el.textContent.toLowerCase().includes('rates'))).slice(0, 10).map(el => ({
            tagName: el.tagName,
            className: el.className,
            text: el.textContent.trim().substring(0, 100)
          })),
        // Look for section headers and table structure
        tableHeaders: Array.from(document.querySelectorAll('th, .table-header, [class*="header"]')).map(el => ({
          tagName: el.tagName,
          className: el.className,
          text: el.textContent?.trim()
        })),
        sectionTitles: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(el =>
          el.textContent && (el.textContent.toLowerCase().includes('isa') ||
                            el.textContent.toLowerCase().includes('fixed') ||
                            el.textContent.toLowerCase().includes('easy') ||
                            el.textContent.toLowerCase().includes('notice') ||
                            el.textContent.toLowerCase().includes('access') ||
                            el.textContent.toLowerCase().includes('term'))).map(el => ({
            tagName: el.tagName,
            className: el.className,
            text: el.textContent?.trim()
          }))
      };

      return {
        savingPanelCount: savingPanels.length,
        sectionHeaderCount: sectionHeaders.length,
        rateCount: rates.length,
        loaderCount: loaders.length,
        hasSavingPanels: savingPanels.length > 0,
        hasSectionHeaders: sectionHeaders.length > 0,
        isaHeaders: isaHeaders,
        allHeaders: allHeaders,
        unavailableText: unavailableText,
        errorMessages: errorMessages,
        debugElements: debugElements,
        pageTitle: document.title,
        bodyText: document.body.textContent?.substring(0, 500) + '...' // First 500 chars for debugging
      };
    });
    
    this.logger.debug(`Page info: ${pageInfo.savingPanelCount} panels, ${pageInfo.sectionHeaderCount} headers, ${pageInfo.rateCount} rates`);
    this.logger.debug(`ISA headers: ${pageInfo.isaHeaders.length > 0 ? pageInfo.isaHeaders.join(', ') : 'None'}`);
    this.logger.debug(`Loaders still visible: ${pageInfo.loaderCount}`);
    this.logger.debug(`Debug elements: ${JSON.stringify(pageInfo.debugElements)}`);
    this.logger.debug(`Page title: ${pageInfo.pageTitle}`);
    this.logger.debug(`Unavailable text: ${pageInfo.unavailableText}`);
    if (pageInfo.errorMessages.length > 0) {
      this.logger.debug(`Error messages: ${pageInfo.errorMessages.join(', ')}`);
    }
    this.logger.debug(`Body text sample: ${pageInfo.bodyText}`);

    // Check if we found actual rate data in tables (look for TD elements with percentages)
    const percentageElements = pageInfo.debugElements?.percentageElements || [];
    this.logger.debug(`Using debugElements.percentageElements: ${percentageElements.length} elements found`);

    const tdElements = percentageElements.filter(el => el.tagName === 'TD');
    const hasSavingsRates = tdElements.some(el => el.text && el.text.match(/^\d+\.\d+%$/));

    this.logger.debug(`TD elements filtered: ${JSON.stringify(tdElements)}`);
    this.logger.debug(`Has savings rates: ${hasSavingsRates}`);

    // Check if we have any TD elements with percentages
    if (pageInfo.rateCount === 0 && hasSavingsRates) {
      this.logger.info('Found rates in table format, using table extraction method...');
      return await this.extractTableBasedRates();
    }

    if (!pageInfo.hasSectionHeaders && pageInfo.hasSavingPanels) {
      this.logger.warning('Section headers not found, using fallback method...');
      return await this.extractRateDataFallback();
    }
    
    const extractedData = await page.evaluate(() => {
      const products = [];
      const sectionHeaders = document.querySelectorAll('.sn-panel-accordion-title');

      for (let i = 0; i < sectionHeaders.length; i++) {
        const header = sectionHeaders[i];
        const sectionText = header.textContent?.trim() || '';

        if (window.hlDebug) console.log(`[Debug] Processing section ${i+1}: "${sectionText}"`);

        // Determine account type from section header
        let accountType = 'easy_access';
        const sectionLower = sectionText.toLowerCase();
        if (sectionLower.includes('fixed')) {
          accountType = 'fixed_term';
        } else if (sectionLower.includes('notice')) {
          accountType = 'notice';
        } else if (sectionLower.includes('isa')) {
          accountType = 'cash_isa';
        } else if (sectionLower.includes('limited access')) {
          accountType = 'limited_access';
        } else if (sectionLower.includes('month') || sectionLower.includes('year')) {
          accountType = 'fixed_term';
        }

        // Extract term information from section header
        let termMonths = null;
        let noticePeriod = null;

        const monthMatch = sectionText.match(/(\d+)\s*months?/i);
        if (monthMatch) {
          termMonths = parseInt(monthMatch[1]);
        }

        const yearMatch = sectionText.match(/(\d+)\s*years?/i);
        if (yearMatch) {
          termMonths = parseInt(yearMatch[1]) * 12;
        }

        const dayMatch = sectionText.match(/(\d+)\s*days?/i);
        if (dayMatch) {
          noticePeriod = parseInt(dayMatch[1]);
        }

        // Find the accordion content area for this section
        const accordionContent = header.closest('.sn-panel-accordion')?.querySelector('.sn-panel-accordion-content');
        if (!accordionContent) continue;

        const sectionProducts = [];
        const savingPanels = accordionContent.querySelectorAll('.sn-panel-saving');

        for (const panel of savingPanels) {
          // Get bank/product name from h3
          const bankNameEl = panel.querySelector('h3');
          if (!bankNameEl) continue;

          const bankName = bankNameEl.textContent?.trim() || '';
          if (!bankName) continue;

          // Get rates from .sn-panel-rate elements
          const rateElements = panel.querySelectorAll('.sn-panel-rate');
          const rateSuffixElements = panel.querySelectorAll('.sn-panel-rate-suffix');

          let aer = '';
          let gross = '';
          let minDeposit = '';

          for (let j = 0; j < rateElements.length; j++) {
            const rateEl = rateElements[j];
            const suffixEl = rateSuffixElements[j];

            const rateText = rateEl.textContent?.trim() || '';
            const suffixText = suffixEl?.textContent?.trim() || '';

            if (rateText.includes('%')) {
              if (!aer) {
                aer = rateText;
                // Check if suffix contains both AER and Gross info
                if (suffixText.includes('|')) {
                  const parts = suffixText.split('|');
                  if (parts.length >= 2) {
                    gross = rateText; // Same rate for both if shown as "X.XX% | AER | Gross"
                  }
                } else {
                  gross = rateText; // Default to same rate
                }
              }
            }
          }

          // Look for minimum deposit information in the panel
          const allText = panel.textContent?.toLowerCase() || '';
          if (allText.includes('minimum') || allText.includes('£')) {
            const minDepositMatch = panel.textContent?.match(/minimum[^£]*£([\d,]+)/i) ||
                                   panel.textContent?.match(/£([\d,]+)[^£]*minimum/i);
            if (minDepositMatch) {
              minDeposit = `£${minDepositMatch[1]}`;
            }
          }

          if (bankName && aer) {
            sectionProducts.push({
              bankName: bankName,
              aer: aer,
              gross: gross || aer,
              accountType: accountType,
              term: termMonths ? `${termMonths} months` : '',
              termMonths: termMonths,
              minDeposit: minDeposit,
              noticePeriod: noticePeriod ? `${noticePeriod} days` : '',
              noticePeriodDays: noticePeriod,
              sectionHeader: sectionText,
              scrapedAt: new Date().toISOString(),
              page: window.location.href,
              extractionMethod: 'hl-new-selectors',
              interestPayment: ''
            });
          }
        }

        if (window.hlDebug) console.log(`[Debug] Section "${sectionText}": ${sectionProducts.length} products`);
        products.push(...sectionProducts);
      }

      return products;
    });
    
    // Count unknown banks for quality reporting
    const unknownBanks = extractedData.filter(product => !product.bankName || product.bankName.trim() === '' || product.bankName === 'Unknown Bank').length;
    
    this.logger.info(`Hargreaves Lansdown: ${extractedData.length} products extracted, ${unknownBanks} failed`);
    this.logger.debug(`Extraction failure rate: ${((unknownBanks/extractedData.length)*100).toFixed(1)}%`);
    return extractedData;
  }

  async extractRateDataFallback() {
    this.logger.warning('Using fallback extraction method...');

    const page = this.getPage();

    const extractedData = await page.evaluate(() => {
      const products = [];
      const containers = document.querySelectorAll('.sn-panel-saving, .sn-panel-rates, [class*="panel"]');

      for (const container of containers) {
        const bankNameSelectors = [
          'h3',
          '.sn-panel-rate-title',
          '[class*="heading"]',
          '[class*="title"]',
          '[class*="name"]'
        ];

        let bankName = '';
        for (const selector of bankNameSelectors) {
          const nameEl = container.querySelector(selector);
          if (nameEl && nameEl.textContent?.trim()) {
            bankName = nameEl.textContent.trim();
            break;
          }
        }

        if (!bankName) continue;

        const rateElements = container.querySelectorAll('.sn-panel-rate, [class*="rate"], [class*="percentage"]');

        let aer = '';
        let gross = '';
        let minDeposit = '';

        for (const rateEl of rateElements) {
          const text = rateEl.textContent?.trim() || '';

          if (text.includes('%') && !aer) {
            aer = text;
          } else if (text.includes('%') && aer && !gross) {
            gross = text;
          } else if (text.includes('£') || text.includes('minimum')) {
            minDeposit = text;
          }
        }

        // Look for minimum deposit in container text
        if (!minDeposit) {
          const allText = container.textContent?.toLowerCase() || '';
          if (allText.includes('minimum') || allText.includes('£')) {
            const minDepositMatch = container.textContent?.match(/minimum[^£]*£([\d,]+)/i) ||
                                   container.textContent?.match(/£([\d,]+)[^£]*minimum/i);
            if (minDepositMatch) {
              minDeposit = `£${minDepositMatch[1]}`;
            }
          }
        }

        if (bankName && aer) {
          products.push({
            bankName: bankName,
            aer: aer,
            gross: gross || aer,
            accountType: 'easy_access',
            term: '',
            termMonths: null,
            minDeposit: minDeposit,
            noticePeriod: '',
            noticePeriodDays: null,
            sectionHeader: '',
            scrapedAt: new Date().toISOString(),
            page: window.location.href,
            extractionMethod: 'hl-fallback-new',
            interestPayment: ''
          });
        }
      }

      return products;
    });
    
    // Count unknown banks for quality reporting
    const unknownBanks = extractedData.filter(product => !product.bankName || product.bankName.trim() === '' || product.bankName === 'Unknown Bank').length;
    
    this.logger.info(`Hargreaves Lansdown: ${extractedData.length} products extracted, ${unknownBanks} failed`);
    this.logger.debug(`Extraction failure rate: ${((unknownBanks/extractedData.length)*100).toFixed(1)}%`);
    return extractedData;
  }

  async extractTableBasedRates() {
    this.logger.info('Extracting rates from table format...');

    const page = this.getPage();

    const extractedData = await page.evaluate(() => {
      const products = [];

      // Look for table rows containing rate information
      const tableRows = document.querySelectorAll('tr, [class*="row"]');

      for (const row of tableRows) {
        // Find cells with percentage values
        const rateCells = row.querySelectorAll('td.p-3.font-normal, [class*="rate"], [class*="percentage"]');
        const allCells = row.querySelectorAll('td, [class*="cell"]');

        let bankName = '';
        let aer = '';
        let gross = '';
        let minDeposit = '';
        let accountType = 'easy_access';
        let term = '';
        let termMonths = null;

        // Try to find bank name and term in the row
        for (const cell of allCells) {
          const cellText = cell.textContent?.trim() || '';

          // Look for term information (month, year, day patterns)
          if (cellText.match(/\d+\s*(month|year|day)/i) || cellText.toLowerCase().includes('easy access')) {
            term = cellText;
          }
          // Skip cells that are just percentages or numbers for bank name
          else if (cellText && !cellText.includes('%') && cellText.length > 3 &&
              !cellText.match(/^[\d.,£\s]+$/) &&
              !cellText.toLowerCase().includes('minimum') &&
              !cellText.match(/\d+\s*(month|year|day)/i)) {
            if (!bankName) {
              bankName = cellText;
            }
          }
        }

        // Extract rates from percentage cells
        for (const cell of rateCells) {
          const cellText = cell.textContent?.trim() || '';
          if (cellText.includes('%')) {
            if (!aer) {
              aer = cellText;
            } else if (!gross) {
              gross = cellText;
            }
          }
        }

        // Look for minimum deposit information in the row
        const rowText = row.textContent?.toLowerCase() || '';
        if (rowText.includes('minimum') || rowText.includes('£')) {
          const minDepositMatch = row.textContent?.match(/minimum[^£]*£([\d,]+)/i) ||
                                 row.textContent?.match(/£([\d,]+)[^£]*minimum/i) ||
                                 row.textContent?.match(/£([\d,]+)/);
          if (minDepositMatch) {
            minDeposit = `£${minDepositMatch[1]}`;
          }
        }

        // Determine account type from term field
        if (term) {
          const termLower = term.toLowerCase();
          if (termLower.includes('easy access')) {
            accountType = 'easy_access';
            termMonths = null;
          } else if (termLower.includes('month') || termLower.includes('year')) {
            accountType = 'fixed_term';
            // Parse term duration
            const monthMatch = term.match(/(\d+)\s*months?/i);
            const yearMatch = term.match(/(\d+)\s*years?/i);
            if (monthMatch) {
              termMonths = parseInt(monthMatch[1]);
            } else if (yearMatch) {
              termMonths = parseInt(yearMatch[1]) * 12;
            }
          } else if (termLower.includes('day')) {
            accountType = 'notice';
            // Parse notice period
            const dayMatch = term.match(/(\d+)\s*days?/i);
            if (dayMatch) {
              // Convert days to notice period, but keep termMonths null for notice accounts
              termMonths = null;
            }
          }
        }

        // Check if this might be an ISA from context
        const contextText = row.textContent?.toLowerCase() || '';
        if (contextText.includes('isa')) {
          accountType = 'cash_isa';
        }

        // Only add if we have both a bank name and a rate
        if (bankName && aer && bankName.length > 1) {
          products.push({
            bankName: bankName,
            aer: aer,
            gross: gross || aer,
            accountType: accountType,
            term: term || '',
            termMonths: termMonths,
            minDeposit: minDeposit,
            noticePeriod: '',
            noticePeriodDays: null,
            sectionHeader: '',
            scrapedAt: new Date().toISOString(),
            page: window.location.href,
            extractionMethod: 'hl-table-based',
            interestPayment: ''
          });
        }
      }

      return products;
    });

    // Count unknown banks for quality reporting
    const unknownBanks = extractedData.filter(product => !product.bankName || product.bankName.trim() === '' || product.bankName === 'Unknown Bank').length;

    this.logger.info(`Hargreaves Lansdown: ${extractedData.length} products extracted, ${unknownBanks} failed`);
    this.logger.debug(`Extraction failure rate: ${((unknownBanks/extractedData.length)*100).toFixed(1)}%`);
    return extractedData;
  }

  // Custom saveToDb method removed - now handled by new pipeline in scraper-base.js

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
Hargreaves Lansdown Scraper Usage:
  node hl-scraper.js [options]

Options:
  --verbose, -v      Enable verbose debug logging
  --visible          Run browser in visible mode (default: headless)
  --help, -h         Show this help message

Examples:
  node hl-scraper.js --verbose
  node hl-scraper.js --visible --verbose
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
  
  const scraper = new HLScraper({
    headless: options.headless,
    logLevel: options.verbose ? 'debug' : 'info'
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

export { HLScraper };
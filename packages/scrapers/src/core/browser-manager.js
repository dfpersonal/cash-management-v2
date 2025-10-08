/**
 * Browser Manager - Centralized browser operations for all scrapers
 * Extracted from flagstone-scraper.js to ensure consistency
 */

import puppeteer from 'puppeteer';

export class BrowserManager {
  constructor(options = {}) {
    this.headless = options.headless !== false; // Default to headless
    this.timeout = options.timeout || 30000;
    this.browser = null;
    this.page = null;
  }

  async initialize() {
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
    
    return this.page;
  }

  async navigateToPage(url, options = {}) {
    const navigationOptions = {
      waitUntil: 'networkidle0',
      timeout: this.timeout,
      ...options
    };

    console.log(`Navigating to ${url}... (timeout: ${navigationOptions.timeout}ms)`);
    try {
      await this.page.goto(url, navigationOptions);
    } catch (error) {
      if (error.name === 'TimeoutError') {
        console.log(`Navigation timeout exceeded, trying with 'domcontentloaded' instead...`);
        // Fallback with less strict wait condition
        await this.page.goto(url, {
          ...navigationOptions,
          waitUntil: 'domcontentloaded',
          timeout: navigationOptions.timeout + 30000 // Extra 30 seconds
        });
      } else {
        throw error;
      }
    }
    
    return this.page;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  // Helper method to add console logging from browser
  enableConsoleLogging(filter = null) {
    if (!this.page) return;
    
    this.page.on('console', (msg) => {
      if (!filter || filter(msg.text())) {
        console.log('Browser:', msg.text());
      }
    });
  }

  // Helper method for common waiting patterns
  async waitForContent(selector, timeout = null) {
    const waitTimeout = timeout || this.timeout;
    
    try {
      await this.page.waitForSelector(selector, { timeout: waitTimeout });
      console.log(`Content detected: ${selector}`);
      return true;
    } catch (e) {
      console.log(`Timeout waiting for: ${selector}`);
      return false;
    }
  }

  // Helper method for scrolling to load content
  async scrollToLoad(delay = 3000) {
    console.log('Scrolling to load content...');
    try {
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(resolve => setTimeout(resolve, delay));
      
      await this.page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      if (error.message.includes('detached Frame')) {
        console.log('Page detached during scrolling, skipping scroll...');
        return;
      }
      throw error;
    }
  }

  // Refresh page context when detached
  async refreshPage() {
    console.log('Refreshing page context...');
    if (this.page) {
      try {
        await this.page.close();
      } catch (error) {
        // Ignore errors when closing detached page
      }
    }
    
    // Check if browser is still connected
    if (!this.browser || !this.browser.isConnected()) {
      await this.cleanup();
      await this.initialize();
      return this.page;
    }
    
    // Create new page
    try {
      this.page = await this.browser.newPage();
      
      // Set viewport for consistent rendering
      await this.page.setViewport({ width: 1920, height: 1080 });
      
      // Set user agent to avoid detection
      await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      return this.page;
    } catch (error) {
      // If creating a new page fails, reinitialize the entire browser
      await this.cleanup();
      await this.initialize();
      return this.page;
    }
  }

  // Get current page instance
  getPage() {
    return this.page;
  }

  // Get current browser instance
  getBrowser() {
    return this.browser;
  }
}
/**
 * Data Normalizer - Convert any scraper output to standard schema
 * Part of the comprehensive scraper deduplication implementation
 */

import { PlatformNormalizer } from './platform-normalizer.js';

export class DataNormalizer {
  constructor(databaseManager = null) {
    this.platformNormalizer = databaseManager ? new PlatformNormalizer(databaseManager) : null;
  }

  /**
   * Initialize the normalizer (must be called before use if using platform normalization)
   */
  async initialize() {
    if (this.platformNormalizer) {
      await this.platformNormalizer.initialize();
    }
  }
  /**
   * Convert any scraper output to standard schema
   * @param {Array} rawData - Raw scraped data
   * @param {string} scraperType - 'ajbell', 'hl', 'flagstone', 'moneyfacts'
   * @returns {Array} Normalized data with standard schema
   */
  async normalize(rawData, scraperType) {
    if (!Array.isArray(rawData)) {
      throw new Error('Raw data must be an array');
    }

    const normalizedItems = [];
    for (const item of rawData) {
      const normalized = await this.normalizeItem(item, scraperType);
      normalizedItems.push(normalized);
    }
    return normalizedItems;
  }

  async normalizeItem(item, scraperType) {
    // Extract raw platform first
    const rawPlatform = this.extractPlatform(item, scraperType);
    
    // Normalize platform if platform normalizer is available
    let platformInfo = null;
    if (this.platformNormalizer) {
      platformInfo = await this.platformNormalizer.normalize(rawPlatform, scraperType);
    }

    const normalized = {
      // Standard schema
      bankName: this.extractBankName(item, scraperType),
      platform: platformInfo ? platformInfo.canonical : rawPlatform,
      rawPlatform: rawPlatform, // Always preserve original
      accountType: this.extractAccountType(item, scraperType),
      aerRate: this.extractAERRate(item, scraperType),
      grossRate: this.extractGrossRate(item, scraperType),
      termMonths: this.extractTermMonths(item, scraperType),
      noticePeriodDays: this.extractNoticePeriodDays(item, scraperType),
      minDeposit: this.extractMinDeposit(item, scraperType),
      maxDeposit: this.extractMaxDeposit(item, scraperType),
      
      // Additional fields
      fscsProtected: this.extractFSCSProtected(item, scraperType),
      interestPaymentFrequency: this.extractInterestPaymentFrequency(item, scraperType),
      applyByDate: this.extractApplyByDate(item, scraperType),
      specialFeatures: this.extractSpecialFeatures(item, scraperType),
      
      // Metadata - scraperType removed since it's now in metadata header
      scrapedAt: new Date().toISOString(),
      originalData: item // Preserve original for debugging
    };

    return normalized;
  }

  // Scraper-specific extraction methods
  extractBankName(item, scraperType) {
    switch (scraperType) {
      case 'AJBell':
        return item.bankName || item.bank_name || item.provider || 'Unknown Bank';
      case 'moneyfacts':
        return item.parsedBankName || item.bankName || item.provider || 'Unknown Bank';
      case 'Hargreaves Lansdown':
        return item.providerName || item.bankName || item.provider || 'Unknown Bank';
      case 'Flagstone':
        return item.bankName || item.provider || 'Unknown Bank';
      default:
        return item.bankName || item.bank_name || item.provider || 'Unknown Bank';
    }
  }

  extractPlatform(item, scraperType) {
    switch (scraperType) {
      case 'AJBell':
        return 'AJBell';
      case 'moneyfacts':
        // MoneyFacts aggregates multiple platforms, check for parsed platform
        return item.parsedPlatform || item.platform || 'direct';
      case 'Hargreaves Lansdown':
        return 'Hargreaves Lansdown';
      case 'Flagstone':
        return 'Flagstone';
      default:
        return item.platform || 'direct';
    }
  }

  extractAccountType(item, scraperType) {
    switch (scraperType) {
      case 'AJBell':
        return this.normalizeAccountType(item.accountType || item.account_type || item.type);
      case 'moneyfacts':
        // MoneyFacts has misclassified accounts - use originalWebsiteTitle to override
        const title = (item.originalWebsiteTitle || '').toLowerCase();

        // Check for instant/easy access indicators in title
        if (title.includes('instant access') ||
            title.includes('easy access') ||
            title.includes('easy saver') ||
            title.includes('instant saver')) {
          return 'easy_access';
        }

        // Check for notice account indicators in title
        if (title.includes('notice') ||
            (title.includes('day') && (title.includes('account') || title.includes('saver')))) {
          return 'notice';
        }

        // Check for fixed term indicators in title
        if (title.includes('fixed') ||
            title.includes('bond') ||
            title.includes('term')) {
          return 'fixed_term';
        }

        // If page-based classification indicates notice but title doesn't support it, reclassify to easy_access
        const pageType = item.accountType || item.account_type || item.type || item.category;
        if (pageType === 'notice' && !title.includes('notice') && !title.includes('day')) {
          return 'easy_access';
        }

        // Fallback to page-based classification
        return this.normalizeAccountType(pageType);
      case 'Hargreaves Lansdown':
        return this.normalizeAccountType(item.accountType || item.account_type || item.type || item.category);
      case 'Flagstone':
        // Flagstone stores type info in 'term' field: "Fixed 12 months", "Notice 95 days", "Instant access"
        const termStr = (item.term || '').toLowerCase();
        if (termStr.includes('fixed')) return 'fixed_term';
        if (termStr.includes('instant')) return 'easy_access';
        if (termStr.includes('notice')) return 'notice';
        return this.normalizeAccountType(item.accountType || item.account_type || item.type);
      default:
        return this.normalizeAccountType(item.accountType || item.account_type || item.type || 'unknown');
    }
  }

  normalizeAccountType(rawType) {
    if (!rawType) return 'unknown';
    
    const typeStr = rawType.toLowerCase();
    
    // Easy access variants
    if (typeStr.includes('easy') || typeStr.includes('instant')) {
      return 'easy_access';
    }
    
    // Fixed term variants
    if (typeStr.includes('fixed') || typeStr.includes('term') || 
        typeStr.includes('deposit') || typeStr.includes('bond')) {
      return 'fixed_term';
    }
    
    // Notice/limited access variants
    if (typeStr.includes('notice') || typeStr.includes('limited') || 
        typeStr.includes('restricted')) {
      return 'notice';
    }
    
    // Cash ISA variants
    if (typeStr.includes('isa')) {
      return 'cash_isa';
    }
    
    return typeStr.replace(/[^a-z0-9]/g, '_');
  }

  extractAERRate(item, scraperType) {
    let rate;
    switch (scraperType) {
      case 'AJBell':
        // AJ Bell uses 'aer' field with percentage string like "3.85%"
        rate = item.aer || item.aerRate || item.aer_rate || item.rate;
        break;
      case 'moneyfacts':
        rate = item.aer || item.aerRate || item.rate;
        break;
      case 'Hargreaves Lansdown':
        rate = item.aer || item.aerRate || item.rate;
        break;
      case 'Flagstone':
        rate = item.aer || item.aerRate || item.rate;
        break;
      default:
        rate = item.aer || item.aerRate || item.aer_rate || item.rate;
    }
    return this.parseRate(rate);
  }

  extractGrossRate(item, scraperType) {
    const rate = item.gross || item.grossRate || item.gross_rate;
    return this.parseRate(rate);
  }

  parseRate(rate) {
    if (typeof rate === 'number') return rate;
    if (typeof rate === 'string' && rate.trim() !== '') {
      // Remove % symbol, spaces, and other non-numeric characters except decimal points
      const cleaned = rate.replace(/[%\s,£$€]/g, '').trim();
      if (cleaned === '') return null;
      
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  extractTermMonths(item, scraperType) {
    // Enhanced extraction for MoneyFacts using title
    if (scraperType === 'moneyfacts' && item.originalWebsiteTitle) {
      const title = item.originalWebsiteTitle;

      // Try to extract from existing scraper data first
      if (item.termMonths && item.termMonths !== null && typeof item.termMonths === 'number') {
        return item.termMonths;
      }

      // Extract from title patterns
      const patterns = [
        /(\d+)\s*[Mm]onth/,
        /(\d+)\s*[Yy]ear/
      ];

      for (const pattern of patterns) {
        const match = title.match(pattern);
        if (match) {
          const value = parseInt(match[1]);
          // Check if it's years
          if (pattern.toString().includes('[Yy]ear')) {
            return value * 12;
          }
          return value;
        }
      }

      // Try to extract from date in parentheses like "(31.10.2027)"
      const dateMatch = title.match(/\((\d{1,2})\.(\d{1,2})\.(\d{4})\)/);
      if (dateMatch) {
        const endYear = parseInt(dateMatch[3]);
        const endMonth = parseInt(dateMatch[2]);
        const endDay = parseInt(dateMatch[1]);
        const endDate = new Date(endYear, endMonth - 1, endDay);
        const now = new Date(2025, 8, 15); // Use approximate scrape date
        const monthsDiff = Math.round((endDate - now) / (1000 * 60 * 60 * 24 * 30));
        // Sanity check - fixed terms are usually between 3 months and 10 years
        if (monthsDiff >= 3 && monthsDiff <= 120) {
          return monthsDiff;
        }
      }
    }

    // Existing logic for other scrapers
    const term = item.termMonths || item.term_months || item.term;
    if (typeof term === 'number') return term;
    if (typeof term === 'string') {
      // Parse strings like "12 months", "2 years"
      const monthMatch = term.match(/(\d+)\s*months?/i);
      if (monthMatch) return parseInt(monthMatch[1]);

      const yearMatch = term.match(/(\d+)\s*years?/i);
      if (yearMatch) return parseInt(yearMatch[1]) * 12;
    }
    return null;
  }

  extractNoticePeriodDays(item, scraperType) {
    // For Flagstone, extract from term field if it contains "Notice X days"
    if (scraperType === 'Flagstone' && item.term) {
      const noticeMatch = item.term.match(/Notice\s+(\d+)\s+days?/i);
      if (noticeMatch) return parseInt(noticeMatch[1]);
    }

    // Enhanced extraction for MoneyFacts using title
    if (scraperType === 'moneyfacts' && item.originalWebsiteTitle) {
      const title = item.originalWebsiteTitle;
      const patterns = [
        /(\d+)\s*[Dd]ay\s*[Nn]otice/,
        /(\d+)-[Dd]ay\s*[Nn]otice/,
        /[Nn]otice.*?(\d+)\s*[Dd]ay/
      ];

      for (const pattern of patterns) {
        const match = title.match(pattern);
        if (match) return parseInt(match[1]);
      }
    }

    // Existing logic for other scrapers
    const notice = item.noticePeriodDays || item.notice_period_days || item.noticePeriod || item.notice;
    if (typeof notice === 'number') return notice;
    if (typeof notice === 'string') {
      // Parse strings like "90 days", "3 months"
      const dayMatch = notice.match(/(\d+)\s*days?/i);
      if (dayMatch) return parseInt(dayMatch[1]);

      const monthMatch = notice.match(/(\d+)\s*months?/i);
      if (monthMatch) return parseInt(monthMatch[1]) * 30; // Approximate
    }
    return null;
  }

  extractMinDeposit(item, scraperType) {
    const min = item.minDeposit || item.min_deposit || item.minimum;
    return this.parseAmount(min);
  }

  extractMaxDeposit(item, scraperType) {
    const max = item.maxDeposit || item.max_deposit || item.maximum;
    return this.parseAmount(max);
  }

  parseAmount(amount) {
    if (typeof amount === 'number') return amount;
    if (typeof amount === 'string') {
      // Remove currency symbols and commas
      const cleaned = amount.replace(/[£$€,\s]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  extractFSCSProtected(item, scraperType) {
    const fscs = item.fscsProtected || item.fscs_protected || item.fscs;
    if (typeof fscs === 'boolean') return fscs;
    if (typeof fscs === 'string') {
      return fscs.toLowerCase().includes('yes') || fscs.toLowerCase().includes('true');
    }
    return true; // Default to protected unless explicitly stated otherwise
  }

  extractInterestPaymentFrequency(item, scraperType) {
    const freq = item.interestPaymentFrequency || item.interest_payment_frequency || item.paymentFrequency;
    if (typeof freq === 'string') {
      const freqLower = freq.toLowerCase();
      if (freqLower.includes('monthly')) return 'monthly';
      if (freqLower.includes('quarterly')) return 'quarterly';
      if (freqLower.includes('annually') || freqLower.includes('yearly')) return 'annually';
      if (freqLower.includes('maturity')) return 'on_maturity';
    }
    return null;
  }

  extractApplyByDate(item, scraperType) {
    const date = item.applyByDate || item.apply_by_date || item.deadline;
    if (date instanceof Date) return date.toISOString();
    if (typeof date === 'string' && date.trim()) {
      try {
        return new Date(date).toISOString();
      } catch {
        return date; // Return as string if can't parse
      }
    }
    return null;
  }

  extractSpecialFeatures(item, scraperType) {
    const features = item.specialFeatures || item.special_features || item.features || item.notes;
    if (Array.isArray(features)) return features.join('; ');
    if (typeof features === 'string') return features;
    return null;
  }
}
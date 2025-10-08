/**
 * Utility functions for parsing AJ Bell scraped data into database-compatible formats
 */

import { parsePercentage, parseDepositAmount, parseFSCSEligibility, parseTerm } from './common-parser.js';

/**
 * Clean AJ Bell bank name for better matching
 * @param {string} bankName - Raw bank name from AJ Bell scraping
 * @returns {string} - Cleaned bank name
 */
export function cleanAJBellBankName(bankName) {
  if (!bankName || typeof bankName !== 'string') {
    return '';
  }
  
  return bankName
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bPlc\b/gi, 'PLC') // Standardize PLC
    .replace(/\bLtd\b/gi, 'Limited') // Standardize Limited
    .replace(/\blimited\b/gi, 'Limited') // Standardize Limited
    .replace(/\bbank\b/gi, 'Bank') // Standardize Bank
    .trim();
}

/**
 * Parse AJ Bell account type to standardized format
 * @param {string} accountTypeStr - Raw account type from AJ Bell
 * @returns {string} - Standardized account type
 */
export function parseAJBellAccountType(accountTypeStr) {
  if (!accountTypeStr || typeof accountTypeStr !== 'string') {
    return 'fixed_term'; // Default for AJ Bell
  }
  
  const cleaned = accountTypeStr.toLowerCase().trim();
  
  if (cleaned.includes('notice')) {
    return 'notice';
  } else if (cleaned.includes('fixed') || cleaned.includes('term')) {
    return 'fixed_term';
  }
  
  return 'fixed_term'; // Default fallback for AJ Bell
}

/**
 * Parse AJ Bell term information
 * @param {string} termStr - Raw term string from AJ Bell
 * @param {number} termMonths - Term in months
 * @returns {object} - Parsed term information
 */
export function parseAJBellTerm(termStr, termMonths) {
  if (!termStr || typeof termStr !== 'string') {
    return {
      term: '',
      termMonths: termMonths || null,
      termCategory: ''
    };
  }
  
  const result = {
    term: termStr.trim(),
    termMonths: termMonths || null,
    termCategory: ''
  };
  
  // Categorize based on termMonths
  if (termMonths) {
    if (termMonths <= 6) {
      result.termCategory = 'short_term';
    } else if (termMonths <= 18) {
      result.termCategory = 'medium_term';
    } else if (termMonths <= 36) {
      result.termCategory = 'long_term';
    } else {
      result.termCategory = 'very_long_term';
    }
  }
  
  return result;
}

/**
 * Parse AJ Bell notice period information
 * @param {string} noticePeriodStr - Raw notice period string
 * @param {number} noticePeriodDays - Notice period in days
 * @returns {object} - Parsed notice period information
 */
export function parseAJBellNoticePeriod(noticePeriodStr, noticePeriodDays) {
  if (!noticePeriodStr || typeof noticePeriodStr !== 'string') {
    return {
      noticePeriod: '',
      noticePeriodDays: noticePeriodDays || null,
      noticeCategory: ''
    };
  }
  
  const result = {
    noticePeriod: noticePeriodStr.trim(),
    noticePeriodDays: noticePeriodDays || null,
    noticeCategory: ''
  };
  
  // Categorize based on notice period days
  if (noticePeriodDays) {
    if (noticePeriodDays <= 40) {
      result.noticeCategory = 'short_notice';
    } else if (noticePeriodDays <= 95) {
      result.noticeCategory = 'medium_notice';
    } else {
      result.noticeCategory = 'long_notice';
    }
  }
  
  return result;
}

/**
 * Transform raw AJ Bell scraped data into database-compatible format
 * @param {object} rawData - Raw scraped data from AJ Bell
 * @returns {object} - Transformed data ready for database insertion
 */
export function transformAJBellData(rawData) {
  if (!rawData || typeof rawData !== 'object') {
    throw new Error('Invalid raw data provided to transformAJBellData');
  }
  
  const cleanedBankName = cleanAJBellBankName(rawData.bankName);
  const accountType = parseAJBellAccountType(rawData.accountType);
  const termInfo = parseAJBellTerm(rawData.term, rawData.termMonths);
  const noticeInfo = parseAJBellNoticePeriod(rawData.noticePeriod, rawData.noticePeriodDays);
  
  return {
    // Core identifiers
    platform: 'ajbell',
    bankName: cleanedBankName,
    productName: `${cleanedBankName} ${accountType === 'notice' ? 'Notice Account' : 'Fixed Term Account'}`,
    
    // Account details
    accountType: accountType,
    
    // Rates
    aer: parsePercentage(rawData.aer),
    gross: parsePercentage(rawData.gross || rawData.aer),
    
    // Term information
    term: termInfo.term,
    termMonths: termInfo.termMonths,
    termCategory: termInfo.termCategory,
    
    // Notice period information
    noticePeriod: noticeInfo.noticePeriod,
    noticePeriodDays: noticeInfo.noticePeriodDays,
    noticeCategory: noticeInfo.noticeCategory,
    
    // Deposit information
    minDeposit: parseDepositAmount(rawData.minDeposit),
    maxDeposit: null, // Not available in AJ Bell data
    
    // Additional info
    fscsEligible: parseFSCSEligibility(cleanedBankName),
    features: [],
    restrictions: [],
    
    // Metadata
    scrapedAt: rawData.scrapedAt || new Date().toISOString(),
    sourceUrl: rawData.page || '',
    extractionMethod: rawData.extractionMethod || 'ajbell-v2',
    
    // Raw data for debugging
    rawData: {
      cardText: rawData.cardText,
      tabSource: rawData.tabSource,
      cardIndex: rawData.cardIndex
    }
  };
}

/**
 * Validate transformed AJ Bell data
 * @param {object} data - Transformed data to validate
 * @returns {boolean} - True if data is valid
 */
export function validateAJBellData(data) {
  if (!data || typeof data !== 'object') {
    console.log('AJ Bell validation failed: Invalid data object');
    return false;
  }
  
  // Required fields
  const requiredFields = ['platform', 'bankName', 'aer', 'accountType'];
  
  for (const field of requiredFields) {
    if (!data[field]) {
      console.log(`AJ Bell validation failed: Missing required field '${field}'`);
      return false;
    }
  }
  
  // Platform must be 'ajbell'
  if (data.platform !== 'ajbell') {
    console.log('AJ Bell validation failed: Platform must be "ajbell"');
    return false;
  }
  
  // AER must be a valid percentage
  if (typeof data.aer !== 'number' || data.aer < 0 || data.aer > 100) {
    console.log('AJ Bell validation failed: Invalid AER rate');
    return false;
  }
  
  // Account type must be valid
  const validAccountTypes = ['fixed_term', 'notice'];
  if (!validAccountTypes.includes(data.accountType)) {
    console.log('AJ Bell validation failed: Invalid account type');
    return false;
  }
  
  // If notice account, must have notice period
  if (data.accountType === 'notice' && !data.noticePeriodDays) {
    console.log('AJ Bell validation failed: Notice account missing notice period');
    return false;
  }
  
  // If fixed term account, should have term months
  if (data.accountType === 'fixed_term' && !data.termMonths) {
    console.log('AJ Bell validation warning: Fixed term account missing term months');
    // Don't fail validation, just warn
  }
  
  return true;
}

/**
 * Get AJ Bell-specific metadata for database insertion
 * @returns {object} - Metadata object
 */
export function getAJBellMetadata() {
  return {
    platform: 'ajbell',
    displayName: 'AJ Bell',
    baseUrl: 'https://www.ajbell.co.uk/cash-savings',
    supportedAccountTypes: ['fixed_term', 'notice'],
    features: {
      tabNavigation: true,
      dynamicContent: true,
      noticeAccounts: true,
      fixedTermAccounts: true
    },
    lastUpdated: new Date().toISOString()
  };
}
/**
 * Utility functions for parsing HL scraped data into database-compatible formats
 */

import { parsePercentage, parseDepositAmount, parseFSCSEligibility, parseTerm } from './common-parser.js';

/**
 * Clean HL bank name for better matching
 * @param {string} bankName - Raw bank name from HL scraping
 * @returns {string} - Cleaned bank name
 */
export function cleanHLBankName(bankName) {
  if (!bankName || typeof bankName !== 'string') {
    return '';
  }
  
  return bankName
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bpart of\b/gi, '') // Remove "part of" text
    .replace(/\bPlc\b/gi, 'PLC') // Standardize PLC
    .replace(/\bLtd\b/gi, 'Limited') // Standardize Limited
    .trim();
}

/**
 * Parse HL account type to standardized format
 * @param {string} accountTypeStr - Raw account type from HL
 * @returns {string} - Standardized account type
 */
export function parseHLAccountType(accountTypeStr) {
  if (!accountTypeStr || typeof accountTypeStr !== 'string') {
    return 'easy_access'; // Default
  }
  
  const cleaned = accountTypeStr.toLowerCase().trim();
  
  if (cleaned.includes('easy access') || cleaned.includes('instant')) {
    return 'easy_access';
  } else if (cleaned.includes('limited access')) {
    return 'limited_access';
  } else if (cleaned.includes('notice')) {
    return 'notice';
  } else if (cleaned.includes('fixed') || cleaned.includes('term')) {
    return 'fixed_term';
  }
  
  return 'easy_access'; // Default fallback
}

/**
 * Parse HL term information to extract months/days
 * @param {string} termStr - Term string from HL
 * @param {string} accountType - Account type to help interpret term
 * @returns {object} - { term_months, notice_period_days }
 */
export function parseHLTerm(termStr, accountType) {
  if (!termStr || typeof termStr !== 'string') {
    return { term_months: null, notice_period_days: null };
  }
  
  const cleaned = termStr.toLowerCase().trim();
  
  // Extract number and unit
  const monthsMatch = cleaned.match(/(\d+)\s*months?/);
  const yearsMatch = cleaned.match(/(\d+)\s*years?/);
  const daysMatch = cleaned.match(/(\d+)\s*days?/);
  
  let term_months = null;
  let notice_period_days = null;
  
  if (accountType === 'fixed_term') {
    if (monthsMatch) {
      term_months = parseInt(monthsMatch[1], 10);
    } else if (yearsMatch) {
      term_months = parseInt(yearsMatch[1], 10) * 12;
    }
  } else if (accountType === 'notice') {
    if (daysMatch) {
      notice_period_days = parseInt(daysMatch[1], 10);
    } else if (monthsMatch) {
      // Convert months to days for notice accounts
      notice_period_days = parseInt(monthsMatch[1], 10) * 30;
    }
  }
  
  return { term_months, notice_period_days };
}

/**
 * Parse HL interest payment frequency
 * @param {string} interestStr - Interest payment string from HL
 * @returns {string} - Standardized frequency
 */
export function parseHLInterestFrequency(interestStr) {
  if (!interestStr || typeof interestStr !== 'string') {
    return null;
  }
  
  const cleaned = interestStr.toLowerCase().trim();
  
  if (cleaned.includes('monthly')) {
    return 'monthly';
  } else if (cleaned.includes('annually') || cleaned.includes('yearly')) {
    return 'annually';
  } else if (cleaned.includes('maturity')) {
    return 'maturity';
  } else if (cleaned.includes('quarterly')) {
    return 'quarterly';
  }
  
  return null;
}

/**
 * Transform HL scraped data to database format
 * @param {object} hlData - Raw scraped data from HL
 * @param {string} platform - Platform name
 * @returns {object} - Database-ready product data
 */
export function transformHLData(hlData, platform) {
  // Use the account type directly if it's already a valid standardized type
  const validAccountTypes = ['easy_access', 'fixed_term', 'notice', 'cash_isa', 'limited_access'];
  const accountType = validAccountTypes.includes(hlData.accountType) 
    ? hlData.accountType 
    : parseHLAccountType(hlData.accountType);
  
  // Use directly passed term values if available, otherwise parse from string
  let termMonths = hlData.termMonths || null;
  let noticePeriodDays = hlData.noticePeriodDays || null;
  
  // If we don't have direct values, try to parse from term string
  if (!termMonths && !noticePeriodDays && hlData.term) {
    const termData = parseHLTerm(hlData.term, accountType);
    termMonths = termData.term_months;
    noticePeriodDays = termData.notice_period_days;
  }
  
  return {
    platform: platform,
    source: 'hargreaves_lansdown',
    bank_name: cleanHLBankName(hlData.bankName),
    frn: null, // Will be populated by FRN lookup
    account_type: accountType,
    aer_rate: parsePercentage(hlData.aer),
    gross_rate: parsePercentage(hlData.gross),
    term_months: termMonths,
    notice_period_days: noticePeriodDays,
    min_deposit: parseDepositAmount(hlData.minDeposit),
    max_deposit: null, // HL doesn't typically show max deposits
    fscs_protected: true, // Assume HL products are FSCS protected
    interest_payment_frequency: parseHLInterestFrequency(hlData.interestPayment),
    apply_by_date: null, // Not captured by HL scraper
    special_features: null, // Not captured by HL scraper
    scrape_date: hlData.scrapedAt ? new Date(hlData.scrapedAt).toISOString().split('T')[0] : null,
    confidence_score: 1.0, // Default confidence
    fuzzy_match_notes: null // Will be populated by FRN lookup
  };
}

/**
 * Validate HL parsed data before database insertion
 * @param {object} data - Parsed HL product data
 * @returns {object} - { valid: boolean, errors: array }
 */
export function validateHLData(data) {
  const errors = [];
  
  // Required fields
  if (!data.platform) {
    errors.push('Platform is required');
  }
  
  if (!data.bank_name || data.bank_name.trim() === '') {
    errors.push('Bank name is required and cannot be empty');
  }
  
  if (!data.account_type) {
    errors.push('Account type is required');
  }
  
  if (data.aer_rate === null || data.aer_rate === undefined) {
    errors.push('AER rate is required');
  }
  
  if (!data.scrape_date) {
    errors.push('Scrape date is required');
  }
  
  // Validate ranges
  if (data.aer_rate !== null && (data.aer_rate < 0 || data.aer_rate > 100)) {
    errors.push('AER rate must be between 0 and 100');
  }
  
  if (data.gross_rate !== null && (data.gross_rate < 0 || data.gross_rate > 100)) {
    errors.push('Gross rate must be between 0 and 100');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}
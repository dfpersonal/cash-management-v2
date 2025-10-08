/**
 * Utility functions for parsing scraped data into database-compatible formats
 */

/**
 * Parse percentage string to numeric value
 * @param {string} percentageStr - e.g., "4.49%"
 * @returns {number} - e.g., 4.49
 */
export function parsePercentage(percentageStr) {
  if (!percentageStr || typeof percentageStr !== 'string') {
    return null;
  }
  
  const cleaned = percentageStr.replace('%', '').trim();
  const parsed = parseFloat(cleaned);
  
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse deposit amount string to integer
 * @param {string} depositStr - e.g., "£5,000" or "£2,000,000"
 * @returns {number} - e.g., 5000
 */
export function parseDepositAmount(depositStr) {
  if (!depositStr || typeof depositStr !== 'string') {
    return null;
  }
  
  // Handle special cases
  if (depositStr.toLowerCase().includes('no limit') || 
      depositStr.toLowerCase().includes('unlimited')) {
    return null;
  }
  
  // Remove currency symbol and commas
  const cleaned = depositStr.replace(/[£$€,]/g, '').trim();
  const parsed = parseInt(cleaned, 10);
  
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse FSCS eligibility to boolean
 * @param {string} fscsStr - e.g., "Yes", "No", "Eligible"
 * @returns {boolean}
 */
export function parseFSCSEligibility(fscsStr) {
  if (!fscsStr || typeof fscsStr !== 'string') {
    return true; // Default to true for safety
  }
  
  const cleaned = fscsStr.toLowerCase().trim();
  
  // Positive indicators
  if (cleaned.includes('yes') || 
      cleaned.includes('eligible') || 
      cleaned.includes('protected') ||
      cleaned.includes('covered')) {
    return true;
  }
  
  // Negative indicators
  if (cleaned.includes('no') || 
      cleaned.includes('not') ||
      cleaned.includes('ineligible')) {
    return false;
  }
  
  // Default to true for safety
  return true;
}

/**
 * Parse term string to extract account type and duration
 * @param {string} termStr - e.g., "Fixed 6 months", "Instant access", "Notice 30 days"
 * @returns {object} - { account_type, term_months, notice_period_days }
 */
export function parseTerm(termStr) {
  if (!termStr || typeof termStr !== 'string') {
    return {
      account_type: null,
      term_months: null,
      notice_period_days: null
    };
  }
  
  const cleaned = termStr.toLowerCase().trim();
  
  // Fixed term accounts
  if (cleaned.includes('fixed')) {
    let term_months = null;
    
    // Extract months
    const monthsMatch = cleaned.match(/(\d+)\s*months?/);
    if (monthsMatch) {
      term_months = parseInt(monthsMatch[1], 10);
    }
    
    // Extract years and convert to months
    const yearsMatch = cleaned.match(/(\d+)\s*years?/);
    if (yearsMatch) {
      term_months = parseInt(yearsMatch[1], 10) * 12;
    }
    
    return {
      account_type: 'fixed_term',
      term_months: term_months,
      notice_period_days: null
    };
  }
  
  // Notice accounts
  if (cleaned.includes('notice')) {
    let notice_period_days = null;
    
    // Extract days
    const daysMatch = cleaned.match(/(\d+)\s*days?/);
    if (daysMatch) {
      notice_period_days = parseInt(daysMatch[1], 10);
    }
    
    return {
      account_type: 'notice',
      term_months: null,
      notice_period_days: notice_period_days
    };
  }
  
  // Instant access accounts
  if (cleaned.includes('instant') || 
      cleaned.includes('immediate') || 
      cleaned.includes('easy access') ||
      cleaned.includes('on demand')) {
    return {
      account_type: 'easy_access',
      term_months: null,
      notice_period_days: null
    };
  }
  
  // Default case - try to extract any numbers for safety
  const numberMatch = cleaned.match(/(\d+)/);
  if (numberMatch) {
    const number = parseInt(numberMatch[1], 10);
    
    // Assume it's months if reasonable range
    if (number >= 1 && number <= 60) {
      return {
        account_type: 'fixed_term',
        term_months: number,
        notice_period_days: null
      };
    }
    
    // Assume it's days if larger number
    if (number > 60) {
      return {
        account_type: 'notice',
        term_months: null,
        notice_period_days: number
      };
    }
  }
  
  // Fallback
  return {
    account_type: 'easy_access',
    term_months: null,
    notice_period_days: null
  };
}

/**
 * Validate parsed data before database insertion
 * @param {object} data - Parsed product data
 * @returns {object} - { valid: boolean, errors: array }
 */
export function validateProductData(data) {
  const errors = [];
  
  // Required fields
  if (!data.platform) {
    errors.push('Platform is required');
  }
  
  if (!data.bank_name) {
    errors.push('Bank name is required');
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
  
  if (data.term_months !== null && (data.term_months < 1 || data.term_months > 600)) {
    errors.push('Term months must be between 1 and 600');
  }
  
  if (data.notice_period_days !== null && (data.notice_period_days < 1 || data.notice_period_days > 365)) {
    errors.push('Notice period days must be between 1 and 365');
  }
  
  if (data.min_deposit !== null && data.max_deposit !== null && 
      data.min_deposit > data.max_deposit) {
    errors.push('Minimum deposit cannot be greater than maximum deposit');
  }
  
  // Validate account type constraints
  const validAccountTypes = ['easy_access', 'notice', 'fixed_term', 'limited_access', 'cash_isa'];
  if (data.account_type && !validAccountTypes.includes(data.account_type)) {
    errors.push(`Account type must be one of: ${validAccountTypes.join(', ')}`);
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Transform scraped data to database format
 * @param {object} scrapedData - Raw scraped data
 * @param {string} platform - Platform name
 * @returns {object} - Database-ready product data
 */
export function transformScrapedData(scrapedData, platform) {
  const termData = parseTerm(scrapedData.term);
  
  // Handle accountType field directly if available (for HL, AJ Bell, etc.)
  let accountType = termData.account_type;
  if (scrapedData.accountType) {
    // Normalize account type from scraper data
    const normalizedType = scrapedData.accountType.toLowerCase();
    if (normalizedType === 'easy_access') {
      accountType = 'easy_access';
    } else if (normalizedType === 'fixed_term') {
      accountType = 'fixed_term';
    } else if (normalizedType === 'notice') {
      accountType = 'notice';
    } else if (normalizedType === 'cash_isa') {
      accountType = 'cash_isa';
    } else {
      accountType = normalizedType;
    }
  }
  
  return {
    platform: platform,
    source: platform, // Use actual platform instead of hardcoded 'flagstone'
    bank_name: scrapedData.bankName?.trim() || null,
    frn: null, // Will be populated by FRN lookup
    account_type: accountType,
    aer_rate: parsePercentage(scrapedData.aer),
    gross_rate: parsePercentage(scrapedData.gross),
    term_months: scrapedData.termMonths || termData.term_months,
    notice_period_days: scrapedData.noticePeriodDays || termData.notice_period_days,
    min_deposit: parseDepositAmount(scrapedData.minDeposit),
    max_deposit: parseDepositAmount(scrapedData.maxDeposit),
    fscs_protected: parseFSCSEligibility(scrapedData.fscsEligible),
    interest_payment_frequency: null, // Not captured by current scraper
    apply_by_date: null, // Not captured by current scraper
    special_features: null, // Not captured by current scraper
    scrape_date: scrapedData.scrapedAt ? new Date(scrapedData.scrapedAt).toISOString().split('T')[0] : null,
    confidence_score: 1.0, // Default confidence
    fuzzy_match_notes: null // Will be populated by FRN lookup
  };
}

/**
 * Clean and standardize bank name for FRN lookup
 * @param {string} bankName - Raw bank name from scraping
 * @returns {string} - Cleaned bank name
 */
export function cleanBankName(bankName) {
  if (!bankName || typeof bankName !== 'string') {
    return '';
  }
  
  return bankName
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\./g, '') // Remove dots
    .replace(/\bPLC\b/gi, '') // Remove PLC
    .replace(/\bLtd\b/gi, '') // Remove Ltd
    .replace(/\bLimited\b/gi, '') // Remove Limited
    .replace(/\bBank\b/gi, 'Bank') // Standardize Bank capitalization
    .replace(/\bBuilding Society\b/gi, 'Building Society') // Standardize Building Society
    .trim();
}

/**
 * Normalize bank name for fuzzy matching by removing common corporate terms
 * @param {string} bankName - Bank name to normalize
 * @returns {string} - Normalized bank name
 */
export function normalizeBankNameForFuzzy(bankName) {
  if (!bankName || typeof bankName !== 'string') {
    return '';
  }
  
  return bankName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\./g, '') // Remove dots
    .replace(/\b(plc|ltd|limited|bank|limited|inc|corp|corporation)\b/gi, '') // Remove corporate terms
    .replace(/\b(the|and|&)\b/gi, '') // Remove common words
    .replace(/\s+/g, ' ') // Clean up extra spaces
    .trim();
}

/**
 * Parse bank name and platform information for aggregator sites like MoneyFacts
 * @param {string} rawBankName - e.g., "AlRayan Bank Raisin UK - 1 Year Fixed Term"
 * @param {Array} knownPlatforms - Array of platform objects from known_platforms table
 * @returns {Object} - { bankName, offeringPlatform, specialFeatures, platformContext }
 */
export function parseBankAndPlatform(rawBankName, knownPlatforms = []) {
  if (!rawBankName || typeof rawBankName !== 'string' || rawBankName.trim() === '') {
    return { 
      bankName: 'Unknown Bank', 
      offeringPlatform: null,
      specialFeatures: null,
      platformContext: null
    };
  }

  // Clean the raw input first
  const cleanedInput = rawBankName.trim();

  // Sort known platforms by platform_variant length (longest first) for proper matching
  const sortedPlatforms = [...knownPlatforms].sort((a, b) => b.platform_variant.length - a.platform_variant.length);

  // Check against known platforms (ordered by length DESC for longest match first)
  for (const platform of sortedPlatforms) {
    if (!platform.is_active && platform.is_active !== undefined) continue;
    
    // Create regex pattern to match platform at end of string, allowing for additional descriptive text
    const escapedVariant = escapeRegExp(platform.platform_variant);
    // This pattern captures: (bank name) + whitespace + (platform) + optional trailing text
    const pattern = new RegExp(`^(.+?)\\s+(${escapedVariant})(?:\\s|$|\\s*[-–—].*$)`, 'i');
    const match = cleanedInput.match(pattern);
    
    if (match) {
      const cleanBankName = match[1].trim();
      const platformContext = `Platform aggregator: ${platform.display_name} detected. Clean bank name extracted from "${rawBankName}".`;
      
      return {
        bankName: cleanBankName,
        offeringPlatform: platform.canonical_name,
        displayName: platform.display_name,
        specialFeatures: `Available via ${platform.display_name}`,
        platformContext: platformContext
      };
    }
  }

  // No platform detected - return original name
  return { 
    bankName: cleanedInput, 
    offeringPlatform: null,
    specialFeatures: null,
    platformContext: null
  };
}

/**
 * Escape special regex characters in a string
 * @param {string} string - String to escape
 * @returns {string} - Escaped string safe for regex
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Enhanced bank name cleaning that handles platform parsing
 * @param {string} rawBankName - Original scraped bank name
 * @param {Array} knownPlatforms - Known platforms for parsing
 * @returns {Object} - { cleanBankName, platformInfo }
 */
export function enhancedCleanBankName(rawBankName, knownPlatforms = []) {
  // First parse for platforms
  const parsed = parseBankAndPlatform(rawBankName, knownPlatforms);
  
  // Then apply standard bank name cleaning to the extracted bank name
  const cleanedBankName = cleanBankName(parsed.bankName);
  
  return {
    cleanBankName: cleanedBankName,
    platformInfo: {
      offeringPlatform: parsed.offeringPlatform,
      specialFeatures: parsed.specialFeatures,
      platformContext: parsed.platformContext
    }
  };
}

/**
 * Validate platform parsing result
 * @param {Object} parseResult - Result from parseBankAndPlatform
 * @returns {Object} - { valid: boolean, errors: Array }
 */
export function validatePlatformParsing(parseResult) {
  const errors = [];
  
  if (!parseResult || typeof parseResult !== 'object') {
    errors.push('Parse result must be an object');
    return { valid: false, errors };
  }
  
  if (!parseResult.bankName || typeof parseResult.bankName !== 'string' || parseResult.bankName.trim().length === 0) {
    errors.push('Bank name is required and must be a non-empty string');
  }
  
  // If platform is detected, validate platform fields
  if (parseResult.offeringPlatform) {
    if (!parseResult.specialFeatures) {
      errors.push('Special features required when platform is detected');
    }
    
    if (!parseResult.platformContext) {
      errors.push('Platform context required when platform is detected');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}
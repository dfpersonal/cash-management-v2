/**
 * Platform Normalizer - Normalize platform names against known_platforms table
 * Part of the comprehensive scraper platform normalization implementation
 */

import { EnhancedLogger } from '../core/enhanced-logger.js';

export class PlatformNormalizer {
  constructor(databaseManager, config = {}) {
    this.databaseManager = databaseManager;
    this.config = config;
    this.logger = new EnhancedLogger('PlatformNormalizer');
    this.platformCache = new Map(); // Cache for performance
    this.lastCacheUpdate = null;
    this.cacheExpiryMs = 300000; // 5 minutes
    this.unknownPlatformsFound = new Set(); // Track unknowns for reporting
  }

  /**
   * Initialize the platform normalizer
   */
  async initialize() {
    await this.loadPlatformCache();
    this.logger.debug('Platform normalizer initialized');
  }

  /**
   * Load platform cache from database
   */
  async loadPlatformCache() {
    try {
      const platforms = await this.databaseManager.getKnownPlatforms();
      this.platformCache.clear();
      
      // Create lookup map: platform_variant -> canonical_name
      for (const platform of platforms) {
        this.platformCache.set(platform.platform_variant.toLowerCase(), {
          canonical: platform.canonical_name,
          display: platform.display_name,
          type: platform.platform_type,
          isActive: platform.is_active
        });
      }
      
      this.lastCacheUpdate = Date.now();
      this.logger.debug(`Platform cache loaded: ${this.platformCache.size} entries`);
      
    } catch (error) {
      this.logger.error(`Failed to load platform cache: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if cache needs refresh
   */
  async ensureCacheValid() {
    const cacheAge = Date.now() - (this.lastCacheUpdate || 0);
    if (!this.lastCacheUpdate || cacheAge > this.cacheExpiryMs) {
      this.logger.debug('Platform cache expired, refreshing...');
      await this.loadPlatformCache();
    }
  }

  /**
   * Normalize a platform name
   * @param {string} rawPlatform - Raw platform name from scraper
   * @param {string} scraperType - Type of scraper for context
   * @returns {Object} Normalization result
   */
  async normalize(rawPlatform, scraperType = 'unknown') {
    if (!rawPlatform || typeof rawPlatform !== 'string') {
      return {
        canonical: 'unknown_platform',
        raw: rawPlatform,
        matched: false,
        reason: 'invalid_input'
      };
    }

    await this.ensureCacheValid();

    const cleanPlatform = rawPlatform.trim();
    const lookupKey = cleanPlatform.toLowerCase();

    // Try exact match first
    if (this.platformCache.has(lookupKey)) {
      const platformInfo = this.platformCache.get(lookupKey);
      return {
        canonical: platformInfo.canonical,
        raw: cleanPlatform,
        matched: true,
        reason: 'exact_match',
        platformType: platformInfo.type,
        isActive: platformInfo.isActive
      };
    }

    // Try case-insensitive partial matching
    const partialMatch = this.findPartialMatch(cleanPlatform);
    if (partialMatch) {
      return {
        canonical: partialMatch.canonical,
        raw: cleanPlatform,
        matched: true,
        reason: 'partial_match',
        platformType: partialMatch.type,
        isActive: partialMatch.isActive
      };
    }

    // No match found - handle unknown platform
    this.logger.debug(`Unknown platform detected: "${cleanPlatform}" from ${scraperType} scraper`);
    this.unknownPlatformsFound.add(cleanPlatform);
    
    // Auto-insert unknown platform for review
    await this.autoInsertUnknownPlatform(cleanPlatform, scraperType);

    return {
      canonical: 'unknown_platform',
      raw: cleanPlatform,
      matched: false,
      reason: 'not_found'
    };
  }

  /**
   * Find partial match in platform cache
   * @private
   */
  findPartialMatch(platformName) {
    const searchTerm = platformName.toLowerCase();
    
    // Try to find platform variants that contain the search term or vice versa
    for (const [variant, info] of this.platformCache.entries()) {
      if (variant.includes(searchTerm) || searchTerm.includes(variant)) {
        this.logger.debug(`Partial match: "${platformName}" matched "${variant}"`);
        return info;
      }
    }
    
    return null;
  }

  /**
   * Auto-insert unknown platform into known_platforms for review
   * @private
   */
  async autoInsertUnknownPlatform(platformName, scraperType) {
    try {
      if (!this.databaseManager.db) {
        await this.databaseManager.connect();
      }

      // Check if already exists (avoid duplicate inserts)
      const exists = await this.databaseManager.db.get(`
        SELECT id FROM known_platforms 
        WHERE platform_variant = ? OR canonical_name = ?
      `, [platformName, platformName]);

      if (exists) {
        this.logger.debug(`Platform "${platformName}" already exists in known_platforms`);
        return;
      }

      // Insert new platform for review
      const notes = `Auto-detected from ${scraperType} scraper on ${new Date().toISOString()} - requires review`;
      
      await this.databaseManager.db.run(`
        INSERT INTO known_platforms 
        (platform_variant, canonical_name, display_name, platform_type, is_active, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `, [
        platformName,           // platform_variant
        platformName,           // canonical_name (temporary)
        platformName,           // display_name
        'unknown',              // platform_type
        0,                      // is_active = FALSE (use 0 instead of false for SQLite)
        notes                   // notes
      ]);

      this.logger.info(`🆕 Auto-inserted unknown platform: "${platformName}" for review`);
      
    } catch (error) {
      this.logger.warning(`Failed to auto-insert platform "${platformName}": ${error.message}`);
    }
  }

  /**
   * Get normalization statistics for reporting
   */
  getNormalizationStats() {
    return {
      cacheSize: this.platformCache.size,
      unknownPlatformsFound: Array.from(this.unknownPlatformsFound),
      unknownCount: this.unknownPlatformsFound.size,
      lastCacheUpdate: this.lastCacheUpdate
    };
  }

  /**
   * Reset unknown platforms tracking (call at start of new scraper run)
   */
  resetUnknownTracking() {
    this.unknownPlatformsFound.clear();
  }

  /**
   * Batch normalize multiple platforms (for efficiency)
   * @param {Array} platforms - Array of platform names
   * @param {string} scraperType - Scraper type for context
   * @returns {Array} Array of normalization results
   */
  async batchNormalize(platforms, scraperType = 'unknown') {
    if (!Array.isArray(platforms)) {
      throw new Error('Platforms must be an array');
    }

    const results = [];
    for (const platform of platforms) {
      const result = await this.normalize(platform, scraperType);
      results.push(result);
    }

    return results;
  }
}
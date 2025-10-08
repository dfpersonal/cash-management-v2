/**
 * Unified FRN Resolver - Centralized FRN lookup service for all scrapers
 * Consolidates and standardizes FRN resolution logic from database.js and upsert-database-manager.js
 * 
 * Key Features:
 * - Uses existing frn_lookup_helper view for sophisticated matching
 * - Maintains caching for performance
 * - Provides consistent interface across all scrapers
 * - Includes auto-flagging for research queue
 * - Comprehensive statistics tracking
 * - Levenshtein distance fuzzy matching for advanced name variations
 */

import { EnhancedLogger } from './enhanced-logger.js';
import levenshtein from 'fast-levenshtein';

export class FRNResolver {
  constructor(database, options = {}) {
    this.db = database;
    this.logger = new EnhancedLogger({
      componentName: 'FRN-Resolver',
      logLevel: options.logLevel || 'info',
      verboseMode: options.verbose || false
    });
    
    // FRN lookup cache for performance
    this.frnCache = new Map();
    
    // Statistics tracking
    this.stats = {
      lookupAttempts: 0,
      exactMatches: 0,
      partialMatches: 0,
      fuzzyMatches: 0,
      cacheHits: 0,
      failed: 0,
      autoFlagged: 0,
      processingTimes: []
    };
    
    // Configuration
    this.defaultFuzzyThreshold = options.fuzzyThreshold || 0.7;
    this.enableAutoFlagging = options.enableAutoFlagging !== false;
    this.enableCaching = options.enableCaching !== false;
  }

  /**
   * Main FRN lookup method - standardized interface for all scrapers
   * @param {string} bankName - Bank name to lookup
   * @param {Object} context - Optional context (platform, productCount, etc.)
   * @returns {Object|null} FRN lookup result or null if not found
   */
  async resolveFRN(bankName, context = {}) {
    const startTime = Date.now();
    this.stats.lookupAttempts++;
    
    if (!bankName || typeof bankName !== 'string') {
      this.logger.debug(`Invalid bank name: "${bankName}" (type: ${typeof bankName})`);
      this.stats.failed++;
      return null;
    }
    
    const cleanedName = bankName.trim().toUpperCase();
    this.logger.debug(`FRN lookup: "${bankName}" → cleaned: "${cleanedName}"`);
    
    try {
      // Check cache first
      let result;
      if (this.enableCaching && this.frnCache.has(cleanedName)) {
        result = this.frnCache.get(cleanedName);
        this.stats.cacheHits++;
        this.logger.debug(`Cache hit: "${bankName}" → ${result ? result.frn : 'null'}`);
      } else {
        // Perform fresh lookup
        result = await this.performFRNLookup(cleanedName, bankName);
        
        // Cache the result (including nulls to avoid repeated failures)
        if (this.enableCaching) {
          this.frnCache.set(cleanedName, result);
        }
      }
      
      // Auto-flag for research if no match found
      if (!result && this.enableAutoFlagging) {
        await this.autoFlagForResearch(bankName, context);
        this.stats.autoFlagged++;
      }
      
      // Track timing
      const duration = Date.now() - startTime;
      this.stats.processingTimes.push(duration);
      
      return result;
      
    } catch (error) {
      this.logger.warning(`FRN lookup error for "${bankName}": ${error.message}`);
      this.logger.debug(`FRN lookup error details: ${error.stack}`);
      this.stats.failed++;
      return null;
    }
  }

  /**
   * Perform the actual FRN lookup using frn_lookup_helper view
   * @private
   */
  async performFRNLookup(cleanedName, originalName) {
    // Stage 1: Try exact match using frn_lookup_helper view
    this.logger.debug(`Stage 1: Exact match for "${cleanedName}"`);
    const exactResult = this.db.prepare(`
      SELECT frn, canonical_name, confidence_score, match_type
      FROM frn_lookup_helper
      WHERE search_name = ? AND match_rank = 1
    `).get(cleanedName);
    
    if (exactResult && exactResult.frn) {
      this.stats.exactMatches++;
      const result = {
        frn: exactResult.frn,
        firm_name: exactResult.canonical_name,
        confidence_score: exactResult.confidence_score,
        fuzzy_match_notes: `${exactResult.match_type} - FRN ${exactResult.frn}`,
        lookup_method: exactResult.match_type,
        search_name: cleanedName
      };
      this.logger.debug(`SUCCESS (exact): "${originalName}" → ${result.frn} via ${result.lookup_method}`);
      return result;
    }
    
    // Stage 2: Try partial matching via SQL LIKE
    this.logger.debug(`Stage 2: Partial matching for "${cleanedName}"`);
    const partialMatches = this.db.prepare(`
      SELECT DISTINCT frn, canonical_name, search_name, 
             confidence_score, match_type
      FROM frn_lookup_helper
      WHERE (search_name LIKE '%' || ? || '%' OR ? LIKE '%' || search_name || '%')
        AND match_rank = 1
      ORDER BY 
        CASE 
          WHEN search_name = ? THEN 0
          WHEN search_name LIKE ? || '%' THEN 1
          WHEN search_name LIKE '%' || ? THEN 2
          ELSE 3
        END,
        LENGTH(search_name),
        confidence_score DESC
      LIMIT 1
    `).get(cleanedName, cleanedName, cleanedName, cleanedName, cleanedName);
    
    this.logger.debug(`Partial match raw result:`, partialMatches);
    
    if (partialMatches && partialMatches.frn) {
      this.stats.partialMatches++;
      const result = {
        frn: partialMatches.frn,
        firm_name: partialMatches.canonical_name,
        confidence_score: partialMatches.confidence_score * 0.9, // Reduce confidence for partial
        fuzzy_match_notes: `Partial match: "${originalName}" → ${partialMatches.canonical_name} (${partialMatches.match_type}) - FRN ${partialMatches.frn}`,
        lookup_method: 'partial_match',
        search_name: cleanedName,
        matched_via: partialMatches.search_name
      };
      this.logger.debug(`SUCCESS (partial): "${originalName}" → ${result.frn} via "${partialMatches.search_name}"`);
      return result;
    }
    
    // Stage 3: Advanced fuzzy matching using Levenshtein distance
    this.logger.debug(`Stage 3: Fuzzy matching for "${cleanedName}"`);
    const fuzzyResult = await this.performFuzzyMatching(cleanedName, originalName);
    if (fuzzyResult) {
      this.stats.fuzzyMatches++;
      return fuzzyResult;
    }
    
    // Stage 4: No matches found
    this.logger.debug(`No matches found for "${originalName}"`);
    this.stats.failed++;
    return null;
  }

  /**
   * Perform fuzzy matching using Levenshtein distance
   * @private
   */
  async performFuzzyMatching(cleanedName, originalName, threshold = 0.7) {
    try {
      // Get all potential matches from frn_lookup_helper
      const candidates = this.db.prepare(`
        SELECT DISTINCT frn, canonical_name, search_name, confidence_score, match_type
        FROM frn_lookup_helper
        WHERE match_rank = 1
      `).all();

      if (!candidates || candidates.length === 0) {
        return null;
      }

      // Import normalization function
      const { normalizeBankNameForFuzzy } = await import('../parsers.js');
      const normalizedSearchTerm = normalizeBankNameForFuzzy(originalName);

      // Calculate similarities for all candidates
      const matches = candidates.map(candidate => {
        // Calculate similarity on normalized names
        const normalizedCandidate = normalizeBankNameForFuzzy(candidate.canonical_name);
        const normalizedDistance = levenshtein.get(normalizedSearchTerm, normalizedCandidate);
        const maxNormalizedLength = Math.max(normalizedSearchTerm.length, normalizedCandidate.length);
        const normalizedSimilarity = maxNormalizedLength > 0 ? 1 - (normalizedDistance / maxNormalizedLength) : 0;

        // Also calculate raw similarity for comparison
        const rawDistance = levenshtein.get(cleanedName, candidate.search_name);
        const maxRawLength = Math.max(cleanedName.length, candidate.search_name.length);
        const rawSimilarity = maxRawLength > 0 ? 1 - (rawDistance / maxRawLength) : 0;

        // Use the better of the two similarities
        const similarity = Math.max(normalizedSimilarity, rawSimilarity);

        return {
          frn: candidate.frn,
          canonical_name: candidate.canonical_name,
          search_name: candidate.search_name,
          confidence_score: candidate.confidence_score,
          match_type: candidate.match_type,
          similarity: similarity
        };
      });

      // Sort by similarity and get the best match
      const sortedMatches = matches
        .filter(match => match.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity);

      if (sortedMatches.length === 0) {
        this.logger.debug(`Fuzzy match: No matches above threshold ${threshold} for "${originalName}"`);
        return null;
      }

      const bestMatch = sortedMatches[0];
      const confidence = bestMatch.similarity * bestMatch.confidence_score * 0.8; // Reduce confidence for fuzzy matches

      const result = {
        frn: bestMatch.frn,
        firm_name: bestMatch.canonical_name,
        confidence_score: confidence,
        fuzzy_match_notes: `Fuzzy match (${(bestMatch.similarity * 100).toFixed(1)}% similarity) - "${originalName}" → ${bestMatch.canonical_name} - FRN ${bestMatch.frn}`,
        lookup_method: 'fuzzy_match',
        search_name: cleanedName,
        matched_via: bestMatch.search_name,
        similarity: bestMatch.similarity
      };

      this.logger.debug(`SUCCESS (fuzzy): "${originalName}" → ${result.frn} via fuzzy matching (${(bestMatch.similarity * 100).toFixed(1)}% similarity)`);
      return result;

    } catch (error) {
      this.logger.warning(`Fuzzy matching error for "${originalName}": ${error.message}`);
      return null;
    }
  }

  /**
   * Auto-flag unmatched banks for manual research
   * @private
   */
  async autoFlagForResearch(bankName, context = {}) {
    try {
      // Check if already exists in manual overrides
      const existing = this.db.prepare(`
        SELECT id FROM frn_manual_overrides WHERE scraped_name = ?
      `).get(bankName);
      
      if (existing) {
        this.logger.debug(`Bank "${bankName}" already in manual overrides, not auto-flagging`);
        return;
      }
      
      // Insert with auto-flagged status
      const notes = this.generateAutoFlagNotes(context);
      
      this.db.prepare(`
        INSERT OR IGNORE INTO frn_manual_overrides (
          scraped_name, frn, firm_name, confidence_score, notes, created_at
        ) VALUES (?, NULL, NULL, 0.0, ?, CURRENT_TIMESTAMP)
      `).run(bankName, `Auto-flagged for manual verification - ${notes}`);
      
      this.logger.debug(`Auto-flagged "${bankName}" for manual research`);
      
    } catch (error) {
      this.logger.warning(`Failed to auto-flag "${bankName}": ${error.message}`);
    }
  }

  /**
   * Generate contextual notes for auto-flagged banks
   * @private
   */
  generateAutoFlagNotes(context) {
    const notes = [];
    
    if (context.platform) {
      notes.push(`from ${context.platform}`);
    }
    
    if (context.productCount) {
      notes.push(`${context.productCount} products`);
    }
    
    if (context.avgRate) {
      notes.push(`avg rate ${context.avgRate.toFixed(2)}%`);
    }
    
    return notes.length > 0 ? notes.join(', ') : 'no automatic match found';
  }

  /**
   * Bulk resolve FRNs for multiple products (main interface for scrapers)
   * @param {Array} products - Products needing FRN resolution
   * @param {Object} options - Processing options
   * @returns {Object} Resolution statistics
   */
  async resolveForProducts(products, options = {}) {
    this.logger.progress(`Resolving FRNs for ${products.length} products...`);
    
    const startTime = Date.now();
    const sourceStats = new Map();
    let resolvedCount = 0;
    let skippedCount = 0;
    
    // Group by bank name for efficiency
    const bankGroups = new Map();
    for (const product of products) {
      // Skip products that already have FRNs
      if (product.frn) {
        skippedCount++;
        continue;
      }
      
      const bankName = product.bankName;
      if (!bankName || bankName === 'Unknown Bank') {
        skippedCount++;
        continue;
      }
      
      if (!bankGroups.has(bankName)) {
        bankGroups.set(bankName, []);
      }
      bankGroups.get(bankName).push(product);
    }
    
    this.logger.debug(`Processing ${bankGroups.size} unique banks (${products.length - skippedCount} products need FRN)`);
    
    // Resolve FRNs for each unique bank
    for (const [bankName, bankProducts] of bankGroups.entries()) {
      const context = {
        platform: bankProducts[0].platform || bankProducts[0].source,
        productCount: bankProducts.length,
        avgRate: bankProducts.reduce((sum, p) => sum + (p.aerRate || 0), 0) / bankProducts.length,
        totalValue: bankProducts.reduce((sum, p) => sum + (p.minDeposit || 0), 0)
      };
      
      const frnResult = await this.resolveFRN(bankName, context);
      
      // Apply result to all products from this bank
      for (const product of bankProducts) {
        if (frnResult) {
          product.frn = frnResult.frn;
          product.firm_name = frnResult.firm_name; // Use canonical name
          product.confidence_score = frnResult.confidence_score;
          product.fuzzy_match_notes = frnResult.fuzzy_match_notes;
          product.frn_lookup_method = frnResult.lookup_method;
          resolvedCount++;
        } else {
          product.frn_lookup_method = 'no_match';
          product.confidence_score = 0.0;
          product.fuzzy_match_notes = 'No automatic match found - flagged for manual research';
        }
      }
      
      // Track per-source statistics
      const source = bankProducts[0].source || 'unknown';
      if (!sourceStats.has(source)) {
        sourceStats.set(source, { resolved: 0, failed: 0, total: 0 });
      }
      const stats = sourceStats.get(source);
      stats.total += bankProducts.length;
      if (frnResult) {
        stats.resolved += bankProducts.length;
      } else {
        stats.failed += bankProducts.length;
      }
    }
    
    const duration = Date.now() - startTime;
    
    // Log summary
    const resolvedPct = products.length > 0 ? (resolvedCount / products.length * 100).toFixed(1) : '0.0';
    this.logger.info(`FRN resolution complete: ${resolvedCount}/${products.length} resolved (${resolvedPct}%)`);
    
    // Log per-source breakdown
    for (const [source, stats] of sourceStats.entries()) {
      const sourcePct = stats.total > 0 ? (stats.resolved / stats.total * 100).toFixed(1) : '0.0';
      this.logger.info(`  ${source}: ${stats.resolved}/${stats.total} resolved (${sourcePct}%)`);
    }
    
    return {
      totalProcessed: products.length,
      resolved: resolvedCount,
      skipped: skippedCount,
      failed: products.length - resolvedCount - skippedCount,
      successRate: parseFloat(resolvedPct),
      duration: duration,
      sourceBreakdown: Object.fromEntries(sourceStats),
      cacheStats: this.getCacheStatistics()
    };
  }

  /**
   * Get current FRN resolver statistics
   */
  getStatistics() {
    const avgProcessingTime = this.stats.processingTimes.length > 0 
      ? this.stats.processingTimes.reduce((a, b) => a + b, 0) / this.stats.processingTimes.length 
      : 0;
      
    return {
      lookupAttempts: this.stats.lookupAttempts,
      exactMatches: this.stats.exactMatches,
      partialMatches: this.stats.partialMatches,
      fuzzyMatches: this.stats.fuzzyMatches,
      cacheHits: this.stats.cacheHits,
      failed: this.stats.failed,
      autoFlagged: this.stats.autoFlagged,
      avgProcessingTimeMs: Math.round(avgProcessingTime),
      cacheSize: this.frnCache.size
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics() {
    return {
      size: this.frnCache.size,
      hits: this.stats.cacheHits,
      enabled: this.enableCaching
    };
  }

  /**
   * Clear the FRN cache (useful for testing or data updates)
   */
  clearCache() {
    this.frnCache.clear();
    this.logger.debug('FRN cache cleared');
  }

  /**
   * Reset statistics (useful for testing or fresh starts)
   */
  resetStatistics() {
    this.stats = {
      lookupAttempts: 0,
      exactMatches: 0,
      partialMatches: 0,
      cacheHits: 0,
      failed: 0,
      autoFlagged: 0,
      processingTimes: []
    };
    this.logger.debug('FRN statistics reset');
  }

  /**
   * Log detailed FRN resolver statistics
   */
  logDetailedStatistics() {
    const stats = this.getStatistics();
    const cacheHitRate = stats.lookupAttempts > 0 ? (stats.cacheHits / stats.lookupAttempts * 100).toFixed(1) : '0.0';
    const exactMatchRate = stats.lookupAttempts > 0 ? (stats.exactMatches / stats.lookupAttempts * 100).toFixed(1) : '0.0';
    
    this.logger.info('FRN Resolver Statistics:');
    this.logger.info(`  Lookup attempts: ${stats.lookupAttempts}`);
    this.logger.info(`  Exact matches: ${stats.exactMatches} (${exactMatchRate}%)`);
    this.logger.info(`  Partial matches: ${stats.partialMatches}`);
    this.logger.info(`  Cache hits: ${stats.cacheHits} (${cacheHitRate}% hit rate)`);
    this.logger.info(`  Failed lookups: ${stats.failed}`);
    this.logger.info(`  Auto-flagged: ${stats.autoFlagged}`);
    this.logger.info(`  Avg processing time: ${stats.avgProcessingTimeMs}ms`);
    this.logger.info(`  Cache size: ${stats.cacheSize} entries`);
  }
}
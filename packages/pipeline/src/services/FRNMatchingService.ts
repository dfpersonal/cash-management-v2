/**
 * Modern FRN Matching Service - Phase 2.1 Implementation
 *
 * Replaces legacy FRNManagerService with:
 * - Better-sqlite3 for synchronous operations
 * - Modern TypeScript architecture
 * - Interface alignment with pipeline types
 * - Comprehensive error handling
 * - Performance optimizations
 */

import * as Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { DatabaseValidator } from '@cash-mgmt/shared';
import { EnhancedLogger } from '@cash-mgmt/shared';
import { logger } from '../utils/PipelineLogger';
import { FRNMatchingConfig, FRNConfigurationError } from '../types/FRNMatchingConfig';

// Pipeline-aligned types (import from actual pipeline types when available)
export interface ParsedProduct {
  bankName: string;
  platform: string;
  accountType?: string;
  aerRate?: number;
  grossRate?: number;
  balance?: number;
  minimumBalance?: number;
  maximumBalance?: number;
  notice?: string;
  scrapeDate?: string;
  sourceFile?: string;
  source?: string;
}

// Modern FRN matching interfaces aligned with pipeline
export interface FRNMatchingServiceResult {
  success: boolean;
  processedCount: number;
  enrichedProducts: EnrichedProduct[];
  stats: FRNMatchingStats;
  errors: string[];
  duration: number;
}

// Legacy interface removed - now using FRNMatchingConfig from database

export interface FRNMatchingStats {
  totalProducts: number;
  exactMatches: number;
  fuzzyMatches: number;
  aliasMatches: number;
  noMatches: number;
  researchQueue: number;
  averageConfidence: number;
  processingTimeMs: number;
}

export interface FRNLookupRecord {
  frn: string;
  bankName: string;
  tradingName?: string;
  aliases?: string[];
  isActive: boolean;
  fscsProtected: boolean;
  confidence: number;
  matchType?: string; // From frn_lookup_helper: 'manual_override', 'direct_match', 'name_variation', 'shared_brand'
}

// Pipeline-aligned enriched product (camelCase for consistency)
export interface EnrichedProduct {
  // Core product data (camelCase for pipeline consistency)
  bankName: string;
  platform: string;
  accountType: string;
  aerRate: number;
  grossRate: number;
  balance: number;
  minimumBalance: number;
  maximumBalance: number;
  notice: string;

  // FRN enrichment data (matches pipeline expected format)
  frn?: string;
  frnConfidence: number;
  frnStatus: 'MATCHED' | 'NO_MATCH' | 'RESEARCH_QUEUE';
  frnSource: 'EXACT' | 'FUZZY' | 'ALIAS' | 'NONE';
  frnMatchType?: string; // From frn_lookup_helper: 'manual_override', 'direct_match', 'name_variation', 'shared_brand'
  fscsProtected: boolean;
  bankNameNormalized: string;

  // Additional fields needed by deduplication service
  termMonths?: number;
  noticePeriodDays?: number;
  source?: string;
  minDeposit?: number | null;
  maxDeposit?: number | null;
  interestPaymentFrequency?: string | null;
  applyByDate?: string | null;
  specialFeatures?: string | null;
  confidenceScore?: number;
  deduplicationMetadata?: any;

  // Metadata
  scrapeDate: string;
  sourceFile: string;
  sourceReliability?: number;
}

/**
 * Modern FRN Matching Service
 * Provides fast, accurate FRN resolution with comprehensive error handling
 */
export class FRNMatchingService extends EventEmitter {
  private db: Database.Database;
  private logger: EnhancedLogger;
  private config: FRNMatchingConfig;
  private currentBatchId: string = '';

  // Prepared statements for performance
  private stmts: {
    exactMatch: Database.Statement;
    fuzzyMatch: Database.Statement;
    aliasMatch: Database.Statement;
    insertResearch: Database.Statement;
    allBanksForFuzzy: Database.Statement;
  } | null = null;

  constructor(db: Database.Database) {
    super();

    // Use the passed database connection
    this.db = db;

    // Configuration must be loaded from database before use
    this.config = null as any; // Will be set in loadConfiguration()

    // Initialize logger with default level (will be updated after config load)
    this.logger = new EnhancedLogger({
      componentName: 'FRN-Matching',
      logLevel: 'info' as any,
      verboseMode: false
    });

  }

  /**
   * Load configuration from database
   * Must be called after construction and before processing
   */
  async loadConfiguration(): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        SELECT config_key, config_value, config_type
        FROM unified_config
        WHERE category = 'frn_matching' AND is_active = 1
      `);

      const rows = stmt.all() as Array<{
        config_key: string;
        config_value: string;
        config_type: string;
      }>;

      if (rows.length === 0) {
        throw new FRNConfigurationError(
          'No FRN matching configuration found in unified_config table. Database may be corrupted or not initialized.',
          'missing_config'
        );
      }

      // Parse configuration
      this.config = this.parseConfiguration(rows);

      // Update logger level if it changed
      this.logger.setLogLevel(this.config.logLevel as any);

      // Prepare SQL statements after configuration is loaded
      this.prepareStatements();

      // Always rebuild lookup helper cache at startup for consistency
      // This ensures cache is always in sync with current configuration
      // Performance: ~30-50ms is negligible for desktop app startup
      await this.rebuildLookupHelperCache();


    } catch (error) {
      this.logger.error('Failed to load FRN configuration from database');
      if (error instanceof FRNConfigurationError) {
        throw error;
      }
      throw new FRNConfigurationError(
        `Failed to load FRN configuration: ${error instanceof Error ? error.message : String(error)}`,
        'load_failed'
      );
    }
  }

  /**
   * Parse configuration rows from database into typed configuration object
   */
  private parseConfiguration(rows: Array<{config_key: string, config_value: string, config_type: string}>): FRNMatchingConfig {
    const config: Partial<FRNMatchingConfig> = {};

    for (const row of rows) {
      const key = row.config_key.replace('frn_matching_', '');
      const value = row.config_value;
      const type = row.config_type;

      try {
        switch (key) {
          // Boolean parameters
          case 'enabled':
          case 'enable_fuzzy':
          case 'enable_alias':
          case 'enable_audit_trail':
          case 'enable_research_queue':
          case 'normalization_enabled':
          case 'auto_flag_unmatched':
            (config as any)[this.camelCase(key)] = value === 'true';
            break;

          // Number parameters
          case 'fuzzy_threshold':
          case 'max_edit_distance':
          case 'batch_size':
          case 'exact_match_confidence':
          case 'alias_match_confidence':
          case 'fuzzy_match_confidence':
          case 'confidence_threshold_high':
          case 'confidence_threshold_low':
          case 'research_queue_max_size':
          case 'timeout_ms':
          case 'max_concurrent_lookups':
            const numValue = parseFloat(value);
            if (isNaN(numValue)) {
              throw new FRNConfigurationError(`Invalid number value for ${key}: ${value}`, key);
            }
            (config as any)[this.camelCase(key)] = numValue;
            break;

          // JSON array parameters
          case 'normalization_prefixes':
          case 'normalization_suffixes':
            config[this.camelCase(key) as keyof FRNMatchingConfig] = JSON.parse(value);
            break;

          // JSON object parameters
          case 'normalization_abbreviations':
            config.normalizationAbbreviations = JSON.parse(value);
            break;

          // String parameters
          case 'log_level':
            if (!['debug', 'info', 'warn', 'error'].includes(value)) {
              throw new FRNConfigurationError(`Invalid log level: ${value}`, key);
            }
            config.logLevel = value as any;
            break;

          default:
            this.logger.warning(`Unknown configuration parameter: ${row.config_key}`);
        }
      } catch (error) {
        if (error instanceof FRNConfigurationError) {
          throw error;
        }
        throw new FRNConfigurationError(
          `Failed to parse configuration parameter ${row.config_key}: ${error instanceof Error ? error.message : String(error)}`,
          row.config_key
        );
      }
    }

    // Validate all required parameters are present and valid
    this.validateConfiguration(config as FRNMatchingConfig);

    return config as FRNMatchingConfig;
  }

  /**
   * Convert snake_case to camelCase
   */
  private camelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Validate configuration values
   */
  private validateConfiguration(config: FRNMatchingConfig): void {
    if (config.fuzzyThreshold < 0 || config.fuzzyThreshold > 1) {
      throw new FRNConfigurationError('fuzzy_threshold must be between 0 and 1', 'fuzzy_threshold');
    }

    if (config.maxEditDistance < 1) {
      throw new FRNConfigurationError('max_edit_distance must be >= 1', 'max_edit_distance');
    }

    if (config.batchSize < 1) {
      throw new FRNConfigurationError('batch_size must be >= 1', 'batch_size');
    }

    if (config.exactMatchConfidence < 0 || config.exactMatchConfidence > 1) {
      throw new FRNConfigurationError('exact_match_confidence must be between 0 and 1', 'exact_match_confidence');
    }

    if (config.confidenceThresholdHigh < config.confidenceThresholdLow) {
      throw new FRNConfigurationError('confidence_threshold_high must be >= confidence_threshold_low', 'confidence_threshold_high');
    }
  }

  /**
   * Set batch ID for audit trail compliance
   */
  setBatchId(batchId: string): void {
    this.currentBatchId = batchId;
  }

  /**
   * Log FRN matching audit entry for regulatory compliance
   */
  /**
   * Calculate normalization quality score based on transformation complexity
   */
  private calculateNormalizationQuality(original: string, normalized: string): number {
    if (!original || !normalized) return 0;

    // Simple quality scoring based on transformation complexity
    const originalLength = original.length;
    const normalizedLength = normalized.length;
    const lengthDiff = Math.abs(originalLength - normalizedLength);

    // Score based on length preservation and character similarity
    const lengthScore = 1 - (lengthDiff / Math.max(originalLength, 1));
    const similarityScore = this.calculateSimilarity(original.toLowerCase(), normalized.toLowerCase());

    return Math.round((lengthScore * 0.3 + similarityScore * 0.7) * 100) / 100;
  }

  /**
   * Calculate string similarity for normalization quality assessment
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);

    // Enforce max edit distance limit
    if (distance > this.config.maxEditDistance) {
      return 0; // Similarity is 0 if edit distance exceeds limit
    }

    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + substitutionCost
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Get confidence threshold used for a specific decision routing
   */
  private getConfidenceThresholdForDecision(decisionRouting: string): string {
    const thresholds = {
      'auto_assigned': '0.85',
      'high_confidence': '0.90',
      'medium_confidence': '0.70',
      'low_confidence': '0.50',
      'research_queue': '0.30',
      'no_match': '0.00'
    };

    return thresholds[decisionRouting as keyof typeof thresholds] || '0.70';
  }

  private async logMatchingAudit(entry: {
    productId: string;
    originalBankName: string;
    normalizedBankName: string;
    normalizationSteps: string;
    candidateFrns: string;
    finalFrn?: string;
    finalConfidence?: number;
    decisionRouting: 'auto_assigned' | 'research_queue' | 'default_assigned';
    databaseQueryMethod: string;
    matchType?: string;
    processingTimeMs?: number;
    addedToResearchQueue?: boolean;
  }): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO frn_matching_audit (
          batch_id, product_id, original_bank_name, normalized_bank_name,
          normalization_steps, database_query_method, candidate_frns,
          final_frn, final_confidence, decision_routing,
          confidence_threshold_used, added_to_research_queue, research_queue_priority,
          manual_override_frn, manual_override_timestamp,
          processing_time_ms, database_query_time_ms, normalization_quality_score,
          match_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Calculate additional metrics
      const databaseQueryTimeMs = entry.processingTimeMs ? Math.round(entry.processingTimeMs * 0.6) : null;
      const normalizationQualityScore = this.calculateNormalizationQuality(entry.originalBankName, entry.normalizedBankName);
      const confidenceThresholdUsed = this.getConfidenceThresholdForDecision(entry.decisionRouting);

      // Determine manual override fields
      const isManualOverride = entry.matchType === 'manual_override';
      const manualOverrideFrn = isManualOverride ? entry.finalFrn : null;
      const manualOverrideTimestamp = isManualOverride ? new Date().toISOString() : null;

      stmt.run(
        this.currentBatchId,
        entry.productId,
        entry.originalBankName,
        entry.normalizedBankName,
        entry.normalizationSteps,
        entry.databaseQueryMethod,
        entry.candidateFrns,
        entry.finalFrn || null,
        entry.finalConfidence ?? null,
        entry.decisionRouting,
        confidenceThresholdUsed,
        entry.addedToResearchQueue ? 1 : 0,
        entry.addedToResearchQueue ? 'normal' : null, // research_queue_priority
        manualOverrideFrn,
        manualOverrideTimestamp,
        entry.processingTimeMs ?? null,
        databaseQueryTimeMs,
        normalizationQualityScore,
        entry.matchType || null
      );
    } catch (error) {
      this.logger.error(`Failed to log matching audit for ${entry.productId}: ${error}`);
      // Don't throw - audit failure shouldn't break pipeline
    }
  }

  /**
   * Process products for FRN matching
   */
  async processProducts(products: any[]): Promise<FRNMatchingServiceResult> {
    // Ensure configuration has been loaded
    if (!this.stmts) {
      throw new Error('FRN Matching Service not properly initialized. Call loadConfiguration() first.');
    }

    const startTime = Date.now();
    const timeoutMs = this.config.timeoutMs;

    // Set up timeout if configured
    let timeoutHandle: NodeJS.Timeout | null = null;
    let hasTimedOut = false;

    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        hasTimedOut = true;
        this.logger.error(`FRN matching timed out after ${timeoutMs}ms`);
      }, timeoutMs);
    }
    const stats: FRNMatchingStats = {
      totalProducts: products.length,
      exactMatches: 0,
      fuzzyMatches: 0,
      aliasMatches: 0,
      noMatches: 0,
      researchQueue: 0,
      averageConfidence: 0,
      processingTimeMs: 0
    };

    const enrichedProducts: EnrichedProduct[] = [];
    const errors: string[] = [];
    let totalConfidence = 0;

    this.logger.info(`Processing ${products.length} products for FRN matching`);

    try {
      // Process in batches for better performance
      for (let i = 0; i < products.length; i += this.config.batchSize) {
        const batch = products.slice(i, i + this.config.batchSize);

        for (const product of batch) {
          // Check for timeout
          if (hasTimedOut) {
            throw new Error(`Processing timed out after ${timeoutMs}ms`);
          }

          try {
            const enriched = await this.enrichProduct(product);
            enrichedProducts.push(enriched);

            // Update statistics
            totalConfidence += enriched.frnConfidence;
            switch (enriched.frnSource) {
              case 'EXACT':
                stats.exactMatches++;
                break;
              case 'FUZZY':
                stats.fuzzyMatches++;
                break;
              case 'ALIAS':
                stats.aliasMatches++;
                break;
              case 'NONE':
                if (enriched.frnStatus === 'RESEARCH_QUEUE') {
                  stats.researchQueue++;
                } else {
                  stats.noMatches++;
                }
                break;
            }

            // Log audit trail for regulatory compliance
            if (this.config.enableAuditTrail && this.currentBatchId) {
              const decisionRouting = enriched.frnStatus === 'RESEARCH_QUEUE'
                ? 'research_queue'
                : enriched.frn
                  ? 'auto_assigned'
                  : 'default_assigned';

              const processingTimeMs = Date.now() - startTime;

              await this.logMatchingAudit({
                productId: `${product.platform || 'unknown'}-${product.bankName}`,
                originalBankName: product.bankName,
                normalizedBankName: enriched.bankNameNormalized,
                normalizationSteps: JSON.stringify([{
                  action: 'bank_name_normalization',
                  before: product.bankName,
                  after: enriched.bankNameNormalized
                }]),
                databaseQueryMethod: enriched.frnSource === 'FUZZY' ? 'fuzzy_matching' :
                                   enriched.frnSource === 'EXACT' ? 'exact_match' :
                                   enriched.frnSource === 'ALIAS' ? 'alias_lookup' : 'unknown',
                matchType: enriched.frnMatchType,
                candidateFrns: JSON.stringify([{
                  frn: enriched.frn || null,
                  bankName: enriched.bankName,
                  confidence: enriched.frnConfidence,
                  matchType: enriched.frnSource?.toLowerCase()
                }]),
                finalFrn: enriched.frn,
                finalConfidence: enriched.frnConfidence,
                decisionRouting: decisionRouting as any,
                processingTimeMs: processingTimeMs,
                addedToResearchQueue: enriched.frnStatus === 'RESEARCH_QUEUE'
              });
            }

            // Emit progress
            this.emit('progress', {
              processed: enrichedProducts.length,
              total: products.length,
              percentage: Math.round((enrichedProducts.length / products.length) * 100)
            });

          } catch (error) {
            const errorMsg = `Failed to process product ${product.bankName}: ${error instanceof Error ? error.message : String(error)}`;
            this.logger.error(errorMsg);
            errors.push(errorMsg);
          }
        }
      }

      // Calculate final statistics
      stats.averageConfidence = totalConfidence / Math.max(enrichedProducts.length, 1);
      stats.processingTimeMs = Date.now() - startTime;

      this.logger.info(`FRN matching completed: ${stats.exactMatches} exact, ${stats.fuzzyMatches} fuzzy, ${stats.aliasMatches} alias, ${stats.noMatches} no match, ${stats.researchQueue} research queue`);

      // Update available_products_raw with enriched FRN data
      await this.updateRawTableWithEnrichments(enrichedProducts);

      return {
        success: errors.length === 0,
        processedCount: enrichedProducts.length,
        enrichedProducts,
        stats,
        errors,
        duration: stats.processingTimeMs
      };

    } catch (error) {
      const errorMsg = `FRN matching failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);

      return {
        success: false,
        processedCount: enrichedProducts.length,
        enrichedProducts,
        stats,
        errors: [errorMsg, ...errors],
        duration: Date.now() - startTime
      };
    } finally {
      // Clean up timeout
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Enrich a single product with FRN data
   */
  private async enrichProduct(product: any): Promise<EnrichedProduct> {
    const bankName = product.bankName || product.bank_name || '';
    const normalizedBankName = this.normalizeBankName(bankName);

    // Validate required fields
    if (!product.source) {
      throw new Error(`FRN Matching: Missing source field for product ${bankName}. Source field is required and cannot be null or empty.`);
    }

    // Convert product to pipeline format (camelCase)
    const enriched: EnrichedProduct = {
      // Core product data
      bankName: bankName,
      platform: product.platform || '',
      accountType: product.accountType || product.account_type || '',
      aerRate: parseFloat(product.aerRate || product.aer_rate || 0),
      grossRate: parseFloat(product.grossRate || product.gross_rate || 0),
      balance: parseFloat(product.balance || 0),
      minimumBalance: parseFloat(product.minimumBalance || product.minimum_balance || 0),
      maximumBalance: parseFloat(product.maximumBalance || product.maximum_balance || 0),
      notice: product.notice || '',

      // Default FRN data
      frnConfidence: 0,
      frnStatus: 'NO_MATCH',
      frnSource: 'NONE',
      fscsProtected: false,
      bankNameNormalized: normalizedBankName,

      // Additional fields for deduplication compatibility
      termMonths: product.termMonths || product.term_months,
      noticePeriodDays: product.noticePeriodDays || product.notice_period_days,
      source: product.source,

      // Metadata
      scrapeDate: product.scrapeDate || product.scrape_date || new Date().toISOString(),
      sourceFile: product.sourceFile || product.source_file || 'unknown',
      sourceReliability: product.sourceReliability || product.source_reliability
    };

    // Try FRN matching in order of preference
    // First try exact match with original normalization for backward compatibility
    const match = this.findExactMatch(normalizedBankName) ||
                  // Then try enhanced fuzzy matching which handles legal suffixes better
                  (this.config.enableFuzzy && this.findFuzzyMatch(normalizedBankName)) ||
                  // Finally try alias matching
                  (this.config.enableAlias && this.findAliasMatch(normalizedBankName));

    if (match) {
      enriched.frn = match.frn;
      enriched.frnConfidence = match.confidence;
      enriched.frnSource = match.source as any;
      enriched.frnMatchType = match.matchType;
      enriched.fscsProtected = match.fscsProtected;

      // Determine status based on confidence thresholds
      enriched.frnStatus = this.determineMatchStatus(match.confidence);

      // If status is RESEARCH_QUEUE, add to queue
      if (enriched.frnStatus === 'RESEARCH_QUEUE' && this.config.enableResearchQueue && this.config.autoFlagUnmatched) {
        if (this.shouldAddToResearchQueue(normalizedBankName)) {
          this.addToResearchQueue(normalizedBankName, bankName);
        }
      }
    } else {
      // No match found - add to research queue if enabled
      if (this.config.enableResearchQueue && this.config.autoFlagUnmatched && this.shouldAddToResearchQueue(normalizedBankName)) {
        enriched.frnStatus = 'RESEARCH_QUEUE';
        this.addToResearchQueue(normalizedBankName, bankName);
      }
    }

    return enriched;
  }

  /**
   * Find exact FRN match
   */
  private findExactMatch(normalizedBankName: string): FRNLookupRecord & { source: string } | null {
    try {
      if (!this.stmts) {
        return null;
      }

      const result = this.stmts.exactMatch.get(normalizedBankName) as any;

      if (result) {
        return {
          frn: result.frn,
          bankName: result.bank_name,
          tradingName: result.trading_name,
          isActive: Boolean(result.is_active),
          fscsProtected: Boolean(result.fscs_protected),
          confidence: result.confidence_score || this.config.exactMatchConfidence,
          matchType: result.match_type,
          source: 'EXACT'
        };
      }
    } catch (error) {
      this.logger.error(`Exact match query failed: ${error}`);
    }
    return null;
  }

  /**
   * Find alias match
   */
  private findAliasMatch(normalizedBankName: string): FRNLookupRecord & { source: string } | null {
    try {
      if (!this.stmts) return null;
      const result = this.stmts.aliasMatch.get(`%${normalizedBankName}%`) as any;
      if (result) {
        return {
          frn: result.frn,
          bankName: result.bank_name,
          tradingName: result.trading_name,
          isActive: Boolean(result.is_active),
          fscsProtected: Boolean(result.fscs_protected),
          confidence: this.config.aliasMatchConfidence,
          matchType: result.match_type,
          source: 'ALIAS'
        };
      }
    } catch (error) {
      this.logger.error(`Alias match query failed: ${error}`);
    }
    return null;
  }

  /**
   * Find fuzzy match using Levenshtein distance similarity
   */
  private findFuzzyMatch(normalizedBankName: string): FRNLookupRecord & { source: string } | null {
    try {
      if (!this.stmts) return null;

      // Get ALL banks from frn_lookup_helper and use Levenshtein distance for matching
      // This eliminates space-sensitivity issues with LIKE patterns
      const allBanks = this.stmts.allBanksForFuzzy.all() as any[];

      let bestMatch: any = null;
      let bestSimilarity = 0;

      for (const bank of allBanks) {
        // Use space-insensitive normalization for similarity comparison
        const inputForSimilarity = this.normalizeForSimilarity(normalizedBankName);
        const dbForSimilarity = this.normalizeForSimilarity(bank.search_name);
        const similarity = this.calculateSimilarity(inputForSimilarity, dbForSimilarity);

        // Keep track of the best match that exceeds our threshold
        if (similarity >= this.config.fuzzyThreshold && similarity > bestSimilarity) {
          bestMatch = bank;
          bestSimilarity = similarity;
        }

        // Early exit for perfect matches
        if (bestSimilarity >= 0.99) break;
      }

      if (bestMatch) {
        return {
          frn: bestMatch.frn,
          bankName: bestMatch.canonical_name,
          tradingName: bestMatch.canonical_name,
          isActive: true,
          fscsProtected: true,
          confidence: bestSimilarity * this.config.fuzzyMatchConfidence,
          source: 'FUZZY'
        };
      }
    } catch (error) {
      this.logger.error(`Fuzzy match query failed: ${error}`);
    }
    return null;
  }


  /**
   * Normalize bank name for matching using configurable rules
   */
  private normalizeBankName(bankName: string): string {
    if (!this.config.normalizationEnabled) {
      return bankName.trim().toUpperCase();
    }

    let normalized = bankName.toUpperCase().trim()
      .replace(/[^A-Z0-9\s]/g, '')  // Remove special characters
      .replace(/\s+/g, ' ')         // Normalize spaces
      .trim();

    // Apply configurable prefix removal
    for (const prefix of this.config.normalizationPrefixes) {
      if (normalized.startsWith(prefix)) {
        normalized = normalized.substring(prefix.length).trim();
        break; // Only remove one prefix
      }
    }

    // Apply configurable suffix removal (iterative for multiple suffixes)
    let changed = true;
    while (changed) {
      changed = false;
      for (const suffix of this.config.normalizationSuffixes) {
        // Create word boundary regex for each suffix - anchored to END of string
        const regex = new RegExp('\\b' + suffix.trim() + '$');
        if (regex.test(normalized)) {
          normalized = normalized.replace(regex, '').trim();
          changed = true;
        }
      }
    }

    // Apply configurable abbreviation expansion
    for (const [abbr, expansion] of Object.entries(this.config.normalizationAbbreviations)) {
      const regex = new RegExp(`\\b${abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      normalized = normalized.replace(regex, expansion);
    }

    // Final cleanup
    return normalized.replace(/\s+/g, ' ').trim();
  }

  /**
   * Normalize bank name for similarity calculations (space-insensitive)
   */
  private normalizeForSimilarity(bankName: string): string {
    return this.normalizeBankName(bankName)
      .replace(/\s+/g, '');  // Remove ALL spaces for similarity comparison
  }

  /**
   * Determine match status based on confidence thresholds
   */
  private determineMatchStatus(confidence: number): 'MATCHED' | 'RESEARCH_QUEUE' | 'NO_MATCH' {
    if (confidence >= this.config.confidenceThresholdHigh) {
      return 'MATCHED';
    } else if (confidence >= this.config.confidenceThresholdLow) {
      return this.config.enableResearchQueue ? 'RESEARCH_QUEUE' : 'NO_MATCH';
    } else {
      return 'NO_MATCH';
    }
  }

  /**
   * Check if bank should be added to research queue
   */
  private shouldAddToResearchQueue(normalizedBankName: string): boolean {
    // Only exclude truly generic/meaningless terms - not legitimate bank names
    const genericTerms = ['account', 'deposit', 'cash', 'unknown', 'savings account', 'deposit account'];
    if (genericTerms.some(term => normalizedBankName === term || normalizedBankName.includes(term))) {
      return false;
    }

    // Don't add if already in research queue (check FIRST to avoid duplicate warnings)
    const existing = this.db.prepare(
      'SELECT COUNT(*) as count FROM frn_research_queue WHERE bank_name = ?'
    ).get(normalizedBankName) as any;

    if ((existing?.count || 0) > 0) {
      return false;  // Already in queue - silently skip
    }

    // Check if queue size limit would be exceeded (check LAST after duplicate check)
    const currentQueueSize = this.db.prepare(
      'SELECT COUNT(*) as count FROM frn_research_queue'
    ).get() as any;

    if ((currentQueueSize?.count || 0) >= this.config.researchQueueMaxSize) {
      this.logger.warning(`Research queue size limit (${this.config.researchQueueMaxSize}) reached, not adding ${normalizedBankName}`);
      return false;
    }

    return true;
  }

  /**
   * Add bank to research queue
   */
  private addToResearchQueue(normalizedBankName: string, originalBankName: string): void {
    try {
      if (!this.stmts) return;
      this.stmts.insertResearch.run(
        originalBankName,    // bank_name (use original, not normalized)
        'pipeline',         // platform
        'frn_matching',     // source
        new Date().toISOString() // first_seen
      );
    } catch (error) {
      // Ignore duplicate errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!errorMsg.includes('UNIQUE constraint failed')) {
        this.logger.error(`Failed to add to research queue: ${errorMsg}`);
      }
    }
  }

  /**
   * Prepare SQL statements for performance
   */
  private prepareStatements(): void {
    this.stmts = {
      exactMatch: this.db.prepare(`
        SELECT frn, canonical_name as bank_name, canonical_name as trading_name, 1 as is_active, 1 as fscs_protected, match_type, confidence_score
        FROM frn_lookup_helper
        WHERE search_name = ? COLLATE NOCASE AND match_rank = 1
        LIMIT 1
      `),

      fuzzyMatch: this.db.prepare(`
        SELECT frn, canonical_name as bank_name, canonical_name as trading_name, 1 as is_active, 1 as fscs_protected, match_type, confidence_score
        FROM frn_lookup_helper
        WHERE match_rank = 1
        LIMIT 1
      `),

      allBanksForFuzzy: this.db.prepare(`
        SELECT frn, canonical_name, search_name, match_type
        FROM frn_lookup_helper
        WHERE match_rank = 1
        ORDER BY LENGTH(search_name)
      `),

      aliasMatch: this.db.prepare(`
        SELECT frn, canonical_name as bank_name, canonical_name as trading_name, 1 as is_active, 1 as fscs_protected, match_type
        FROM frn_lookup_helper
        WHERE match_type IN ('shared_brand', 'name_variation') AND search_name LIKE ? AND match_rank = 1
        LIMIT 1
      `),

      insertResearch: this.db.prepare(`
        INSERT OR IGNORE INTO frn_research_queue
        (bank_name, platform, source, first_seen)
        VALUES (?, ?, ?, ?)
      `)
    };
  }

  /**
   * Update available_products_raw with enriched FRN data
   */
  private async updateRawTableWithEnrichments(enrichedProducts: EnrichedProduct[]): Promise<void> {

    const updateStmt = this.db.prepare(`
      UPDATE available_products_raw
      SET frn = ?,
          bank_name = ?,
          confidence_score = ?,
          imported_at = CURRENT_TIMESTAMP
      WHERE bank_name = ? AND platform = ? AND source = ?
    `);

    let updatedCount = 0;
    for (const product of enrichedProducts) {
      try {
        const result = updateStmt.run(
          product.frn || null,
          product.bankName, // Use normalized bank name
          product.frnConfidence, // Use actual confidence (0 for NO_MATCH is valid)
          // WHERE conditions - match original data
          product.bankName, // Should match normalized name in raw table
          product.platform,
          product.source
        );

        if (result.changes > 0) {
          updatedCount++;
        }
      } catch (error) {
        logger.warn(`Failed to update raw table for ${product.bankName} on ${product.platform}: ${error}`);
      }
    }

  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.logger.info('FRN Matching Service closed');
    }
  }

  /**
   * Get service statistics
   */
  getStats(): any {
    try {
      const stats = this.db.prepare(`
        SELECT
          (SELECT COUNT(DISTINCT frn) FROM frn_lookup_helper) as total_frns,
          (SELECT COUNT(*) FROM boe_shared_brands) as total_aliases,
          (SELECT COUNT(*) FROM frn_research_queue) as research_queue_size
      `).get();

      return stats;
    } catch (error) {
      this.logger.error(`Failed to get stats: ${error}`);
      return {};
    }
  }


  /**
   * Rebuild frn_lookup_helper_cache from source tables
   * Called at startup and whenever normalization config changes via UI
   */
  async rebuildLookupHelperCache(): Promise<void> {
    const startTime = Date.now();

    try {
      // Clear existing cache
      this.db.prepare('DELETE FROM frn_lookup_helper_cache').run();

      // Generate entries for each source
      this.generateManualOverrideEntries();
      this.generateBOEInstitutionEntries();
      this.generateSharedBrandEntries();

      // Rank entries by priority
      this.rankCacheEntries();

      const count = this.db.prepare('SELECT COUNT(*) as count FROM frn_lookup_helper_cache').get() as { count: number };
      const elapsed = Date.now() - startTime;

      console.log(`✅ FRN lookup cache rebuilt: ${count.count} entries (${elapsed}ms)`);
    } catch (error) {
      this.logger.error(`Failed to rebuild lookup helper cache: ${error}`);
      throw error;
    }
  }

  /**
   * Generate cache entries from manual_overrides
   */
  private generateManualOverrideEntries(): void {
    const overrides = this.db.prepare(`
      SELECT frn, scraped_name, firm_name, confidence_score
      FROM frn_manual_overrides
      WHERE frn IS NOT NULL
    `).all() as Array<{ frn: string; scraped_name: string; firm_name: string | null; confidence_score: number }>;

    for (const override of overrides) {
      const canonical = override.firm_name || override.scraped_name;
      const variations = this.generateNameVariations(override.scraped_name);

      for (const searchName of variations) {
        this.db.prepare(`
          INSERT INTO frn_lookup_helper_cache
          (frn, canonical_name, search_name, match_type, confidence_score, priority_rank, source_table)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(override.frn, canonical, searchName, 'manual_override', override.confidence_score, 1, 'frn_manual_overrides');
      }
    }
  }

  /**
   * Generate cache entries from boe_institutions
   */
  private generateBOEInstitutionEntries(): void {
    const institutions = this.db.prepare(`
      SELECT frn, firm_name
      FROM boe_institutions
    `).all() as Array<{ frn: string; firm_name: string }>;

    for (const inst of institutions) {
      const variations = this.generateNameVariations(inst.firm_name);

      for (const searchName of variations) {
        const upper = inst.firm_name.toUpperCase().trim();
        const isDirect = searchName === upper;

        this.db.prepare(`
          INSERT INTO frn_lookup_helper_cache
          (frn, canonical_name, search_name, match_type, confidence_score, priority_rank, source_table)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          inst.frn,
          inst.firm_name,
          searchName,
          isDirect ? 'direct_match' : 'name_variation',
          isDirect ? 1.0 : 0.95,
          isDirect ? 2 : 3,
          'boe_institutions'
        );
      }
    }
  }

  /**
   * Generate cache entries from boe_shared_brands
   */
  private generateSharedBrandEntries(): void {
    const brands = this.db.prepare(`
      SELECT DISTINCT sb.trading_name, boe.frn, boe.firm_name
      FROM boe_shared_brands sb
      JOIN boe_institutions boe ON sb.primary_frn = boe.frn
      WHERE UPPER(sb.trading_name) != UPPER(boe.firm_name)
    `).all() as Array<{ trading_name: string; frn: string; firm_name: string }>;

    for (const brand of brands) {
      const variations = this.generateNameVariations(brand.trading_name);

      for (const searchName of variations) {
        this.db.prepare(`
          INSERT INTO frn_lookup_helper_cache
          (frn, canonical_name, search_name, match_type, confidence_score, priority_rank, source_table)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(brand.frn, brand.firm_name, searchName, 'shared_brand', 0.85, 4, 'boe_shared_brands');
      }
    }
  }

  /**
   * Generate all name variations by:
   * 1. Optionally expanding abbreviations
   * 2. Removing prefix/suffix combinations
   */
  private generateNameVariations(originalName: string): Set<string> {
    const variations = new Set<string>();
    const upper = originalName.toUpperCase().trim();

    // Generate variations with and without abbreviation expansion
    for (const expandAbbr of [false, true]) {
      let normalized = upper;

      // Step 1: Optionally expand abbreviations
      if (expandAbbr && this.config.normalizationEnabled) {
        normalized = this.expandAbbreviations(normalized);
      }

      // Step 2: Generate all combinations of prefix/suffix removal
      for (let removePrefixes = 0; removePrefixes <= 1; removePrefixes++) {
        for (let removeSuffixes = 0; removeSuffixes <= 1; removeSuffixes++) {
          let variation = normalized;

          if (removePrefixes && this.config.normalizationEnabled) {
            variation = this.removePrefixes(variation);
          }

          if (removeSuffixes && this.config.normalizationEnabled) {
            variation = this.removeSuffixes(variation);
          }

          if (variation.length > 0) {
            variations.add(variation);
          }
        }
      }
    }

    return variations;
  }

  /**
   * Expand abbreviations in bank name
   */
  private expandAbbreviations(name: string): string {
    let expanded = name;
    for (const [abbr, expansion] of Object.entries(this.config.normalizationAbbreviations)) {
      const regex = new RegExp(`\\b${abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      expanded = expanded.replace(regex, expansion);
    }
    return expanded.replace(/\s+/g, ' ').trim();
  }

  /**
   * Remove prefixes from bank name
   */
  private removePrefixes(name: string): string {
    let result = name;
    for (const prefix of this.config.normalizationPrefixes) {
      if (result.startsWith(prefix)) {
        result = result.substring(prefix.length).trim();
        break;
      }
    }
    return result;
  }

  /**
   * Remove suffixes from bank name (iterative to handle multiple suffixes)
   */
  private removeSuffixes(name: string): string {
    let result = name;
    let changed = true;
    while (changed) {
      changed = false;
      for (const suffix of this.config.normalizationSuffixes) {
        const regex = new RegExp('\\b' + suffix.trim() + '$');
        if (regex.test(result)) {
          result = result.replace(regex, '').trim();
          changed = true;
        }
      }
    }
    return result.replace(/\s+/g, ' ').trim();
  }

  /**
   * Assign match_rank to cache entries based on priority
   */
  private rankCacheEntries(): void {
    this.db.prepare(`
      UPDATE frn_lookup_helper_cache
      SET match_rank = (
        SELECT COUNT(*) + 1
        FROM frn_lookup_helper_cache c2
        WHERE c2.search_name = frn_lookup_helper_cache.search_name
          AND (c2.priority_rank < frn_lookup_helper_cache.priority_rank
               OR (c2.priority_rank = frn_lookup_helper_cache.priority_rank
                   AND c2.confidence_score > frn_lookup_helper_cache.confidence_score))
      )
    `).run();
  }

  /**
   * Add or update a manual override and rebuild the cache
   * This ensures the override takes effect immediately
   */
  async addManualOverride(
    scrapedName: string,
    frn: string,
    firmName?: string,
    confidenceScore: number = 1.0,
    notes?: string
  ): Promise<void> {
    try {
      this.logger.info(`Adding manual override: ${scrapedName} → ${frn}`);

      // Insert or update the manual override
      this.db.prepare(`
        INSERT OR REPLACE INTO frn_manual_overrides
        (scraped_name, frn, firm_name, confidence_score, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(scrapedName, frn, firmName, confidenceScore, notes);

      // Rebuild cache to include the new override
      await this.rebuildLookupHelperCache();

      this.logger.info(`✅ Manual override added and cache rebuilt`);
    } catch (error) {
      this.logger.error(`Failed to add manual override: ${error}`);
      throw error;
    }
  }

  /**
   * Remove a manual override and rebuild the cache
   */
  async removeManualOverride(scrapedName: string): Promise<void> {
    try {
      this.logger.info(`Removing manual override: ${scrapedName}`);

      const result = this.db.prepare(
        'DELETE FROM frn_manual_overrides WHERE scraped_name = ?'
      ).run(scrapedName);

      if (result.changes > 0) {
        // Rebuild cache to remove the override
        await this.rebuildLookupHelperCache();
        this.logger.info(`✅ Manual override removed and cache rebuilt`);
      } else {
        this.logger.warning(`No manual override found for: ${scrapedName}`);
      }
    } catch (error) {
      this.logger.error(`Failed to remove manual override: ${error}`);
      throw error;
    }
  }
}
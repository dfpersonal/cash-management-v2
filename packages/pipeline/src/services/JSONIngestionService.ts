import * as Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { Engine } from 'json-rules-engine';
import {
  RulesBasedModule,
  BusinessRule,
  ParsedBusinessRule,
  ConfigCategory,
  ModuleStatus,
  ValidationResult
} from '@cash-mgmt/shared';
import { logger } from '../utils/PipelineLogger';

// Corruption detection and error handling interfaces
export enum JSONIngestionCriticalErrorType {
  CONFIG_LOAD_FAILED = 'CONFIG_LOAD_FAILED',
  DATABASE_FAILED = 'DATABASE_FAILED',
  SCRAPER_CONFIG_FAILED = 'SCRAPER_CONFIG_FAILED',
  BUSINESS_RULES_FAILED = 'BUSINESS_RULES_FAILED',
  DATA_CORRUPTION = 'DATA_CORRUPTION',
  VALIDATION_FAILED = 'VALIDATION_FAILED'
}

export interface ValidationTracker {
  totalProducts: number;
  validationFailures: number;
  corruptionThreshold: number;

  addProduct(): void;
  addValidationFailure(): void;
  isSystematicCorruption(): boolean;
  getFailureRate(): number;
}

export interface RuleEvaluationResult {
  productIndex: number;
  passed: boolean;
  facts: Record<string, unknown>;
  events: Array<{
    type: string;
    params?: Record<string, unknown>;
  }>;
}

export class JSONIngestionValidationTracker implements ValidationTracker {
  public totalProducts = 0;
  public validationFailures = 0;
  public corruptionThreshold: number;

  constructor(corruptionThreshold: number) {
    this.corruptionThreshold = corruptionThreshold;
  }

  addProduct(): void {
    this.totalProducts++;
  }

  addValidationFailure(): void {
    this.validationFailures++;
  }

  isSystematicCorruption(): boolean {
    return this.totalProducts > 0 &&
           (this.validationFailures / this.totalProducts) > this.corruptionThreshold;
  }

  getFailureRate(): number {
    return this.totalProducts > 0 ?
           (this.validationFailures / this.totalProducts) : 0;
  }
}

export interface JSONIngestionConfig {
  // Rate filtering configuration
  rateFilteringEnabled: boolean;
  easyAccessMinRate: number;
  noticeMinRate: number;
  fixedTermMinRate: number;

  // Enhanced validation ranges (NO HARDCODED VALUES)
  aerRateMin: number;
  aerRateMax: number;
  termMonthsMin: number;
  termMonthsMax: number;
  noticeDaysMin: number;
  noticeDaysMax: number;
  dataCorruptionThreshold: number;

  // Processing configuration
  batchSize: number;
  timeoutMs: number;
  validateSchema: boolean;
  trackFiles: boolean;

  // Directory structure
  dataDirectory: string;
  platformDirectories: string[];
}

export interface IngestionResult {
  success: boolean;
  filesProcessed: number;
  productsInserted: number;
  errors: string[];
  duration: number;
  processedFiles: string[];
  statistics: IngestionStatistics;
}

/**
 * Pure transform result from JSON Ingestion (Phase 3 refactor)
 */
export interface IngestionServiceResult {
  passed: ParsedProduct[];      // Valid products ready for FRN resolution
  rejected: InvalidProduct[];   // Products that failed validation
  statistics: {
    processed: number;
    passed: number;
    rejected: number;
    validationErrors: number;
    rateFiltered: number;
    duration: number;
    byPlatform: Record<string, {
      processed: number;
      passed: number;
      rejected: number;
    }>;
  };
  errors: string[];
}

/**
 * Parsed and validated product (output from JSON ingestion)
 */
export interface ParsedProduct {
  platform: string;              // Normalized platform name
  source: string;                // Original scraper source
  bankName: string;
  accountType: string;
  aerRate: number;
  grossRate: number;
  termMonths: number | null;
  noticePeriodDays: number | null;
  minDeposit: number | null;
  maxDeposit: number | null;
  fscsProtected: boolean;
  interestPaymentFrequency: string | null;
  applyByDate: string | null;
  specialFeatures: string | null;
  scrapeDate: string;
  scrapedAt: string;             // Alias for scrapeDate for ProductData compatibility
  confidenceScore: number;
  validationErrors?: string[];
  // Quality scoring fields
  platformPriority?: number;     // For deduplication quality scoring
  sourceReliability?: number;    // For deduplication quality scoring
}

/**
 * Invalid product (failed validation)
 */
export interface InvalidProduct {
  originalData: ProductData;
  validationErrors: string[];
  rejectionReason: string;
}

export interface IngestionStatistics {
  processingTime: number;
  productsPerSecond: number;
  platformBreakdown: Record<string, number>;
  qualityMetrics: {
    averageConfidenceScore: number;
    filteredByRate: number;
    validationErrors: number;
  };
}

export interface JSONFileData {
  metadata: {
    source: string;
    method: string;
  };
  products: ProductData[];
}

export interface ProductData {
  bankName: string;
  platform: string;
  rawPlatform?: string;
  source?: string;               // Populated from metadata during processing
  accountType: string;
  aerRate: number;
  grossRate: number;
  termMonths: number | null;
  noticePeriodDays: number | null;
  minDeposit: number | null;
  maxDeposit: number | null;
  fscsProtected: boolean;
  interestPaymentFrequency: string | null;
  applyByDate: string | null;
  specialFeatures: string | null;
  scrapedAt: string;
  originalData?: ProductData;
}

export class JSONIngestionService {
  private db: Database.Database;
  private config: JSONIngestionConfig | null = null;
  private rules: ParsedBusinessRule[] = [];
  private engine: Engine = new Engine();
  private processedFiles: Set<string>;
  private initialized: boolean = false;

  // Platform and source data loading
  private platformPriorities: Map<string, number> = new Map();
  private sourceReliability: Map<string, number> = new Map();

  // Corruption detection
  private validationTracker: ValidationTracker | null = null;
  private currentBatchId: string = '';

  constructor(db: Database.Database) {
    this.db = db;
    this.processedFiles = new Set();
  }

  /**
   * Set batch ID for audit trail compliance
   */
  setBatchId(batchId: string): void {
    this.currentBatchId = batchId;
  }

  /**
   * Log product processing audit entry for regulatory compliance
   */
  private async logIngestionAudit(entry: {
    productId: string;
    source: string;
    platform: string;
    method: string;
    rawProductJson: string;
    validationStatus: 'valid' | 'invalid';
    validationDetails: string;
    rejectionReasons?: string;
    normalizationApplied: string;
    originalBankName?: string;
    normalizedBankName?: string;
    originalPlatform?: string;
    normalizedPlatform?: string;
    businessRulesFired?: string;
    businessRulesPassed?: boolean;
    processingTimeMs?: number;
    aerRateOriginal?: number | null;
    aerRateValidated?: boolean | null;
    termMonthsOriginal?: number | null;
    termMonthsValidated?: boolean | null;
    noticeDaysOriginal?: number | null;
    noticeDaysValidated?: boolean | null;
    platformSourceConsistent?: boolean;
    platformSourceAuditNotes?: string | null;
    sourceReliabilityScore?: number;
    dataCompletenessScore?: number;
    corruptionIndicatorCount?: number;
    corruptionSeverity?: string | null;
    processingStageTimesMs?: string;
  }): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO json_ingestion_audit (
          batch_id, product_id, source, platform, method, raw_product_json,
          validation_status, validation_details, rejection_reasons,
          normalization_applied, original_bank_name, normalized_bank_name,
          original_platform, normalized_platform,
          aer_rate_original, aer_rate_validated, term_months_original, term_months_validated,
          notice_days_original, notice_days_validated,
          business_rules_fired, business_rules_passed,
          platform_source_consistent, platform_source_audit_notes,
          source_reliability_score, data_completeness_score,
          corruption_indicator_count, corruption_severity,
          processing_time_ms, processing_stage_times
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        this.currentBatchId,
        entry.productId,
        entry.source,
        entry.platform,
        entry.method, // method field for data source tracking
        entry.rawProductJson,
        entry.validationStatus,
        entry.validationDetails,
        entry.rejectionReasons || null,
        entry.normalizationApplied,
        entry.originalBankName || null,
        entry.normalizedBankName || null,
        entry.originalPlatform || null,
        entry.normalizedPlatform || null,
        entry.aerRateOriginal || null,
        entry.aerRateValidated ? 1 : 0,
        entry.termMonthsOriginal || null,
        entry.termMonthsValidated ? 1 : 0,
        entry.noticeDaysOriginal || null,
        entry.noticeDaysValidated ? 1 : 0,
        entry.businessRulesFired || null,
        entry.businessRulesPassed ? 1 : 0,
        entry.platformSourceConsistent ? 1 : 0,
        entry.platformSourceAuditNotes || null,
        entry.sourceReliabilityScore || null,
        entry.dataCompletenessScore || null,
        entry.corruptionIndicatorCount || 0,
        entry.corruptionSeverity || null,
        entry.processingTimeMs || null,
        entry.processingStageTimesMs || null
      );
    } catch (error) {
      logger.error(`Failed to log ingestion audit for ${entry.productId}: ${error}`);
      // Don't throw - audit failure shouldn't break pipeline
    }
  }

  /**
   * Load configuration from unified_config (RulesBasedModule interface)
   */
  async loadConfiguration(category: ConfigCategory = 'json_ingestion'): Promise<JSONIngestionConfig> {
    try {
      const stmt = this.db.prepare(`
        SELECT config_key, config_value, config_type
        FROM unified_config
        WHERE category = ? AND is_active = 1
      `);

      const configRows = stmt.all(category) as Array<{
        config_key: string;
        config_value: string;
        config_type: string;
      }>;

      // Create configuration object - will be populated from database only
      // NO hardcoded defaults - configuration MUST exist in unified_config
      const config: Partial<JSONIngestionConfig> = {
        // Directory structure (platform-specific - not from config)
        // Allow environment variable override for test fixtures directory
        // Use absolute path from monorepo root, resolved from pipeline package location
        dataDirectory: process.env.JSON_DATA_DIR || require('path').resolve(__dirname, '../../../scrapers/data'),
        platformDirectories: ['ajbell', 'flagstone', 'hargreaves-lansdown', 'moneyfacts']
      };

      // Override with database values
      for (const row of configRows) {
        const key = row.config_key;
        let value: string | number | boolean | Record<string, unknown> = row.config_value;

        // Type conversion based on config_type
        if (row.config_type === 'number') {
          value = parseFloat(value as string);
        } else if (row.config_type === 'boolean') {
          value = (value as string) === 'true' || (value as string) === '1';
        } else if (row.config_type === 'json') {
          try {
            value = JSON.parse(value as string);
          } catch {
            logger.warn(`Failed to parse JSON config: ${key}`);
          }
        }

        // Map configuration keys to interface properties
        switch (key) {
          case 'rate_filtering_enabled':
          case 'json_ingestion_rate_filtering_enabled':
            config.rateFilteringEnabled = value as boolean;
            break;
          case 'easy_access_min_rate':
          case 'json_ingestion_easy_access_min_rate':
            config.easyAccessMinRate = value as number;
            break;
          case 'notice_min_rate':
          case 'json_ingestion_notice_min_rate':
            config.noticeMinRate = value as number;
            break;
          case 'fixed_term_min_rate':
          case 'json_ingestion_fixed_term_min_rate':
            config.fixedTermMinRate = value as number;
            break;
          case 'json_ingestion_aer_rate_min':
            config.aerRateMin = value as number;
            break;
          case 'json_ingestion_aer_rate_max':
            config.aerRateMax = value as number;
            break;
          case 'json_ingestion_term_months_min':
            config.termMonthsMin = value as number;
            break;
          case 'json_ingestion_term_months_max':
            config.termMonthsMax = value as number;
            break;
          case 'json_ingestion_notice_days_min':
            config.noticeDaysMin = value as number;
            break;
          case 'json_ingestion_notice_days_max':
            config.noticeDaysMax = value as number;
            break;
          case 'json_ingestion_data_corruption_threshold':
            config.dataCorruptionThreshold = value as number;
            break;
          case 'json_ingestion_batch_size':
            config.batchSize = value as number;
            break;
          case 'json_ingestion_timeout_ms':
            config.timeoutMs = value as number;
            break;
          case 'json_ingestion_validate_schema':
            config.validateSchema = value as boolean;
            break;
          case 'json_ingestion_track_files':
            config.trackFiles = value as boolean;
            break;
        }
      }

      // Validate that all required configuration parameters are present
      const requiredParams = [
        'rateFilteringEnabled', 'easyAccessMinRate', 'noticeMinRate', 'fixedTermMinRate',
        'aerRateMin', 'aerRateMax', 'termMonthsMin', 'termMonthsMax', 'noticeDaysMin', 'noticeDaysMax',
        'dataCorruptionThreshold', 'batchSize', 'timeoutMs', 'validateSchema', 'trackFiles'
      ];

      const missingParams = requiredParams.filter(param => !(param in config));
      if (missingParams.length > 0) {
        throw new Error(`Missing required configuration parameters: ${missingParams.join(', ')}. All parameters must be present in unified_config table.`);
      }

      this.config = config as JSONIngestionConfig;
      logger.info(`✅ Loaded ${configRows.length} JSON ingestion configuration parameters`);
      return this.config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load business rules from unified_business_rules (RulesBasedModule interface)
   */
  async loadRules(category: ConfigCategory = 'json_ingestion'): Promise<ParsedBusinessRule[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT id, rule_name, rule_category, rule_type, conditions, event_type,
               event_params, priority, enabled, description
        FROM unified_business_rules
        WHERE rule_category = ? AND enabled = 1
        ORDER BY priority DESC
      `);

      const ruleRows = stmt.all(category) as Array<{
        id: number;
        rule_name: string;
        rule_category: string;
        rule_type: string;
        conditions: string;
        event_type: string;
        event_params: string | null;
        priority: number;
        enabled: number;
        description: string | null;
      }>;

      this.rules = ruleRows.map(row => ({
        id: row.id,
        ruleName: row.rule_name,
        category: row.rule_category as ConfigCategory,
        type: row.rule_type,
        conditions: (() => {
          const parsed = JSON.parse(row.conditions);
          // Extract inner conditions if double-nested
          return parsed.conditions || parsed;
        })(),
        event: {
          type: row.event_type,
          params: row.event_params ? JSON.parse(row.event_params) : undefined
        },
        priority: row.priority,
        enabled: row.enabled === 1,
        description: row.description || undefined,
        createdAt: '', // Will be populated if needed
        updatedAt: ''  // Will be populated if needed
      }));

      logger.info(`✅ Loaded ${this.rules.length} business rules for ${category}`);
      return this.rules;
    } catch (error) {
      throw new Error(`Failed to load business rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Initialize rules engine with loaded rules (RulesBasedModule interface)
   */
  async initializeEngine(rules: ParsedBusinessRule[]): Promise<void> {
    try {
      this.engine = new Engine();

      // Add each rule to the engine
      for (const rule of rules) {
        try {
          await this.engine.addRule({
            conditions: rule.conditions,
            event: rule.event,
            priority: rule.priority
          });
        } catch (error) {
          logger.warn(`Failed to parse rule ${rule.ruleName}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      logger.info(`✅ Rules engine initialized with ${rules.length} rules`);
    } catch (error) {
      throw new Error(`Failed to initialize rules engine: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Evaluate rules against input data (RulesBasedModule interface)
   */
  async evaluateRules(input: ProductData[]): Promise<any> {
    try {
      const results = [];

      for (const product of input) {
        // Validate product ranges to provide valid_ranges fact
        const rangeValidation = this.validateProductRanges(product);

        // Create facts object for rules evaluation
        const facts = {
          aer_rate: product.aerRate,
          account_type: product.accountType,
          platform: product.platform,
          bank_name: product.bankName,
          min_deposit: product.minDeposit || 0,
          term_months: product.termMonths || 0,
          notice_period_days: product.noticePeriodDays || 0,
          min_rate_threshold: this.getMinRateThreshold(product.accountType),
          required_fields_complete: this.validateRequiredFields(product),
          valid_ranges: rangeValidation.valid  // ✅ FIXED: Provide valid_ranges fact for business rules
        };

        const result = await this.engine.run(facts);
        results.push({
          product,
          events: result.events,
          facts
        });
      }

      return results;
    } catch (error) {
      throw new Error(`Rules evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process products using rules-based logic (RulesBasedModule interface)
   */
  async process(
    input: ProductData[],
    metadata: { source: string; method: string }
  ): Promise<IngestionResult> {
    const startTime = Date.now();

    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Validate configuration before processing
      const validation = await this.validateConfiguration();
      if (!validation.valid) {
        return {
          success: false,
          filesProcessed: 0,
          productsInserted: 0,
          errors: [`Configuration validation failed: ${validation.errors?.join(', ') || 'Unknown error'}`],
          duration: Date.now() - startTime,
          processedFiles: [],
          statistics: {
            processingTime: Date.now() - startTime,
            productsPerSecond: 0,
            platformBreakdown: {},
            qualityMetrics: {
              averageConfidenceScore: 0,
              filteredByRate: 0,
              validationErrors: validation.errors?.length || 0
            }
          }
        };
      }

      // Delegate to processForProducts which has the correct implementation
      const serviceResult = await this.processForProducts(input, metadata);

      // Convert IngestionServiceResult to IngestionResult format
      const platformBreakdown: Record<string, number> = {};
      for (const [platform, stats] of Object.entries(serviceResult.statistics.byPlatform)) {
        platformBreakdown[platform] = stats.processed;
      }

      return {
        success: serviceResult.passed.length > 0 || serviceResult.rejected.length === 0,
        filesProcessed: 0,
        productsInserted: serviceResult.passed.length,
        errors: [],
        duration: serviceResult.statistics.duration,
        processedFiles: [],
        statistics: {
          processingTime: serviceResult.statistics.duration,
          productsPerSecond: serviceResult.passed.length / Math.max(serviceResult.statistics.duration / 1000, 0.001),
          platformBreakdown,
          qualityMetrics: {
            averageConfidenceScore: 1.0,
            filteredByRate: serviceResult.statistics.rateFiltered,
            validationErrors: serviceResult.statistics.validationErrors
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        filesProcessed: 0,
        productsInserted: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        duration: Date.now() - startTime,
        processedFiles: [],
        statistics: {
          processingTime: Date.now() - startTime,
          productsPerSecond: 0,
          platformBreakdown: {},
          qualityMetrics: {
            averageConfidenceScore: 0,
            filteredByRate: 0,
            validationErrors: 1
          }
        }
      };
    }
  }

  /**
   * Pure transform JSON ingestion (Phase 3 refactor) with corruption detection
   * Returns validated products instead of writing to database
   */
  async processForProducts(
    input: ProductData[],
    metadata: { source: string; method: string }
  ): Promise<IngestionServiceResult> {
    const startTime = Date.now();

    // Only set batch ID if one hasn't been provided by OrchestrationService
    if (!this.currentBatchId) {
      this.currentBatchId = `batch_${Date.now()}`;
    }

    if (!this.initialized) {
      await this.initialize();
    }

    // Initialize validation tracker with corruption threshold
    if (this.config) {
      this.validationTracker = new JSONIngestionValidationTracker(this.config.dataCorruptionThreshold);
    } else {
      this.validationTracker = new JSONIngestionValidationTracker(0.5);
    }

    // Clear audit trail for fresh processing
    await this.clearAuditTrail(this.currentBatchId);

    try {
      // Validate configuration before processing
      const validation = await this.validateConfiguration();
      if (!validation.valid) {
        await this.handleCriticalError(
          JSONIngestionCriticalErrorType.CONFIG_LOAD_FAILED,
          `Configuration validation failed: ${validation.errors?.join(', ')}`
        );
      }

      logger.info(`📝 Processing ${input.length} products for validation with corruption detection...`);

      // Normalize platform values for consistency (ensure lowercase)
      // Source is now provided via metadata parameter, not individual products
      const normalizedInput = input.map(product => ({
        ...product,
        platform: (product.platform || 'unknown').toLowerCase(),
        source: metadata.source.toLowerCase(),
        method: metadata.method.toLowerCase()
      }));

      // Evaluate rules for all products
      const ruleResults = await this.evaluateRules(normalizedInput);

      // Apply rules and separate passed/rejected products WITH corruption tracking
      const { passed, rejected, platformStats } = await this.applyRulesForTransformWithCorruption(normalizedInput, ruleResults);

      // Final corruption check
      await this.checkFinalCorruptionStatus();

      const duration = Date.now() - startTime;

      logger.info(`✅ JSON Ingestion complete: ${passed.length}/${input.length} products passed validation`);

      // Insert passed products into available_products_raw for audit/debugging purposes
      if (passed.length > 0) {
        await this.insertProducts(passed, metadata);
      }

      return {
        passed,
        rejected,
        statistics: {
          processed: input.length,
          passed: passed.length,
          rejected: rejected.length,
          validationErrors: rejected.filter(r => r.rejectionReason === 'validation_failed').length,
          rateFiltered: rejected.filter(r => r.rejectionReason === 'rate_filtered').length,
          duration,
          byPlatform: platformStats
        },
        errors: []
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if this is a corruption detection error
      if (errorMessage.includes('DATA_CORRUPTION')) {
        await this.logCorruptionDetection(
          this.currentBatchId,
          'systematic_validation_failures',
          this.validationTracker?.validationFailures || 0,
          this.validationTracker?.totalProducts || input.length,
          true
        );
      }

      return {
        passed: [],
        rejected: input.map(product => ({
          originalData: product,
          validationErrors: [errorMessage],
          rejectionReason: 'processing_error'
        })),
        statistics: {
          processed: input.length,
          passed: 0,
          rejected: input.length,
          validationErrors: 1,
          rateFiltered: 0,
          duration,
          byPlatform: {}
        },
        errors: [errorMessage]
      };
    }
  }

  /**
   * Apply rule results for pure transform with corruption tracking
   */
  private async applyRulesForTransformWithCorruption(input: ProductData[], ruleResults: RuleEvaluationResult[]): Promise<{
    passed: ParsedProduct[];
    rejected: InvalidProduct[];
    platformStats: Record<string, { processed: number; passed: number; rejected: number }>;
  }> {
    const passed: ParsedProduct[] = [];
    const rejected: InvalidProduct[] = [];
    const platformStats: Record<string, { processed: number; passed: number; rejected: number }> = {};

    for (let i = 0; i < input.length; i++) {
      const product = input[i];
      const rules = ruleResults[i];

      // Track for corruption detection
      this.validationTracker?.addProduct();

      // Extract original source and method (CRITICAL BUG FIX)
      const originalSource = product.source || 'unknown';
      const originalMethod = (product as any).method || 'unknown';

      // Initialize platform stats
      const platform = this.normalizePlatformName(product.platform, originalSource);
      if (!platformStats[platform]) {
        platformStats[platform] = { processed: 0, passed: 0, rejected: 0 };
      }
      platformStats[platform].processed++;

      // Apply rule results
      let shouldPass = true;
      const validationErrors: string[] = [];
      let rejectionReason = 'validation_failed';

      // Check if any rule rejected the product
      if (rules.events) {
        for (const event of rules.events) {
          if (event.type === 'reject_product') {
            shouldPass = false;
            const reason = (event.params?.reason as string) || 'Rule rejection';
            validationErrors.push(reason);

            // Determine rejection type
            if (reason.includes('rate')) {
              rejectionReason = 'rate_filtered';
            }
          } else if (event.type === 'flag_validation_error') {
            validationErrors.push((event.params?.error as string) || 'Validation error');
          }
        }
      }

      // Enhanced validation with configurable ranges
      const rangeValidation = this.validateProductRanges(product);
      if (!rangeValidation.valid) {
        shouldPass = false;
        validationErrors.push(...rangeValidation.errors);
        rejectionReason = 'validation_failed';
      }

      // Rate threshold filtering (configurable)
      if (shouldPass && !this.applyRateThresholdFilter(product)) {
        shouldPass = false;
        validationErrors.push(`Rate ${product.aerRate}% below threshold for ${product.accountType}`);
        rejectionReason = 'rate_filtered';
      }

      // Additional basic validation
      if (!product.bankName || product.bankName.trim() === '') {
        shouldPass = false;
        validationErrors.push('Missing bank name');
      }

      if (!product.aerRate || product.aerRate <= 0) {
        shouldPass = false;
        validationErrors.push('Invalid AER rate');
      }

      // Track validation failures for corruption detection (exclude legitimate rate filtering)
      if (!shouldPass && rejectionReason === 'validation_failed') {
        this.validationTracker?.addValidationFailure();

        // Check for systematic corruption every 100 products
        if (this.validationTracker && this.validationTracker.totalProducts % 100 === 0) {
          if (this.validationTracker.isSystematicCorruption()) {
            const failureRate = (this.validationTracker.getFailureRate() * 100).toFixed(1);
            throw new Error(`DATA_CORRUPTION: Systematic data corruption detected: ${failureRate}% validation failures`);
          }
        }
      }

      if (shouldPass) {
        // Convert to ParsedProduct format (CRITICAL BUG FIX)
        const parsedProduct: ParsedProduct = {
          platform: this.normalizePlatformName(product.platform, originalSource), // ✅ FIXED: Normalized platform
          source: originalSource,  // ✅ FIXED: Keep original source separate
          bankName: product.bankName,
          accountType: product.accountType || 'unknown',
          aerRate: product.aerRate,
          grossRate: product.grossRate || product.aerRate,
          termMonths: product.termMonths ?? null,
          noticePeriodDays: product.noticePeriodDays ?? null,
          minDeposit: product.minDeposit ?? null,
          maxDeposit: product.maxDeposit ?? null,
          fscsProtected: product.fscsProtected || false,
          interestPaymentFrequency: product.interestPaymentFrequency ?? null,
          applyByDate: product.applyByDate ?? null,
          specialFeatures: product.specialFeatures ?? null,
          scrapeDate: product.scrapedAt || new Date().toISOString(),
          scrapedAt: product.scrapedAt || new Date().toISOString(),
          confidenceScore: (product as any).confidenceScore || 1.0,
          validationErrors: validationErrors.length > 0 ? validationErrors : undefined
        };

        // Enrich with platform priority and source reliability
        const enrichedProduct = this.enrichProduct(parsedProduct);

        passed.push(enrichedProduct);
        platformStats[platform].passed++;
      } else {
        // Add to rejected
        const invalidProduct: InvalidProduct = {
          originalData: product,
          validationErrors,
          rejectionReason
        };

        rejected.push(invalidProduct);
        platformStats[platform].rejected++;
      }

      // Log audit trail for regulatory compliance
      if (this.currentBatchId) {
        // Calculate validation tracking data
        const aerRateValid = this.config && product.aerRate >= this.config.aerRateMin && product.aerRate <= this.config.aerRateMax;
        const termMonthsValid = !product.termMonths || (this.config && product.termMonths >= this.config.termMonthsMin && product.termMonths <= this.config.termMonthsMax);
        const noticeDaysValid = !product.noticePeriodDays || (this.config && product.noticePeriodDays >= this.config.noticeDaysMin && product.noticePeriodDays <= this.config.noticeDaysMax);

        // Calculate quality scores
        const requiredFieldsCount = [product.bankName, product.accountType, product.aerRate, product.platform].filter(f => f).length;
        const totalRequiredFields = 4;
        const dataCompletenessScore = requiredFieldsCount / totalRequiredFields;

        // Platform-source consistency check
        const platformSourceConsistent = product.platform?.toLowerCase() === originalSource?.toLowerCase();

        await this.logIngestionAudit({
          productId: `${platform}-${product.bankName}-${product.accountType}`,
          source: originalSource,
          platform: platform,
          method: originalMethod,
          rawProductJson: JSON.stringify(product),
          validationStatus: shouldPass ? 'valid' : 'invalid',
          validationDetails: JSON.stringify(validationErrors),
          rejectionReasons: shouldPass ? undefined : rejectionReason,
          normalizationApplied: JSON.stringify({
            originalPlatform: product.platform,
            normalizedPlatform: platform,
            source: originalSource
          }),
          originalBankName: product.bankName,
          normalizedBankName: product.bankName,
          originalPlatform: product.platform,
          normalizedPlatform: platform,
          businessRulesPassed: shouldPass,

          // Range validation tracking
          aerRateOriginal: product.aerRate,
          aerRateValidated: aerRateValid,
          termMonthsOriginal: product.termMonths,
          termMonthsValidated: termMonthsValid,
          noticeDaysOriginal: product.noticePeriodDays,
          noticeDaysValidated: noticeDaysValid,

          // Platform/source consistency
          platformSourceConsistent: platformSourceConsistent,
          platformSourceAuditNotes: platformSourceConsistent ? null : `Platform '${product.platform}' != Source '${originalSource}'`,

          // Quality metrics
          sourceReliabilityScore: this.getSourceReliabilityScore(originalSource),
          dataCompletenessScore: dataCompletenessScore,

          // Corruption tracking
          corruptionIndicatorCount: validationErrors.length,
          corruptionSeverity: validationErrors.length > 3 ? 'high' : validationErrors.length > 1 ? 'medium' : validationErrors.length > 0 ? 'low' : null
        });
      }
    }

    return { passed, rejected, platformStats };
  }


  /**
   * Process JSON file using rules-based logic (RulesBasedModule interface)
   */
  async processFile(filePath: string): Promise<IngestionResult> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const data: JSONFileData = JSON.parse(content);

      // Validate metadata structure
      if (!data.metadata || !data.metadata.source || !data.metadata.method) {
        throw new Error('Invalid JSON format: missing metadata with source and method');
      }

      if (!Array.isArray(data.products)) {
        throw new Error('Invalid JSON format: products must be an array');
      }

      // Process with metadata
      return await this.process(data.products, data.metadata);
    } catch (error) {
      const startTime = Date.now();
      return {
        success: false,
        filesProcessed: 0,
        productsInserted: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        duration: Date.now() - startTime,
        processedFiles: [],
        statistics: {
          processingTime: Date.now() - startTime,
          productsPerSecond: 0,
          platformBreakdown: {},
          qualityMetrics: {
            averageConfidenceScore: 0,
            filteredByRate: 0,
            validationErrors: 1
          }
        }
      };
    }
  }

  /**
   * Get module status (RulesBasedModule interface)
   */
  getStatus(): ModuleStatus {
    return {
      initialized: this.initialized,
      configurationLoaded: this.config !== null,
      rulesEngineReady: this.engine !== null && this.rules.length > 0,
      healthy: this.initialized && this.config !== null,
      lastActivity: new Date().toISOString()
    };
  }

  /**
   * Validate configuration (RulesBasedModule interface)
   */
  async validateConfiguration(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.config) {
      errors.push('Configuration not loaded');
      return { valid: false, message: 'Configuration validation failed', errors, warnings };
    }

    // Validate rate thresholds
    if (this.config.easyAccessMinRate < 0 || this.config.easyAccessMinRate > 10) {
      errors.push('Easy access minimum rate must be between 0 and 10');
    }

    if (this.config.noticeMinRate < 0 || this.config.noticeMinRate > 10) {
      errors.push('Notice minimum rate must be between 0 and 10');
    }

    if (this.config.fixedTermMinRate < 0 || this.config.fixedTermMinRate > 10) {
      errors.push('Fixed term minimum rate must be between 0 and 10');
    }

    // Validate processing parameters
    if (this.config.batchSize < 1 || this.config.batchSize > 10000) {
      warnings.push('Batch size should be between 1 and 10000 for optimal performance');
    }

    if (this.config.timeoutMs < 1000) {
      warnings.push('Timeout should be at least 1000ms');
    }

    // Validate directory structure
    if (!fs.existsSync(this.config.dataDirectory)) {
      errors.push(`Data directory does not exist: ${this.config.dataDirectory}`);
    }

    return {
      valid: errors.length === 0,
      message: errors.length === 0 ? 'Configuration is valid' : 'Configuration validation failed',
      errors,
      warnings
    };
  }

  /**
   * Reset module state (RulesBasedModule interface)
   */
  reset(): void {
    this.config = null;
    this.rules = [];
    this.engine = new Engine();
    this.processedFiles.clear();
    this.initialized = false;
    logger.info('✅ JSONIngestionService reset');
  }

  /**
   * Load platform priorities from known_platforms table
   */
  async loadPlatformPriorities(): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        SELECT platform_variant, canonical_name, priority
        FROM known_platforms
        WHERE is_active = 1
      `);
      const platforms = stmt.all() as Array<{
        platform_variant: string;
        canonical_name: string;
        priority: number;
      }>;

      this.platformPriorities.clear();
      platforms.forEach(p => {
        this.platformPriorities.set(p.platform_variant.toLowerCase(), p.priority);
        this.platformPriorities.set(p.canonical_name.toLowerCase(), p.priority);
      });

      logger.info(`✅ Loaded ${platforms.length} platform priorities`);
    } catch (error) {
      logger.warn(`⚠️ Failed to load platform priorities: ${error instanceof Error ? error.message : String(error)}`);
      // Use defaults
      this.platformPriorities.set('hargreaves lansdown', 1);
      this.platformPriorities.set('aj bell', 2);
      this.platformPriorities.set('flagstone', 3);
      this.platformPriorities.set('raisin uk', 4);
      this.platformPriorities.set('direct', 5);
    }
  }

  /**
   * Load source reliability from scraper_config table
   */
  async loadSourceReliability(): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        SELECT scraper_id, source_reliability
        FROM scraper_config
        WHERE is_enabled = 1
      `);
      const scrapers = stmt.all() as Array<{
        scraper_id: string;
        source_reliability: number;
      }>;

      this.sourceReliability.clear();
      scrapers.forEach(s => {
        this.sourceReliability.set(s.scraper_id, s.source_reliability);
      });

      logger.info(`✅ Loaded ${scrapers.length} source reliability scores`);
    } catch (error) {
      logger.warn(`⚠️ Failed to load source reliability: ${error instanceof Error ? error.message : String(error)}`);
      // Use defaults
      this.sourceReliability.set('moneyfacts', 0.9);
      this.sourceReliability.set('ajbell', 0.8);
      this.sourceReliability.set('flagstone', 0.8);
      this.sourceReliability.set('hl', 0.8);
    }
  }

  /**
   * Initialize the service with configuration and rules
   */
  private async initialize(): Promise<void> {
    try {
      await this.loadConfiguration();
      const rules = await this.loadRules();
      await this.initializeEngine(rules);
      await this.loadPlatformPriorities();
      await this.loadSourceReliability();
      this.initialized = true;
      logger.info('✅ JSONIngestionService initialized');
    } catch (error) {
      throw new Error(`Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Calculate source reliability score based on platform
   */
  private getSourceReliabilityScore(source: string): number {
    // Source reliability scoring based on platform stability and data quality
    const reliabilityScores: { [key: string]: number } = {
      'ajbell': 0.95,
      'flagstone': 0.90,
      'hl': 0.90,
      'moneyfacts': 0.85,
      'unknown': 0.50
    };

    return reliabilityScores[source?.toLowerCase()] || 0.70;
  }

  /**
   * Enhanced field validation with configurable ranges (NO HARDCODED VALUES)
   */
  private validateProductRanges(product: ProductData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config) {
      errors.push('Configuration not loaded');
      return { valid: false, errors };
    }

    // AER rate validation (NO HARDCODED VALUES)
    if (product.aerRate < this.config.aerRateMin || product.aerRate > this.config.aerRateMax) {
      errors.push(`AER rate ${product.aerRate}% outside valid range (${this.config.aerRateMin}%-${this.config.aerRateMax}%)`);
    }

    // Term validation for fixed term accounts
    if (product.accountType === 'fixed_term' && product.termMonths) {
      if (product.termMonths < this.config.termMonthsMin || product.termMonths > this.config.termMonthsMax) {
        errors.push(`Term ${product.termMonths} months outside valid range (${this.config.termMonthsMin}-${this.config.termMonthsMax} months)`);
      }
    }

    // Notice period validation
    if (product.accountType === 'notice' && product.noticePeriodDays) {
      if (product.noticePeriodDays < this.config.noticeDaysMin || product.noticePeriodDays > this.config.noticeDaysMax) {
        errors.push(`Notice period ${product.noticePeriodDays} days outside valid range (${this.config.noticeDaysMin}-${this.config.noticeDaysMax} days)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Apply rate threshold filtering by account type (configurable)
   */
  private applyRateThresholdFilter(product: ProductData): boolean {
    if (!this.config || !this.config.rateFilteringEnabled) {
      return true; // Pass if filtering disabled
    }

    const threshold = this.getMinRateThreshold(product.accountType);
    return product.aerRate >= threshold;
  }

  /**
   * Get minimum rate threshold for account type
   */
  private getMinRateThreshold(accountType: string): number {
    if (!this.config) return 0;

    switch (accountType.toLowerCase()) {
      case 'easy_access':
      case 'easy access':
        return this.config.easyAccessMinRate;
      case 'notice':
        return this.config.noticeMinRate;
      case 'fixed_term':
      case 'fixed term':
        return this.config.fixedTermMinRate;
      default:
        throw new Error(`Unknown account type: "${accountType}". Expected: easy_access, notice, or fixed_term`);
    }
  }

  /**
   * Validate required fields for a product
   */
  private validateRequiredFields(product: ProductData): boolean {
    return !!(
      product.bankName &&
      product.platform &&
      product.accountType &&
      typeof product.aerRate === 'number' &&
      !isNaN(product.aerRate)
    );
  }

  /**
   * Apply rule results to filter and process products
   */
  private applyRuleResults(products: ProductData[], ruleResults: RuleEvaluationResult[]): ProductData[] {
    const processedProducts: ProductData[] = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const result = ruleResults[i];

      let includeProduct = true;
      let confidenceScore = 1.0;

      // Process rule events
      for (const event of result.events) {
        switch (event.type) {
          case 'filter_product':
            // Only apply rate filtering if it's enabled in configuration
            if (event.params?.action === 'exclude_low_rate' && this.config?.rateFilteringEnabled) {
              includeProduct = false;
            }
            break;
          case 'apply_platform_score':
            // Could modify confidence based on platform
            break;
          case 'validate_quality':
            if (!result.facts.required_fields_complete) {
              confidenceScore *= 0.5; // Reduce confidence for incomplete data
            }
            break;
        }
      }

      if (includeProduct) {
        // Add confidence score to product data
        (product as any).confidenceScore = confidenceScore;
        processedProducts.push(product);
      }
    }

    return processedProducts;
  }

  /**
   * Insert processed products into database
   */
  private async insertProducts(
    products: ProductData[],
    metadata: { source: string; method: string }
  ): Promise<{
    success: boolean;
    filesProcessed: number;
    productsInserted: number;
    errors: string[];
    processedFiles: string[];
  }> {
    if (products.length === 0) {
      return {
        success: true,
        filesProcessed: 0,
        productsInserted: 0,
        errors: [],
        processedFiles: []
      };
    }

    // Clear existing raw data for this specific method only (granular deletion)
    if (products.length > 0) {
      const method = metadata.method;
      const source = metadata.source;
      logger.debug(`🗑️ Clearing available_products_raw for method: ${method} (source: ${source}, ${products.length} products)`);
      const clearStmt = this.db.prepare(`DELETE FROM available_products_raw WHERE source = ? AND method = ?`);
      const result = clearStmt.run(source, method);
      logger.debug(`✅ Cleared ${result.changes} existing products from source: ${source}, method: ${method}`);
    } else {
      logger.debug(`⚠️ No products to process - skipping raw table deletion`);
    }

    const stmt = this.db.prepare(`
      INSERT INTO available_products_raw (
        platform, source, method, bank_name, account_type, aer_rate, gross_rate,
        term_months, notice_period_days, min_deposit, max_deposit,
        fscs_protected, interest_payment_frequency, apply_by_date,
        special_features, scrape_date, confidence_score, imported_at,
        created_at, raw_platform
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `);

    let inserted = 0;
    const errors: string[] = [];

    const insertMany = this.db.transaction((products: ProductData[]) => {
      for (const product of products) {
        try {
          const confidenceScore = (product as any).confidenceScore || 1.0;

          stmt.run([
            this.normalizePlatformName(product.platform),
            metadata.source,
            metadata.method,
            product.bankName || 'Unknown Bank',
            product.accountType || 'unknown',
            product.aerRate,
            product.grossRate,
            product.termMonths,
            product.noticePeriodDays,
            product.minDeposit,
            product.maxDeposit,
            product.fscsProtected ? 1 : 0,
            product.interestPaymentFrequency,
            product.applyByDate,
            product.specialFeatures,
            product.scrapedAt ? new Date(product.scrapedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            confidenceScore,
            product.rawPlatform || product.platform
          ]);
          inserted++;
        } catch (error) {
          const errorMsg = `Product insert error: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.warn(`⚠️ ${errorMsg}`);
        }
      }
    });

    insertMany(products);

    logger.debug(`💾 Insertion complete: ${inserted}/${products.length} products inserted into raw table`);
    if (errors.length > 0) {
      logger.warn(`⚠️ ${errors.length} insertion errors occurred`);
      errors.forEach((error, i) => logger.debug(`  ${i + 1}. ${error}`));
    }

    return {
      success: errors.length === 0,
      filesProcessed: 1, // This is for single batch processing
      productsInserted: inserted,
      errors,
      processedFiles: []
    };
  }

  /**
   * Calculate processing statistics
   */
  private calculateStatistics(
    products: ProductData[],
    insertResult: any,
    processingTime: number
  ): IngestionStatistics {
    const platformBreakdown: Record<string, number> = {};
    let totalConfidence = 0;
    let filteredCount = 0;

    for (const product of products) {
      const platform = this.normalizePlatformName(product.platform);
      platformBreakdown[platform] = (platformBreakdown[platform] || 0) + 1;
      totalConfidence += (product as any).confidenceScore || 1.0;
    }

    // Count how many were filtered out (original count vs processed count)
    filteredCount = Math.max(0, products.length - insertResult.productsInserted);

    return {
      processingTime,
      productsPerSecond: processingTime > 0 ? (insertResult.productsInserted / processingTime) * 1000 : 0,
      platformBreakdown,
      qualityMetrics: {
        averageConfidenceScore: products.length > 0 ? totalConfidence / products.length : 0,
        filteredByRate: filteredCount,
        validationErrors: insertResult.errors.length
      }
    };
  }

  /**
   * Process all pending normalized JSON files from all scraper directories
   */
  async ingestPendingFiles(): Promise<IngestionResult> {
    const startTime = Date.now();
    logger.info('📥 Starting JSON ingestion...');

    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const normalizedFiles = await this.findNormalizedJSONFiles();

      if (normalizedFiles.length === 0) {
        logger.info('✅ No new JSON files to process');
        return {
          success: true,
          filesProcessed: 0,
          productsInserted: 0,
          errors: [],
          duration: Date.now() - startTime,
          processedFiles: [],
          statistics: {
            processingTime: Date.now() - startTime,
            productsPerSecond: 0,
            platformBreakdown: {},
            qualityMetrics: {
              averageConfidenceScore: 0,
              filteredByRate: 0,
              validationErrors: 0
            }
          }
        };
      }

      logger.info(`📊 Processing ${normalizedFiles.length} JSON files`);

      let totalInserted = 0;
      const errors: string[] = [];
      const processedFilesList: string[] = [];
      const allStatistics: IngestionStatistics[] = [];

      for (const filePath of normalizedFiles) {
        try {
          const result = await this.processFile(filePath);
          totalInserted += result.productsInserted;
          this.processedFiles.add(filePath);
          processedFilesList.push(path.basename(filePath));
          allStatistics.push(result.statistics);
          errors.push(...result.errors);
          logger.debug(`✅ Processed ${path.basename(filePath)}: ${result.productsInserted} products`);
        } catch (error) {
          const errorMsg = `${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logger.error(`❌ ${errorMsg}`);
        }
      }

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      logger.info(`${success ? '✅' : '⚠️'} JSON ingestion complete: ${totalInserted} products from ${normalizedFiles.length} files in ${duration}ms`);
      if (errors.length > 0) {
        logger.warn(`⚠️ ${errors.length} files had errors`);
      }

      // Aggregate statistics
      const aggregatedStats = this.aggregateStatistics(allStatistics, duration);

      return {
        success,
        filesProcessed: normalizedFiles.length,
        productsInserted: totalInserted,
        errors,
        duration,
        processedFiles: processedFilesList,
        statistics: aggregatedStats
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ JSON ingestion failed: ${errorMessage}`);
      return {
        success: false,
        filesProcessed: 0,
        productsInserted: 0,
        errors: [errorMessage],
        duration: Date.now() - startTime,
        processedFiles: [],
        statistics: {
          processingTime: Date.now() - startTime,
          productsPerSecond: 0,
          platformBreakdown: {},
          qualityMetrics: {
            averageConfidenceScore: 0,
            filteredByRate: 0,
            validationErrors: 1
          }
        }
      };
    }
  }

  /**
   * Aggregate statistics from multiple file processing results
   */
  private aggregateStatistics(allStats: IngestionStatistics[], totalDuration: number): IngestionStatistics {
    if (allStats.length === 0) {
      return {
        processingTime: totalDuration,
        productsPerSecond: 0,
        platformBreakdown: {},
        qualityMetrics: {
          averageConfidenceScore: 0,
          filteredByRate: 0,
          validationErrors: 0
        }
      };
    }

    const aggregated: IngestionStatistics = {
      processingTime: totalDuration,
      productsPerSecond: 0,
      platformBreakdown: {},
      qualityMetrics: {
        averageConfidenceScore: 0,
        filteredByRate: 0,
        validationErrors: 0
      }
    };

    let totalProducts = 0;
    let totalConfidence = 0;

    for (const stats of allStats) {
      // Aggregate platform breakdown
      for (const [platform, count] of Object.entries(stats.platformBreakdown)) {
        aggregated.platformBreakdown[platform] = (aggregated.platformBreakdown[platform] || 0) + count;
        totalProducts += count;
      }

      // Aggregate quality metrics
      aggregated.qualityMetrics.filteredByRate += stats.qualityMetrics.filteredByRate;
      aggregated.qualityMetrics.validationErrors += stats.qualityMetrics.validationErrors;
      totalConfidence += stats.qualityMetrics.averageConfidenceScore * Object.values(stats.platformBreakdown).reduce((sum, count) => sum + count, 0);
    }

    // Calculate average confidence
    if (totalProducts > 0) {
      aggregated.qualityMetrics.averageConfidenceScore = totalConfidence / totalProducts;
      aggregated.productsPerSecond = totalDuration > 0 ? (totalProducts / totalDuration) * 1000 : 0;
    }

    return aggregated;
  }

  /**
   * Find normalized JSON files that haven't been processed
   * Updated to use new /scrapers/data directory structure
   */
  private async findNormalizedJSONFiles(): Promise<string[]> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const allFiles: string[] = [];

    for (const platformDir of this.config.platformDirectories) {
      const directory = path.join(this.config.dataDirectory, platformDir);

      try {
        if (!fs.existsSync(directory)) {
          logger.warn(`⚠️ Platform directory not found: ${directory}`);
          continue;
        }

        const files = await fs.promises.readdir(directory);
        const normalizedFiles = files
          .filter(file =>
            file.includes('-normalized-') &&
            file.endsWith('.json') &&
            !this.processedFiles.has(path.join(directory, file))
          )
          .map(file => path.join(directory, file));

        allFiles.push(...normalizedFiles);
        logger.debug(`📁 Found ${normalizedFiles.length} normalized files in ${platformDir}`);
      } catch (error) {
        logger.error(`❌ Error reading directory ${directory}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Sort by modification time (newest first) for consistent processing order
    return allFiles.sort((a, b) => {
      try {
        const statA = fs.statSync(a);
        const statB = fs.statSync(b);
        return statB.mtime.getTime() - statA.mtime.getTime();
      } catch {
        return 0;
      }
    });
  }


  /**
   * Extract platform name from JSON filename
   */
  private extractPlatformFromFilename(filePath: string): string {
    const filename = path.basename(filePath);

    // Handle different filename patterns:
    // "AJBell-normalized-", "MoneyFacts-fixed_term-normalized-", "Flagstone-normalized-"
    const patterns = [
      /^([^-]+)-normalized-/,  // Standard: "AJBell-normalized-"
      /^([^-]+)-[^-]+-normalized-/  // MoneyFacts: "MoneyFacts-fixed_term-normalized-"
    ];

    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match) {
        return this.normalizePlatformName(match[1]);
      }
    }

    // Fallback - try to extract from directory name
    const dirName = path.basename(path.dirname(filePath));
    if (dirName.includes('ajbell')) return 'ajbell';
    if (dirName.includes('moneyfacts')) return 'moneyfacts';
    if (dirName.includes('flagstone')) return 'flagstone';
    if (dirName.includes('hl')) return 'hl';

    logger.warn(`⚠️ Could not extract platform from ${filename}, using 'unknown'`);
    return 'unknown';
  }

  /**
   * Ingest products directly from memory (for Electron integration)
   * This method uses rules-based processing for consistency
   */
  async ingestFromMemory(products: ProductData[], platform: string): Promise<IngestionResult> {
    logger.info(`📥 Starting memory-based ingestion for ${platform}...`);

    // Ensure platform is set for all products
    const normalizedProducts = products.map(product => ({
      ...product,
      platform: this.normalizePlatformName(platform, product.source),
      source: (product.source || platform).toLowerCase()
    }));

    // Use the main rules-based processing method
    return await this.process(normalizedProducts, {
      source: platform,
      method: 'memory-ingestion'
    });
  }

  /**
   * Normalize platform names with source context (CRITICAL BUG FIX)
   */
  private normalizePlatformName(platform: string, source?: string): string {
    const platformLower = platform.toLowerCase();

    // Source-specific mappings - critical for moneyfacts platform/source confusion
    const sourceSpecificMappings: Record<string, Record<string, string>> = {
      'moneyfacts': {
        'moneyfacts': 'direct',  // ✅ FIXED: Moneyfacts is source, not platform
        'raisin uk': 'raisin',
        'raisin.co.uk': 'raisin',
        'raisin europe': 'raisin',
        'flagstone im': 'flagstone',
        'flagstone': 'flagstone',
        'direct': 'direct'
      },
      'ajbell': {
        'ajbell': 'ajbell',
        'aj bell': 'ajbell'
      },
      'flagstone': {
        'flagstone': 'flagstone',
        'flagstone im': 'flagstone'
      },
      'hl': {
        'hl': 'hl active savings',
        'hargreaves lansdown': 'hl active savings',
        'hl cash': 'hl active savings',
        'hl active savings': 'hl active savings'
      }
    };

    // Apply source-specific mapping if source is provided
    if (source) {
      const sourceMappings = sourceSpecificMappings[source.toLowerCase()];
      if (sourceMappings && sourceMappings[platformLower]) {
        return sourceMappings[platformLower].toLowerCase();
      }
    }

    // Fallback to generic mappings
    const genericMappings: Record<string, string> = {
      'ajbell': 'ajbell',
      'aj_bell': 'ajbell',
      'aj bell': 'ajbell',
      'flagstone': 'flagstone',
      'flagstone im': 'flagstone',
      'hargreaves_lansdown': 'hl active savings',
      'hargreaves lansdown': 'hl active savings',
      'hl': 'hl active savings',
      'hl active savings': 'hl active savings',
      'raisin uk': 'raisin',
      'raisin': 'raisin',
      'raisin.co.uk': 'raisin',
      'prosper': 'prosper',
      'direct': 'direct'
    };

    return (genericMappings[platformLower] || platform).toLowerCase();
  }

  /**
   * Enhanced product enrichment with platform priority and source reliability
   */
  private enrichProduct(product: ParsedProduct): ParsedProduct {
    const normalizedPlatform = this.normalizePlatformName(product.platform, product.source);
    const platformPriority = this.platformPriorities.get(normalizedPlatform.toLowerCase()) || 999;
    const sourceReliability = this.sourceReliability.get(product.source) || 0.5;

    const enriched = {
      ...product,
      platform: normalizedPlatform, // Use normalized platform
      platformPriority,
      sourceReliability
    };


    return enriched;
  }

  /**
   * Get ingestion statistics
   */
  async getStats(): Promise<any> {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_raw_products,
        COUNT(CASE WHEN processed_at IS NULL THEN 1 END) as pending_products,
        COUNT(DISTINCT platform) as active_platforms,
        MAX(imported_at) as latest_import,
        COUNT(CASE WHEN imported_at > datetime('now', '-1 hour') THEN 1 END) as recent_imports
      FROM available_products_raw
    `);

    return stmt.get();
  }

  /**
   * Mark specific files as processed (for testing/manual management)
   */
  markFileAsProcessed(filePath: string): void {
    this.processedFiles.add(filePath);
  }

  /**
   * Clear processed files cache (for testing)
   */
  clearProcessedFilesCache(): void {
    this.processedFiles.clear();
  }

  /**
   * Get list of processed files
   */
  getProcessedFiles(): string[] {
    return Array.from(this.processedFiles);
  }

  /**
   * Clear audit trail for batch processing
   */
  private async clearAuditTrail(batchId: string): Promise<void> {
    try {
      const deleteStmt = this.db.prepare(`DELETE FROM json_ingestion_audit WHERE batch_id = ?`);
      deleteStmt.run(batchId);

      const corruptionDeleteStmt = this.db.prepare(`DELETE FROM json_ingestion_corruption_audit WHERE batch_id = ?`);
      corruptionDeleteStmt.run(batchId);

      logger.debug(`🧹 Cleared JSON ingestion audit trail for batch ${batchId}`);
    } catch (error) {
      logger.warn(`Failed to clear audit trail: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Log corruption detection events
   */
  private async logCorruptionDetection(
    batchId: string,
    corruptionType: string,
    affectedCount: number,
    totalCount: number,
    thresholdExceeded: boolean
  ): Promise<void> {
    try {
      const percentage = (affectedCount / totalCount) * 100;
      const insertStmt = this.db.prepare(`
        INSERT INTO json_ingestion_corruption_audit (
          batch_id, corruption_type, affected_count, total_count,
          corruption_percentage, threshold_exceeded, action_taken
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const actionTaken = thresholdExceeded ? 'abort_pipeline' : 'continue';
      insertStmt.run(batchId, corruptionType, affectedCount, totalCount, percentage, thresholdExceeded ? 1 : 0, actionTaken);

      if (thresholdExceeded) {
        logger.error(`🚨 Systematic corruption detected: ${corruptionType} (${percentage.toFixed(1)}%)`);
      }
    } catch (error) {
      logger.warn(`Failed to log corruption detection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Final corruption check after all products processed
   */
  private async checkFinalCorruptionStatus(): Promise<void> {
    if (this.validationTracker?.isSystematicCorruption()) {
      const failureRate = (this.validationTracker.getFailureRate() * 100).toFixed(1);
      await this.logCorruptionDetection(
        this.currentBatchId,
        'systematic_validation_failures',
        this.validationTracker.validationFailures,
        this.validationTracker.totalProducts,
        true
      );
      throw new Error(`DATA_CORRUPTION: Final corruption check failed: ${failureRate}% validation failures across ${this.validationTracker.totalProducts} products`);
    }
  }

  /**
   * Handle critical errors with proper classification
   */
  private async handleCriticalError(
    errorType: JSONIngestionCriticalErrorType,
    message: string,
    originalError?: any
  ): Promise<never> {
    // Log critical error
    logger.error(`🚨 CRITICAL ERROR: ${errorType} - ${message}`);

    // Log to corruption audit if it's a data corruption error
    if (errorType === JSONIngestionCriticalErrorType.DATA_CORRUPTION && this.validationTracker) {
      await this.logCorruptionDetection(
        this.currentBatchId,
        'critical_error',
        this.validationTracker.validationFailures,
        this.validationTracker.totalProducts,
        true
      );
    }

    // Throw error to halt current service execution
    throw new Error(`Pipeline aborted: ${errorType} - ${message}`);
  }
}
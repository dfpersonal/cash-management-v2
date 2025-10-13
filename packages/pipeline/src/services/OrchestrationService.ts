import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { Engine } from 'json-rules-engine';
import { BrowserWindow } from 'electron';
import {
  RulesBasedModule,
  BusinessRule,
  ParsedBusinessRule,
  ConfigCategory,
  ModuleStatus,
  ValidationResult
} from '@cash-mgmt/shared';
import { JSONIngestionService, IngestionResult, ProductData, IngestionServiceResult, ParsedProduct, RuleEvaluationResult, JSONFileData } from './JSONIngestionService';
import { FRNMatchingService, FRNMatchingServiceResult } from './FRNMatchingService';
import { DeduplicationService, DeduplicationOutput, FinalProduct } from './DeduplicationService';
import { PipelineAudit } from './PipelineAudit';
import { DataQualityAnalyzer, DataQualityReport } from './DataQualityAnalyzer';
import { logger } from '../utils/PipelineLogger';

export interface OrchestrationConfig {
  // Core pipeline control (simplified - no retry logic)
  concurrentExecutionCheck: boolean;
  configUpdateBlocking: boolean;
  uiProgressUpdates: boolean;
  stageTimeoutMs: number;
  dataCorruptionThreshold: number;
  enableAtomicTransactions: boolean;
  pipelineAtomicMode: boolean; // Environment variable controlled: PIPELINE_ATOMIC
  pipelineRetryEnabled: boolean; // false for simplified fail-fast approach
  errorNotificationEnabled: boolean;

  // Data Quality Analysis (optional pipeline stage)
  dataQualityEnabled: boolean; // Enable data quality analysis stage
  dataQualityVerbose: boolean; // Show detailed quality reports

  // Legacy fields for compatibility (will be phased out)
  preservePartialSuccess?: boolean;
  continueOnError?: boolean;
  enableProgressEvents?: boolean;
}

export interface PipelineRequest {
  // Input data or file paths for processing
  inputData?: ProductData[];
  inputFiles?: string[];

  // Processing options
  requestId?: string;
  enablePartialSuccess?: boolean;
  skipStages?: PipelineStage[];
}

export interface PipelineResult {
  success: boolean;
  requestId: string;
  totalDuration: number;
  stagesCompleted: PipelineStage[];

  // Stage results
  ingestionResult?: IngestionServiceResult;
  frnResult?: FRNMatchingServiceResult;
  deduplicationResult?: DeduplicationOutput;
  dataQualityReport?: DataQualityReport;

  // Error handling
  errors: PipelineError[];
  partialSuccess: boolean;

  // Statistics
  totalProductsProcessed: number;
  finalProductCount: number;
  performanceMetrics: PerformanceMetrics;
}

export interface PipelineError {
  stage: PipelineStage;
  message: string;
  originalError?: Error | unknown;
  timestamp: Date;
  recoverable: boolean;
}

export interface PerformanceMetrics {
  stageExecutionTimes: Record<PipelineStage, number>;
  totalExecutionTime: number;
  throughputPerSecond: number;
  memoryUsage?: number;
  retryCount: number;
}

export interface PipelineProgress {
  requestId: string;
  currentStage: PipelineStage;
  stageProgress: number; // 0-100
  totalProgress: number; // 0-100
  message: string;
  timestamp: Date;
}

export enum PipelineStage {
  JSON_INGESTION = 'json_ingestion',
  FRN_MATCHING = 'frn_matching',
  DEDUPLICATION = 'deduplication',
  DATA_QUALITY = 'data_quality'
}

export interface PipelineOptions {
  stopAfterStage?: PipelineStage;
  skipDataQuality?: boolean;
}

// Simplified error types for fail-fast approach
export enum OrchestratorCriticalErrorType {
  CONFIG_LOAD_FAILED = 'CONFIG_LOAD_FAILED',
  SERVICE_INIT_FAILED = 'SERVICE_INIT_FAILED',
  DATABASE_FAILED = 'DATABASE_FAILED',
  STAGE_EXECUTION_FAILED = 'STAGE_EXECUTION_FAILED',
  PERSISTENCE_FAILED = 'PERSISTENCE_FAILED',
  CONCURRENT_EXECUTION = 'CONCURRENT_EXECUTION'
}

export interface OrchestratorCriticalError {
  errorType: OrchestratorCriticalErrorType;
  stage: PipelineStage | 'initialization' | 'persistence';
  message: string;
  originalError?: Error | unknown;
  timestamp: Date;
}

// Final product interface for atomic persistence

export class OrchestrationService extends EventEmitter implements RulesBasedModule<OrchestrationConfig, PipelineRequest, PipelineResult> {
  private db: Database.Database;
  private config: OrchestrationConfig | null = null;
  private rules: ParsedBusinessRule[] = [];
  private engine: Engine = new Engine();
  private initialized: boolean = false;
  private mainWindow?: BrowserWindow; // For UI integration

  // Service instances
  private jsonIngestionService: JSONIngestionService;
  private frnMatchingService: FRNMatchingService;
  private deduplicationService: DeduplicationService;
  private pipelineAudit: PipelineAudit;

  constructor(db: Database.Database, dbPath?: string) {
    super();
    this.db = db;

    // Initialize service instances
    this.jsonIngestionService = new JSONIngestionService(db);
    this.frnMatchingService = new FRNMatchingService(db);
    this.deduplicationService = new DeduplicationService(db);
    this.pipelineAudit = new PipelineAudit('orchestration', db);
  }

  /**
   * Load configuration from unified_config (RulesBasedModule interface)
   * Enhanced with orchestrator-specific parameters and NO hardcoded values
   */
  async loadConfiguration(category: ConfigCategory = 'orchestrator'): Promise<OrchestrationConfig> {
    try {
      // Always reload fresh from database
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

      if (configRows.length === 0) {
        throw new Error(`No configuration found for category: ${category}`);
      }

      // Parse configuration values based on type
      const configData: Record<string, string | number | boolean> = {};
      for (const row of configRows) {
        let value: string | number | boolean = row.config_value;

        switch (row.config_type) {
          case 'number':
            value = parseFloat(row.config_value);
            break;
          case 'boolean':
            value = row.config_value.toLowerCase() === 'true';
            break;
          case 'json':
            value = JSON.parse(row.config_value);
            break;
          // string type uses value as-is
        }

        configData[row.config_key] = value;
      }

      // Map to OrchestrationConfig interface with NO hardcoded values
      const newConfig: OrchestrationConfig = {
        concurrentExecutionCheck: Boolean(configData.orchestrator_concurrent_execution_check ?? true),
        configUpdateBlocking: Boolean(configData.orchestrator_config_update_blocking ?? true),
        uiProgressUpdates: Boolean(configData.orchestrator_ui_progress_updates ?? true),
        stageTimeoutMs: Number(configData.orchestrator_stage_timeout_ms ?? 300000),
        dataCorruptionThreshold: Number(configData.orchestrator_data_corruption_threshold ?? 0.5),
        enableAtomicTransactions: Boolean(configData.orchestrator_enable_atomic_transactions ?? true),
        pipelineAtomicMode: process.env.PIPELINE_ATOMIC !== 'false', // Default true for production safety
        pipelineRetryEnabled: Boolean(configData.orchestrator_pipeline_retry_enabled ?? false), // Simplified: disabled
        errorNotificationEnabled: Boolean(configData.orchestrator_error_notification_enabled ?? true),

        // Data Quality Analysis configuration
        dataQualityEnabled: process.env.PIPELINE_DATA_QUALITY !== undefined
          ? process.env.PIPELINE_DATA_QUALITY === 'true'
          : Boolean(configData.orchestrator_data_quality_enabled ?? false),
        dataQualityVerbose: process.env.DATA_QUALITY_VERBOSE !== undefined
          ? process.env.DATA_QUALITY_VERBOSE === 'true'
          : Boolean(configData.orchestrator_data_quality_verbose ?? false),

        // Legacy compatibility
        preservePartialSuccess: Boolean(configData.preservePartialSuccess ?? true),
        continueOnError: Boolean(configData.continueOnError ?? false),
        enableProgressEvents: Boolean(configData.enableProgressEvents ?? true)
      };

      // Always update the cached config
      this.config = newConfig;
      return this.config;
    } catch (error) {
      await this.handleCriticalError(
        OrchestratorCriticalErrorType.CONFIG_LOAD_FAILED,
        'initialization',
        `Failed to load orchestration configuration: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw error;
    }
  }

  /**
   * Load business rules from unified_business_rules (RulesBasedModule interface)
   */
  async loadRules(category: ConfigCategory = 'orchestrator'): Promise<ParsedBusinessRule[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT id, rule_name, rule_category, rule_type, conditions, event_type, event_params,
               priority, enabled, description, created_at, updated_at
        FROM unified_business_rules
        WHERE rule_category = ? AND enabled = 1
        ORDER BY priority DESC
      `);

      const ruleRows = stmt.all(category) as BusinessRule[];

      this.rules = ruleRows.map(row => ({
        id: row.id,
        ruleName: row.rule_name,
        category: row.rule_category as ConfigCategory,
        type: row.rule_type,
        conditions: JSON.parse(row.conditions),
        event: {
          type: row.event_type,
          params: row.event_params ? JSON.parse(row.event_params) : undefined
        },
        priority: row.priority,
        enabled: row.enabled,
        description: row.description,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      return this.rules;
    } catch (error) {
      throw new Error(`Failed to load orchestration rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Initialize rules engine (RulesBasedModule interface)
   */
  async initializeEngine(rules: ParsedBusinessRule[]): Promise<void> {
    try {
      this.engine = new Engine();

      for (const rule of rules) {
        this.engine.addRule({
          conditions: rule.conditions,
          event: rule.event,
          priority: rule.priority
        });
      }

      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize rules engine: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Evaluate rules against input (RulesBasedModule interface)
   */
  async evaluateRules(input: PipelineRequest): Promise<RuleEvaluationResult[]> {
    try {
      if (!this.initialized) {
        throw new Error('Rules engine not initialized');
      }

      const facts = {
        request: input,
        hasInputData: !!input.inputData?.length,
        hasInputFiles: !!input.inputFiles?.length,
        partialSuccessEnabled: input.enablePartialSuccess ?? this.config?.preservePartialSuccess,
        stagesCompleted: 0,
        errorType: null,
        retryCount: 0,
        pipeline_stage_failed: false,
        previous_stages_successful: 0,
        pipelineExecutionTime: 0,
        memoryUsage: 0,
        concurrentPipelines: 1,
        performanceThreshold: this.config?.stageTimeoutMs || 300000,
        memoryThreshold: 2048,
        maxConcurrent: 3
      };

      const { events } = await this.engine.run(facts);
      return [{
        productIndex: 0,
        passed: events.length === 0,
        facts,
        events
      }];
    } catch (error) {
      throw new Error(`Failed to evaluate rules: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Initialize the orchestration service with pipeline state validation
   */
  async initialize(): Promise<void> {
    try {
      // First, validate and recover pipeline state from previous runs
      await this.validatePipelineState();

      // Load configuration and rules
      await this.loadConfiguration();
      const rules = await this.loadRules();
      await this.initializeEngine(rules);

      // Initialize all sub-services
      await this.jsonIngestionService.loadConfiguration();
      await this.frnMatchingService.loadConfiguration();
      await this.deduplicationService.loadConfiguration();

      this.initialized = true;
      logger.info('   ✅ Pipeline orchestrator initialized');
    } catch (error) {
      await this.handleCriticalError(
        OrchestratorCriticalErrorType.SERVICE_INIT_FAILED,
        'initialization',
        `Failed to initialize OrchestrationService: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      throw error;
    }
  }

  /**
   * Core pipeline processing (RulesBasedModule interface)
   */
  async process(input: PipelineRequest): Promise<PipelineResult> {
    return this.executePipelineWithUI(input.inputFiles || [], this.mainWindow);
  }

  /**
   * Process from file (RulesBasedModule interface)
   */
  async processFile(filePath: string, options?: PipelineOptions): Promise<PipelineResult> {
    return this.executePipelineWithUI([filePath], this.mainWindow, options);
  }

  /**
   * Enhanced pipeline execution with UI integration and concurrent execution protection
   */
  async executePipelineWithUI(
    inputFiles: string[],
    mainWindow?: BrowserWindow,
    options?: PipelineOptions
  ): Promise<PipelineResult> {
    this.mainWindow = mainWindow;

    if (!this.initialized) {
      await this.initialize();
    }

    // CRITICAL: Check concurrent execution FIRST
    await this.checkConcurrentExecution();

    // Set pipeline status to running
    const batchId = `pipeline-${Date.now()}`;
    await this.setPipelineStatus(true, 'initialization', batchId);

    try {
      // Execute pipeline with stage tracking (no user interaction)
      const result = await this.executePipelineWithStageTracking(inputFiles, batchId, options);

      // Reset status to ready
      await this.setPipelineStatus(false);

      return result;
    } catch (error) {
      // Reset status on error
      await this.setPipelineStatus(false);
      throw error;
    }
  }

  /**
   * Execute pipeline with stage tracking and atomic persistence
   */
  private async executePipelineWithStageTracking(inputFiles: string[], batchId: string, options?: PipelineOptions): Promise<PipelineResult> {
    const startTime = Date.now();

    // Use PipelineAudit's batch ID for regulatory compliance
    const auditBatchId = this.pipelineAudit.getBatchId();

    const result: PipelineResult = {
      success: false,
      requestId: auditBatchId,
      totalDuration: 0,
      stagesCompleted: [],
      errors: [],
      partialSuccess: false,
      totalProductsProcessed: 0,
      finalProductCount: 0,
      performanceMetrics: {
        stageExecutionTimes: {} as Record<PipelineStage, number>,
        totalExecutionTime: 0,
        throughputPerSecond: 0,
        retryCount: 0
      }
    };

    try {
      // Set batch ID for all services for audit trail compliance
      this.jsonIngestionService.setBatchId(auditBatchId);
      this.frnMatchingService.setBatchId(auditBatchId);
      this.deduplicationService.setBatchId(auditBatchId);

      // Initialize all pipeline_audit entries upfront so other services can reference them
      this.pipelineAudit.initializeAllStages();

      // Execute pipeline in atomic transaction if enabled
      if (this.config?.pipelineAtomicMode) {
        logger.info('🔒 Pipeline executing in atomic mode - data will be committed only on success');
        return await this.executeAtomicPipeline(inputFiles, batchId, auditBatchId, result, startTime, options);
      } else {
        logger.info('🔓 Pipeline executing in incremental mode - data committed after each stage');
        return await this.executeIncrementalPipeline(inputFiles, batchId, auditBatchId, result, startTime, options);
      }
    } catch (error) {
      return this.handlePipelineError(error, result, batchId, startTime);
    }
  }

  /**
   * Execute pipeline with atomic transaction - all or nothing
   */
  private async executeAtomicPipeline(
    inputFiles: string[],
    batchId: string,
    auditBatchId: string,
    result: PipelineResult,
    startTime: number,
    options?: PipelineOptions
  ): Promise<PipelineResult> {
    // Check if stopAfterStage is incompatible with atomic mode
    if (options?.stopAfterStage) {
      logger.info('⚠️ stopAfterStage specified - switching to incremental mode');
      return await this.executeIncrementalPipeline(inputFiles, batchId, auditBatchId, result, startTime, options);
    }

    // Begin transaction manually for async function support
    this.db.exec('BEGIN');

    try {
      const pipelineResult = await this.executePipelineStages(inputFiles, batchId, auditBatchId, result, startTime, options);

      // Only commit if pipeline was successful
      if (pipelineResult.success) {
        this.db.exec('COMMIT');
        logger.info('✅ Atomic transaction committed - all data persisted');
      } else {
        this.db.exec('ROLLBACK');
        logger.warn('❌ Atomic transaction rolled back - no data persisted');
      }

      return pipelineResult;
    } catch (error) {
      this.db.exec('ROLLBACK');
      logger.error('❌ Atomic transaction rolled back due to error - no data persisted');
      throw error;
    }
  }

  /**
   * Execute pipeline with incremental commits - visible after each stage
   */
  private async executeIncrementalPipeline(
    inputFiles: string[],
    batchId: string,
    auditBatchId: string,
    result: PipelineResult,
    startTime: number,
    options?: PipelineOptions
  ): Promise<PipelineResult> {
    return await this.executePipelineStages(inputFiles, batchId, auditBatchId, result, startTime, options);
  }

  /**
   * Core pipeline stages execution
   */
  private async executePipelineStages(
    inputFiles: string[],
    batchId: string,
    auditBatchId: string,
    result: PipelineResult,
    startTime: number,
    options?: PipelineOptions
  ): Promise<PipelineResult> {
    try {

      // Emit pipeline start
      this.emit('pipeline:started', { batchId, inputFiles: inputFiles.length });
      this.emitProgress(batchId, PipelineStage.JSON_INGESTION, 0, 0, 'Starting pipeline execution');

      // Stage 1: JSON Ingestion
      await this.setPipelineStatus(true, 'json_ingestion', batchId);
      this.emit('pipeline:stage-started', { stage: 'json_ingestion', batchId });

      const ingestionResult = await this.executeJSONIngestionStage(inputFiles);

      // Record audit for JSON ingestion stage
      this.pipelineAudit.record('json_ingestion', {
        passed: ingestionResult.passed,
        rejected: ingestionResult.rejected,
        metadata: {
          inputFiles: inputFiles.length,
          processingTime: ingestionResult.statistics.duration || 0
        }
      }, ingestionResult.statistics.duration);

      result.ingestionResult = ingestionResult;
      result.totalProductsProcessed = ingestionResult.statistics.processed;

      this.emit('pipeline:stage-completed', {
        stage: 'json_ingestion',
        batchId,
        productsProcessed: ingestionResult.statistics.passed
      });

      // Check success based on errors and passed products
      const ingestionSuccessful = ingestionResult.errors.length === 0 && ingestionResult.passed.length > 0;
      if (ingestionSuccessful) {
        result.stagesCompleted.push(PipelineStage.JSON_INGESTION);

        // Check if we should stop after JSON ingestion
        if (options?.stopAfterStage === PipelineStage.JSON_INGESTION) {
          logger.info('⏹️ Stopping pipeline after JSON Ingestion as requested');
          result.success = true;
          const rawCount = this.db.prepare('SELECT COUNT(*) as count FROM available_products_raw').get() as { count: number };
          result.finalProductCount = rawCount.count;
          return result;
        }

        this.emitProgress(batchId, PipelineStage.FRN_MATCHING, 0, 33, 'JSON ingestion completed, starting FRN matching');
      } else {
        throw new Error(`JSON Ingestion failed: ${ingestionResult.errors.join(', ')}`);
      }

      // Stage 2: Rebuild from Complete Raw Dataset
      // New accumulation architecture: process all sources together for true cross-scraper deduplication
      await this.setPipelineStatus(true, 'rebuild', batchId);
      this.emit('pipeline:stage-started', { stage: 'rebuild', batchId });
      this.emitProgress(batchId, PipelineStage.DEDUPLICATION, 0, 66, 'JSON ingestion completed, rebuilding from complete raw dataset');

      await this.rebuildFromRawData(options);

      // Get final product count for reporting
      const finalCount = this.db.prepare(`SELECT COUNT(*) as count FROM available_products`).get() as { count: number };
      result.finalProductCount = finalCount.count;

      result.stagesCompleted.push(PipelineStage.FRN_MATCHING);
      result.stagesCompleted.push(PipelineStage.DEDUPLICATION);

      this.emit('pipeline:stage-completed', {
        stage: 'rebuild',
        batchId,
        productsSelected: finalCount.count
      });

      // Stage 3: Data Quality Analysis (optional)
      if (this.config?.dataQualityEnabled) {
        await this.setPipelineStatus(true, 'data_quality', batchId);
        this.emit('pipeline:stage-started', { stage: 'data_quality', batchId });

        this.emitProgress(batchId, PipelineStage.DATA_QUALITY, 0, 75, 'Starting data quality analysis');

        const dataQualityAnalyzer = new DataQualityAnalyzer(this.db, auditBatchId, {
          verbose: this.config.dataQualityVerbose,
          enableAnomalyDetection: true,
          enableTrendAnalysis: true,
          outputFormat: 'both'
        });

        await dataQualityAnalyzer.initialize();
        const qualityReport = await dataQualityAnalyzer.analyzePipeline();

        if (this.config.dataQualityVerbose) {
          logger.info('📊 Data quality analysis completed');
        } else {
          logger.info(`✅ Data quality score: ${qualityReport.overallScore}%`);
        }

        result.dataQualityReport = qualityReport;

        this.emit('pipeline:stage-completed', {
          stage: 'data_quality',
          batchId,
          score: qualityReport.overallScore
        });

        result.stagesCompleted.push(PipelineStage.DATA_QUALITY);

        this.emitProgress(batchId, PipelineStage.DATA_QUALITY, 100, 85, 'Data quality analysis completed');
      }

      this.emitProgress(batchId, PipelineStage.DEDUPLICATION, 100, 100, `Pipeline completed: ${result.finalProductCount} final products`)

      // Check overall success
      const expectedStages = [PipelineStage.JSON_INGESTION, PipelineStage.FRN_MATCHING, PipelineStage.DEDUPLICATION];
      if (this.config?.dataQualityEnabled) {
        expectedStages.push(PipelineStage.DATA_QUALITY);
      }
      result.success = result.stagesCompleted.length === expectedStages.length;

    } catch (error) {
      const currentStage = result.stagesCompleted[result.stagesCompleted.length - 1] || PipelineStage.JSON_INGESTION;

      await this.handleCriticalError(
        OrchestratorCriticalErrorType.STAGE_EXECUTION_FAILED,
        currentStage,
        error instanceof Error ? error.message : String(error),
        error
      );

      result.errors.push({
        stage: currentStage,
        message: error instanceof Error ? error.message : String(error),
        originalError: error,
        timestamp: new Date(),
        recoverable: false
      });

      // Handle partial success
      if (this.config?.preservePartialSuccess && result.stagesCompleted.length > 0) {
        result.partialSuccess = true;
      }
    }

    // Calculate final metrics
    const endTime = Date.now();
    result.totalDuration = endTime - startTime;
    result.performanceMetrics.totalExecutionTime = result.totalDuration;

    if (result.totalDuration > 0) {
      result.performanceMetrics.throughputPerSecond =
        (result.totalProductsProcessed / result.totalDuration) * 1000;
    }

    // Emit completion
    if (result.success) {
      this.emit('pipeline:completed', {
        batchId,
        duration: result.totalDuration,
        finalProductCount: result.finalProductCount
      });

      // Clean up processed files after successful pipeline
      await this.cleanupProcessedFiles(inputFiles);
    } else {
      this.emit('pipeline:failed', {
        batchId,
        error: result.errors[0]?.message || 'Unknown error',
        stage: result.errors[0]?.stage || 'unknown'
      });
    }

    // Flush all batched audit records to database
    logger.debug('🔍 Orchestrator: Flushing pipeline audit records');
    this.pipelineAudit.flush();

    return result;
  }

  /**
   * Execute JSON Ingestion stage (simplified)
   * FIXED: Process each file individually to preserve source/method metadata
   */
  private async executeJSONIngestionStage(inputFiles: string[]): Promise<IngestionServiceResult> {
    try {
      // Accumulate results from each file
      let combinedResult: IngestionServiceResult = {
        passed: [],
        rejected: [],
        errors: [],
        statistics: {
          processed: 0,
          passed: 0,
          rejected: 0,
          validationErrors: 0,
          rateFiltered: 0,
          duration: 0,
          byPlatform: {}
        }
      };

      // Process each file individually to preserve source/method
      for (const filePath of inputFiles) {
        const content = await require('fs').promises.readFile(filePath, 'utf8');
        const data: JSONFileData = JSON.parse(content);

        // Validate metadata format
        if (!data.metadata || !data.metadata.source || !data.metadata.method) {
          throw new Error(`Invalid JSON file format: missing metadata in ${filePath}`);
        }

        if (!Array.isArray(data.products)) {
          throw new Error(`Invalid JSON file format: products must be an array in ${filePath}`);
        }

        // Process this file with its specific source/method metadata
        const fileResult = await this.jsonIngestionService.processForProducts(
          data.products,
          data.metadata  // Preserve original source/method from file
        );

        // Accumulate results
        combinedResult.passed.push(...fileResult.passed);
        combinedResult.rejected.push(...fileResult.rejected);
        combinedResult.errors.push(...fileResult.errors);
        combinedResult.statistics.processed += fileResult.statistics.processed;
        combinedResult.statistics.passed += fileResult.statistics.passed;
        combinedResult.statistics.rejected += fileResult.statistics.rejected;
        combinedResult.statistics.validationErrors += fileResult.statistics.validationErrors;
        combinedResult.statistics.rateFiltered += fileResult.statistics.rateFiltered;
        combinedResult.statistics.duration += fileResult.statistics.duration;

        // Merge platform statistics
        for (const [platform, stats] of Object.entries(fileResult.statistics.byPlatform)) {
          if (!combinedResult.statistics.byPlatform[platform]) {
            combinedResult.statistics.byPlatform[platform] = {
              processed: 0,
              passed: 0,
              rejected: 0
            };
          }
          combinedResult.statistics.byPlatform[platform].processed += stats.processed;
          combinedResult.statistics.byPlatform[platform].passed += stats.passed;
          combinedResult.statistics.byPlatform[platform].rejected += stats.rejected;
        }
      }

      return combinedResult;

    } catch (error) {
      await this.handleCriticalError(
        OrchestratorCriticalErrorType.STAGE_EXECUTION_FAILED,
        PipelineStage.JSON_INGESTION,
        error instanceof Error ? error.message : String(error),
        error
      );
      throw error;
    }
  }

  /**
   * Execute FRN Matching stage (simplified)
   */
  private async executeFRNMatchingStage(products: ParsedProduct[]): Promise<FRNMatchingServiceResult> {
    try {
      logger.info(`🔍 Starting FRN matching for ${products.length} products`);

      const frnResult = await this.frnMatchingService.processProducts(products);

      if (!frnResult.success) {
        throw new Error(`FRN Matching failed: ${frnResult.errors.join(', ')}`);
      }

      logger.info(`✅ FRN matching completed: ${frnResult.stats.exactMatches} exact, ${frnResult.stats.fuzzyMatches} fuzzy, ${frnResult.stats.aliasMatches} alias, ${frnResult.stats.noMatches} no match`);

      return frnResult;
    } catch (error) {
      await this.handleCriticalError(
        OrchestratorCriticalErrorType.STAGE_EXECUTION_FAILED,
        PipelineStage.FRN_MATCHING,
        error instanceof Error ? error.message : String(error),
        error
      );
      throw error;
    }
  }

  /**
   * Execute Deduplication stage (simplified)
   */
  private async executeDeduplicationStage(products: import('./FRNMatchingService').EnrichedProduct[]): Promise<DeduplicationOutput> {
    try {
      logger.debug(`🔍 executeDeduplicationStage calling processProducts with ${products.length} products`);
      const deduplicationResult = await this.deduplicationService.processProducts(products);

      logger.debug(`🔍 executeDeduplicationStage received from service: selectedProducts.length=${deduplicationResult.selectedProducts?.length}`);

      return deduplicationResult;
    } catch (error) {
      logger.error(`❌ executeDeduplicationStage caught error: ${error}`);
      throw error;
    }
  }

  /**
   * Non-atomic persistence with complete data replacement
   */
  private async persistResultsNonAtomic(selectedProducts: FinalProduct[]): Promise<void> {
    logger.debug(`💾 Starting non-atomic persistence of ${selectedProducts.length} products`);

    try {
      // Clear existing products
      const deleteStmt = this.db.prepare(`DELETE FROM available_products`);
      deleteStmt.run();
      logger.debug(`🗑️ Cleared existing products from available_products`);

      // Insert new products
      if (selectedProducts.length > 0) {
        const insertStmt = this.db.prepare(`
          INSERT INTO available_products (
            platform, bank_name, account_type, aer_rate, gross_rate, term_months,
            notice_period_days, min_deposit, max_deposit, fscs_protected, frn,
            interest_payment_frequency, apply_by_date, special_features, scrape_date,
            confidence_score, source, business_key, deduplication_metadata, raw_platform
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const product of selectedProducts) {
          insertStmt.run([
            product.platform,
            product.bankName,
            product.accountType,
            product.aerRate,
            product.grossRate || null,
            product.termMonths || null,
            product.noticePeriodDays || null,
            product.minDeposit || null,
            product.maxDeposit || null,
            product.fscsProtected ? 1 : 0,
            product.frn || null,
            product.interestPaymentFrequency || null,
            product.applyByDate || null,
            product.specialFeatures || null,
            product.scrapeDate,
            product.confidenceScore || 1.0,
            product.source,
            product.businessKey || null,
            product.deduplicationMetadata || null,
            product.platform // raw_platform same as platform
          ]);
        }
        logger.debug(`✅ Inserted ${selectedProducts.length} products into available_products`);
      }
    } catch (error) {
      logger.error('❌ Non-atomic persistence failed:', error);
      throw error;
    }
  }


  /**
   * Atomic persistence with complete data replacement
   */
  private async persistResultsWithTransaction(selectedProducts: FinalProduct[]): Promise<void> {
    if (!this.config?.enableAtomicTransactions) {
      logger.warn('⚠️ Atomic transactions disabled, skipping persistence');
      return;
    }

    logger.debug(`💾 Starting atomic persistence of ${selectedProducts.length} products`);

    const transaction = this.db.transaction(() => {
      try {
        // 1. Validate current data state
        const currentCount = this.db.prepare(`SELECT COUNT(*) as count FROM available_products`).get() as { count: number };
        logger.debug(`Replacing ${currentCount.count} existing products with ${selectedProducts.length} new products`);

        // 2. Clear current data
        this.db.prepare(`DELETE FROM available_products`).run();

        // 3. Insert new data with validation
        const insertStmt = this.db.prepare(`
          INSERT INTO available_products (
            bank_name, account_type, aer_rate, term_months,
            notice_period_days, platform, source, business_key, frn,
            scrape_date, confidence_score, fscs_protected, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);

        let insertedCount = 0;
        for (const product of selectedProducts) {
          // Validate each product before insertion
          if (!product.bankName || typeof product.aerRate !== 'number') {
            throw new Error(`Invalid product data: missing required fields`);
          }

          insertStmt.run(
            product.bankName,
            product.accountType,
            product.aerRate,
            product.termMonths || null,
            product.noticePeriodDays || null,
            product.platform,
            product.source,
            product.businessKey,
            product.frn,
            product.scrapeDate || new Date().toISOString().split('T')[0],
            product.confidenceScore || 1.0,
            product.fscsProtected ? 1 : 0
          );
          insertedCount++;
        }

        // 4. Validate final state
        const finalCount = this.db.prepare(`SELECT COUNT(*) as count FROM available_products`).get() as { count: number };
        if (finalCount.count !== selectedProducts.length) {
          throw new Error(`Data integrity error: expected ${selectedProducts.length}, got ${finalCount.count}`);
        }

        logger.debug(`Successfully replaced ${currentCount.count} products with ${insertedCount} new products`);

      } catch (error) {
        logger.error('Transaction failed, rolling back:', error);
        throw error; // This will cause transaction rollback
      }
    });

    try {
      // Execute transaction (atomic - all or nothing)
      transaction();
      logger.info('✅ Atomic persistence completed successfully');
    } catch (error) {
      await this.handleCriticalError(
        OrchestratorCriticalErrorType.PERSISTENCE_FAILED,
        'persistence',
        error instanceof Error ? error.message : String(error),
        error
      );
      throw error;
    }
  }


  /**
   * Check for concurrent execution (CRITICAL for data integrity)
   */
  private async checkConcurrentExecution(): Promise<void> {
    if (!this.config?.concurrentExecutionCheck) {
      return; // Skip if disabled in config
    }

    const isRunning = await this.isPipelineRunning();

    if (isRunning) {
      await this.handleCriticalError(
        OrchestratorCriticalErrorType.CONCURRENT_EXECUTION,
        'initialization',
        'Pipeline is already running. Only one pipeline execution allowed at a time.'
      );
      throw new Error('Concurrent pipeline execution not allowed');
    }
  }

  /**
   * Check if pipeline is currently running
   */
  async isPipelineRunning(): Promise<boolean> {
    try {
      const stmt = this.db.prepare(`SELECT is_running FROM orchestrator_pipeline_status WHERE id = 1`);
      const row = stmt.get() as { is_running: number } | undefined;
      return row?.is_running === 1;
    } catch (error) {
      logger.error('Failed to check pipeline status:', error);
      return false; // Safe fallback
    }
  }

  /**
   * Set pipeline status (atomic operation)
   */
  private async setPipelineStatus(isRunning: boolean, stage?: string, batchId?: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE orchestrator_pipeline_status
        SET is_running = ?, current_stage = ?, batch_id = ?,
            started_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE started_at END,
            last_updated = CURRENT_TIMESTAMP
        WHERE id = 1
      `);
      stmt.run(isRunning ? 1 : 0, stage || null, batchId || null, isRunning ? 1 : 0);
    } catch (error) {
      logger.error('Failed to update pipeline status:', error);
      throw new Error(`Failed to update pipeline status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get current pipeline status
   */
  async getPipelineStatus(): Promise<{
    isRunning: boolean;
    currentStage?: string;
    batchId?: string;
  }> {
    try {
      const stmt = this.db.prepare(`
        SELECT is_running, current_stage, batch_id
        FROM orchestrator_pipeline_status
        WHERE id = 1
      `);
      const row = stmt.get() as {
        is_running: number;
        current_stage?: string;
        batch_id?: string;
      } | undefined;

      return {
        isRunning: row?.is_running === 1,
        currentStage: row?.current_stage || undefined,
        batchId: row?.batch_id || undefined
      };
    } catch (error) {
      logger.error('Failed to get pipeline status:', error);
      return { isRunning: false };
    }
  }

  /**
   * Validate pipeline state and recover from stuck states
   */
  private async validatePipelineState(): Promise<void> {
    try {
      // Check for orphaned pipeline status
      const stmt = this.db.prepare(`
        SELECT is_running, current_stage, started_at
        FROM orchestrator_pipeline_status
        WHERE id = 1
      `);
      const status = stmt.get() as {
        is_running: number;
        current_stage?: string;
        started_at?: string;
      } | undefined;

      if (status?.is_running && status?.started_at) {
        const startTime = new Date(status.started_at);
        const timeSinceStart = Date.now() - startTime.getTime();
        const timeoutMs = this.config?.stageTimeoutMs || 300000; // Use config or fallback

        // Check for stuck pipeline (running too long)
        if (timeSinceStart > timeoutMs * 3) { // 15 minutes total timeout
          logger.warn(`Detected stuck pipeline execution, resetting state`);
          await this.resetPipelineStatus();
        }
      }
    } catch (error) {
      logger.error('Pipeline state validation failed:', error);
      await this.resetPipelineStatus(); // Safe recovery
    }
  }

  /**
   * Reset pipeline status to ready state
   */
  private async resetPipelineStatus(): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE orchestrator_pipeline_status
        SET is_running = 0, current_stage = NULL, batch_id = NULL
        WHERE id = 1
      `);
      stmt.run();
    } catch (error) {
      logger.error('Failed to reset pipeline status:', error);
    }
  }

  /**
   * Handle critical errors with pipeline status reset and UI notification
   */
  private async handleCriticalError(
    errorType: OrchestratorCriticalErrorType,
    stage: string,
    message: string,
    originalError?: Error | unknown
  ): Promise<void> {
    const error: OrchestratorCriticalError = {
      errorType,
      stage: stage as PipelineStage | 'initialization' | 'persistence',
      message,
      originalError,
      timestamp: new Date()
    };

    // Reset pipeline status to ready
    await this.resetPipelineStatus();

    // Report to UI via IPC
    if (this.mainWindow && this.config?.errorNotificationEnabled) {
      this.mainWindow.webContents.send('orchestrator:pipeline-failed', {
        error: error.errorType,
        stage: error.stage,
        message: error.message,
        timestamp: error.timestamp
      });
    }

    // Log for debugging
    logger.error(`Pipeline failed: ${errorType} in ${stage} - ${message}`, originalError);
  }

  /**
   * Handle pipeline execution errors
   */
  private handlePipelineError(error: unknown, result: PipelineResult, batchId: string, startTime: number): PipelineResult {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(`❌ Pipeline execution failed for batch ${batchId}: ${errorMessage}`);

    // Reset pipeline status
    this.resetPipelineStatus().catch(resetError => {
      logger.error('Failed to reset pipeline status after error:', resetError);
    });

    // Return failed result
    return {
      ...result,
      success: false,
      errors: [...result.errors, {
        stage: 'pipeline_execution' as PipelineStage,
        message: errorMessage,
        originalError: error,
        timestamp: new Date(),
        recoverable: false
      }],
      totalDuration: Date.now() - startTime
    };
  }

  /**
   * Emit progress events for UI integration
   */
  private emitProgress(
    requestId: string,
    stage: PipelineStage,
    stageProgress: number,
    totalProgress: number,
    message: string
  ): void {
    if (this.config?.uiProgressUpdates) {
      const progress: PipelineProgress = {
        requestId,
        currentStage: stage,
        stageProgress,
        totalProgress,
        message,
        timestamp: new Date()
      };

      this.emit('progress', progress);
    }
  }

  /**
   * Update configuration (with pipeline execution blocking)
   */
  async updateConfiguration(configUpdates: Record<string, string | number | boolean>): Promise<void> {
    // Block configuration updates during pipeline execution
    if (this.config?.configUpdateBlocking && await this.isPipelineRunning()) {
      throw new Error('Cannot update configuration while pipeline is running');
    }

    // Validate configuration before applying
    for (const [key, value] of Object.entries(configUpdates)) {
      if (!this.isValidConfigKey(key)) {
        throw new Error(`Invalid configuration key: ${key}`);
      }
    }

    // Apply updates atomically
    const transaction = this.db.transaction(() => {
      for (const [key, value] of Object.entries(configUpdates)) {
        const stmt = this.db.prepare(`
          UPDATE unified_config
          SET config_value = ?
          WHERE config_key = ?
        `);
        stmt.run(String(value), key);
      }
    });

    transaction();

    // Reload configuration
    await this.loadConfiguration();
  }

  /**
   * Validate configuration key
   */
  private isValidConfigKey(key: string): boolean {
    const validPrefixes = [
      'orchestrator_',
      'json_ingestion_',
      'frn_matching_',
      'deduplication_'
    ];

    return validPrefixes.some(prefix => key.startsWith(prefix));
  }

  /**
   * Get service status (RulesBasedModule interface)
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
    try {
      if (!this.config) {
        return {
          valid: false,
          message: 'Configuration not loaded',
          errors: ['Configuration must be loaded before validation']
        };
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      // Validate configuration values
      if (this.config.stageTimeoutMs < 30000 || this.config.stageTimeoutMs > 600000) {
        warnings.push('stageTimeoutMs should be between 30s and 10m');
      }

      if (this.config.dataCorruptionThreshold < 0 || this.config.dataCorruptionThreshold > 1) {
        errors.push('dataCorruptionThreshold must be between 0 and 1');
      }

      return {
        valid: errors.length === 0,
        message: errors.length === 0 ? 'Configuration is valid' : 'Configuration validation failed',
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      return {
        valid: false,
        message: 'Configuration validation failed',
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Rebuild available_products from complete raw dataset
   * This enables true cross-scraper deduplication
   */
  public async rebuildFromRawData(options?: PipelineOptions): Promise<void> {
    logger.info('🔄 Rebuilding available_products from complete raw dataset...');

    try {
      // 1. Load ALL products from available_products_raw (including FRN data)
      const rawProducts = this.db.prepare(`
        SELECT platform, source, bank_name, account_type, aer_rate, gross_rate,
               term_months, notice_period_days, min_deposit, max_deposit,
               fscs_protected, interest_payment_frequency, apply_by_date,
               special_features, scrape_date, confidence_score, frn
        FROM available_products_raw
        ORDER BY source, bank_name, account_type
      `).all() as any[];

      logger.info(`📊 Loading ${rawProducts.length} products from raw table for reprocessing`);

      if (rawProducts.length === 0) {
        logger.warn('⚠️ No products in raw table, skipping rebuild');
        return;
      }

      // 2. Convert to ParsedProduct format for FRN matching
      const parsedProducts: ParsedProduct[] = rawProducts.map(raw => ({
        platform: raw.platform || 'unknown',
        source: raw.source || 'unknown',
        bankName: raw.bank_name || 'Unknown Bank',
        accountType: raw.account_type || 'unknown',
        aerRate: Number(raw.aer_rate) || 0,
        grossRate: raw.gross_rate ? Number(raw.gross_rate) : Number(raw.aer_rate) || 0,
        termMonths: raw.term_months ? Number(raw.term_months) : null,
        noticePeriodDays: raw.notice_period_days ? Number(raw.notice_period_days) : null,
        minDeposit: raw.min_deposit ? Number(raw.min_deposit) : null,
        maxDeposit: raw.max_deposit ? Number(raw.max_deposit) : null,
        fscsProtected: Boolean(raw.fscs_protected),
        interestPaymentFrequency: raw.interest_payment_frequency || null,
        applyByDate: raw.apply_by_date || null,
        specialFeatures: raw.special_features || null,
        scrapeDate: raw.scrape_date || new Date().toISOString().split('T')[0],
        scrapedAt: raw.scrape_date || new Date().toISOString().split('T')[0],
        confidenceScore: Number(raw.confidence_score) || 1.0
      }));

      // 3. Process through FRN matching
      logger.info('🔍 Processing complete dataset through FRN matching...');
      const frnResult = await this.executeFRNMatchingStage(parsedProducts);

      // Early exit after FRN matching if requested
      if (options?.stopAfterStage === PipelineStage.FRN_MATCHING) {
        logger.info('⏹️ Stopping pipeline after FRN Matching as requested');
        logger.info(`✅ FRN matching completed: ${frnResult.enrichedProducts.length} products enriched`);
        return;
      }

      // 4. Process through deduplication
      logger.info('🔄 Processing complete dataset through deduplication...');
      const deduplicationResult = await this.executeDeduplicationStage(frnResult.enrichedProducts);

      // Early exit after deduplication if requested
      if (options?.stopAfterStage === PipelineStage.DEDUPLICATION) {
        logger.info('⏹️ Stopping pipeline after Deduplication as requested');
        // Persist the deduplicated results and exit before data quality analysis
        if (deduplicationResult.selectedProducts && deduplicationResult.selectedProducts.length > 0) {
          if (this.config?.enableAtomicTransactions) {
            await this.persistResultsWithTransaction(deduplicationResult.selectedProducts);
          } else {
            await this.persistResultsNonAtomic(deduplicationResult.selectedProducts);
          }
          logger.info(`✅ Pipeline stopped after deduplication: ${deduplicationResult.selectedProducts.length} products persisted`);
        } else {
          logger.warn('⚠️ No products to persist after deduplication');
        }
        return;
      }

      if (!deduplicationResult.selectedProducts || deduplicationResult.selectedProducts.length === 0) {
        logger.warn('⚠️ No products selected from complete dataset - this is expected when raw table is empty');
        // Clear the final table since there are no products to process
        if (this.config?.enableAtomicTransactions) {
          await this.persistResultsWithTransaction([]);
        } else {
          await this.persistResultsNonAtomic([]);
        }
        logger.info('✅ Rebuild complete: empty dataset handled gracefully');
        return;
      }

      // 5. Replace available_products table (using existing persistence logic)
      logger.info(`💾 Replacing available_products with ${deduplicationResult.selectedProducts.length} deduplicated products`);

      if (this.config?.enableAtomicTransactions) {
        await this.persistResultsWithTransaction(deduplicationResult.selectedProducts);
      } else {
        await this.persistResultsNonAtomic(deduplicationResult.selectedProducts);
      }

      logger.info(`✅ Rebuild complete: ${rawProducts.length} raw → ${deduplicationResult.selectedProducts.length} final products`);

    } catch (error) {
      logger.error('❌ Rebuild from raw data failed:', error);
      throw error;
    }
  }

  /**
   * Clean up processed files after successful pipeline completion
   * Uses graceful failure - warnings only if files are missing or can't be deleted
   */
  private async cleanupProcessedFiles(inputFiles: string[]): Promise<void> {
    logger.info('🧹 Cleaning up processed files...');

    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      for (const filePath of inputFiles) {
        try {
          // Extract timestamp and platform from normalized filename
          // Format: platform-normalized-timestamp.json (platform may contain spaces, hyphens, or underscores)
          const filename = path.basename(filePath);
          const match = filename.match(/^([\w\s-]+)-normalized-(.+)\.json$/);

          if (!match) {
            logger.warn(`⚠️  Skipping cleanup for non-standard filename: ${filename}`);
            continue;
          }

          const [, platform, timestamp] = match;
          const directory = path.dirname(filePath);

          // Find and delete all files with the same timestamp (log, raw, normalized)
          const allFiles = await fs.readdir(directory);
          const relatedFiles = allFiles.filter(file =>
            file.includes(timestamp) && file.startsWith(platform)
          );

          for (const file of relatedFiles) {
            const fullPath = path.join(directory, file);
            try {
              await fs.unlink(fullPath);
              logger.debug(`  ✓ Deleted: ${file}`);
            } catch (unlinkError: any) {
              if (unlinkError.code === 'ENOENT') {
                logger.warn(`  ⚠️  File already deleted: ${file}`);
              } else {
                logger.warn(`  ⚠️  Failed to delete ${file}: ${unlinkError.message}`);
              }
            }
          }

          if (relatedFiles.length > 0) {
            logger.info(`✅ Cleaned up ${relatedFiles.length} file(s) for ${platform} (${timestamp})`);
          }
        } catch (fileError: any) {
          logger.warn(`⚠️  Cleanup failed for ${path.basename(filePath)}: ${fileError.message}`);
        }
      }

      logger.info('✅ File cleanup complete');

      // Checkpoint WAL to ensure all data is persisted to main database file
      logger.info('🔄 Checkpointing WAL file...');
      try {
        this.db.prepare('PRAGMA wal_checkpoint(FULL)').run();
        logger.info('✅ WAL checkpoint complete - all data persisted to main database');
      } catch (walError: any) {
        logger.warn(`⚠️  WAL checkpoint failed: ${walError.message}`);
        // Don't throw - checkpoint failure shouldn't fail the pipeline
      }
    } catch (error: any) {
      logger.warn(`⚠️  File cleanup encountered an error: ${error.message}`);
      // Don't throw - cleanup failure shouldn't fail the pipeline
    }
  }

  /**
   * Reset service state (RulesBasedModule interface)
   */
  reset(): void {
    this.config = null;
    this.rules = [];
    this.engine = new Engine();
    this.initialized = false;
    this.mainWindow = undefined;
  }
}
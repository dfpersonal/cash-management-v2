import * as Database from 'better-sqlite3';
import { logger } from '../utils/PipelineLogger';
import {
  RulesBasedModule,
  ConfigCategory,
  ModuleStatus
} from '@cash-mgmt/shared';

/**
 * Data Quality Analysis Module
 *
 * Provides comprehensive pipeline health monitoring and quality analysis
 * as an optional stage in the JSON processing pipeline.
 *
 * Key Features:
 * - Pipeline flow analysis (product counts, attrition rates)
 * - Data integrity validation
 * - Deduplication effectiveness assessment
 * - Anomaly detection (outliers, inconsistencies)
 * - Actionable recommendations
 * - Historical quality tracking
 */

export interface DataQualityConfig {
  // Quality thresholds
  minFrnMatchRate: number;
  maxAnomalyRate: number;
  minIntegrityScore: number;

  // Analysis settings
  verbose: boolean;
  enableAnomalyDetection: boolean;
  enableTrendAnalysis: boolean;

  // Performance settings
  sampleSize?: number;
  timeoutMs: number;

  // Report settings
  retentionDays: number;
  outputFormat: 'console' | 'database' | 'both';
}

export interface PipelineFlowAnalysis {
  rawProductCount: number;
  validatedCount: number;
  enrichedCount: number;
  finalCount: number;
  attritionRate: number;
  processingTimeMs: number;
  efficiency: number;
}

export interface DataIntegrityAnalysis {
  score: number; // 0-100
  missingFields: string[];
  invalidValues: Array<{field: string; count: number; percentage: number}>;
  sourceConsistency: number; // percentage
  platformConsistency: number; // percentage
  frnMatchRate: number;
  completenessScore: number;
}

export interface DeduplicationAnalysis {
  totalGroups: number;
  crossPlatformGroups: number;
  preferredPlatformRetention: number; // percentage
  selectionReasons: Record<string, number>;
  businessKeyDistribution: Array<{key: string; count: number; quality: number}>;
  duplicateRate: number;
  deduplicationEfficiency: number;
}

export interface QualityAnomaly {
  type: 'high_rate' | 'duplicate_frn' | 'missing_frn' | 'unusual_platform' | 'rate_outlier' | 'processing_time';
  severity: 'low' | 'medium' | 'high';
  description: string;
  affectedProducts: number;
  affectedPercentage: number;
  recommendation?: string;
  threshold?: number;
  actualValue?: number;
}

export interface DataQualityReport {
  batchId: string;
  timestamp: string;
  executionTimeMs: number;

  // Core analysis
  pipeline: PipelineFlowAnalysis;
  dataIntegrity: DataIntegrityAnalysis;
  deduplication: DeduplicationAnalysis;

  // Issues and recommendations
  anomalies: QualityAnomaly[];
  recommendations: string[];

  // Summary scoring
  overallScore: number; // 0-100
  pipelineScore: number;
  integrityScore: number;
  deduplicationScore: number;

  // Metadata
  configSnapshot: Partial<DataQualityConfig>;
  previousBatchComparison?: {
    scoreDelta: number;
    trendDirection: 'improving' | 'degrading' | 'stable';
  };
}

export class DataQualityAnalyzer {
  private db: Database.Database;
  private config: DataQualityConfig;
  private batchId: string;
  private startTime: number;

  constructor(db: Database.Database, batchId: string, config?: Partial<DataQualityConfig>) {
    this.db = db;
    this.batchId = batchId;
    this.startTime = Date.now();
    this.config = this.mergeWithDefaults(config || {});
  }

  private mergeWithDefaults(config: Partial<DataQualityConfig>): DataQualityConfig {
    return {
      // Quality thresholds
      minFrnMatchRate: config.minFrnMatchRate ?? 0.70,
      maxAnomalyRate: config.maxAnomalyRate ?? 0.10,
      minIntegrityScore: config.minIntegrityScore ?? 80,

      // Analysis settings
      verbose: config.verbose ?? false,
      enableAnomalyDetection: config.enableAnomalyDetection ?? true,
      enableTrendAnalysis: config.enableTrendAnalysis ?? true,

      // Performance settings
      sampleSize: config.sampleSize,
      timeoutMs: config.timeoutMs ?? 30000,

      // Report settings
      retentionDays: config.retentionDays ?? 90,
      outputFormat: config.outputFormat ?? 'both'
    };
  }

  // RulesBasedModule interface implementation
  async loadConfiguration(): Promise<void> {
    const configRows = this.db.prepare(`
      SELECT config_key, config_value
      FROM unified_config
      WHERE category = 'data_quality'
    `).all();

    for (const row of configRows as Array<{config_key: string, config_value: string}>) {
      const key = row.config_key.replace('data_quality_', '');
      const value = this.parseConfigValue(row.config_value);

      switch (key) {
        case 'min_frn_match_rate':
          this.config.minFrnMatchRate = parseFloat(value);
          break;
        case 'max_anomaly_rate':
          this.config.maxAnomalyRate = parseFloat(value);
          break;
        case 'min_integrity_score':
          this.config.minIntegrityScore = parseInt(value);
          break;
        case 'report_retention_days':
          this.config.retentionDays = parseInt(value);
          break;
        case 'enable_anomaly_detection':
          this.config.enableAnomalyDetection = value === 'true';
          break;
        case 'enable_trend_analysis':
          this.config.enableTrendAnalysis = value === 'true';
          break;
      }
    }

    if (this.config.verbose) {
      logger.info(`✅ Loaded ${configRows.length} data quality configuration parameters`);
    }
  }

  private parseConfigValue(value: string): string {
    // Handle boolean and numeric strings
    if (value === 'true' || value === 'false') return value;
    if (!isNaN(Number(value))) return value;
    return value;
  }

  async initialize(): Promise<{status: string; error?: string}> {
    try {
      await this.loadConfiguration();
      return {
        status: 'initialized'
      };
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Main entry point - analyze complete pipeline quality
   */
  async analyzePipeline(): Promise<DataQualityReport> {
    const analysisStart = Date.now();

    if (this.config.verbose) {
      logger.info(`📊 Starting data quality analysis for batch ${this.batchId}`);
    }

    try {
      // Core analysis components
      const pipeline = await this.analyzePipelineFlow();
      const dataIntegrity = await this.analyzeDataIntegrity();
      const deduplication = await this.analyzeDeduplicationEffectiveness();

      // Advanced analysis
      const anomalies = this.config.enableAnomalyDetection
        ? await this.detectAnomalies(pipeline, dataIntegrity, deduplication)
        : [];

      const recommendations = this.generateRecommendations(pipeline, dataIntegrity, deduplication, anomalies);

      // Calculate scoring
      const scores = this.calculateQualityScores(pipeline, dataIntegrity, deduplication, anomalies);

      // Build report
      const report: DataQualityReport = {
        batchId: this.batchId,
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - analysisStart,

        pipeline,
        dataIntegrity,
        deduplication,
        anomalies,
        recommendations,

        overallScore: scores.overall,
        pipelineScore: scores.pipeline,
        integrityScore: scores.integrity,
        deduplicationScore: scores.deduplication,

        configSnapshot: {
          minFrnMatchRate: this.config.minFrnMatchRate,
          maxAnomalyRate: this.config.maxAnomalyRate,
          minIntegrityScore: this.config.minIntegrityScore,
          enableAnomalyDetection: this.config.enableAnomalyDetection
        }
      };

      // Add trend analysis if enabled
      if (this.config.enableTrendAnalysis) {
        report.previousBatchComparison = await this.compareWithPreviousBatch(scores.overall);
      }

      // Store report
      await this.storeReport(report);

      if (this.config.verbose) {
        this.outputDetailedReport(report);
      } else {
        logger.info(`✅ Data quality score: ${report.overallScore}% (${report.anomalies.length} anomalies)`);
      }

      return report;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`❌ Data quality analysis failed: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Analyze product flow through pipeline stages
   */
  private async analyzePipelineFlow(): Promise<PipelineFlowAnalysis> {
    // Use pipeline_audit data to get batch-specific counts
    const batchAuditQuery = this.db.prepare(`
      SELECT stage, input_count, output_count, processing_time
      FROM pipeline_audit
      WHERE batch_id = ?
      ORDER BY stage_order
    `);

    const auditRecords = batchAuditQuery.all(this.batchId) as Array<{
      stage: string;
      input_count: number;
      output_count: number;
      processing_time: number;
    }>;

    // Extract stage data
    const stageData: Record<string, {input: number; output: number; time: number}> = {};
    for (const record of auditRecords) {
      stageData[record.stage] = {
        input: record.input_count,
        output: record.output_count,
        time: record.processing_time
      };
    }

    // Calculate pipeline flow metrics
    const rawCount = stageData['json_ingestion']?.input || 0;
    const validatedCount = stageData['json_ingestion']?.output || 0;
    const enrichedCount = stageData['frn_matching']?.output || 0;
    const finalCount = stageData['deduplication']?.output || 0;

    // Calculate total processing time
    const totalProcessingTime = auditRecords.reduce((sum, record) => sum + (record.processing_time || 0), 0);

    const attritionRate = rawCount > 0 ? (rawCount - finalCount) / rawCount : 0;
    const efficiency = totalProcessingTime > 0 && finalCount > 0
      ? finalCount / (totalProcessingTime / 1000) // products per second
      : 0;

    return {
      rawProductCount: rawCount,
      validatedCount: validatedCount,
      enrichedCount: enrichedCount,
      finalCount,
      attritionRate,
      processingTimeMs: totalProcessingTime,
      efficiency
    };
  }

  /**
   * Analyze data integrity and completeness
   */
  private async analyzeDataIntegrity(): Promise<DataIntegrityAnalysis> {
    // Get recent product sample for analysis (since we don't have batch_id in available_products_raw)
    const products = this.db.prepare(`
      SELECT * FROM available_products_raw
      ORDER BY created_at DESC
      ${this.config.sampleSize ? `LIMIT ${this.config.sampleSize}` : 'LIMIT 1000'}
    `).all() as any[];

    if (products.length === 0) {
      return {
        score: 0,
        missingFields: [],
        invalidValues: [],
        sourceConsistency: 0,
        platformConsistency: 0,
        frnMatchRate: 0,
        completenessScore: 0
      };
    }

    // Analyze missing fields
    const requiredFields = ['bank_name', 'platform', 'source', 'account_type', 'aer_rate'];
    const missingFields: string[] = [];

    for (const field of requiredFields) {
      const missingCount = products.filter(p => !p[field] || p[field] === null || p[field] === '').length;
      if (missingCount > 0) {
        missingFields.push(`${field} (${missingCount}/${products.length})`);
      }
    }

    // Analyze invalid values
    const invalidValues: Array<{field: string; count: number; percentage: number}> = [];

    // Check AER rates
    const invalidRates = products.filter(p => p.aer_rate < 0 || p.aer_rate > 20).length;
    if (invalidRates > 0) {
      invalidValues.push({
        field: 'aer_rate',
        count: invalidRates,
        percentage: (invalidRates / products.length) * 100
      });
    }

    // Check FRN match rate
    const frnMatches = products.filter(p => p.frn && p.frn !== null).length;
    const frnMatchRate = products.length > 0 ? frnMatches / products.length : 0;

    // Source/platform consistency
    const sourceConsistency = this.calculateSourcePlatformConsistency(products);

    // Overall completeness
    const completenessScore = this.calculateCompletenessScore(products, requiredFields);

    // Calculate integrity score
    const score = this.calculateIntegrityScore({
      missingFieldsScore: (requiredFields.length - missingFields.length) / requiredFields.length * 100,
      invalidValuesScore: Math.max(0, 100 - (invalidValues.reduce((sum, iv) => sum + iv.percentage, 0))),
      frnMatchScore: frnMatchRate * 100,
      completenessScore
    });

    return {
      score,
      missingFields,
      invalidValues,
      sourceConsistency,
      platformConsistency: sourceConsistency, // TODO: Separate platform consistency
      frnMatchRate,
      completenessScore
    };
  }

  private calculateSourcePlatformConsistency(products: any[]): number {
    // Check if source and platform are properly separated
    const consistentProducts = products.filter(p =>
      p.source && p.platform && p.source !== p.platform
    ).length;

    return products.length > 0 ? (consistentProducts / products.length) * 100 : 100;
  }

  private calculateCompletenessScore(products: any[], requiredFields: string[]): number {
    if (products.length === 0) return 100;

    let totalFields = products.length * requiredFields.length;
    let completedFields = 0;

    for (const product of products) {
      for (const field of requiredFields) {
        if (product[field] && product[field] !== null && product[field] !== '') {
          completedFields++;
        }
      }
    }

    return (completedFields / totalFields) * 100;
  }

  private calculateIntegrityScore(components: {
    missingFieldsScore: number;
    invalidValuesScore: number;
    frnMatchScore: number;
    completenessScore: number;
  }): number {
    // Weighted average of integrity components
    const weights = {
      missingFields: 0.3,
      invalidValues: 0.3,
      frnMatch: 0.2,
      completeness: 0.2
    };

    return Math.round(
      components.missingFieldsScore * weights.missingFields +
      components.invalidValuesScore * weights.invalidValues +
      components.frnMatchScore * weights.frnMatch +
      components.completenessScore * weights.completeness
    );
  }

  /**
   * Analyze deduplication effectiveness
   */
  private async analyzeDeduplicationEffectiveness(): Promise<DeduplicationAnalysis> {
    // Use deduplication_groups table for accurate duplicate analysis
    let businessKeyStats = { total_groups: 0, total_products: 0 };
    try {
      businessKeyStats = this.db.prepare(`
        SELECT
          COUNT(DISTINCT business_key) as total_groups,
          SUM(products_in_group) as total_products
        FROM deduplication_groups
      `).get() as any;
    } catch (error) {
      logger.warn('Failed to query deduplication_groups table:', error);
      // Fallback to available_products table
      try {
        businessKeyStats = this.db.prepare(`
          SELECT
            COUNT(DISTINCT business_key) as total_groups,
            COUNT(*) as total_products
          FROM available_products
          WHERE business_key IS NOT NULL
        `).get() as any;
      } catch (fallbackError) {
        logger.warn('Failed to query available_products for business keys:', fallbackError);
      }
    }

    // Get cross-platform groups from deduplication_groups
    let crossPlatformGroups = 0;
    try {
      const crossPlatformResult = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM deduplication_groups
        WHERE platforms_in_group LIKE '%,%'
      `).get() as any;
      crossPlatformGroups = crossPlatformResult?.count || 0;
    } catch (error) {
      logger.warn('Failed to query cross-platform groups:', error);
    }

    // Get selection reason distribution (if available_products table exists)
    let selectionReasons: Array<{selection_reason: string; count: number}> = [];
    try {
      selectionReasons = this.db.prepare(`
        SELECT selection_reason, COUNT(*) as count
        FROM available_products
        WHERE selection_reason IS NOT NULL
        GROUP BY selection_reason
      `).all() as Array<{selection_reason: string; count: number}>;
    } catch (error) {
      // Table might not exist, skip selection reasons analysis
    }

    const selectionReasonsMap: Record<string, number> = {};
    selectionReasons.forEach(sr => {
      selectionReasonsMap[sr.selection_reason] = sr.count;
    });

    // Get business key quality distribution
    const businessKeyResults = this.db.prepare(`
      SELECT
        business_key,
        COUNT(*) as count
      FROM deduplication_groups
      GROUP BY business_key
      ORDER BY count DESC
      LIMIT 20
    `).all() as Array<{business_key: string; count: number}>;

    const businessKeyDistribution = businessKeyResults.map(row => ({
      key: row.business_key,
      count: row.count,
      quality: 0  // Quality scores stored as JSON in quality_scores column
    }));

    // Calculate metrics
    const totalGroups = businessKeyStats?.total_groups || 0;
    crossPlatformGroups = crossPlatformGroups; // Already calculated above
    const totalProducts = businessKeyStats?.total_products || 0;

    const duplicateRate = totalProducts > 0 ? (totalProducts - totalGroups) / totalProducts : 0;
    const deduplicationEfficiency = crossPlatformGroups > 0 ? crossPlatformGroups / totalGroups : 0;

    // Calculate preferred platform retention (assume flagstone/ajbell are preferred)
    const preferredSelections = (selectionReasonsMap['preferred_platform'] || 0) +
                               (selectionReasonsMap['cross_platform'] || 0);
    const totalSelections = Object.values(selectionReasonsMap).reduce((sum, count) => sum + count, 0);
    const preferredPlatformRetention = totalSelections > 0 ? (preferredSelections / totalSelections) * 100 : 0;

    return {
      totalGroups,
      crossPlatformGroups,
      preferredPlatformRetention,
      selectionReasons: selectionReasonsMap,
      businessKeyDistribution,
      duplicateRate,
      deduplicationEfficiency
    };
  }

  /**
   * Detect anomalies in the data
   */
  private async detectAnomalies(
    pipeline: PipelineFlowAnalysis,
    integrity: DataIntegrityAnalysis,
    deduplication: DeduplicationAnalysis
  ): Promise<QualityAnomaly[]> {
    const anomalies: QualityAnomaly[] = [];

    // High rate outliers
    const highRateResult = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM available_products_raw
      WHERE aer_rate > ?
    `).get(10.0) as {count: number} | undefined;

    const highRateProducts = highRateResult?.count || 0;

    if (highRateProducts > 0) {
      anomalies.push({
        type: 'high_rate',
        severity: highRateProducts > 10 ? 'high' : 'medium',
        description: `${highRateProducts} products with rates above 10%`,
        affectedProducts: highRateProducts,
        affectedPercentage: (highRateProducts / pipeline.rawProductCount) * 100,
        recommendation: 'Review high rate products for data accuracy',
        threshold: 10.0
      });
    }

    // Low FRN match rate
    if (integrity.frnMatchRate < this.config.minFrnMatchRate) {
      anomalies.push({
        type: 'missing_frn',
        severity: integrity.frnMatchRate < 0.5 ? 'high' : 'medium',
        description: `FRN match rate ${(integrity.frnMatchRate * 100).toFixed(1)}% below threshold`,
        affectedProducts: Math.round(pipeline.rawProductCount * (1 - integrity.frnMatchRate)),
        affectedPercentage: (1 - integrity.frnMatchRate) * 100,
        recommendation: 'Review FRN matching configuration and bank name normalization',
        threshold: this.config.minFrnMatchRate * 100
      });
    }

    // Processing time anomalies
    if (pipeline.processingTimeMs > 60000) { // More than 1 minute
      anomalies.push({
        type: 'processing_time',
        severity: pipeline.processingTimeMs > 300000 ? 'high' : 'medium',
        description: `Pipeline processing took ${(pipeline.processingTimeMs / 1000).toFixed(1)}s`,
        affectedProducts: 0,
        affectedPercentage: 0,
        recommendation: 'Investigate performance bottlenecks in pipeline stages',
        actualValue: pipeline.processingTimeMs
      });
    }

    return anomalies;
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    pipeline: PipelineFlowAnalysis,
    integrity: DataIntegrityAnalysis,
    deduplication: DeduplicationAnalysis,
    anomalies: QualityAnomaly[]
  ): string[] {
    const recommendations: string[] = [];

    // High attrition rate
    if (pipeline.attritionRate > 0.5) {
      recommendations.push(`High attrition rate (${(pipeline.attritionRate * 100).toFixed(1)}%) - review filtering criteria`);
    }

    // Low integrity score
    if (integrity.score < this.config.minIntegrityScore) {
      recommendations.push(`Data integrity below threshold - focus on data validation and cleaning`);
    }

    // Low FRN matching
    if (integrity.frnMatchRate < 0.8) {
      recommendations.push(`Improve FRN matching (${(integrity.frnMatchRate * 100).toFixed(1)}%) - review bank name normalization`);
    }

    // Poor deduplication effectiveness
    if (deduplication.deduplicationEfficiency < 0.1 && deduplication.totalGroups > 100) {
      recommendations.push('Low cross-platform deduplication - review business key generation logic');
    }

    // Critical anomalies
    const criticalAnomalies = anomalies.filter(a => a.severity === 'high');
    if (criticalAnomalies.length > 0) {
      recommendations.push(`Address ${criticalAnomalies.length} critical anomalies immediately`);
    }

    return recommendations;
  }

  /**
   * Calculate overall quality scores
   */
  private calculateQualityScores(
    pipeline: PipelineFlowAnalysis,
    integrity: DataIntegrityAnalysis,
    deduplication: DeduplicationAnalysis,
    anomalies: QualityAnomaly[]
  ): {overall: number; pipeline: number; integrity: number; deduplication: number} {

    // Pipeline score (processing efficiency and reasonable attrition)
    const pipelineScore = Math.min(100, Math.max(0,
      100 - (pipeline.attritionRate * 100) +
      Math.min(20, pipeline.efficiency * 10)
    ));

    // Integrity score (already calculated)
    const integrityScore = integrity.score;

    // Deduplication score
    const deduplicationScore = Math.min(100,
      (deduplication.deduplicationEfficiency * 50) +
      (deduplication.preferredPlatformRetention * 0.5)
    );

    // Anomaly penalty
    const anomalyPenalty = anomalies.reduce((penalty, anomaly) => {
      switch (anomaly.severity) {
        case 'high': return penalty + 20;
        case 'medium': return penalty + 10;
        case 'low': return penalty + 5;
        default: return penalty;
      }
    }, 0);

    // Overall score (weighted average minus anomaly penalty)
    const weightedScore = (
      pipelineScore * 0.3 +
      integrityScore * 0.4 +
      deduplicationScore * 0.3
    );

    const overall = Math.max(0, Math.round(weightedScore - anomalyPenalty));

    return {
      overall,
      pipeline: Math.round(pipelineScore),
      integrity: Math.round(integrityScore),
      deduplication: Math.round(deduplicationScore)
    };
  }

  /**
   * Compare with previous batch for trend analysis
   */
  private async compareWithPreviousBatch(currentScore: number): Promise<{
    scoreDelta: number;
    trendDirection: 'improving' | 'degrading' | 'stable';
  } | undefined> {
    try {
      const previousReport = this.db.prepare(`
        SELECT overall_quality_score
        FROM data_quality_reports
        WHERE batch_id != ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(this.batchId) as {overall_quality_score: number} | undefined;

      if (!previousReport) {
        return undefined;
      }

      const scoreDelta = currentScore - previousReport.overall_quality_score;
      let trendDirection: 'improving' | 'degrading' | 'stable';

      if (Math.abs(scoreDelta) <= 2) {
        trendDirection = 'stable';
      } else if (scoreDelta > 0) {
        trendDirection = 'improving';
      } else {
        trendDirection = 'degrading';
      }

      return { scoreDelta, trendDirection };
    } catch (error) {
      // Silently handle - trend analysis is optional
      return undefined;
    }
  }

  /**
   * Store quality report in database
   */
  private async storeReport(report: DataQualityReport): Promise<void> {
    try {
      // Ensure table exists
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS data_quality_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_id TEXT NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

          -- Summary metrics
          total_products_raw INTEGER,
          total_products_final INTEGER,
          frn_match_rate REAL,
          deduplication_rate REAL,

          -- Quality scores (0-100)
          data_integrity_score REAL,
          pipeline_efficiency_score REAL,
          deduplication_effectiveness_score REAL,
          overall_quality_score REAL,

          -- Detailed analysis (JSON)
          full_report TEXT,
          anomalies TEXT,
          recommendations TEXT,

          -- Performance metrics
          execution_time_ms INTEGER,
          config_snapshot TEXT,

          FOREIGN KEY (batch_id) REFERENCES pipeline_audit(batch_id)
        )
      `);

      // Create indexes if they don't exist
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_quality_reports_created_at
        ON data_quality_reports(created_at);

        CREATE INDEX IF NOT EXISTS idx_quality_reports_quality_score
        ON data_quality_reports(overall_quality_score);
      `);

      // Insert report
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO data_quality_reports (
          batch_id, total_products_raw, total_products_final, frn_match_rate, deduplication_rate,
          data_integrity_score, pipeline_efficiency_score, deduplication_effectiveness_score, overall_quality_score,
          full_report, anomalies, recommendations, execution_time_ms, config_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        report.batchId,
        report.pipeline.rawProductCount,
        report.pipeline.finalCount,
        report.dataIntegrity.frnMatchRate,
        report.deduplication.duplicateRate,
        report.integrityScore,
        report.pipelineScore,
        report.deduplicationScore,
        report.overallScore,
        JSON.stringify(report),
        JSON.stringify(report.anomalies),
        JSON.stringify(report.recommendations),
        report.executionTimeMs,
        JSON.stringify(report.configSnapshot)
      );

      if (this.config.verbose) {
        logger.debug(`💾 Data quality report stored for batch ${report.batchId}`);
      }
    } catch (error) {
      logger.error('Failed to store data quality report:', error);
      // Don't throw - report storage failure shouldn't break pipeline
    }
  }

  /**
   * Output detailed console report
   */
  private outputDetailedReport(report: DataQualityReport): void {
    logger.info('\n=== DATA QUALITY ANALYSIS REPORT ===');
    logger.info(`Batch ID: ${report.batchId}`);
    logger.info(`Overall Quality Score: ${report.overallScore}/100`);

    logger.info('\nPIPELINE FLOW:');
    logger.info('┌─────────────┬─────────┬──────────┐');
    logger.info('│ Stage       │ Count   │ Change   │');
    logger.info('├─────────────┼─────────┼──────────┤');
    logger.info(`│ Raw Input   │ ${report.pipeline.rawProductCount.toLocaleString().padStart(7)} │ -        │`);
    logger.info(`│ Final       │ ${report.pipeline.finalCount.toLocaleString().padStart(7)} │ ${this.formatChange(report.pipeline.finalCount - report.pipeline.rawProductCount, report.pipeline.rawProductCount).padStart(8)} │`);
    logger.info('└─────────────┴─────────┴──────────┘');

    logger.info(`\nDATA INTEGRITY: Score ${report.integrityScore}/100`);
    if (report.dataIntegrity.missingFields.length === 0) {
      logger.info('✓ All required fields present');
    } else {
      logger.info(`⚠ Missing fields: ${report.dataIntegrity.missingFields.join(', ')}`);
    }
    logger.info(`${report.dataIntegrity.frnMatchRate >= 0.8 ? '✓' : '⚠'} FRN match rate: ${(report.dataIntegrity.frnMatchRate * 100).toFixed(1)}%`);

    logger.info('\nDEDUPLICATION ANALYSIS:');
    logger.info(`- Business key groups: ${report.deduplication.totalGroups}`);
    logger.info(`- Cross-platform: ${report.deduplication.crossPlatformGroups} groups`);
    logger.info(`- Preferred platform retention: ${report.deduplication.preferredPlatformRetention.toFixed(1)}%`);

    if (Object.keys(report.deduplication.selectionReasons).length > 0) {
      logger.info('- Selection distribution:');
      Object.entries(report.deduplication.selectionReasons).forEach(([reason, count]) => {
        const percentage = (count / report.pipeline.finalCount * 100).toFixed(1);
        logger.info(`  * ${reason}: ${percentage}%`);
      });
    }

    logger.info(`\nANOMALIES DETECTED: ${report.anomalies.length}`);
    if (report.anomalies.length === 0) {
      logger.info('✓ No anomalies detected');
    } else {
      report.anomalies.forEach(anomaly => {
        const icon = anomaly.severity === 'high' ? '🔴' : anomaly.severity === 'medium' ? '⚠' : 'ℹ';
        logger.info(`${icon} [${anomaly.severity.toUpperCase()}] ${anomaly.description}`);
      });
    }

    if (report.recommendations.length > 0) {
      logger.info('\nRECOMMENDATIONS:');
      report.recommendations.forEach((rec, i) => {
        logger.info(`${i + 1}. ${rec}`);
      });
    }

    logger.info(`\nExecution time: ${report.executionTimeMs}ms`);
    logger.info('=' .repeat(50));
  }

  private formatChange(change: number, total: number): string {
    if (change === 0) return '0';
    const percentage = total > 0 ? ((change / total) * 100).toFixed(0) : '0';
    const sign = change > 0 ? '+' : '';
    return `${sign}${change}(${sign}${percentage}%)`;
  }

  /**
   * Get formatted quality report for console output
   */
  getFormattedReport(): string {
    // This would be called after analyzePipeline() to get a formatted string
    // For now, return a placeholder
    return 'Data quality analysis complete';
  }
}
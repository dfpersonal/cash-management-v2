/**
 * Implementation of RecommendationService
 * 
 * Coordinates rate optimization, formatting, and storage
 */

import {
  RecommendationService,
  OptimizationOptions,
  RecommendationResult,
  PendingDeposit,
  OptimizationMetadata
} from './recommendation-service';
import { 
  Recommendation,
  DatabaseConnection
} from '../types';
import { EasyAccessOptimizer } from '../optimization/easy-access';
import { FSCSComplianceEngine } from '../compliance/fscs';
import { OptimizationRulesEngine } from '../rules/engine';
import { ConfigurationLoader } from '../configuration/loader';
import { UnifiedConfigurationLoader } from '../configuration/unified-loader';
import { SQLiteConnection } from '../database/connection';
import { ProductLoader } from '../products/loader';
import { PortfolioLoader } from '../portfolio/loader';
import { getLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = getLogger({ component: 'recommendation-service' });

export class RecommendationServiceImpl implements RecommendationService {
  private db: DatabaseConnection;
  private configLoader: ConfigurationLoader;
  private unifiedConfigLoader: UnifiedConfigurationLoader;
  private rulesEngine: OptimizationRulesEngine;
  private productLoader: ProductLoader;
  private portfolioLoader: PortfolioLoader;
  private optimizer: EasyAccessOptimizer;

  constructor(databasePath?: string) {
    this.db = new SQLiteConnection(databasePath);
    this.configLoader = new ConfigurationLoader(this.db);
    this.unifiedConfigLoader = new UnifiedConfigurationLoader(this.db);
    this.rulesEngine = new OptimizationRulesEngine(this.configLoader);
    this.productLoader = new ProductLoader(this.db);
    this.portfolioLoader = new PortfolioLoader(this.db);
    
    // Note: We don't pass FSCSComplianceEngine to EasyAccessOptimizer anymore
    // as rate optimization is separate from FSCS compliance
    this.optimizer = new EasyAccessOptimizer(
      new FSCSComplianceEngine(databasePath || this.db.databasePath), // Still passed but not used for validation
      this.rulesEngine,
      this.configLoader,
      this.productLoader
    );
  }

  async generateRecommendations(options: OptimizationOptions): Promise<RecommendationResult> {
    const startTime = Date.now();
    
    // Load portfolio if not provided
    const portfolio = options.portfolio || await this.portfolioLoader.loadPortfolio();
    
    // Report progress
    if (options.progressCallback) {
      options.progressCallback(10, 'Loaded portfolio');
    }
    
    // Get optimization config
    const optimizationConfig = await this.unifiedConfigLoader.getOptimizationConfig();
    
    // Initialize rules engine
    await this.rulesEngine.initialize();
    
    if (options.progressCallback) {
      options.progressCallback(20, 'Initialized rules engine');
    }
    
    // Run optimization
    logger.info(`Starting rate optimization for ${portfolio.accounts.length} accounts`);
    
    const result = await this.optimizer.optimizeEasyAccess(
      portfolio,
      {
        allowShariaBanks: options.includeShariaBanks ?? true
      }
    );
    
    const recommendations = result.recommendations;
    
    if (options.progressCallback) {
      options.progressCallback(80, 'Generated recommendations');
    }
    
    // Auto-save if requested
    if (options.autoSave) {
      await this.saveToDatabase(recommendations);
      if (options.progressCallback) {
        options.progressCallback(90, 'Saved to database');
      }
    }
    
    // Calculate metadata
    const executionTime = Date.now() - startTime;
    const totalBenefit = recommendations.reduce(
      (sum: number, rec: Recommendation) => sum + rec.benefits.annualBenefit.amount, 
      0
    );
    const avgImprovement = recommendations.length > 0
      ? recommendations.reduce((sum: number, rec: Recommendation) => sum + rec.benefits.rateImprovement.value, 0) / recommendations.length
      : 0;
    
    const metadata: OptimizationMetadata = {
      executionTime,
      accountsProcessed: portfolio.accounts.length,
      productsEvaluated: await this.productLoader.getProductCount(),
      totalBenefit,
      averageRateImprovement: avgImprovement,
      generatedAt: new Date(),
      configSnapshot: {
        existingAccountBonus: optimizationConfig.existingAccountBonus,
        preferredPlatformBonus: optimizationConfig.preferredPlatformBonus,
        maxRecommendationsPerRun: optimizationConfig.maxRecommendationsPerRun
      }
    };
    
    if (options.progressCallback) {
      options.progressCallback(100, 'Complete');
    }
    
    logger.info(`Generated ${recommendations.length} recommendations in ${executionTime}ms`);
    
    return {
      recommendations,
      metadata,
      warnings: [], // Collect warnings from optimizer
      skippedAccounts: new Map(), // TODO: Collect from optimizer
      ruleEvents: [] // TODO: Collect from rules engine
    };
  }

  formatAsJSON(result: RecommendationResult): string {
    return JSON.stringify({
      recommendations: result.recommendations.map(rec => ({
        id: rec.id,
        source: {
          bank: rec.source.bankName,
          amount: rec.source.amount.amount,
          rate: rec.source.currentRate
        },
        target: {
          bank: rec.target.bankName,
          platform: rec.target.platform,
          rate: rec.target.targetRate,
          product: rec.target.bankName
        },
        benefits: {
          rateImprovement: rec.benefits.rateImprovement.value,
          annualBenefit: rec.benefits.annualBenefit.amount,
          marginalBenefit: rec.benefits.rateImprovement.value
        },
        priority: rec.priority,
        reason: rec.recommendationReason
      })),
      metadata: result.metadata,
      warnings: result.warnings
    }, null, 2);
  }

  formatAsText(result: RecommendationResult): string {
    const lines: string[] = [];
    
    lines.push('RATE OPTIMIZATION RECOMMENDATIONS');
    lines.push('=' .repeat(50));
    lines.push('');
    
    for (const rec of result.recommendations) {
      lines.push(`${rec.source.bankName} → ${rec.target.bankName}`);
      lines.push(`  Amount: £${rec.source.amount.amount.toLocaleString()}`);
      lines.push(`  Rate: ${rec.source.currentRate}% → ${rec.target.targetRate}%`);
      lines.push(`  Annual Benefit: £${rec.benefits.annualBenefit.amount.toFixed(2)}`);
      lines.push(`  Priority: ${rec.priority}`);
      lines.push('');
    }
    
    lines.push('SUMMARY');
    lines.push('-'.repeat(50));
    lines.push(`Total Recommendations: ${result.recommendations.length}`);
    lines.push(`Total Annual Benefit: £${result.metadata.totalBenefit.toFixed(2)}`);
    lines.push(`Average Rate Improvement: ${result.metadata.averageRateImprovement.toFixed(2)}%`);
    lines.push(`Execution Time: ${result.metadata.executionTime}ms`);
    
    return lines.join('\n');
  }

  formatForCLI(result: RecommendationResult): string {
    // Similar to formatAsText but with ANSI colors and better formatting
    return this.formatAsText(result); // TODO: Add color formatting
  }

  async saveToDatabase(recommendations: Recommendation[]): Promise<void> {
    const insertStmt = `
      INSERT INTO optimization_recommendations (
        recommendation_id, source_account_id, source_bank, source_frn,
        source_amount, source_rate, target_bank, target_frn,
        target_product_id, target_rate, target_platform,
        marginal_benefit, annual_benefit, convenience_bonus,
        bonus_type, recommendation_reason, priority,
        confidence_score, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    for (const rec of recommendations) {
      const recommendationId = uuidv4();
      
      await this.db.execute(insertStmt, [
        recommendationId,
        rec.source.accountId,
        rec.source.bankName,
        null, // FRN removed from source
        rec.source.amount.amount,
        rec.source.currentRate,
        rec.target.bankName,
        rec.target.institutionFRN || null,
        null, // productId not in target
        rec.target.targetRate,
        rec.target.platform,
        rec.benefits.rateImprovement.value || 0,
        rec.benefits.annualBenefit.amount,
        0, // convenienceBonus not in benefits
        'none', // bonusType not in benefits
        rec.recommendationReason || '',
        rec.priority,
        rec.confidence || 1.0,
        'PENDING',
        JSON.stringify({
          implementationNotes: rec.implementationNotes,
          risks: rec.risks,
          displayNotes: rec.displayNotes,
          generatedAt: rec.generatedAt
        })
      ]);
    }
    
    logger.info(`Saved ${recommendations.length} recommendations to database`);
  }

  preparePendingDeposits(recommendations: Recommendation[]): PendingDeposit[] {
    return recommendations.map(rec => ({
      bankName: rec.target.bankName,
      accountType: rec.target.accountSubType || 'Easy Access',
      platform: rec.target.platform || 'Direct',
      amount: rec.source.amount.amount,
      rate: rec.target.targetRate,
      frn: rec.target.institutionFRN,
      notes: rec.recommendationReason || '',
      createdAt: new Date()
    }));
  }

  async loadRecommendations(_status?: string): Promise<Recommendation[]> {
    // TODO: Implement loading from database
    return [];
  }

  async updateRecommendationStatus(
    recommendationId: string,
    status: 'APPROVED' | 'REJECTED' | 'EXECUTED',
    notes?: string
  ): Promise<void> {
    const updateStmt = `
      UPDATE optimization_recommendations
      SET status = ?, 
          ${status === 'APPROVED' ? 'approved_at = CURRENT_TIMESTAMP, approved_by = "user",' : ''}
          ${status === 'REJECTED' && notes ? 'rejection_reason = ?,' : ''}
          metadata = json_set(metadata, '$.statusNotes', ?)
      WHERE recommendation_id = ?
    `;
    
    const params: any[] = [status];
    if (status === 'REJECTED' && notes) {
      params.push(notes);
    }
    params.push(notes || '');
    params.push(recommendationId);
    
    await this.db.execute(updateStmt, params);
    logger.info(`Updated recommendation ${recommendationId} status to ${status}`);
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
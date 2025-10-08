/**
 * RecommendationService - Core service interface for rate optimization
 * 
 * Provides a clean API for generating, formatting, and storing recommendations
 * while keeping rate optimization logic separate from FSCS compliance
 */

import { 
  Portfolio, 
  Recommendation,
  RuleEvent
} from '../types';

/**
 * Options for optimization request
 */
export interface OptimizationOptions {
  /** Portfolio to optimize (if not provided, loads from database) */
  portfolio?: Portfolio;
  
  /** Include Sharia-compliant banks in recommendations */
  includeShariaBanks?: boolean;
  
  /** Products to exclude from recommendations */
  excludedProducts?: any[];
  
  /** Preferred platforms for convenience bonus */
  preferredPlatforms?: any[];
  
  /** Output format for results */
  outputFormat?: 'text' | 'json' | 'database';
  
  /** Progress callback for long-running operations */
  progressCallback?: (percent: number, message: string) => void;
  
  /** Auto-save results to database */
  autoSave?: boolean;
  
  /** Include debug information in output */
  includeDebugInfo?: boolean;
}

/**
 * Metadata about the optimization run
 */
export interface OptimizationMetadata {
  /** Time taken to generate recommendations (ms) */
  executionTime: number;
  
  /** Number of accounts processed */
  accountsProcessed: number;
  
  /** Number of products evaluated */
  productsEvaluated: number;
  
  /** Total annual benefit across all recommendations */
  totalBenefit: number;
  
  /** Average rate improvement across recommendations */
  averageRateImprovement: number;
  
  /** Timestamp of optimization run */
  generatedAt: Date;
  
  /** Configuration snapshot used */
  configSnapshot?: Record<string, any>;
}

/**
 * Result of optimization
 */
export interface RecommendationResult {
  /** Generated recommendations */
  recommendations: Recommendation[];
  
  /** Metadata about the optimization run */
  metadata: OptimizationMetadata;
  
  /** Warnings generated during optimization */
  warnings: string[];
  
  /** Accounts that were skipped and why */
  skippedAccounts?: Map<string, string>;
  
  /** Rule events fired during optimization */
  ruleEvents?: RuleEvent[];
}

/**
 * Pending deposit for database storage
 */
export interface PendingDeposit {
  bankName: string;
  accountType: string;
  platform: string;
  amount: number;
  rate: number;
  frn?: string;
  notes?: string;
  createdAt: Date;
}

/**
 * Core service interface for rate optimization
 */
export interface RecommendationService {
  /**
   * Generate rate optimization recommendations
   */
  generateRecommendations(options: OptimizationOptions): Promise<RecommendationResult>;
  
  /**
   * Format recommendations as JSON string
   */
  formatAsJSON(result: RecommendationResult): string;
  
  /**
   * Format recommendations as human-readable text
   */
  formatAsText(result: RecommendationResult): string;
  
  /**
   * Format recommendations for CLI display
   */
  formatForCLI(result: RecommendationResult): string;
  
  /**
   * Save recommendations to database
   */
  saveToDatabase(recommendations: Recommendation[]): Promise<void>;
  
  /**
   * Prepare pending deposits from recommendations
   */
  preparePendingDeposits(recommendations: Recommendation[]): PendingDeposit[];
  
  /**
   * Load previous recommendations from database
   */
  loadRecommendations(status?: string): Promise<Recommendation[]>;
  
  /**
   * Update recommendation status
   */
  updateRecommendationStatus(
    recommendationId: string, 
    status: 'APPROVED' | 'REJECTED' | 'EXECUTED',
    notes?: string
  ): Promise<void>;
}

/**
 * Recommendation priority levels
 */
export enum RecommendationPriority {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM', 
  LOW = 'LOW'
}

/**
 * Recommendation status
 */
export enum RecommendationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXECUTED = 'EXECUTED'
}
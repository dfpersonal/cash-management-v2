/**
 * ConfigurationService - Centralized access to unified_config table
 * Provides cached configuration values with TTL and category-based retrieval
 */

import { Database } from 'sqlite3';
import * as path from 'path';
import { DatabaseValidator } from '../utils/DatabaseValidator';

export interface ConfigEntry {
  config_key: string;
  config_value: string;
  config_type: 'number' | 'string' | 'boolean' | 'json';
  category: string;
  description?: string;
  is_active: boolean;
}

export interface OptimizationConfig {
  existing_account_bonus: number;
  preferred_platform_bonus: number;
  priority_threshold_high: number;
  priority_threshold_medium: number;
  convenience_bonus_existing: number;
  convenience_bonus_platform: number;
  max_recommendations_per_account: number;
  optimization_funding_days: number;
  optimization_conflict_auto_resolve: boolean;
  optimization_retry_attempts: number;
  optimization_retry_delay_ms: number;
}

export interface OperationalConfig {
  max_recommendations_per_run: number;
  max_concurrent_operations: number;
  account_complexity_penalty: number;
  cross_tier_threshold: number;
  max_accounts_preference: number;
  min_move_amount: number;
  min_rebalancing_benefit: number;
  rebalancing_max_transfer_size: number;
  rebalancing_min_transfer_size: number;
}

export interface ComplianceConfig {
  fscs_default_rate_loss_tolerance: number;
  fscs_joint_multiplier: number;
  fscs_near_limit_threshold: number;
  fscs_limit: number;
  fscs_tolerance_threshold: number;
  fscs_warning_threshold: number;
  meaningful_rate_threshold: number;
  allow_no_frn_products: boolean;
  joint_account_fscs_multiplier: number;
}

export class ConfigurationService {
  private static instance: ConfigurationService;
  private cache: Map<string, any> = new Map();
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private db: Database | null = null;
  private dbPath: string;

  private constructor(databasePath?: string) {
    this.dbPath = databasePath || process.env.DATABASE_PATH ||
                  path.join(process.cwd(), 'data', 'database', 'cash_savings.db');
  }

  public static getInstance(databasePath?: string): ConfigurationService {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService(databasePath);
    }
    return ConfigurationService.instance;
  }

  private getDatabase(): Database {
    if (!this.db) {
      // Pre-flight validation
      const validation = DatabaseValidator.validateDatabase(this.dbPath);
      if (!validation.isValid) {
        console.error('❌ Configuration service database validation failed:', validation.error);
        throw new Error(`Configuration database validation failed: ${validation.error}`);
      }

      const sqlite3 = require('sqlite3').verbose();
      this.db = new sqlite3.Database(this.dbPath);
    }
    return this.db!;
  }

  /**
   * Get a single configuration value
   */
  public async getConfig(key: string): Promise<any> {
    await this.ensureCacheLoaded();
    
    const entry = this.cache.get(key);
    if (!entry) {
      throw new Error(`Configuration key not found: ${key}`);
    }
    
    return this.parseValue(entry.config_value, entry.config_type);
  }

  /**
   * Get all configuration values for a category
   */
  public async getConfigByCategory(category: string): Promise<Record<string, any>> {
    await this.ensureCacheLoaded();
    
    const result: Record<string, any> = {};
    for (const [key, entry] of this.cache.entries()) {
      if (entry.category === category && entry.is_active) {
        result[key] = this.parseValue(entry.config_value, entry.config_type);
      }
    }
    
    return result;
  }

  /**
   * Get optimization-specific configuration
   */
  public async getOptimizationConfig(): Promise<OptimizationConfig> {
    const optimization = await this.getConfigByCategory('optimization');
    const operational = await this.getConfigByCategory('operational');
    
    // Merge optimization and relevant operational configs
    return {
      existing_account_bonus: optimization.existing_account_bonus || 0.25,
      preferred_platform_bonus: optimization.preferred_platform_bonus || 0.10,
      priority_threshold_high: optimization.priority_threshold_high || 1000,
      priority_threshold_medium: optimization.priority_threshold_medium || 500,
      convenience_bonus_existing: optimization.convenience_bonus_existing || 0.25,
      convenience_bonus_platform: optimization.convenience_bonus_platform || 0.10,
      max_recommendations_per_account: optimization.max_recommendations_per_account || 3,
      optimization_funding_days: operational.optimization_funding_days || 7,
      optimization_conflict_auto_resolve: operational.optimization_conflict_auto_resolve || false,
      optimization_retry_attempts: operational.optimization_retry_attempts || 3,
      optimization_retry_delay_ms: operational.optimization_retry_delay_ms || 1000
    };
  }

  /**
   * Get operational configuration
   */
  public async getOperationalConfig(): Promise<OperationalConfig> {
    const config = await this.getConfigByCategory('operational');
    
    return {
      max_recommendations_per_run: config.max_recommendations_per_run || 50,
      max_concurrent_operations: config.max_concurrent_operations || 5,
      account_complexity_penalty: config.account_complexity_penalty || 0.05,
      cross_tier_threshold: config.cross_tier_threshold || 0.25,
      max_accounts_preference: config.max_accounts_preference || 15,
      min_move_amount: config.min_move_amount || 1000,
      min_rebalancing_benefit: config.min_rebalancing_benefit || 50,
      rebalancing_max_transfer_size: config.rebalancing_max_transfer_size || 100000,
      rebalancing_min_transfer_size: config.rebalancing_min_transfer_size || 5000
    };
  }

  /**
   * Get compliance configuration
   */
  public async getComplianceConfig(): Promise<ComplianceConfig> {
    const config = await this.getConfigByCategory('compliance');
    
    return {
      fscs_default_rate_loss_tolerance: config.fscs_default_rate_loss_tolerance || 0.5,
      fscs_joint_multiplier: config.fscs_joint_multiplier || 2,
      fscs_near_limit_threshold: config.fscs_near_limit_threshold || 80000,
      fscs_limit: config.fscs_limit || 85000,
      fscs_tolerance_threshold: config.fscs_tolerance_threshold || 500,
      fscs_warning_threshold: config.fscs_warning_threshold || 0.9,
      meaningful_rate_threshold: config.meaningful_rate_threshold || 0.2,
      allow_no_frn_products: config.allow_no_frn_products || false,
      joint_account_fscs_multiplier: config.joint_account_fscs_multiplier || 2
    };
  }

  /**
   * Force refresh the cache
   */
  public async refreshCache(): Promise<void> {
    this.cache.clear();
    this.cacheTimestamp = 0;
    await this.ensureCacheLoaded();
  }

  /**
   * Update a configuration value
   */
  public async updateConfig(key: string, value: any): Promise<void> {
    const db = this.getDatabase();
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    
    const query = `
      UPDATE unified_config 
      SET config_value = ?, updated_at = CURRENT_TIMESTAMP
      WHERE config_key = ?
    `;
    
    await new Promise<void>((resolve, reject) => {
      db.run(query, [stringValue, key], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Invalidate cache
    await this.refreshCache();
  }

  /**
   * Ensure cache is loaded and not expired
   */
  private async ensureCacheLoaded(): Promise<void> {
    const now = Date.now();
    if (this.cache.size === 0 || (now - this.cacheTimestamp) > this.CACHE_TTL_MS) {
      await this.loadCache();
    }
  }

  /**
   * Load all active configurations into cache
   */
  private async loadCache(): Promise<void> {
    const db = this.getDatabase();
    
    const query = `
      SELECT config_key, config_value, config_type, category, description, is_active
      FROM unified_config
      WHERE is_active = 1
    `;
    
    const configs = await new Promise<ConfigEntry[]>((resolve, reject) => {
      db.all(query, (err, rows: ConfigEntry[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    this.cache.clear();
    for (const config of configs) {
      this.cache.set(config.config_key, config);
    }
    
    this.cacheTimestamp = Date.now();
    console.log(`✅ Configuration cache loaded with ${this.cache.size} entries`);
  }

  /**
   * Parse configuration value based on type
   */
  private parseValue(value: string, type: string): any {
    switch (type) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  /**
   * Close database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export singleton instance getter
export const getConfigurationService = (databasePath?: string) => 
  ConfigurationService.getInstance(databasePath);
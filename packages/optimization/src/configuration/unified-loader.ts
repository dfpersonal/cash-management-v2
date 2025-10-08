/**
 * Unified configuration loader that uses the unified_config table
 * Provides backward compatibility while centralizing all configuration
 */

import { 
  ComplianceConfig, 
  RiskToleranceConfig,
  DatabaseConnection,
  ConfigurationError 
} from '../types';
import { Money, Percentage } from '../utils/money';
import { SQLiteConnection } from '../database/connection';
import { getLogger } from '../utils/logger';

const logger = getLogger();

interface UnifiedConfigRow {
  config_key: string;
  config_value: string;
  config_type: 'string' | 'number' | 'boolean' | 'json';
  category: string;
  description: string;
  is_active: number;
}

interface CachedConfig {
  data: any;
  timestamp: Date;
  ttl: number; // seconds
}

export class UnifiedConfigurationLoader {
  private cache = new Map<string, CachedConfig>();
  private readonly defaultTTL = 300; // 5 minutes
  private db: DatabaseConnection;
  private configMap: Map<string, any> = new Map();

  constructor(db?: DatabaseConnection) {
    this.db = db || new SQLiteConnection();
  }

  /**
   * Load all configuration from unified_config table
   */
  private async loadUnifiedConfig(): Promise<Map<string, any>> {
    const cacheKey = 'unified_config';
    const cached = this.getFromCache<Map<string, any>>(cacheKey);
    if (cached) return cached;

    try {
      const rawConfigs = await this.db.query<UnifiedConfigRow>(`
        SELECT config_key, config_value, config_type, category, description
        FROM unified_config
        WHERE is_active = 1
        ORDER BY category, config_key
      `);

      const configMap = new Map<string, any>();
      
      for (const config of rawConfigs) {
        let value: any = config.config_value;
        
        switch (config.config_type) {
          case 'number':
            value = parseFloat(config.config_value);
            break;
          case 'boolean':
            value = config.config_value.toLowerCase() === 'true';
            break;
          case 'json':
            try {
              value = JSON.parse(config.config_value);
            } catch (e) {
              logger.error(`Failed to parse JSON config ${config.config_key}: ${e}`);
              value = config.config_value;
            }
            break;
          case 'string':
          default:
            value = config.config_value;
            break;
        }
        
        configMap.set(config.config_key, value);
      }

      this.configMap = configMap;
      this.setCache(cacheKey, configMap);
      return configMap;

    } catch (error) {
      throw new ConfigurationError(`Failed to load unified configuration: ${error}`, cacheKey);
    }
  }

  /**
   * Get a configuration value by key
   */
  public async getConfig(key: string, defaultValue?: any): Promise<any> {
    const config = await this.loadUnifiedConfig();
    return config.get(key) ?? defaultValue;
  }

  /**
   * Get a numeric configuration value
   */
  public async getNumber(key: string, defaultValue?: number): Promise<number> {
    const value = await this.getConfig(key, defaultValue);
    return typeof value === 'number' ? value : parseFloat(value);
  }

  /**
   * Get a boolean configuration value
   */
  public async getBoolean(key: string, defaultValue?: boolean): Promise<boolean> {
    const value = await this.getConfig(key, defaultValue);
    return typeof value === 'boolean' ? value : value === 'true';
  }

  /**
   * Get a string configuration value
   */
  public async getString(key: string, defaultValue?: string): Promise<string> {
    const value = await this.getConfig(key, defaultValue);
    return String(value);
  }

  /**
   * Load compliance configuration (backward compatibility)
   */
  public async loadComplianceConfig(): Promise<ComplianceConfig> {
    const config = await this.loadUnifiedConfig();

    const complianceConfig: ComplianceConfig = {
      fscsStandardLimit: new Money(config.get('fscs_limit') || 85000),
      fscsToleranceThreshold: new Money(config.get('fscs_tolerance_threshold') || 500),
      fscsNearLimitThreshold: new Money(config.get('fscs_near_limit_threshold') || 80000),
      meaningfulRateThreshold: new Percentage(config.get('meaningful_rate_threshold') || 0.2),
      personalFSCSOverrideEnabled: config.get('personal_fscs_override_enabled') ?? true,
      personalFSCSMaxExposure: new Money(config.get('personal_fscs_max_exposure') || 120000),
      overrideRequiresEasyAccess: config.get('override_requires_easy_access') ?? true,
      includePendingDepositsInFSCS: config.get('include_pending_deposits_in_fscs') ?? true,
      allowShariaBanks: config.get('allow_sharia_banks') ?? true,
      includeProductsWithoutFRN: config.get('allow_no_frn_products') ?? false,
    };

    return complianceConfig;
  }

  /**
   * Load risk tolerance configuration (backward compatibility)
   */
  public async loadRiskToleranceConfig(): Promise<RiskToleranceConfig> {
    const config = await this.loadUnifiedConfig();

    const riskConfig: RiskToleranceConfig = {
      meaningfulRateThreshold: new Percentage(config.get('meaningful_rate_threshold') || 0.2),
      minMoveAmount: new Money(config.get('min_move_amount') || 1000),
      minRebalancingBenefit: new Money(config.get('min_rebalancing_benefit') || 50),
      rebalancingMinTransferSize: new Money(config.get('rebalancing_min_transfer_size') || 5000),
      rebalancingMaxTransferSize: new Money(config.get('rebalancing_max_transfer_size') || 100000),
      crossTierThreshold: new Percentage(config.get('cross_tier_threshold') || 0.25),
      maxAccountsPreference: config.get('max_accounts_preference') || 15,
      allocationTolerance: new Percentage(config.get('allocation_tolerance') || 5.0),
      fscsToleranceThreshold: new Money(config.get('fscs_tolerance_threshold') || 500),
      maxRecommendationsPerAccount: config.get('max_recommendations_per_account') || 3,
    };

    return riskConfig;
  }

  /**
   * Get optimization-specific configuration values
   */
  public async getOptimizationConfig(): Promise<{
    existingAccountBonus: number;
    preferredPlatformBonus: number;
    priorityThresholdHigh: number;
    priorityThresholdMedium: number;
    maxRecommendationsPerRun: number;
  }> {
    const config = await this.loadUnifiedConfig();

    return {
      existingAccountBonus: config.get('existing_account_bonus') || 0.25,
      preferredPlatformBonus: config.get('preferred_platform_bonus') || 0.10,
      priorityThresholdHigh: config.get('priority_threshold_high') || 1000,
      priorityThresholdMedium: config.get('priority_threshold_medium') || 500,
      maxRecommendationsPerRun: config.get('max_recommendations_per_run') || 10,
    };
  }

  /**
   * Get all configuration values by category
   */
  public async getConfigByCategory(category: string): Promise<Map<string, any>> {
    await this.loadUnifiedConfig(); // Ensure config is loaded
    const categoryConfig = new Map<string, any>();

    const rawConfigs = await this.db.query<UnifiedConfigRow>(`
      SELECT config_key, config_value, config_type
      FROM unified_config
      WHERE category = ? AND is_active = 1
    `, [category]);

    for (const config of rawConfigs) {
      let value: any = config.config_value;
      
      switch (config.config_type) {
        case 'number':
          value = parseFloat(config.config_value);
          break;
        case 'boolean':
          value = config.config_value.toLowerCase() === 'true';
          break;
        case 'json':
          try {
            value = JSON.parse(config.config_value);
          } catch (e) {
            value = config.config_value;
          }
          break;
      }
      
      categoryConfig.set(config.config_key, value);
    }

    return categoryConfig;
  }

  /**
   * Update a configuration value
   */
  public async updateConfig(key: string, value: any, description?: string): Promise<void> {
    let configType: string;
    let configValue: string;

    if (typeof value === 'number') {
      configType = 'number';
      configValue = value.toString();
    } else if (typeof value === 'boolean') {
      configType = 'boolean';
      configValue = value.toString();
    } else if (typeof value === 'object') {
      configType = 'json';
      configValue = JSON.stringify(value);
    } else {
      configType = 'string';
      configValue = String(value);
    }

    await this.db.execute(`
      INSERT OR REPLACE INTO unified_config (config_key, config_value, config_type, description, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [key, configValue, configType, description || '']);

    // Clear cache to force reload
    this.clearCache();
  }

  // Cache management
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = new Date();
    const age = (now.getTime() - cached.timestamp.getTime()) / 1000;
    
    if (age > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  private setCache<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: new Date(),
      ttl: ttl || this.defaultTTL,
    });
  }

  public clearCache(): void {
    this.cache.clear();
    this.configMap.clear();
  }

  public async hotReload(): Promise<void> {
    this.clearCache();
    await this.loadUnifiedConfig();
  }

  public async close(): Promise<void> {
    await this.db.close();
  }
}
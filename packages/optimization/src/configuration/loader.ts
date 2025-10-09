/**
 * Configuration loader with caching and hot reload support
 * Loads from all configuration tables including new sharia_banks table
 */

import { 
  ComplianceConfig, 
  RiskToleranceConfig, 
  LiquidityAllocationConfig,
  RateOutlookConfig,
  InstitutionPreference,
  ShariaBankRegistry,
  PreferredPlatform,
  OptimizationRule,
  DatabaseConnection,
  ConfigurationError 
} from '../types';
import { Money, Percentage } from '../utils/money';
import { SQLiteConnection } from '../database/connection';

interface CachedConfig {
  data: any;
  timestamp: Date;
  ttl: number; // seconds
}

interface RawComplianceConfig {
  config_key: string;
  config_value: string;
  config_type: 'string' | 'number' | 'boolean';
  description: string;
}

interface RawRiskToleranceConfig {
  config_key: string;
  config_value: number;
  config_description: string;
  config_category: string;
  min_value: number;
  max_value: number;
}

interface RawLiquidityAllocationConfig {
  liquidity_tier: string;
  target_percentage: number;
  min_percentage?: number;
  max_percentage?: number;
  tier_description: string;
  tier_short_name: string;
  tier_order: number;
  is_active: number;
}

interface RawRateOutlookConfig {
  id: number;
  time_horizon_months: number;
  expected_base_rate: number;
  confidence_level: string;
  scenario: string;
  notes?: string;
  effective_date: string;
  created_at: string;
  updated_at: string;
}

export class ConfigurationLoader {
  private cache = new Map<string, CachedConfig>();
  private readonly defaultTTL = 300; // 5 minutes
  private db: DatabaseConnection;

  constructor(db?: DatabaseConnection) {
    if (!db) {
      throw new ConfigurationError('Database connection is required for ConfigurationLoader', 'database_connection');
    }
    this.db = db;
  }

  public async loadComplianceConfig(): Promise<ComplianceConfig> {
    const cacheKey = 'compliance_config';
    const cached = this.getFromCache<ComplianceConfig>(cacheKey);
    if (cached) return cached;

    try {
      const rawConfigs = await this.db.query<RawComplianceConfig>(`
        SELECT config_key, config_value, config_type, description
        FROM compliance_config
        ORDER BY config_key
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
          case 'string':
          default:
            value = config.config_value;
            break;
        }
        
        configMap.set(config.config_key, value);
      }

      // Build typed configuration with defaults
      const complianceConfig: ComplianceConfig = {
        fscsStandardLimit: new Money(configMap.get('fscs_standard_limit') || 85000),
        fscsToleranceThreshold: new Money(configMap.get('fscs_tolerance_threshold') || 500),
        fscsNearLimitThreshold: new Money(configMap.get('fscs_near_limit_threshold') || 80000),
        meaningfulRateThreshold: new Percentage(configMap.get('meaningful_rate_threshold') || 0.2),
        personalFSCSOverrideEnabled: configMap.get('personal_fscs_override_enabled') ?? true,
        personalFSCSMaxExposure: new Money(configMap.get('personal_fscs_max_exposure') || 120000),
        overrideRequiresEasyAccess: configMap.get('override_requires_easy_access') ?? true,
        
        // NEW: Enhanced configuration
        includePendingDepositsInFSCS: configMap.get('include_pending_deposits_in_fscs') ?? true,
        allowShariaBanks: configMap.get('allow_sharia_banks') ?? true,
        includeProductsWithoutFRN: configMap.get('include_products_without_frn') ?? false,
      };

      this.setCache(cacheKey, complianceConfig);
      return complianceConfig;

    } catch (error) {
      throw new ConfigurationError(`Failed to load compliance configuration: ${error}`, cacheKey);
    }
  }

  public async loadRiskToleranceConfig(): Promise<RiskToleranceConfig> {
    const cacheKey = 'risk_tolerance_config';
    const cached = this.getFromCache<RiskToleranceConfig>(cacheKey);
    if (cached) return cached;

    try {
      const rawConfigs = await this.db.query<RawRiskToleranceConfig>(`
        SELECT config_key, config_value, config_description, config_category, min_value, max_value
        FROM risk_tolerance_config
        ORDER BY config_key
      `);

      const configMap = new Map<string, number>();
      for (const config of rawConfigs) {
        configMap.set(config.config_key, config.config_value);
      }

      const riskConfig: RiskToleranceConfig = {
        meaningfulRateThreshold: new Percentage(configMap.get('meaningful_rate_threshold') || 0.1),
        minMoveAmount: new Money(configMap.get('min_move_amount') || 1000),
        minRebalancingBenefit: new Money(configMap.get('min_rebalancing_benefit') || 50),
        rebalancingMinTransferSize: new Money(configMap.get('rebalancing_min_transfer_size') || 5000),
        rebalancingMaxTransferSize: new Money(configMap.get('rebalancing_max_transfer_size') || 100000),
        crossTierThreshold: new Percentage(configMap.get('cross_tier_threshold') || 0.25),
        maxAccountsPreference: configMap.get('max_accounts_preference') || 15,
        allocationTolerance: new Percentage(configMap.get('allocation_tolerance') || 5.0),
        fscsToleranceThreshold: new Money(configMap.get('fscs_tolerance_threshold') || 1000),
        maxRecommendationsPerAccount: configMap.get('max_recommendations_per_account') || 3,
      };

      this.setCache(cacheKey, riskConfig);
      return riskConfig;

    } catch (error) {
      throw new ConfigurationError(`Failed to load risk tolerance configuration: ${error}`, cacheKey);
    }
  }

  public async loadLiquidityAllocationConfig(): Promise<LiquidityAllocationConfig[]> {
    const cacheKey = 'liquidity_allocation_config';
    const cached = this.getFromCache<LiquidityAllocationConfig[]>(cacheKey);
    if (cached) return cached;

    try {
      const rawConfigs = await this.db.query<RawLiquidityAllocationConfig>(`
        SELECT 
          liquidity_tier, target_percentage, min_percentage, max_percentage,
          tier_description, tier_short_name, tier_order, is_active
        FROM liquidity_allocation_config
        WHERE is_active = 1
        ORDER BY tier_order
      `);

      const allocationConfigs: LiquidityAllocationConfig[] = rawConfigs.map(config => ({
        liquidityTier: config.liquidity_tier as any,
        targetPercentage: new Percentage(config.target_percentage),
        minPercentage: config.min_percentage !== null && config.min_percentage !== undefined ? new Percentage(config.min_percentage) : undefined,
        maxPercentage: config.max_percentage !== null && config.max_percentage !== undefined ? new Percentage(config.max_percentage) : undefined,
        tierDescription: config.tier_description,
        tierShortName: config.tier_short_name,
        tierOrder: config.tier_order,
        isActive: config.is_active === 1,
      }));

      this.setCache(cacheKey, allocationConfigs);
      return allocationConfigs;

    } catch (error) {
      throw new ConfigurationError(`Failed to load liquidity allocation configuration: ${error}`, cacheKey);
    }
  }

  public async loadRateOutlookConfig(): Promise<RateOutlookConfig[]> {
    const cacheKey = 'rate_outlook_config';
    const cached = this.getFromCache<RateOutlookConfig[]>(cacheKey);
    if (cached) return cached;

    try {
      const rawConfigs = await this.db.query<RawRateOutlookConfig>(`
        SELECT 
          id, time_horizon_months, expected_base_rate, confidence_level,
          scenario, notes, effective_date, created_at, updated_at
        FROM rate_outlook_config
        ORDER BY time_horizon_months
      `);

      const outlookConfigs: RateOutlookConfig[] = rawConfigs.map(config => ({
        id: config.id,
        timeHorizonMonths: config.time_horizon_months,
        expectedBaseRate: config.expected_base_rate,
        confidenceLevel: config.confidence_level as 'HIGH' | 'MEDIUM' | 'LOW',
        scenario: config.scenario,
        notes: config.notes,
        effectiveDate: new Date(config.effective_date),
        createdAt: new Date(config.created_at),
        updatedAt: new Date(config.updated_at),
      }));

      this.setCache(cacheKey, outlookConfigs);
      return outlookConfigs;

    } catch (error) {
      throw new ConfigurationError(`Failed to load rate outlook configuration: ${error}`, cacheKey);
    }
  }

  public async loadInstitutionPreferences(): Promise<InstitutionPreference[]> {
    const cacheKey = 'institution_preferences';
    const cached = this.getFromCache<InstitutionPreference[]>(cacheKey);
    if (cached) return cached;

    try {
      const rawPreferences = await this.db.query<any>(`
        SELECT 
          id, frn, bank_name, personal_limit, easy_access_required_above_fscs,
          risk_notes, trust_level, created_at, updated_at
        FROM institution_preferences
        ORDER BY bank_name
      `);

      const preferences: InstitutionPreference[] = rawPreferences.map(pref => ({
        id: pref.id,
        frn: pref.frn,
        bankName: pref.bank_name,
        personalLimit: new Money(pref.personal_limit),
        easyAccessRequiredAboveFSCS: Boolean(pref.easy_access_required_above_fscs),
        riskNotes: pref.risk_notes,
        trustLevel: pref.trust_level,
        createdAt: new Date(pref.created_at),
        updatedAt: new Date(pref.updated_at),
      }));

      this.setCache(cacheKey, preferences);
      return preferences;

    } catch (error) {
      throw new ConfigurationError(`Failed to load institution preferences: ${error}`, cacheKey);
    }
  }

  public async loadShariaBankRegistry(): Promise<ShariaBankRegistry[]> {
    const cacheKey = 'sharia_banks';
    const cached = this.getFromCache<ShariaBankRegistry[]>(cacheKey);
    if (cached) return cached;

    try {
      const rawBanks = await this.db.query<any>(`
        SELECT 
          id, frn, bank_name, is_sharia_compliant, notes, created_at, updated_at
        FROM sharia_banks
        ORDER BY bank_name
      `);

      const shariaBanks: ShariaBankRegistry[] = rawBanks.map(bank => ({
        id: bank.id,
        frn: bank.frn,
        bankName: bank.bank_name,
        isShariaCompliant: Boolean(bank.is_sharia_compliant),
        notes: bank.notes,
        createdAt: new Date(bank.created_at),
        updatedAt: new Date(bank.updated_at),
      }));

      this.setCache(cacheKey, shariaBanks);
      return shariaBanks;

    } catch (error) {
      throw new ConfigurationError(`Failed to load Sharia bank registry: ${error}`, cacheKey);
    }
  }

  public async loadPreferredPlatforms(): Promise<PreferredPlatform[]> {
    const cacheKey = 'preferred_platforms';
    const cached = this.getFromCache<PreferredPlatform[]>(cacheKey);
    if (cached) return cached;

    try {
      const rawPlatforms = await this.db.query<any>(`
        SELECT 
          id, platform_name, priority, rate_tolerance, is_active, notes, created_at, updated_at
        FROM preferred_platforms
        WHERE is_active = TRUE
        ORDER BY priority ASC, platform_name
      `);

      const preferredPlatforms: PreferredPlatform[] = rawPlatforms.map(platform => ({
        id: platform.id,
        platformName: platform.platform_name,
        priority: platform.priority,
        rateTolerance: platform.rate_tolerance,
        isActive: Boolean(platform.is_active),
        notes: platform.notes,
        createdAt: new Date(platform.created_at),
        updatedAt: new Date(platform.updated_at),
      }));

      this.setCache(cacheKey, preferredPlatforms);
      return preferredPlatforms;

    } catch (error) {
      throw new ConfigurationError(`Failed to load preferred platforms: ${error}`, cacheKey);
    }
  }

  // Utility methods
  public async getShariaBankFRNs(): Promise<string[]> {
    const shariaBanks = await this.loadShariaBankRegistry();
    return shariaBanks
      .filter(bank => bank.isShariaCompliant)
      .map(bank => bank.frn);
  }

  public async isShariaBankFRN(frn: string): Promise<boolean> {
    const shariaBanks = await this.loadShariaBankRegistry();
    return shariaBanks.some(bank => bank.frn === frn && bank.isShariaCompliant);
  }

  public async loadShariaBanks(): Promise<ShariaBankRegistry[]> {
    // Alias for loadShariaBankRegistry for compatibility
    return await this.loadShariaBankRegistry();
  }

  public async getInstitutionPreferenceByFRN(frn: string): Promise<InstitutionPreference | null> {
    const preferences = await this.loadInstitutionPreferences();
    return preferences.find(pref => pref.frn === frn) || null;
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
  }

  /**
   * Load optimization rules from database
   */
  public async loadOptimizationRules(): Promise<OptimizationRule[]> {
    const cacheKey = 'optimization_rules';
    const cached = this.getFromCache<OptimizationRule[]>(cacheKey);
    if (cached) return cached;

    try {
      const rawRules = await this.db.query<{
        id: number;
        rule_name: string;
        rule_type: string;
        conditions: string;
        event_type: string;
        event_params?: string;
        priority: number;
        enabled: boolean;
        description?: string;
        created_at: string;
        updated_at: string;
      }>(`
        SELECT id, rule_name, rule_type, conditions, event_type, event_params,
               priority, enabled, description, created_at, updated_at
        FROM optimization_rules
        WHERE enabled = TRUE
        ORDER BY priority DESC, rule_name
      `);

      // Load config values for placeholder replacement
      const riskConfig = await this.loadRiskToleranceConfig();

      const optimizationRules: OptimizationRule[] = rawRules.map(raw => {
        // Parse JSON conditions and replace placeholders with actual config values
        let conditions = raw.conditions;
        let eventParams = raw.event_params || '{}';

        // Replace placeholder values with actual configuration values
        const replacements = {
          'MEANINGFUL_RATE_THRESHOLD': riskConfig.meaningfulRateThreshold.value.toString(),
          'MEANINGFUL_RATE_THRESHOLD_2X': (riskConfig.meaningfulRateThreshold.value * 2).toString(),
          'MIN_MOVE_AMOUNT': riskConfig.minMoveAmount.amount.toString(),
          'REBALANCING_MAX_TRANSFER_SIZE': riskConfig.rebalancingMaxTransferSize.amount.toString(),
          'MIN_REBALANCING_BENEFIT': riskConfig.minRebalancingBenefit.amount.toString(),
          'MIN_REBALANCING_BENEFIT_3X': (riskConfig.minRebalancingBenefit.amount * 3).toString()
        };

        // Replace placeholders in conditions and event params
        for (const [placeholder, value] of Object.entries(replacements)) {
          conditions = conditions.replace(new RegExp(`"${placeholder}"`, 'g'), value);
          eventParams = eventParams.replace(new RegExp(`"${placeholder}"`, 'g'), value);
        }

        return {
          conditions: JSON.parse(conditions),
          event: {
            type: raw.event_type,
            params: JSON.parse(eventParams)
          },
          priority: raw.priority
        };
      });

      this.setCache(cacheKey, optimizationRules);
      return optimizationRules;

    } catch (error) {
      throw new ConfigurationError(`Failed to load optimization rules: ${error}`, cacheKey);
    }
  }

  public async hotReload(): Promise<void> {
    this.clearCache();
    
    // Pre-load all configurations
    await Promise.all([
      this.loadComplianceConfig(),
      this.loadRiskToleranceConfig(),
      this.loadLiquidityAllocationConfig(),
      this.loadRateOutlookConfig(),
      this.loadInstitutionPreferences(),
      this.loadShariaBankRegistry(),
      this.loadOptimizationRules(),
      this.loadPreferredPlatforms()
    ]);
  }

  /**
   * Load FSCS standard limit from configuration
   */
  public async loadFSCSLimit(): Promise<number> {
    const cacheKey = 'fscs_limit';
    const cached = this.getFromCache<number>(cacheKey);
    if (cached) return cached;

    try {
      const result = await this.db.query<{config_value: string}>(`
        SELECT config_value
        FROM compliance_config
        WHERE config_key = 'fscs_standard_limit'
      `);

      if (result.length === 0) {
        throw new Error('FSCS standard limit not found in configuration');
      }

      const fscsLimit = parseFloat(result[0]?.config_value || '85000');
      this.setCache(cacheKey, fscsLimit);
      return fscsLimit;

    } catch (error) {
      throw new ConfigurationError(`Failed to load FSCS limit: ${error}`, cacheKey);
    }
  }

  /**
   * Load excluded products configuration
   */
  public async loadExcludedProducts(): Promise<Array<{
    frn?: string;
    bankName?: string;
    accountType?: string;
    reason?: string;
  }>> {
    const cacheKey = 'excluded_products';
    const cached = this.getFromCache<Array<{
      frn?: string;
      bankName?: string;
      accountType?: string;
      reason?: string;
    }>>(cacheKey);
    if (cached) return cached;

    try {
      const excluded = await this.db.query<{
        frn: string | null;
        bank_name: string | null;
        account_type: string | null;
        reason: string | null;
      }>(`
        SELECT frn, bank_name, account_type, reason
        FROM excluded_products
        ORDER BY id
      `);

      const result = excluded.map(row => {
        const item: {
          frn?: string;
          bankName?: string;
          accountType?: string;
          reason?: string;
        } = {};
        
        if (row.frn) item.frn = row.frn;
        if (row.bank_name) item.bankName = row.bank_name;
        if (row.account_type) item.accountType = row.account_type;
        if (row.reason) item.reason = row.reason;
        
        return item;
      });

      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      // Table might not exist yet
      console.warn('excluded_products table not found, skipping exclusions');
      return [];
    }
  }

  public async close(): Promise<void> {
    await this.db.close();
  }

  /**
   * Get the database connection for advanced usage
   */
  public getDatabaseConnection(): DatabaseConnection {
    return this.db;
  }
}
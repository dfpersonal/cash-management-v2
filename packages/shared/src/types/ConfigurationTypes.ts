/**
 * CONFIGURATION PRECEDENCE:
 * 1. Command Line Arguments (--config, --min-rate, etc.)
 * 2. Environment Variables (USE_LEGACY_FRN_LOOKUP, LOG_LEVEL, etc.)
 * 3. Database Configuration (unified_config table)
 * 4. JSON Configuration (config.json, config-prod.json)
 * 5. Hardcoded Defaults (emergency fallbacks)
 *
 * IMPLEMENTATION PRINCIPLES:
 * - 🚫 No Hardcoded Values: All parameters from unified_config table
 * - ⚙️ Rules Engine First: Use unified_business_rules for business logic
 *
 * See: /docs/architecture/CONFIGURATION_SYSTEM.md
 * See: /docs/shared/json-pipeline-implementation-plan.md
 */

export interface ConfigManagerInterface {
  get<T>(key: string, defaultValue?: T): Promise<T>;

  // Unified configuration methods (replaces legacy getDeduplicationConfig)
  getConfigByCategory(category: ConfigCategory): Promise<Record<string, any>>;
  getUnifiedConfig(): Promise<UnifiedConfig>;

  // Legacy methods (deprecated but maintained for compatibility)
  /** @deprecated Use getConfigByCategory('json_ingestion') instead */
  getRateFilteringConfig(): Promise<RateFilteringConfig>;
  getFileManagementConfig(): Promise<FileManagementConfig>;
  getDatabaseOptimizationConfig(): Promise<DatabaseOptimizationConfig>;

  validateConfiguration(): Promise<{ valid: boolean; errors: string[] }>;
}

/**
 * Configuration categories for unified configuration system
 */
export type ConfigCategory =
  | 'deduplication'      // Cross-platform deduplication settings
  | 'json_ingestion'     // JSON file processing and rate filtering
  | 'frn_management'     // Bank name to FRN resolution
  | 'frn_matching'       // FRN matching service configuration
  | 'orchestrator'       // Pipeline workflow management
  | 'compliance'         // FSCS and regulatory settings
  | 'system'            // Infrastructure and logging settings
  | 'optimization';     // Rate optimization and recommendations

/**
 * Unified configuration interface replacing legacy specific configs
 */
export interface UnifiedConfig {
  // Deduplication configuration
  deduplication: {
    rateTolerance: number;
    enableRateTolerance: boolean;
    enableCrossPlatformDedup: boolean;
    platformPriority: Record<string, number>;
    qualityMetrics: {
      confidenceScoringEnabled: boolean;
      factorWeights: Record<string, number>;
    };
    businessKey: {
      components: string[];
      includeSpecialFeatures: boolean;
      includeMinDeposit: boolean;
      normalizeNames: boolean;
    };
    auditTrail: {
      enabled: boolean;
      logDecisions: boolean;
      preserveOriginalData: boolean;
      trackBusinessKeys: boolean;
    };
    userPreferences: {
      registeredPlatforms: string[];
      preferRegisteredPlatforms: boolean;
      keepAllPlatforms: boolean;
      registeredPlatformBonus: number;
    };
  };

  // JSON ingestion configuration
  jsonIngestion: {
    rateThresholds: Record<string, number>;
    batchSize: number;
    timeoutMs: number;
    validateSchema: boolean;
    trackFiles: boolean;
    rateFilteringEnabled: boolean;
  };

  // FRN management configuration
  frnManagement: {
    fuzzyMatchThreshold: number;
    partialMatchConfidence: number;
    fuzzyMatchConfidence: number;
    autoFlagUnmatched: boolean;
    cacheEnabled: boolean;
    cacheTtlHours: number;
  };

  // Orchestrator configuration
  orchestrator: {
    maxRetries: number;
    retryDelayMs: number;
    preservePartialSuccess: boolean;
    parallelProcessing: boolean;
  };
}

/**
 * Legacy interface maintained for compatibility
 * @deprecated Use UnifiedConfig.deduplication instead
 */
export interface DeduplicationConfig {
  rateTolerance: number;
  enableRateTolerance: boolean;
  enableCrossPlatformDedup: boolean;
  enableBusinessKeys: boolean;
  logDeduplicationDetails: boolean;
}

export interface RateFilteringConfig {
  enabled: boolean;
  thresholds: Record<string, number>;
  applyAfterDeduplication: boolean;
}

export interface FileManagementConfig {
  enabled: boolean;
  deleteAfterDays: number;
  compressAfterDays: number;
  preserveLatest: number;
  archiveDirectory: string;
}

export interface DatabaseOptimizationConfig {
  enabled: boolean;
  archiveAfterDays: number;
  compressionAfterDays: number;
  purgePolicy: 'soft' | 'hard';
}

/**
 * Business rules interface for unified_business_rules table
 * Maps directly to database column names (snake_case)
 */
export interface BusinessRule {
  id: number;
  rule_name: string;
  rule_category: ConfigCategory;
  rule_type: string;
  conditions: string; // JSON string
  event_type: string;
  event_params?: string; // JSON string
  priority: number;
  enabled: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Parsed business rule with JSON objects
 */
export interface ParsedBusinessRule {
  id: number;
  ruleName: string;
  category: ConfigCategory;
  type: string;
  conditions: any; // Parsed JSON conditions
  event: {
    type: string;
    params?: any; // Parsed JSON params
  };
  priority: number;
  enabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Rules-based module interface for all pipeline services
 * Implements no hardcoded values and rules engine first principles
 */
export interface RulesBasedModule<TConfig, TInput, TOutput> {
  // Configuration Management (NO hardcoded values)
  loadConfiguration(category: ConfigCategory): Promise<TConfig>;
  loadRules(category: ConfigCategory): Promise<ParsedBusinessRule[]>;

  // Rules Engine Operations (rules engine first)
  initializeEngine(rules: ParsedBusinessRule[]): Promise<void>;
  evaluateRules(input: TInput): Promise<any>; // RuleResult from json-rules-engine

  // Core Processing (rules-driven)
  process(input: TInput): Promise<TOutput>;
  processFile(filePath: string): Promise<TOutput>;

  // Utilities
  getStatus(): ModuleStatus;
  validateConfiguration(): Promise<ValidationResult>;
  reset(): void;
}

/**
 * Configuration validation result
 */
export interface ValidationResult {
  valid: boolean;
  message: string;
  errors?: string[];
  warnings?: string[];
  details?: any;
}

/**
 * Module status interface
 */
export interface ModuleStatus {
  initialized: boolean;
  configurationLoaded: boolean;
  rulesEngineReady: boolean;
  healthy: boolean;
  lastActivity: string;
}

/**
 * Database row type interfaces for type safety
 */

/**
 * unified_config table row type
 */
export interface ConfigRow {
  config_key: string;
  config_value: string;
  config_type: string;
  category?: string;
  description?: string;
}

/**
 * unified_business_rules table row type
 */
export interface BusinessRuleRow {
  id: number;
  rule_name: string;
  rule_category: string;
  rule_type: string;
  conditions: string;
  event_type: string;
  event_params?: string;
  priority: number;
  enabled: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

/**
 * frn_lookup_helper view row type
 */
export interface FRNLookupRow {
  frn: string;
  canonical_name: string;
  search_name: string;
  match_type: string;
  confidence_score: number;
  match_rank: number;
}

/**
 * frn_manual_overrides table row type
 */
export interface FRNManualOverrideRow {
  id: number;
  scraped_name: string;
  frn?: string;
  firm_name?: string;
  confidence_score: number;
  notes?: string;
  created_at: string;
}

/**
 * Base configuration settings that must be supported across all components
 */
export interface BaseConfiguration {
  // Infrastructure settings
  database: {
    path: string;
    backupPath?: string;
    connectionTimeout?: number;
  };
  
  // Scraper settings  
  scrapers: {
    timeout: number;
    maxRetries: number;
    headless: boolean;
    userAgent?: string;
  };
  
  // Logging settings
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error' | 'none';
    enableFileLogging: boolean;
    logDir: string;
    maxFileSize?: number;
    maxFiles?: number;
  };
}

/**
 * Configuration validation utilities
 */
export class ConfigValidator {
  static validateDatabaseConfig(config: any): string[] {
    const errors: string[] = [];
    
    if (!config.database?.path) {
      errors.push('database.path is required');
    }
    
    if (config.database?.connectionTimeout && config.database.connectionTimeout < 0) {
      errors.push('database.connectionTimeout must be positive');
    }
    
    return errors;
  }
  
  static validateScraperConfig(config: any): string[] {
    const errors: string[] = [];
    
    if (!config.scrapers?.timeout || config.scrapers.timeout < 1000) {
      errors.push('scrapers.timeout must be at least 1000ms');
    }
    
    if (config.scrapers?.maxRetries && config.scrapers.maxRetries < 0) {
      errors.push('scrapers.maxRetries must be non-negative');
    }
    
    return errors;
  }
  
  static validateLoggingConfig(config: any): string[] {
    const errors: string[] = [];
    
    const validLevels = ['debug', 'info', 'warn', 'error', 'none'];
    if (config.logging?.level && !validLevels.includes(config.logging.level)) {
      errors.push(`logging.level must be one of: ${validLevels.join(', ')}`);
    }
    
    if (!config.logging?.logDir) {
      errors.push('logging.logDir is required');
    }
    
    return errors;
  }
  
  static validateDeduplicationConfig(config: DeduplicationConfig): string[] {
    const errors: string[] = [];
    
    if (config.rateTolerance < 0 || config.rateTolerance > 0.01) {
      errors.push('rateTolerance must be between 0 and 0.01 (0-100 basis points)');
    }
    
    return errors;
  }
  
  static validateRateFilteringConfig(config: RateFilteringConfig): string[] {
    const errors: string[] = [];
    
    for (const [accountType, threshold] of Object.entries(config.thresholds)) {
      if (typeof threshold !== 'number' || threshold < 0 || threshold > 10) {
        errors.push(`Rate threshold for ${accountType} must be between 0 and 10`);
      }
    }
    
    return errors;
  }
  
  static validateAll(config: any): { valid: boolean; errors: string[] } {
    const allErrors = [
      ...ConfigValidator.validateDatabaseConfig(config),
      ...ConfigValidator.validateScraperConfig(config),
      ...ConfigValidator.validateLoggingConfig(config)
    ];
    
    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  }
}

/**
 * Command line argument parsing utilities
 */
export class CLIParser {
  static parseArguments(args: string[]): Record<string, any> {
    const parsed: Record<string, any> = {};
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        
        if (key.includes('=')) {
          const [k, v] = key.split('=', 2);
          parsed[k] = CLIParser.parseValue(v);
        } else {
          // Look ahead for value
          const nextArg = args[i + 1];
          if (nextArg && !nextArg.startsWith('--')) {
            parsed[key] = CLIParser.parseValue(nextArg);
            i++; // Skip next arg since we consumed it
          } else {
            parsed[key] = true; // Boolean flag
          }
        }
      }
    }
    
    return parsed;
  }
  
  static parseValue(value: string): any {
    // Boolean values
    if (value === 'true') return true;
    if (value === 'false') return false;
    
    // Numeric values
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    
    // String values
    return value;
  }
}

/**
 * Environment variable utilities
 */
export class EnvParser {
  static getEnvConfig(): Record<string, any> {
    const env = process.env;
    const config: Record<string, any> = {};
    
    // Database settings
    if (env.DB_PATH) config['database.path'] = env.DB_PATH;
    if (env.DB_BACKUP_PATH) config['database.backupPath'] = env.DB_BACKUP_PATH;
    if (env.DB_CONNECTION_TIMEOUT) config['database.connectionTimeout'] = parseInt(env.DB_CONNECTION_TIMEOUT);
    
    // Logging settings  
    if (env.LOG_LEVEL) config['logging.level'] = env.LOG_LEVEL;
    if (env.LOG_DIR) config['logging.logDir'] = env.LOG_DIR;
    if (env.ENABLE_FILE_LOGGING) config['logging.enableFileLogging'] = env.ENABLE_FILE_LOGGING === 'true';
    
    // Scraper settings
    if (env.SCRAPER_TIMEOUT) config['scrapers.timeout'] = parseInt(env.SCRAPER_TIMEOUT);
    if (env.SCRAPER_MAX_RETRIES) config['scrapers.maxRetries'] = parseInt(env.SCRAPER_MAX_RETRIES);
    if (env.SCRAPER_HEADLESS) config['scrapers.headless'] = env.SCRAPER_HEADLESS === 'true';
    
    // Deduplication settings
    if (env.RATE_TOLERANCE_BP) config['deduplication.rateTolerance'] = parseInt(env.RATE_TOLERANCE_BP) / 10000;
    if (env.ENABLE_CROSS_PLATFORM_DEDUP) config['deduplication.enableCrossPlatformDedup'] = env.ENABLE_CROSS_PLATFORM_DEDUP === 'true';
    
    // Feature flags
    if (env.USE_LEGACY_FRN_LOOKUP) config['frn.useLegacyLookup'] = env.USE_LEGACY_FRN_LOOKUP === 'true';
    if (env.ENABLE_RATE_FILTERING) config['operationalEfficiency.rateFiltering.enabled'] = env.ENABLE_RATE_FILTERING === 'true';
    
    return config;
  }
}

/**
 * Configuration precedence resolver
 * Implements the standardized precedence chain: CLI > ENV > DB > JSON > Defaults
 */
export class ConfigPrecedenceResolver {
  constructor(
    private cliArgs: Record<string, any>,
    private envConfig: Record<string, any>,
    private dbConfig: Record<string, any>,
    private jsonConfig: Record<string, any>,
    private defaults: Record<string, any>
  ) {}
  
  resolve<T>(key: string): T | undefined {
    // 1. CLI arguments (highest priority)
    if (this.hasValue(this.cliArgs, key)) {
      return this.getValue(this.cliArgs, key);
    }
    
    // 2. Environment variables
    if (this.hasValue(this.envConfig, key)) {
      return this.getValue(this.envConfig, key);
    }
    
    // 3. Database configuration
    if (this.hasValue(this.dbConfig, key)) {
      return this.getValue(this.dbConfig, key);
    }
    
    // 4. JSON configuration
    if (this.hasValue(this.jsonConfig, key)) {
      return this.getValue(this.jsonConfig, key);
    }
    
    // 5. Defaults (lowest priority)
    if (this.hasValue(this.defaults, key)) {
      return this.getValue(this.defaults, key);
    }
    
    return undefined;
  }
  
  private hasValue(config: Record<string, any>, key: string): boolean {
    return this.getValue(config, key) !== undefined;
  }
  
  private getValue(config: Record<string, any>, key: string): any {
    const keys = key.split('.');
    let current = config;
    
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return undefined;
      }
    }
    
    return current;
  }
}

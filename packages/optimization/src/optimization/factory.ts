import { EasyAccessOptimizer } from './easy-access';
import { FSCSComplianceEngine } from '../compliance/fscs';
import { OptimizationRulesEngine } from '../rules/engine';
import { ConfigurationLoader } from '../configuration/loader';
import { SQLiteConnection } from '../database/connection';
import { ProductLoader } from '../products/loader';

/**
 * Factory for creating optimizers with proper dependency injection
 */
export class OptimizationFactory {
  private config: ConfigurationLoader;
  private fscsEngine: FSCSComplianceEngine;
  private rulesEngine: OptimizationRulesEngine;
  private productLoader: ProductLoader;
  private dbConnection: SQLiteConnection;

  constructor(databasePath?: string) {
    this.dbConnection = new SQLiteConnection(databasePath);
    this.config = new ConfigurationLoader(this.dbConnection);
    this.fscsEngine = new FSCSComplianceEngine(databasePath || this.dbConnection.databasePath);
    this.rulesEngine = new OptimizationRulesEngine(this.config);
    this.productLoader = new ProductLoader(this.dbConnection);
  }

  /**
   * Create EasyAccessOptimizer with all dependencies
   */
  public createEasyAccessOptimizer(): EasyAccessOptimizer {
    return new EasyAccessOptimizer(
      this.fscsEngine,
      this.rulesEngine,
      this.config,
      this.productLoader
    );
  }

  /**
   * Get configuration loader for direct access
   */
  public getConfigurationLoader(): ConfigurationLoader {
    return this.config;
  }

  /**
   * Get FSCS compliance engine for direct access
   */
  public getFSCSComplianceEngine(): FSCSComplianceEngine {
    return this.fscsEngine;
  }

  /**
   * Get rules engine for direct access
   */
  public getRulesEngine(): OptimizationRulesEngine {
    return this.rulesEngine;
  }

  /**
   * Get product loader for direct access
   */
  public getProductLoader(): ProductLoader {
    return this.productLoader;
  }

  /**
   * Get database connection for direct access
   */
  public getDatabaseConnection(): SQLiteConnection {
    return this.dbConnection;
  }

  /**
   * Initialize all components
   */
  public async initialize(): Promise<void> {
    // Initialize rules engine (loads rules from database)
    await this.rulesEngine.initialize();
    
    // Validate configuration loading
    await this.config.loadComplianceConfig();
    await this.config.loadRiskToleranceConfig();
  }
}
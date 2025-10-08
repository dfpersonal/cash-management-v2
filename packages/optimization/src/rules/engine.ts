import { Engine } from 'json-rules-engine';
import { ConfigurationLoader } from '../configuration/loader';
import { 
  OptimizationRule, 
  RuleFacts,
  RuleExecutionResult 
} from '../types/index';

/**
 * Rules Engine Infrastructure for Optimization Logic
 * 
 * Provides a flexible, configurable rules system for portfolio optimization
 * decisions using json-rules-engine with database-driven rule configuration.
 */
export class OptimizationRulesEngine {
  private engine: Engine;
  private config: ConfigurationLoader;
  private rulesLoaded: boolean = false;

  constructor(config: ConfigurationLoader) {
    this.config = config;
    this.engine = new Engine();
    this.setupEngineOperators();
  }

  /**
   * Initialize the rules engine with optimization rules from database
   */
  public async initialize(): Promise<void> {
    if (this.rulesLoaded) {
      return;
    }

    // Load optimization rules from configuration
    const rules = await this.loadOptimizationRules();
    
    // Add rules to engine
    for (const rule of rules) {
      // Ensure conditions have proper format for json-rules-engine
      let conditions: any;
      if (rule.conditions.all || rule.conditions.any) {
        conditions = rule.conditions;
      } else {
        // If no all/any specified, wrap in 'all'
        conditions = { all: [rule.conditions] };
      }
      
      this.engine.addRule({
        conditions,
        event: rule.event,
        priority: rule.priority || 100
      });
    }

    this.rulesLoaded = true;
  }

  /**
   * Execute rules against provided facts
   */
  public async executeRules(facts: RuleFacts): Promise<RuleExecutionResult> {
    await this.initialize();

    const results = await this.engine.run(facts);
    
    return {
      facts,
      events: results.events.map(event => ({
        type: event.type,
        params: event.params || {}
      })),
      successful: results.events.length > 0
    };
  }

  /**
   * Validate a specific condition against facts
   */
  public async validateCondition(
    conditionType: string, 
    facts: RuleFacts
  ): Promise<boolean> {
    const result = await this.executeRules(facts);
    return result.events.some(event => event.type === conditionType);
  }

  /**
   * Get rule engine performance metrics
   */
  public getMetrics(): { rulesCount: number; rulesLoaded: boolean } {
    return {
      rulesCount: this.rulesLoaded ? 1 : 0, // Simplified count since engine rules aren't directly accessible
      rulesLoaded: this.rulesLoaded
    };
  }

  /**
   * Setup custom operators for optimization rules
   */
  private setupEngineOperators(): void {
    // Add custom operators for financial calculations
    this.engine.addOperator('greaterThanPercent', (factValue: number, jsonValue: number) => {
      return factValue > (jsonValue / 100);
    });

    this.engine.addOperator('lessThanPercent', (factValue: number, jsonValue: number) => {
      return factValue < (jsonValue / 100);
    });

    this.engine.addOperator('betweenPercent', (factValue: number, jsonValue: [number, number]) => {
      return factValue >= (jsonValue[0] / 100) && factValue <= (jsonValue[1] / 100);
    });

    this.engine.addOperator('greaterThanPounds', (factValue: number, jsonValue: number) => {
      return factValue > jsonValue;
    });

    this.engine.addOperator('lessThanPounds', (factValue: number, jsonValue: number) => {
      return factValue < jsonValue;
    });

    // String/value operators
    this.engine.addOperator('isEmpty', (factValue: any) => {
      return !factValue || factValue === '' || factValue === null || factValue === undefined;
    });

    this.engine.addOperator('lessThanInclusive', (factValue: number, jsonValue: number) => {
      return factValue <= jsonValue;
    });

    this.engine.addOperator('equal', (factValue: any, jsonValue: any) => {
      return factValue === jsonValue;
    });
  }

  /**
   * Load optimization rules from database
   */
  private async loadOptimizationRules(): Promise<OptimizationRule[]> {
    // Load rules from database via ConfigurationLoader
    return await this.config.loadOptimizationRules();
  }
}
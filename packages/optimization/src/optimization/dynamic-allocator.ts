/**
 * Dynamic Allocation Engine
 * 
 * Implements continuous re-evaluation of opportunities to ensure
 * all accounts receive recommendations while maintaining optimal
 * marginal benefit ordering.
 */

import { 
  Account, 
  AvailableProduct, 
  Recommendation,
  RuleFacts,
  Priority
} from '../types/index';
import { FRNHeadroomManager } from './frn-headroom-manager';
import { OptimizationRulesEngine } from '../rules/engine';
import { ConfigurationLoader } from '../configuration/loader';
import { UnifiedConfigurationLoader } from '../configuration/unified-loader';
import { Money as MoneyImpl, Percentage as PercentageImpl } from '../utils/money';
import { getLogger } from '../utils/logger';

export interface DynamicOpportunity {
  account: Account;
  product: AvailableProduct;
  marginalBenefit: number;
  effectiveBenefit: number;
  transferAmount: number;
  annualBenefit: number;
  convenienceBonus: number;
  bonusType: 'none' | 'existing' | 'platform';
}

export class DynamicAllocator {
  private logger = getLogger({ component: 'dynamic-allocator' });
  
  constructor(
    private rulesEngine: OptimizationRulesEngine,
    private config: ConfigurationLoader,
    private frnManager: FRNHeadroomManager
  ) {}

  /**
   * Allocate using dynamic re-evaluation strategy
   * Re-evaluates all opportunities after each allocation
   */
  public async allocateDynamically(
    accounts: Account[],
    products: AvailableProduct[],
    existingAccounts: Set<string>,
    preferredPlatforms: Set<string>
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const accountBalances = new Map<string, number>();
    const accountRecommendations = new Map<string, Recommendation[]>();
    const riskConfig = await this.config.loadRiskToleranceConfig();
    const complianceConfig = await this.config.loadComplianceConfig();
    
    // Initialize account balances
    for (const account of accounts) {
      accountBalances.set(account.id, account.balance.amount);
      accountRecommendations.set(account.id, []);
    }

    // Continue allocating while opportunities exist
    let iteration = 0;
    const maxIterations = accounts.length * products.length; // Safety limit
    
    while (iteration < maxIterations) {
      iteration++;
      this.logger.debug(`Dynamic allocation iteration ${iteration}`);
      
      // Debug: Show remaining balances for large accounts
      for (const [accountId, balance] of accountBalances.entries()) {
        if (balance > 100000) {
          const account = accounts.find(a => a.id === accountId);
          if (account) {
            this.logger.debug(`  ${account.bankName}: £${balance.toFixed(2)} remaining`);
          }
        }
      }
      
      // Find the best opportunity across ALL accounts and products
      const bestOpp = await this.findBestGlobalOpportunity(
        accounts,
        products,
        accountBalances,
        accountRecommendations,
        existingAccounts,
        preferredPlatforms,
        riskConfig
      );
      
      if (!bestOpp) {
        // No more viable opportunities
        this.logger.info('No more viable opportunities found');
        break;
      }
      
      // Create recommendation for best opportunity
      const recommendation = await this.createRecommendation(
        bestOpp,
        accountBalances.get(bestOpp.account.id) || 0,
        complianceConfig.fscsStandardLimit.amount
      );
      
      if (recommendation) {
        recommendations.push(recommendation);
        
        // Update account recommendations tracking
        const accountRecs = accountRecommendations.get(bestOpp.account.id) || [];
        accountRecs.push(recommendation);
        accountRecommendations.set(bestOpp.account.id, accountRecs);
        
        // Update balances and headroom
        const currentBalance = accountBalances.get(bestOpp.account.id) || 0;
        accountBalances.set(bestOpp.account.id, currentBalance - bestOpp.transferAmount);
        
        if (bestOpp.product.frn) {
          this.frnManager.reserveHeadroom(bestOpp.product.frn, bestOpp.transferAmount);
        }
      }
    }
    
    return recommendations;
  }

  /**
   * Find the single best opportunity across entire portfolio
   */
  private async findBestGlobalOpportunity(
    accounts: Account[],
    products: AvailableProduct[],
    accountBalances: Map<string, number>,
    accountRecommendations: Map<string, Recommendation[]>,
    existingAccounts: Set<string>,
    preferredPlatforms: Set<string>,
    riskConfig: any
  ): Promise<DynamicOpportunity | null> {
    let bestOpp: DynamicOpportunity | null = null;
    let bestMarginalBenefit = 0;
    let skippedReasons = new Map<string, string>();
    
    // Load configuration values once
    const unifiedConfig = new UnifiedConfigurationLoader();
    const optimizationConfig = await unifiedConfig.getOptimizationConfig();
    const allowNoFRN = await unifiedConfig.getBoolean('allow_no_frn_products', false);
    
    
    for (const account of accounts) {
      const balance = accountBalances.get(account.id) || 0;
      
      // Skip if account has insufficient balance
      if (balance < riskConfig.minMoveAmount.amount) {
        if (balance > 0) skippedReasons.set(account.bankName, `Insufficient balance: £${balance.toFixed(2)}`);
        continue;
      }
      
      // Get account balance (unused but kept for clarity)
      // const originalBalance = account.balance.amount;
      
      // Log recommendation count for tracking (no limit enforced)
      const currentRecCount = accountRecommendations.get(account.id)?.length || 0;
      if (currentRecCount > 0) {
        this.logger.debug(`  ${account.bankName} has ${currentRecCount} recommendation(s) so far`);
      }
      
      for (const product of products) {
        // Skip if same FRN (no point moving within same institution)
        if (product.frn === account.institutionFRN) {
          continue;
        }
        
        // Skip if no FRN (unless allowed by configuration)
        if (!product.frn && !allowNoFRN) {
          continue;
        }
        
        // Check available headroom (skip for products without FRN)
        let headroom = Infinity; // No FSCS limit for non-FRN products
        if (product.frn) {
          headroom = this.frnManager.getAvailableHeadroom(product.frn);
          if (headroom < riskConfig.minMoveAmount.amount) {
            continue;
          }
        }
        
        // Calculate transfer amount
        const transferAmount = Math.min(
          balance,
          headroom,
          product.maxDeposit?.amount || Infinity,
          balance
        );
        
        if (transferAmount < riskConfig.minMoveAmount.amount) {
          continue;
        }
        
        // Calculate marginal benefit
        const baseMarginalBenefit = product.aerRate - (account.rate || 0);
        if (baseMarginalBenefit <= 0) {
          // Track the best product that was skipped due to no rate improvement
          if (!skippedReasons.has(account.bankName)) {
            skippedReasons.set(account.bankName, `No rate improvement available (current: ${account.rate}%, best: ${product.aerRate}%)`);
          }
          continue;
        }
        
        // Apply convenience bonuses via rules engine
        const isExisting = existingAccounts.has(`${product.bankName}-${product.accountType}`);
        const isPlatform = preferredPlatforms.has(product.platform || 'Direct');
        
        const ruleFacts: RuleFacts = {
          transferAmount,
          annualBenefit: transferAmount * baseMarginalBenefit / 100,
          currentRate: account.rate || 0,
          targetRate: product.aerRate,
          marginalBenefit: baseMarginalBenefit,
          effectiveMarginalBenefit: baseMarginalBenefit,
          isExistingAccount: isExisting,
          isPreferredPlatform: isPlatform && !isExisting,
          hasHeadroom: headroom,
          accountBalance: balance,
          targetFRN: product.frn || '',
          sourceInstitutionFRN: account.institutionFRN,
          targetInstitutionFRN: product.frn || '', // Empty string for non-FRN products
          rateImprovement: baseMarginalBenefit,
          institutionConcentration: 0,
          cumulativeExposure: product.frn ? this.frnManager.getCurrentExposure(product.frn) : 0,
          hasMultipleOpportunities: products.length > 1,
          useCumulativeTracking: true,
          productFRN: product.frn || '',
          productRate: product.aerRate,
          fscsCompliant: true,
          shariaBankAllowed: true,
          rateWithinPlatformTolerance: true,
          rateGapFromBest: 0
        };
        
        // Execute rules to validate opportunity
        await this.rulesEngine.executeRules(ruleFacts);
        
        // Calculate effective marginal benefit with bonuses
        let convenienceBonus = 0;
        let bonusType: 'none' | 'existing' | 'platform' = 'none';
        
        if (isExisting) {
          convenienceBonus = optimizationConfig.existingAccountBonus;
          bonusType = 'existing';
        } else if (isPlatform) {
          convenienceBonus = optimizationConfig.preferredPlatformBonus;
          bonusType = 'platform';
        }
        
        const effectiveBenefit = baseMarginalBenefit + convenienceBonus;
        const annualBenefit = transferAmount * baseMarginalBenefit / 100;
        
        // Skip if below minimum benefit threshold
        if (annualBenefit < riskConfig.minRebalancingBenefit.amount) {
          continue;
        }
        
        // Track if this is the best opportunity
        if (effectiveBenefit > bestMarginalBenefit) {
          bestMarginalBenefit = effectiveBenefit;
          bestOpp = {
            account,
            product,
            marginalBenefit: baseMarginalBenefit,
            effectiveBenefit,
            transferAmount,
            annualBenefit,
            convenienceBonus,
            bonusType
          };
        }
      }
    }
    
    // Track skipped accounts for potential debugging
    // Uncomment below to see why accounts were skipped:
    /*
    if (!bestOpp && skippedReasons.size > 0) {
      this.logger.info('[Dynamic Allocator] Accounts skipped:');
      for (const [bank, reason] of skippedReasons) {
        this.logger.debug(`  - ${bank}: ${reason}`);
      }
    }
    */
    
    return bestOpp;
  }

  /**
   * Create a recommendation from an opportunity
   */
  private async createRecommendation(
    opp: DynamicOpportunity,
    originalBalance: number,
    fscsLimit: number
  ): Promise<Recommendation> {
    // Determine recommendation reason
    let recommendationReason = 'Highest available rate';
    if (opp.bonusType === 'existing') {
      recommendationReason = 'Topping up existing account - no setup required';
    } else if (opp.bonusType === 'platform') {
      recommendationReason = 'Using preferred platform';
    }
    
    const recommendation: Recommendation = {
      id: `rec-${Date.now()}-${Math.random()}`,
      type: 'rate_optimization',
      priority: this.calculatePriority(opp.annualBenefit),
      
      source: {
        accountId: opp.account.id,
        bankName: opp.account.bankName,
        accountName: (opp.account as any).accountName,
        amount: new MoneyImpl(opp.transferAmount),
        originalAccountBalance: new MoneyImpl(originalBalance),
        currentRate: opp.account.rate || 0,
        liquidityTier: 'easy_access',
        canWithdrawImmediately: true
      },
      
      target: {
        institutionFRN: opp.product.frn || '',
        bankName: opp.product.bankName,
        accountType: 'Savings',
        accountSubType: 'Easy Access',
        platform: opp.product.platform || 'Direct',
        targetRate: opp.product.aerRate,
        liquidityTier: 'easy_access'
      },
      
      benefits: {
        rateImprovement: new PercentageImpl(opp.marginalBenefit),
        annualBenefit: new MoneyImpl(opp.annualBenefit),
        cumulativeBenefit: new MoneyImpl(opp.annualBenefit)
      },
      
      compliance: {
        fscsImpact: opp.product.frn ? 'Headroom verified' : 'No FSCS protection',
        resultingExposure: new MoneyImpl(opp.product.frn ? this.frnManager.getCurrentExposure(opp.product.frn) : 0),
        resultingStatus: 'COMPLIANT',
        jointAccountConsidered: false,
        pendingDepositsConsidered: true
      },
      
      confidence: 95,
      implementationNotes: opp.bonusType === 'existing'
        ? ['Topping up existing account - no new account setup required']
        : opp.bonusType === 'platform'
        ? ['Using preferred platform']
        : [],
      risks: [],
      generatedAt: new Date(),
      
      recommendationReason,
      // Use AND for large accounts that need multiple transfers  
      displayMode: opp.account.balance.amount > fscsLimit ? 'AND' : 'OR',
      displayNotes: []
    };
    
    return recommendation;
  }

  /**
   * Calculate priority based on annual benefit
   */
  private calculatePriority(annualBenefit: number): Priority {
    if (annualBenefit >= 10000) return 'URGENT';
    if (annualBenefit >= 5000) return 'HIGH';
    if (annualBenefit >= 1000) return 'MEDIUM';
    return 'LOW';
  }
}
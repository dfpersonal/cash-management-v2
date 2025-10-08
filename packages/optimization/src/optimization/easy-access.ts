import { 
  Portfolio, 
  Account, 
  Recommendation, 
  RateOpportunity,
  ValidatedRecommendation,
  BenefitAnalysis,
  ComplianceOptions,
  Priority,
  RuleFacts,
  Institution,
  MissingFRNAlert
} from '../types/index';
import { FSCSComplianceEngine } from '../compliance/fscs';
import { OptimizationRulesEngine } from '../rules/engine';
import { ConfigurationLoader } from '../configuration/loader';
import { Money as MoneyImpl, Percentage as PercentageImpl } from '../utils/money';
import { ProductLoader } from '../products/loader';
import { FSCSTracker } from './fscs-tracker';
import { getLogger } from '../utils/logger';

/**
 * Easy Access Optimizer with Rules Engine Architecture
 * 
 * Provides rate optimization recommendations for easy access accounts only,
 * using json-rules-engine for flexible optimization logic.
 * 
 * Note: This optimizer respects user-defined institution limits from institution_preferences
 * but does NOT perform FSCS regulatory compliance validation. FSCS compliance
 * should be checked separately using FSCSComplianceEngine.
 */
export class EasyAccessOptimizer {
  private rulesEngine: OptimizationRulesEngine;
  private config: ConfigurationLoader;
  private productLoader: ProductLoader;
  private logger = getLogger({ component: 'easy-access-optimizer' });

  constructor(
    _fscsEngine: FSCSComplianceEngine, // Kept for backward compatibility, will be removed in Phase 3
    rulesEngine: OptimizationRulesEngine,
    config: ConfigurationLoader,
    productLoader: ProductLoader
  ) {
    // Note: fscsEngine parameter kept for backward compatibility but not used
    // FSCS compliance is handled separately by FSCSComplianceEngine
    this.rulesEngine = rulesEngine;
    this.config = config;
    this.productLoader = productLoader;
  }

  /**
   * Main optimization entry point - Two-Phase Approach with FSCS-Aware Generation
   * Phase 1: Discover all potential opportunities (no FSCS filtering)
   * Phase 2: Optimize with cumulative FSCS tracking and prioritization
   */
  public async optimizeEasyAccess(
    portfolio: Portfolio,
    options: ComplianceOptions = {}
  ): Promise<{recommendations: Recommendation[], missingFRNAlerts: MissingFRNAlert[]}> {
    // Get easy access accounts only
    const easyAccessAccounts = portfolio.accounts.filter(
      account => account.liquidityTier === 'easy_access'
    );

    if (easyAccessAccounts.length === 0) {
      return {recommendations: [], missingFRNAlerts: []};
    }

    // PHASE 1: Opportunity Discovery (no FSCS limits)
    const allOpportunities = await this.discoverAllOpportunities(easyAccessAccounts, options);
    // Detect missing FRN products that can't be recommended
    const missingFRNAlerts = await this.detectMissingFRNOpportunities(easyAccessAccounts);

    // PHASE 2: FSCS-Aware Optimization  
    const fscsTracker = new FSCSTracker(portfolio.accounts, portfolio.pendingDeposits);
    const optimizedRecommendations = await this.optimizeWithFSCSTracking(
      allOpportunities, 
      fscsTracker
    );

    return {recommendations: optimizedRecommendations, missingFRNAlerts};
  }

  /**
   * PHASE 1: Discover all potential opportunities without FSCS filtering
   * Creates comprehensive list sorted by rate improvement for optimal allocation
   */
  public async discoverAllOpportunities(
    accounts: Account[],
    options: ComplianceOptions = {}
  ): Promise<RateOpportunity[]> {
    const opportunities: RateOpportunity[] = [];
    
    // Load available products that offer better rates than current accounts
    const riskConfig = await this.config.loadRiskToleranceConfig();
    
    // Get all products better than any current account rate
    const minCurrentRate = Math.min(...accounts.map(acc => acc.rate));
    this.logger.debug(`   Minimum current rate: ${minCurrentRate}%, looking for products > ${minCurrentRate + 0.1}%`);
    
    let betterProducts = await this.productLoader.getProductsBetterThan(
      minCurrentRate + 0.1, // Only consider products at least 0.1% better
      'easy_access'
    );
    this.logger.debug(`   Products from loader: ${betterProducts.length}`);
    this.logger.debug(`   Sample products: ${betterProducts.slice(0, 3).map(p => `${p.bankName}: ${p.aerRate}% (FRN: ${p.frn || 'none'})`).join(', ')}`);

    // Apply preferred platform filtering
    betterProducts = await this.applyPreferredPlatformFiltering(betterProducts);
    this.logger.debug(`   After platform filtering: ${betterProducts.length}`);

    // For each account, find better rates from available products
    for (const account of accounts) {
      // Skip very small balances
      if (account.balance.amount < riskConfig.minMoveAmount.amount) {
        continue;
      }

      // Check if this account needs chunking (>FSCS limit)
      const fscsLimit = await this.config.loadFSCSLimit();
      const needsChunking = account.balance.amount > fscsLimit;
      
      this.logger.debug(`\n   Account: ${account.bankName} (£${account.balance.amount.toLocaleString()})`);
      this.logger.debug(`   FSCS Limit: £${fscsLimit.toLocaleString()}, Needs chunking: ${needsChunking}`);
      
      if (needsChunking) {
        // Apply chunking rule via rules engine
        const chunkingRuleFacts: RuleFacts = {
          accountBalance: account.balance.amount,
          rateImprovement: 0, // Will be calculated per target
          transferAmount: 0, // Will be calculated per chunk
          annualBenefit: 0, // Will be calculated per chunk
          institutionConcentration: 50, // High concentration triggers diversification
          currentRate: account.rate || 0,
          targetRate: 0, // Will be set per target
          sourceInstitutionFRN: account.institutionFRN,
          targetInstitutionFRN: '', // Will be set per target
          targetFRN: 'CHUNKING_RULE_PLACEHOLDER', // For rules that check target FRN
          cumulativeExposure: 0, // For FSCS rules
          hasMultipleOpportunities: false, // For ordering rules
          useCumulativeTracking: true, // Enable cumulative tracking
          productFRN: 'CHUNKING_RULE_PLACEHOLDER', // For FRN detection rules
          productRate: 0 // For FRN detection rules
        };

        const chunkingResult = await this.rulesEngine.executeRules(chunkingRuleFacts);
        
        this.logger.debug(`   Rules engine result: ${chunkingResult.events.length} events`);
        this.logger.debug(`   Events: ${chunkingResult.events.map(e => e.type).join(', ')}`);
        
        if (chunkingResult.events.some(e => e.type === 'chunkLargeAccount')) {
          this.logger.debug(`Generating chunked opportunities for ${account.bankName}...`);
          const beforeCount = opportunities.length;
          await this.generateChunkedOpportunities(account, betterProducts, opportunities, riskConfig);
          this.logger.debug(`Generated ${opportunities.length - beforeCount} chunked opportunities`);
          continue; // Skip regular opportunity generation for this account
        } else {
          this.logger.debug(`   No chunking rule triggered for ${account.bankName}`);
        }
      }

      // Find products offering better rates
      for (const product of betterProducts) {
        // Skip same institution
        if (product.frn === account.institutionFRN) {
          continue;
        }

        // Skip if rate isn't actually better than current account
        if (product.aerRate <= account.rate) {
          continue;
        }

        // Apply Sharia bank filtering using database
        if (options.allowShariaBanks === false) {
          const shariaBanks = await this.config.loadShariaBanks();
          const isShariaBankFRN = shariaBanks.some(bank => bank.frn === product.frn && bank.isShariaCompliant);
          if (isShariaBankFRN) {
            continue;
          }
        }

        // Check minimum deposit requirements
        if (product.minDeposit && account.balance.amount < product.minDeposit.amount) {
          continue;
        }

        // Calculate potential transfer amount (conservative approach)
        let maxSafeTransferAmount = Math.min(
          account.balance.amount * 0.8, // Don't move more than 80% of any single account
          riskConfig.rebalancingMaxTransferSize.amount
        );

        // Respect product maximum deposit limits
        if (product.maxDeposit && maxSafeTransferAmount > product.maxDeposit.amount) {
          maxSafeTransferAmount = product.maxDeposit.amount;
        }

        const rateImprovement = product.aerRate - account.rate;
        const annualBenefit = (maxSafeTransferAmount * rateImprovement) / 100;

        // Skip opportunities with minimal benefit
        if (annualBenefit < riskConfig.minRebalancingBenefit.amount) {
          continue;
        }

        // Create Institution object from product data and preferences
        const institutionPreferences = await this.config.loadInstitutionPreferences();
        const institutionPref = institutionPreferences.find(pref => pref.frn === product.frn);
        
        const targetInstitution: Institution = {
          frn: product.frn || '',
          firmName: product.bankName,
          isActive: true,
          ...(institutionPref?.personalLimit && { personalLimit: institutionPref.personalLimit }),
          ...(institutionPref?.easyAccessRequiredAboveFSCS !== undefined && { 
            easyAccessRequiredAboveFSCS: institutionPref.easyAccessRequiredAboveFSCS 
          }),
          ...(institutionPref?.trustLevel && { trustLevel: institutionPref.trustLevel }),
          ...(institutionPref?.riskNotes && { riskNotes: institutionPref.riskNotes })
        };

        opportunities.push({
          currentAccount: account,
          targetInstitution: targetInstitution,
          targetProduct: product, // Use the actual product from database
          rateImprovement: new PercentageImpl(rateImprovement),
          annualBenefit: new MoneyImpl(annualBenefit),
          safeTransferAmount: new MoneyImpl(maxSafeTransferAmount),
          wouldViolateFSCS: false, // Will be calculated in Phase 2
          resultingExposure: new MoneyImpl(0), // Will be calculated in Phase 2
          headroomRemaining: new MoneyImpl(0), // Will be calculated in Phase 2
          requiresJointAccount: false,
          shariaCompliant: true,
          pendingDepositConsidered: true
        });
      }
    }

    // CRITICAL: Sort by rate improvement (DESC) then annual benefit (DESC)
    // This ensures highest rate improvements get first pick of FSCS headroom
    // Small accounts get the best rates, large chunks get next best available rates
    opportunities.sort((a, b) => {
      const rateDiff = b.rateImprovement.value - a.rateImprovement.value;
      if (Math.abs(rateDiff) > 0.01) return rateDiff; // Significant rate difference
      
      // Tie-breaker: annual benefit for similar rate improvements
      return b.annualBenefit.amount - a.annualBenefit.amount;
    });


    return opportunities;
  }

  /**
   * Validate opportunities using rules engine and FSCS compliance
   */
  public async validateOpportunities(
    opportunities: RateOpportunity[],
    portfolio: Portfolio,
    options: ComplianceOptions = {}
  ): Promise<ValidatedRecommendation[]> {
    const validatedRecommendations: ValidatedRecommendation[] = [];

    for (const opportunity of opportunities) {
      const validation = await this.validateSingleOpportunity(opportunity, portfolio, options);
      
      if (validation.rulesValid) {
        validatedRecommendations.push({
          opportunity,
          validation
        });
      }
    }

    return validatedRecommendations;
  }

  /**
   * Validate a single opportunity using rules engine
   * Note: FSCS compliance validation is handled separately by FSCSComplianceEngine
   */
  private async validateSingleOpportunity(
    opportunity: RateOpportunity,
    _portfolio: Portfolio,
    options: ComplianceOptions
  ) {
    const warnings: string[] = [];
    
    // Type guard to ensure we have an Account
    const currentAccount = opportunity.currentAccount;
    if (!('canWithdrawImmediately' in currentAccount)) {
      throw new Error('PendingDeposit not supported for transfers');
    }
    
    // Rules Engine Validation
    const ruleFacts: RuleFacts = {
      rateImprovement: opportunity.rateImprovement.value,
      transferAmount: opportunity.safeTransferAmount.amount,
      annualBenefit: opportunity.annualBenefit.amount,
      institutionConcentration: 25, // Conservative assumption - would be calculated from portfolio
      currentRate: currentAccount.rate,
      targetRate: opportunity.targetProduct.aerRate,
      sourceInstitutionFRN: currentAccount.institutionFRN,
      targetInstitutionFRN: opportunity.targetInstitution.frn,
      accountBalance: currentAccount.balance.amount,
      // Note: fscsCompliant removed - handled separately by compliance module
      shariaBankAllowed: options.allowShariaBanks ?? true
    };

    const ruleResult = await this.rulesEngine.executeRules(ruleFacts);
    
    // Check if all required validation events were triggered
    const requiredEvents = [
      'rateImprovementValid',
      'transferAmountValid', 
      'transferAmountWithinLimit',
      'annualBenefitValid'
    ];
    
    const rulesValid = requiredEvents.every(eventType => 
      ruleResult.events.some(event => event.type === eventType)
    );

    return {
      rulesValid,
      validationEvents: ruleResult.events,
      maxSafeAmount: new MoneyImpl(opportunity.safeTransferAmount.amount),
      warnings
    };
  }


  /**
   * Prioritize recommendations using rules engine
   */
  public async prioritizeRecommendations(
    recommendations: Recommendation[]
  ): Promise<Recommendation[]> {
    const prioritizedRecommendations = [...recommendations];

    // Use rules engine to identify high priority recommendations
    for (const recommendation of prioritizedRecommendations) {
      const facts: RuleFacts = {
        rateImprovement: recommendation.benefits.rateImprovement.value,
        transferAmount: recommendation.source.amount.amount,
        annualBenefit: recommendation.benefits.annualBenefit.amount,
        institutionConcentration: 25 // Conservative assumption - would be calculated from portfolio
      };

      const result = await this.rulesEngine.executeRules(facts);
      
      // Upgrade priority if rules engine identifies high priority
      if (result.events.some(event => event.type === 'highPriorityRecommendation')) {
        recommendation.priority = 'HIGH';
      }
    }

    // Sort by priority and annual benefit
    return prioritizedRecommendations.sort((a, b) => {
      const priorityOrder = { 'URGENT': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      
      // If same priority, sort by annual benefit
      return b.benefits.annualBenefit.amount - a.benefits.annualBenefit.amount;
    });
  }

  /**
   * Calculate benefit analysis for a set of recommendations
   */
  public async calculateBenefits(recommendations: Recommendation[]): Promise<BenefitAnalysis> {
    const totalAnnualBenefit = recommendations.reduce(
      (sum, rec) => sum + rec.benefits.annualBenefit.amount, 
      0
    );

    const averageRateImprovement = recommendations.length > 0 ?
      recommendations.reduce((sum, rec) => sum + rec.benefits.rateImprovement.value, 0) / recommendations.length :
      0;

    // Find best opportunity
    const bestOpportunity = recommendations.length > 0 ?
      recommendations.reduce((best, current) => 
        current.benefits.annualBenefit.amount > best.benefits.annualBenefit.amount ? current : best
      ) : null;

    return {
      totalAnnualBenefit: new MoneyImpl(totalAnnualBenefit),
      averageRateImprovement: new PercentageImpl(averageRateImprovement),
      recommendationCount: recommendations.length,
      averageBenefit: new MoneyImpl(recommendations.length > 0 ? totalAnnualBenefit / recommendations.length : 0),
      bestOpportunity: bestOpportunity ?? {
        id: '',
        type: 'rate_optimization',
        priority: 'LOW',
        source: {} as any,
        target: {} as any,
        benefits: {} as any,
        compliance: {} as any,
        confidence: 0,
        implementationNotes: [],
        risks: [],
        generatedAt: new Date()
      },
      opportunityCount: recommendations.length,
      riskLevel: 'LOW' as const,
      complianceIssues: 0, // No compliance issues for easy access
      jointAccountOpportunities: 0, // Would be calculated from actual joint accounts
      excludedShariaBankOpportunities: 0, // Would be calculated from filtered opportunities
      pendingDepositImpact: new MoneyImpl(0), // Easy access doesn't involve pending deposits
      riskAssessment: {
        fscsRisk: 'LOW', // Would be calculated based on compliance analysis
        institutionConcentrationRisk: 'LOW', // Would be calculated based on diversification
        liquidityRisk: 'LOW' // Easy access = low liquidity risk
      }
    };
  }

  /**
   * Calculate recommendation priority based on opportunity and validation
   */
  private calculatePriority(
    opportunity: RateOpportunity, 
    _validation: any
  ): Priority {
    // High benefit = HIGH priority
    if (opportunity.annualBenefit.amount > 200) {
      return 'HIGH';
    }
    
    // Medium benefit = MEDIUM priority
    if (opportunity.annualBenefit.amount > 50) {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }


  /**
   * Apply dual-mode logic for recommendation display
   * OR mode: Accounts ≤ £85k - show alternatives (user picks ONE)
   * AND mode: Accounts > £85k - show complementary moves (user executes ALL)
   */
  private async applyDualModeLogic(recommendations: Recommendation[]): Promise<Recommendation[]> {
    const FSCS_LIMIT = 85000; // Standard FSCS protection limit
    const riskConfig = await this.config.loadRiskToleranceConfig();
    const maxRecommendationsPerAccount = riskConfig.maxRecommendationsPerAccount || 3;

    // Group recommendations by source account
    const recommendationsByAccount = new Map<string, Recommendation[]>();
    
    for (const recommendation of recommendations) {
      const accountId = recommendation.source.accountId;
      if (!recommendationsByAccount.has(accountId)) {
        recommendationsByAccount.set(accountId, []);
      }
      recommendationsByAccount.get(accountId)!.push(recommendation);
    }

    const finalRecommendations: Recommendation[] = [];

    // Process each account separately
    for (const [, accountRecommendations] of recommendationsByAccount) {
      // Find the source account balance from the first recommendation
      // Use originalAccountBalance if available (for chunked recommendations), otherwise use transfer amount
      const firstRec = accountRecommendations[0];
      if (!firstRec) continue; // Skip if no recommendations
      
      const sourceAmount = firstRec.source.originalAccountBalance?.amount || firstRec.source.amount.amount;
      
      if (sourceAmount <= FSCS_LIMIT) {
        // OR MODE: Account ≤ £85k - show alternatives (user picks ONE)
        // Limit to maxRecommendationsPerAccount best alternatives
        const limitedRecommendations = accountRecommendations
          .sort((a, b) => b.benefits.annualBenefit.amount - a.benefits.annualBenefit.amount)
          .slice(0, maxRecommendationsPerAccount)
          .map(rec => ({
            ...rec,
            displayMode: 'OR' as const,
            displayNotes: [`Choose ONE of these ${accountRecommendations.length > maxRecommendationsPerAccount ? maxRecommendationsPerAccount : accountRecommendations.length} alternatives`]
          }));
        
        finalRecommendations.push(...limitedRecommendations);
      } else {
        // AND MODE: Account > £85k - show complementary moves (user executes ALL)
        // Show all valid recommendations as they work together
        const complementaryRecommendations = accountRecommendations.map(rec => ({
          ...rec,
          displayMode: 'AND' as const,
          displayNotes: [`Execute ALL these moves to diversify above FSCS limit`]
        }));
        
        finalRecommendations.push(...complementaryRecommendations);
      }
    }

    return finalRecommendations;
  }

  /**
   * Apply preferred platform filtering
   * Shows best rates on user's preferred platforms, accepting rate tolerance
   */
  private async applyPreferredPlatformFiltering(products: any[]): Promise<any[]> {
    try {
      const preferredPlatforms = await this.config.loadPreferredPlatforms();
      
      this.logger.debug(`   Platform filtering: ${preferredPlatforms.length} preferred platforms configured`);
      
      if (preferredPlatforms.length === 0) {
        // No platform preferences configured, return all products
        return products;
      }

      // Find the best overall rate to calculate tolerances from
      const bestRate = Math.max(...products.map(p => p.aerRate));
      this.logger.debug(`   Best overall rate: ${bestRate}%`);
      
      const filteredProducts: any[] = [];
      const productsByPlatform = new Map<string, any[]>();

      // Group products by platform
      for (const product of products) {
        const platform = product.platform || 'Direct';
        if (!productsByPlatform.has(platform)) {
          productsByPlatform.set(platform, []);
        }
        productsByPlatform.get(platform)!.push(product);
      }
      
      this.logger.debug(`   Products grouped by platform:`);
      for (const [platform, platformProducts] of productsByPlatform) {
        const bestOnPlatform = Math.max(...platformProducts.map(p => p.aerRate));
        this.logger.debug(`     ${platform}: ${platformProducts.length} products, best rate ${bestOnPlatform}%`);
      }

      // Process preferred platforms in priority order
      for (const preferredPlatform of preferredPlatforms.sort((a, b) => a.priority - b.priority)) {
        const platformProducts = productsByPlatform.get(preferredPlatform.platformName) || [];
        
        this.logger.debug(`   Processing preferred platform: ${preferredPlatform.platformName} (priority ${preferredPlatform.priority}, tolerance ${preferredPlatform.rateTolerance}%)`);
        
        if (platformProducts.length === 0) {
          this.logger.debug(`     No products found for platform ${preferredPlatform.platformName}`);
          continue;
        }

        // Find best product on this platform
        const bestPlatformProduct = platformProducts
          .sort((a, b) => b.aerRate - a.aerRate)[0];

        // Check if the best rate on this platform is within tolerance of the overall best rate
        const rateGap = bestRate - bestPlatformProduct.aerRate;
        const toleranceThreshold = preferredPlatform.rateTolerance; // Already in percentage format

        this.logger.debug(`     Best rate on ${preferredPlatform.platformName}: ${bestPlatformProduct.aerRate}%`);
        this.logger.debug(`     Rate gap: ${rateGap.toFixed(2)}% vs tolerance: ${toleranceThreshold}%`);

        if (rateGap <= toleranceThreshold) {
          // Include all products from this preferred platform within tolerance
          const toleratedProducts = platformProducts.filter(product => {
            const productRateGap = bestRate - product.aerRate;
            return productRateGap <= toleranceThreshold;
          });
          
          this.logger.debug(`     Adding ${toleratedProducts.length} products from ${preferredPlatform.platformName}`);
          if (toleratedProducts.length < 5) {
            this.logger.debug(`     Sample products: ${toleratedProducts.map(p => `${p.bankName}: ${p.aerRate}% (FRN: ${p.frn || 'none'})`).slice(0, 3).join(', ')}`);
          }
          filteredProducts.push(...toleratedProducts);
        } else {
          this.logger.debug(`     Rate gap ${rateGap.toFixed(2)}% exceeds tolerance ${toleranceThreshold}%, skipping platform`);
        }
      }

      // If no preferred platform products meet tolerance, fall back to all products
      if (filteredProducts.length === 0) {
        this.logger.debug(`   No preferred platform products within tolerance, falling back to all ${products.length} products`);
        return products;
      }

      this.logger.debug(`   Found ${filteredProducts.length} products from preferred platforms`);

      // Also include any products that are better than the best preferred platform product
      // (i.e., don't exclude better options just because they're not on preferred platforms)
      const bestPreferredRate = Math.max(...filteredProducts.map(p => p.aerRate));
      const betterThanPreferred = products.filter(product => product.aerRate > bestPreferredRate);
      
      this.logger.debug(`   Found ${betterThanPreferred.length} products better than best preferred rate ${bestPreferredRate}%`);
      filteredProducts.push(...betterThanPreferred);

      // Remove duplicates and sort by rate
      const uniqueProducts = Array.from(
        new Map(filteredProducts.map(p => [p.id, p])).values()
      ).sort((a, b) => b.aerRate - a.aerRate);

      this.logger.debug(`   Final filtered products: ${uniqueProducts.length} (after deduplication)`);
      return uniqueProducts;

    } catch (error) {
      console.warn('Failed to load preferred platforms, using all products:', error);
      return products;
    }
  }

  /**
   * PHASE 2: FSCS-Aware Optimization with Cumulative Tracking
   * Processes opportunities in rate improvement order, respecting cumulative FSCS limits
   */
  private async optimizeWithFSCSTracking(
    opportunities: RateOpportunity[],
    fscsTracker: FSCSTracker
  ): Promise<Recommendation[]> {
    const finalRecommendations: Recommendation[] = [];
    const riskConfig = await this.config.loadRiskToleranceConfig();
    const maxRecommendationsPerAccount = riskConfig.maxRecommendationsPerAccount || 3;
    
    // Track accounts that were chunked for diversification - they don't have limits
    const chunkedAccounts = new Set<string>();
    const fscsLimit = await this.config.loadFSCSLimit();
    opportunities.forEach(opp => {
      if (opp.currentAccount.balance.amount > fscsLimit) {
        chunkedAccounts.add(opp.currentAccount.id);
      }
    });

    for (const opportunity of opportunities) {
      // Skip products without FRN - cannot track FSCS exposure
      if (!opportunity.targetInstitution.frn) {
        continue; // These will be flagged in missingFRNAlerts instead
      }

      // Check if this recommendation would violate FSCS limits
      const targetFRN = opportunity.targetInstitution.frn;
      const desiredAmount = opportunity.safeTransferAmount.amount;
      
      if (fscsTracker.wouldViolateFSCS(targetFRN, desiredAmount)) {
        // Try to reduce transfer amount to fit available headroom
        const maxSafeAmount = fscsTracker.getMaxSafeTransfer(targetFRN, desiredAmount);
        
        if (maxSafeAmount < riskConfig.minMoveAmount.amount) {
          continue; // Transfer would be too small to be worthwhile
        }

        // Adjust the opportunity to fit FSCS limits
        opportunity.safeTransferAmount = new MoneyImpl(maxSafeAmount);
        opportunity.annualBenefit = new MoneyImpl(
          (maxSafeAmount * opportunity.rateImprovement.value) / 100
        );
      }

      // Validate with rules engine (but not FSCS since we handled that above)  
      const ruleFacts: RuleFacts = {
        accountBalance: opportunity.currentAccount.balance.amount,
        currentRate: opportunity.currentAccount.rate || 0,
        targetRate: opportunity.targetProduct.aerRate,
        rateImprovement: opportunity.rateImprovement.value,
        annualBenefit: opportunity.annualBenefit.amount,
        transferAmount: opportunity.safeTransferAmount.amount,
        targetInstitutionFRN: opportunity.targetInstitution.frn,
        targetFRN: opportunity.targetInstitution.frn, // Add missing targetFRN fact
        // Note: fscsCompliant removed - handled separately by compliance module
        // Add other facts that rules might expect
        institutionConcentration: 25, // Conservative assumption
        cumulativeExposure: 0, // Will be calculated if needed
        hasMultipleOpportunities: false,
        useCumulativeTracking: true,
        productFRN: opportunity.targetInstitution.frn,
        productRate: opportunity.targetProduct.aerRate,
        sourceInstitutionFRN: opportunity.currentAccount.institutionFRN,
        shariaBankAllowed: true // Default assumption
      };

      const rulesResult = await this.rulesEngine.executeRules(ruleFacts);
      
      if (!rulesResult.successful) {
        continue; // Rules engine rejected this opportunity
      }

      // Reserve FSCS capacity for this recommendation
      const recommendationId = fscsTracker.addRecommendation(
        targetFRN,
        opportunity.targetInstitution.firmName,
        opportunity.safeTransferAmount.amount,
        opportunity.currentAccount.id
      );

      // Create the recommendation
      const recommendation: Recommendation = {
        id: recommendationId,
        type: 'rate_optimization',
        priority: this.calculatePriority(opportunity, rulesResult),
        
        source: {
          accountId: opportunity.currentAccount.id,
          bankName: opportunity.currentAccount.bankName,
          amount: opportunity.safeTransferAmount,
          originalAccountBalance: new MoneyImpl(opportunity.currentAccount.balance.amount),
          currentRate: opportunity.currentAccount.rate || 0,
          liquidityTier: 'easy_access',
          canWithdrawImmediately: true
        },
        
        target: {
          institutionFRN: opportunity.targetInstitution.frn || '',
          bankName: opportunity.targetInstitution.firmName,
          accountType: 'Savings',
          accountSubType: 'Easy Access',
          platform: opportunity.targetProduct.platform || 'Direct',
          targetRate: opportunity.targetProduct.aerRate,
          liquidityTier: 'easy_access'
        },
        
        benefits: {
          rateImprovement: opportunity.rateImprovement,
          annualBenefit: opportunity.annualBenefit,
          cumulativeBenefit: opportunity.annualBenefit // Same as annual for easy access
        },
        
        compliance: {
          fscsImpact: 'No FSCS compliance concerns',
          resultingExposure: new MoneyImpl(0), // Would need to calculate
          resultingStatus: 'COMPLIANT',
          jointAccountConsidered: false,
          pendingDepositsConsidered: true
        },
        
        confidence: 85,
        implementationNotes: [],
        risks: [],
        generatedAt: new Date(),
        
        // Flag missing FRN if applicable
        missingFRN: !opportunity.targetInstitution.frn
      };

      finalRecommendations.push(recommendation);

      // Stop if we've hit the max recommendations per account for this source
      // BUT: Skip limit for chunked accounts (they need all chunks for diversification)
      if (!chunkedAccounts.has(opportunity.currentAccount.id)) {
        const recommendationsForThisAccount = finalRecommendations.filter(
          rec => rec.source.accountId === opportunity.currentAccount.id
        );
        
        if (recommendationsForThisAccount.length >= maxRecommendationsPerAccount) {
          // Remove any remaining opportunities for this account
          const remainingIndex = opportunities.findIndex(opp => 
            opp.currentAccount.id === opportunity.currentAccount.id
          );
          if (remainingIndex !== -1) {
            opportunities.splice(remainingIndex);
          }
        }
      }
    }

    // Apply dual-mode logic (OR vs AND) based on source account balances
    return await this.applyDualModeLogic(finalRecommendations);
  }

  /**
   * Detect high-rate products without FRNs that cannot be recommended
   * Generates actionable alerts for the user
   */
  private async detectMissingFRNOpportunities(
    accounts: Account[]
  ): Promise<MissingFRNAlert[]> {
    const alerts: MissingFRNAlert[] = [];
    const riskConfig = await this.config.loadRiskToleranceConfig();

    try {
      // Find high-rate products without FRNs
      const minCurrentRate = Math.min(...accounts.map(acc => acc.rate));
      const products = await this.productLoader.getProductsBetterThan(
        minCurrentRate + riskConfig.meaningfulRateThreshold.value,
        'easy_access'
      );

      // Filter to products without FRN
      const noFRNProducts = products.filter(product => !product.frn);

      // Group by bank name to avoid duplicates
      const productsByBank = new Map<string, typeof products[0]>();
      for (const product of noFRNProducts) {
        const existing = productsByBank.get(product.bankName);
        if (!existing || product.aerRate > existing.aerRate) {
          productsByBank.set(product.bankName, product);
        }
      }

      // Generate alerts for each high-rate no-FRN product
      for (const [, product] of productsByBank) {
        // Find accounts that could benefit
        const benefitingAccounts = accounts.filter(
          account => product.aerRate > account.rate + riskConfig.meaningfulRateThreshold.value
        );

        if (benefitingAccounts.length === 0) continue;

        // Calculate potential benefit (using smallest beneficial account for conservative estimate)
        const smallestAccount = benefitingAccounts.reduce((min, acc) => 
          acc.balance.amount < min.balance.amount ? acc : min
        );
        
        const rateImprovement = product.aerRate - smallestAccount.rate;
        const transferAmount = Math.min(smallestAccount.balance.amount * 0.8, 85000);
        const potentialBenefit = (transferAmount * rateImprovement) / 100;

        const alert: MissingFRNAlert = {
          bankName: product.bankName,
          aerRate: product.aerRate,
          platform: product.platform || 'Direct',
          potentialBenefit: new MoneyImpl(potentialBenefit),
          affectedAccounts: benefitingAccounts.map(acc => acc.bankName),
          actionRequired: 'Add FRN to enable FSCS-compliant recommendations',
          sqlCommand: `INSERT INTO frn_manual_overrides (scraped_name, frn, firm_name, notes) VALUES ('${product.bankName}', '[LOOKUP_FRN_HERE]', '${product.bankName}', 'Added for recommendation engine - verify FRN is correct');`
        };

        alerts.push(alert);
      }

      // Sort by potential benefit (highest first)
      alerts.sort((a, b) => b.potentialBenefit.amount - a.potentialBenefit.amount);

      return alerts;

    } catch (error) {
      console.warn('Failed to detect missing FRN opportunities:', error);
      return [];
    }
  }

  /**
   * Generate chunked opportunities for large accounts that exceed FSCS limits
   */
  private async generateChunkedOpportunities(
    account: Account,
    betterProducts: any[],
    opportunities: RateOpportunity[],
    riskConfig: any
  ): Promise<void> {
    const fscsLimit = await this.config.loadFSCSLimit();
    const maxChunkSize = fscsLimit; // Use FSCS limit as max chunk size
    const remainingBalance = account.balance.amount;
    
    // Calculate how many chunks we need
    const numChunks = Math.ceil(remainingBalance / maxChunkSize);
    
    // Group products by FRN and pick the best rate for each FRN
    const productsByFRN = new Map<string, any>();
    
    this.logger.debug(`   Account rate: ${account.rate}%, FRN: ${account.institutionFRN}`);
    this.logger.debug(`   Available products: ${betterProducts.length}`);
    
    const withFRN = betterProducts.filter(product => product.frn && product.frn !== '');
    this.logger.debug(`   Products with FRN: ${withFRN.length}`);
    
    const notSameInstitution = withFRN.filter(product => product.frn !== account.institutionFRN);
    this.logger.debug(`   Not same institution: ${notSameInstitution.length}`);
    
    const betterRates = notSameInstitution.filter(product => product.aerRate > account.rate);
    this.logger.debug(`   Better rates: ${betterRates.length}`);
    
    if (betterRates.length > 0) {
      this.logger.debug(`   Top 3 better rate products:`);
      betterRates.slice(0, 3).forEach(p => {
        this.logger.debug(`     ${p.bankName}: ${p.aerRate}% (FRN: ${p.frn})`);
      });
    }
    
    betterRates.forEach(product => {
        const existing = productsByFRN.get(product.frn);
        if (!existing || product.aerRate > existing.aerRate) {
          productsByFRN.set(product.frn, product);
        }
      });
    
    // Sort by rate (best first) for chunk allocation
    const uniqueFRNProducts = Array.from(productsByFRN.values())
      .sort((a, b) => b.aerRate - a.aerRate);
    
    this.logger.debug(`   Chunking ${account.bankName}: ${uniqueFRNProducts.length} unique FRNs available for ${numChunks} chunks`);
    
    let processedAmount = 0;
    
    for (let chunkIndex = 0; chunkIndex < numChunks && uniqueFRNProducts.length > 0; chunkIndex++) {
      // Cycle through available FRNs if we need more chunks than unique FRNs
      const product = uniqueFRNProducts[chunkIndex % uniqueFRNProducts.length];
      
      // Calculate chunk size (remaining balance or max chunk size, whichever is smaller)
      const chunkSize = Math.min(maxChunkSize, remainingBalance - processedAmount);
      
      if (chunkSize < riskConfig.minMoveAmount.amount) {
        break; // Don't create tiny chunks
      }
      
      // Apply Sharia bank filtering
      const shariaBanks = await this.config.loadShariaBanks();
      const isShariaBankFRN = shariaBanks.some(bank => bank.frn === product.frn && bank.isShariaCompliant);
      if (isShariaBankFRN) {
        continue; // Skip Sharia banks if not allowed
      }
      
      // Check minimum deposit requirements
      if (product.minDeposit && chunkSize < product.minDeposit.amount) {
        continue;
      }
      
      // Calculate rate improvement and benefit for this chunk
      const rateImprovement = product.aerRate - account.rate;
      const annualBenefit = chunkSize * (rateImprovement / 100);
      
      // Skip if benefit is too small
      if (annualBenefit < riskConfig.minRebalancingBenefit.amount) {
        continue;
      }
      
      // Create Institution object
      const institutionPreferences = await this.config.loadInstitutionPreferences();
      const institutionPref = institutionPreferences.find(pref => pref.frn === product.frn);
      
      const targetInstitution: Institution = {
        frn: product.frn || '',
        firmName: product.bankName,
        isActive: true,
        ...(institutionPref?.personalLimit && { personalLimit: institutionPref.personalLimit }),
        ...(institutionPref?.easyAccessRequiredAboveFSCS !== undefined && { 
          easyAccessRequiredAboveFSCS: institutionPref.easyAccessRequiredAboveFSCS 
        }),
        ...(institutionPref?.trustLevel && { trustLevel: institutionPref.trustLevel }),
        ...(institutionPref?.riskNotes && { riskNotes: institutionPref.riskNotes })
      };
      
      const opportunity = {
        currentAccount: account,
        targetInstitution: targetInstitution,
        targetProduct: product,
        rateImprovement: new PercentageImpl(rateImprovement),
        annualBenefit: new MoneyImpl(annualBenefit),
        safeTransferAmount: new MoneyImpl(chunkSize),
        wouldViolateFSCS: false, // Will be calculated in Phase 2
        resultingExposure: new MoneyImpl(0), // Will be calculated in Phase 2
        headroomRemaining: new MoneyImpl(0), // Will be calculated in Phase 2
        requiresJointAccount: false,
        shariaCompliant: true,
        pendingDepositConsidered: true
      };
      
      opportunities.push(opportunity);
      
      processedAmount += chunkSize;
      
      // Stop if we've covered the full account balance
      if (processedAmount >= remainingBalance) {
        break;
      }
    }
  }

}
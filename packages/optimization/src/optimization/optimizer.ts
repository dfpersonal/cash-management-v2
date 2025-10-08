/**
 * Marginal Benefit Optimizer - FRN-based optimization with convenience bonuses
 * 
 * Implements the new optimization strategy that:
 * - Groups products by FRN for proper FSCS tracking
 * - Calculates marginal benefit (rate improvement per pound)
 * - Applies convenience bonuses for existing accounts and preferred platforms
 * - Dynamically allocates based on available headroom
 */

import {
  Portfolio,
  Recommendation
} from '../types/index';
import { FRNHeadroomManager } from './frn-headroom-manager';
import { OptimizationRulesEngine } from '../rules/engine';
import { ConfigurationLoader } from '../configuration/loader';
import { ProductLoader } from '../products/loader';
import { DynamicAllocator } from './dynamic-allocator';

// OpportunityWithBenefit interface moved to dynamic-allocator.ts

export class Optimizer {
  private rulesEngine: OptimizationRulesEngine;
  private config: ConfigurationLoader;
  private productLoader: ProductLoader;

  constructor(
    rulesEngine: OptimizationRulesEngine,
    config: ConfigurationLoader,
    productLoader: ProductLoader
  ) {
    this.rulesEngine = rulesEngine;
    this.config = config;
    this.productLoader = productLoader;
  }

  /**
   * Main optimization entry point using marginal benefit approach
   */
  public async optimize(portfolio: Portfolio): Promise<Recommendation[]> {
    // Step 1: Load exclusions
    const exclusions = await this.config.loadExcludedProducts();
    
    // Step 2: Initialize FRN headroom tracking with filtered products
    let availableProducts = await this.productLoader.getProductsBetterThan(0, 'easy_access');
    
    // Filter out excluded products
    availableProducts = availableProducts.filter(product => {
      // Check if product is excluded
      for (const exclusion of exclusions) {
        // FRN-level exclusion
        if (exclusion.frn && product.frn === exclusion.frn && !exclusion.bankName && !exclusion.accountType) {
          return false;
        }
        // Bank-level exclusion
        if (exclusion.bankName && product.bankName === exclusion.bankName && !exclusion.frn && !exclusion.accountType) {
          return false;
        }
        // Bank + type exclusion
        if (exclusion.bankName && exclusion.accountType && 
            product.bankName === exclusion.bankName && 
            product.accountType === exclusion.accountType) {
          return false;
        }
        // FRN + type exclusion
        if (exclusion.frn && exclusion.accountType && 
            product.frn === exclusion.frn && 
            product.accountType === exclusion.accountType) {
          return false;
        }
      }
      return true;
    });
    
    const frnManager = new FRNHeadroomManager(
      portfolio.accounts,
      portfolio.pendingDeposits || [],
      availableProducts,
      await this.config.loadFSCSLimit()
    );

    // Step 2: Use dynamic allocation for comprehensive recommendations
    const dynamicAllocator = new DynamicAllocator(
      this.rulesEngine,
      this.config,
      frnManager
    );
    
    // Build existing accounts set (accounts we already have)
    const existingAccounts = new Set<string>();
    for (const account of portfolio.accounts) {
      existingAccounts.add(`${account.bankName}-${account.accountType}`);
    }
    
    // Load preferred platforms
    const preferredPlatformsList = await this.config.loadPreferredPlatforms();
    const preferredPlatforms = new Set(preferredPlatformsList.map(p => p.platformName));
    
    // Use dynamic allocation strategy
    return await dynamicAllocator.allocateDynamically(
      portfolio.accounts.filter(acc => acc.balance.amount >= 1000), // Only accounts with meaningful balance
      availableProducts,
      existingAccounts,
      preferredPlatforms
    );
  }




}

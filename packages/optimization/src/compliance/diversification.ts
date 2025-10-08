/**
 * Diversification Engine for FSCS Compliance
 * 
 * Generates recommendations to achieve FSCS compliance by diversifying
 * funds across multiple institutions. Uses institution_preferences for
 * determining actual limits and headroom.
 * 
 * Key features:
 * - Uses configuration from compliance_config table (no hardcoded values)
 * - Respects institution_preferences for personal limits
 * - Handles easy_access_required_above_fscs constraints
 * - Single optimal diversification plan based on rate loss tolerance
 * - Priority algorithm: Amount at risk (largest first)
 */

import * as sqlite3 from 'sqlite3';
import { ComplianceBreach, InstitutionPreference, ComplianceConfig } from './fscs';
import { getLogger } from '../utils/logger';

export interface AvailableProduct {
  id: number;
  frn: string;
  bankName: string;
  productName: string;
  aerRate: number;
  accountType: string;
  liquidityTier: string;
  minDeposit: number;
  maxDeposit: number | null;
}

export interface TargetAllocation {
  frn: string;
  bankName: string;
  productName: string;
  rate: number;
  availableHeadroom: number;
  effectiveLimit: number;
  rateDifference: number;
  recommendedAmount: number;
  requiresEasyAccess: boolean;
}

export interface DiversificationRecommendation {
  sourceFRN: string;
  sourceInstitutions: string[];
  excessAmount: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  allocations: TargetAllocation[];
  estimatedRateImpact: number;
  totalAmountToMove: number;
  notes?: string;
}

export interface DiversificationOptions {
  maxAcceptableRateLoss?: number; // Default from config
  excludeFRNs?: string[]; // FRNs to exclude from targets
  accountType?: 'easy_access' | 'notice' | 'fixed_term'; // Default 'easy_access'
}

export class DiversificationEngine {
  private db: sqlite3.Database;
  private config: ComplianceConfig | null = null;
  private institutionPreferences: Map<string, InstitutionPreference> = new Map();
  private logger = getLogger({ component: 'fscs-diversification' });
  
  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
  }
  
  /**
   * Generate recommendations to achieve FSCS compliance
   * Accepts rate loss for safety (configurable threshold)
   */
  async generateDiversificationPlan(
    breaches: ComplianceBreach[],
    options: DiversificationOptions = {}
  ): Promise<DiversificationRecommendation[]> {
    // Load configuration and preferences
    await this.loadConfiguration();
    await this.loadInstitutionPreferences();
    
    const { 
      maxAcceptableRateLoss = await this.getDefaultRateLoss(),
      excludeFRNs = [],
      accountType = 'easy_access'
    } = options;
    
    const recommendations: DiversificationRecommendation[] = [];
    const availableProducts = await this.loadAvailableProducts(accountType);
    
    // Create FRN headroom tracker using actual limits from institution_preferences
    const frnHeadroom = await this.calculateFRNHeadroom(excludeFRNs);
    
    // Process breaches in priority order (already sorted by excess amount)
    for (const breach of breaches) {
      const currentRate = await this.getAverageRateForFRN(breach.frn);
      
      const targetFRNs = this.findViableTargets(
        breach,
        availableProducts,
        frnHeadroom,
        currentRate,
        maxAcceptableRateLoss
      );
      
      if (targetFRNs.length === 0) {
        // No viable targets found within rate loss tolerance
        this.logger.warning(`No viable diversification targets found for FRN ${breach.frn} within ${maxAcceptableRateLoss}% rate loss`);
        continue;
      }
      
      const allocations = this.optimizeAllocation(
        breach.excessAmount,
        targetFRNs,
        frnHeadroom
      );
      
      // Update headroom after allocation
      for (const allocation of allocations) {
        const currentHeadroom = frnHeadroom.get(allocation.frn) || 0;
        frnHeadroom.set(allocation.frn, currentHeadroom - allocation.recommendedAmount);
      }
      
      const totalAmountToMove = allocations.reduce((sum, a) => sum + a.recommendedAmount, 0);
      const estimatedRateImpact = this.calculateRateImpact(allocations, currentRate, breach.excessAmount);
      
      // Add notes about protection type
      let notes: string | undefined;
      if (breach.protectionType === 'government_protected') {
        notes = 'Moving funds from government-protected institution';
      } else if (breach.protectionType === 'personal_override') {
        notes = breach.riskNotes || 'Moving funds from institution with personal override limit';
      }
      
      const recommendation: DiversificationRecommendation = {
        sourceFRN: breach.frn,
        sourceInstitutions: breach.institutions,
        excessAmount: breach.excessAmount,
        priority: breach.severity,
        allocations,
        estimatedRateImpact,
        totalAmountToMove
      };
      
      if (notes) {
        recommendation.notes = notes;
      }
      
      recommendations.push(recommendation);
    }
    
    return recommendations;
  }
  
  private async loadConfiguration(): Promise<void> {
    const query = `
      SELECT config_key, config_value, config_type
      FROM compliance_config
      WHERE config_key IN (
        'fscs_standard_limit',
        'fscs_joint_multiplier',
        'fscs_tolerance_threshold',
        'fscs_default_rate_loss_tolerance',
        'personal_fscs_override_enabled'
      )
    `;
    
    return new Promise((resolve, reject) => {
      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        
        const config: any = {};
        for (const row of rows) {
          const value = row.config_type === 'number' 
            ? parseFloat(row.config_value)
            : row.config_type === 'boolean'
            ? row.config_value === 'true'
            : row.config_value;
          
          // Convert snake_case to camelCase
          const key = row.config_key.replace(/_([a-z])/g, (_g: string, p1: string) => p1.toUpperCase());
          config[key] = value;
        }
        
        this.config = {
          fscsStandardLimit: config.fscsStandardLimit || 85000,
          fscsJointMultiplier: config.fscsJointMultiplier || 2,
          fscsTolerance: config.fscsToleranceThreshold || 500,
          fscsNearLimitThreshold: config.fscsNearLimitThreshold || 80000,
          fscsWarningThreshold: config.fscsWarningThreshold || 0.9,
          personalFSCSOverrideEnabled: config.personalFscsOverrideEnabled !== false
        };
        
        resolve();
      });
    });
  }
  
  private async loadInstitutionPreferences(): Promise<void> {
    const query = `
      SELECT 
        frn,
        bank_name as bankName,
        personal_limit as personalLimit,
        easy_access_required_above_fscs as easyAccessRequired,
        trust_level as trustLevel,
        risk_notes as riskNotes
      FROM institution_preferences
    `;
    
    return new Promise((resolve, reject) => {
      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        
        this.institutionPreferences.clear();
        for (const row of rows) {
          this.institutionPreferences.set(row.frn, {
            frn: row.frn,
            bankName: row.bankName,
            personalLimit: row.personalLimit,
            easyAccessRequiredAboveFSCS: row.easyAccessRequired === 1,
            trustLevel: row.trustLevel,
            riskNotes: row.riskNotes
          });
        }
        
        resolve();
      });
    });
  }
  
  private async loadAvailableProducts(accountType: string): Promise<AvailableProduct[]> {
    const query = `
      SELECT 
        id,
        frn,
        bank_name as bankName,
        bank_name || ' ' || account_type as productName,
        aer_rate as aerRate,
        account_type as accountType,
        account_type as liquidityTier,
        COALESCE(min_deposit, 0) as minDeposit,
        max_deposit as maxDeposit
      FROM available_products
      WHERE account_type = ? 
        AND aer_rate > 0
      ORDER BY aer_rate DESC
    `;
    
    return new Promise((resolve, reject) => {
      this.db.all(query, [accountType], (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows.map(row => ({
          id: row.id,
          frn: row.frn,
          bankName: row.bankName,
          productName: row.productName,
          aerRate: row.aerRate,
          accountType: row.accountType,
          liquidityTier: row.liquidityTier,
          minDeposit: row.minDeposit || 0,
          maxDeposit: row.maxDeposit
        })));
      });
    });
  }
  
  private async calculateFRNHeadroom(excludeFRNs: string[]): Promise<Map<string, number>> {
    const headroomMap = new Map<string, number>();
    
    // Get current exposures
    const query = `
      SELECT 
        frn,
        SUM(balance) as totalExposure
      FROM my_deposits
      WHERE is_active = 1
      GROUP BY frn
    `;
    
    const rows = await new Promise<any[]>((resolve, reject) => {
      this.db.all(query, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows as any[]);
      });
    });
    
    // Get all unique FRNs from available products
    const frnQuery = `
      SELECT DISTINCT frn
      FROM available_products
      WHERE frn IS NOT NULL
    `;
    
    const allFRNs = await new Promise<any[]>((resolve, reject) => {
      this.db.all(frnQuery, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows as any[]);
      });
    });
    
    // Calculate headroom for each FRN using actual limits
    for (const { frn } of allFRNs) {
      if (excludeFRNs.includes(frn)) continue;
      
      const exposure = rows.find(r => r.frn === frn);
      const currentExposure = exposure ? exposure.totalExposure : 0;
      
      // Get effective limit for this FRN
      const institutionPref = this.institutionPreferences.get(frn);
      const effectiveLimit = institutionPref?.personalLimit || this.config!.fscsStandardLimit;
      
      const headroom = Math.max(0, effectiveLimit - currentExposure);
      headroomMap.set(frn, headroom);
    }
    
    return headroomMap;
  }
  
  private async getAverageRateForFRN(frn: string): Promise<number> {
    const query = `
      SELECT AVG(aer) as avgRate
      FROM my_deposits
      WHERE frn = ? AND is_active = 1
    `;
    
    return new Promise((resolve, reject) => {
      this.db.get(query, [frn], (err, result: any) => {
        if (err) reject(err);
        else resolve(result?.avgRate || 0);
      });
    });
  }
  
  private findViableTargets(
    breach: ComplianceBreach,
    products: AvailableProduct[],
    headroom: Map<string, number>,
    currentRate: number,
    maxRateLoss: number
  ): TargetAllocation[] {
    const targets: TargetAllocation[] = [];
    
    // Group products by FRN and find best rate for each FRN
    const bestProductsByFRN = new Map<string, AvailableProduct>();
    
    for (const product of products) {
      if (!product.frn || product.frn === breach.frn) continue;
      
      const existing = bestProductsByFRN.get(product.frn);
      if (!existing || product.aerRate > existing.aerRate) {
        bestProductsByFRN.set(product.frn, product);
      }
    }
    
    // Check each FRN for viability
    for (const [frn, product] of bestProductsByFRN) {
      const availableHeadroom = headroom.get(frn) || 0;
      if (availableHeadroom <= 0) continue;
      
      const rateLoss = currentRate - product.aerRate;
      if (rateLoss > maxRateLoss) continue;
      
      // Check if we can meet minimum deposit requirement
      const recommendedAmount = Math.min(availableHeadroom, breach.excessAmount);
      if (recommendedAmount < product.minDeposit) continue;
      
      // Check maximum deposit constraint
      if (product.maxDeposit && recommendedAmount > product.maxDeposit) {
        // Split into multiple accounts if needed - for now, just cap at max
        continue;
      }
      
      // Get institution preference to determine if easy access is required
      const institutionPref = this.institutionPreferences.get(frn);
      const effectiveLimit = institutionPref?.personalLimit || this.config!.fscsStandardLimit;
      const requiresEasyAccess = institutionPref?.easyAccessRequiredAboveFSCS || false;
      
      targets.push({
        frn: product.frn,
        bankName: product.bankName,
        productName: product.productName,
        rate: product.aerRate,
        availableHeadroom,
        effectiveLimit,
        rateDifference: -rateLoss, // Negative because it's a loss
        recommendedAmount: 0, // Will be set by optimizeAllocation
        requiresEasyAccess
      });
    }
    
    // Sort by rate (best first)
    return targets.sort((a, b) => b.rate - a.rate);
  }
  
  private optimizeAllocation(
    amountToAllocate: number,
    targets: TargetAllocation[],
    headroom: Map<string, number>
  ): TargetAllocation[] {
    const allocations: TargetAllocation[] = [];
    let remainingAmount = amountToAllocate;
    
    // Allocate to best rates first
    for (const target of targets) {
      if (remainingAmount <= 0) break;
      
      const availableHeadroom = headroom.get(target.frn) || 0;
      const allocationAmount = Math.min(remainingAmount, availableHeadroom);
      
      if (allocationAmount > 0) {
        allocations.push({
          ...target,
          recommendedAmount: allocationAmount
        });
        
        remainingAmount -= allocationAmount;
      }
    }
    
    // Warn if we couldn't allocate everything
    if (remainingAmount > 0) {
      this.logger.warning(`Could not fully diversify. Remaining amount: £${remainingAmount.toFixed(2)}`);
    }
    
    return allocations;
  }
  
  private calculateRateImpact(
    allocations: TargetAllocation[],
    currentRate: number,
    totalAmount: number
  ): number {
    if (totalAmount === 0) return 0;
    
    let weightedNewRate = 0;
    let totalAllocated = 0;
    
    for (const allocation of allocations) {
      weightedNewRate += allocation.rate * allocation.recommendedAmount;
      totalAllocated += allocation.recommendedAmount;
    }
    
    if (totalAllocated === 0) return 0;
    
    const averageNewRate = weightedNewRate / totalAllocated;
    return currentRate - averageNewRate; // Positive means rate loss
  }
  
  /**
   * Get default rate loss tolerance from configuration
   */
  private async getDefaultRateLoss(): Promise<number> {
    const query = `
      SELECT config_value 
      FROM compliance_config 
      WHERE config_key = 'fscs_default_rate_loss_tolerance'
    `;
    
    return new Promise((resolve, reject) => {
      this.db.get(query, [], (err, result: any) => {
        if (err) reject(err);
        else {
          const maxRateLoss = result ? parseFloat(result.config_value) : 0.5;
          resolve(maxRateLoss);
        }
      });
    });
  }
  
  close() {
    this.db.close();
  }
}
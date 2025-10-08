/**
 * FSCS Tracker - Cumulative exposure tracking for recommendation generation
 * Tracks FSCS exposure across current portfolio and pending recommendations
 * to ensure no institution exceeds protection limits
 */

import { Account, PendingDeposit } from '../types';

interface FSCSExposure {
  frn: string;
  institutionName: string;
  currentExposure: number;
  pendingRecommendations: number;
  totalExposure: number;
  availableHeadroom: number;
  isAtLimit: boolean;
  isOverLimit: boolean;
}

interface RecommendationEntry {
  id: string;
  targetFRN: string;
  amount: number;
  sourceAccountId: string;
  createdAt: Date;
}

export class FSCSTracker {
  private readonly fscsLimit: number = 85000; // Standard FSCS protection limit
  private exposures: Map<string, FSCSExposure> = new Map();
  private recommendationQueue: RecommendationEntry[] = [];
  private nextRecommendationId = 1;

  constructor(
    accounts: Account[],
    pendingDeposits: PendingDeposit[] = [],
    fscsLimit: number = 85000
  ) {
    this.fscsLimit = fscsLimit;
    this.initialize(accounts, pendingDeposits);
  }

  /**
   * Initialize tracker with current portfolio state
   */
  private initialize(accounts: Account[], pendingDeposits: PendingDeposit[]): void {
    // Process current accounts
    for (const account of accounts) {
      if (!account.institutionFRN) continue; // Skip accounts without FRN
      
      this.addExposure(
        account.institutionFRN,
        account.bankName,
        account.balance.amount
      );
    }

    // Process pending deposits  
    for (const pending of pendingDeposits) {
      if (!pending.institutionFRN) continue; // Skip without FRN
      
      this.addExposure(
        pending.institutionFRN,
        pending.bankName,
        pending.balance.amount
      );
    }
  }

  /**
   * Add or update exposure for an institution
   */
  private addExposure(frn: string, institutionName: string, amount: number): void {
    const existing = this.exposures.get(frn);
    
    if (existing) {
      existing.currentExposure += amount;
      this.recalculateExposure(existing);
    } else {
      const exposure: FSCSExposure = {
        frn,
        institutionName,
        currentExposure: amount,
        pendingRecommendations: 0,
        totalExposure: amount,
        availableHeadroom: this.fscsLimit - amount,
        isAtLimit: amount >= this.fscsLimit,
        isOverLimit: amount > this.fscsLimit
      };
      
      this.exposures.set(frn, exposure);
    }
  }

  /**
   * Recalculate derived values for an exposure
   */
  private recalculateExposure(exposure: FSCSExposure): void {
    exposure.totalExposure = exposure.currentExposure + exposure.pendingRecommendations;
    exposure.availableHeadroom = Math.max(0, this.fscsLimit - exposure.totalExposure);
    exposure.isAtLimit = exposure.totalExposure >= this.fscsLimit;
    exposure.isOverLimit = exposure.totalExposure > this.fscsLimit;
  }

  /**
   * Check if a potential recommendation would violate FSCS limits
   */
  public wouldViolateFSCS(targetFRN: string, amount: number): boolean {
    if (!targetFRN || amount <= 0) return true; // No FRN is always a violation
    
    const exposure = this.exposures.get(targetFRN);
    if (!exposure) {
      // New institution - check if amount exceeds limit
      return amount > this.fscsLimit;
    }
    
    return (exposure.totalExposure + amount) > this.fscsLimit;
  }

  /**
   * Get available headroom for an institution
   */
  public getAvailableHeadroom(targetFRN: string): number {
    if (!targetFRN) return 0; // No FRN = no headroom
    
    const exposure = this.exposures.get(targetFRN);
    if (!exposure) {
      // New institution - full FSCS limit available
      return this.fscsLimit;
    }
    
    return exposure.availableHeadroom;
  }

  /**
   * Calculate maximum safe transfer amount to an institution
   */
  public getMaxSafeTransfer(targetFRN: string, desiredAmount: number): number {
    if (!targetFRN) return 0; // No FRN = cannot transfer
    
    const availableHeadroom = this.getAvailableHeadroom(targetFRN);
    
    // Return the smaller of desired amount and available headroom
    return Math.min(desiredAmount, availableHeadroom);
  }

  /**
   * Add a recommendation to the tracker (reserves FSCS capacity)
   */
  public addRecommendation(
    targetFRN: string, 
    institutionName: string,
    amount: number, 
    sourceAccountId: string
  ): string {
    if (this.wouldViolateFSCS(targetFRN, amount)) {
      throw new Error(`Recommendation would violate FSCS limit for ${targetFRN}`);
    }

    // Generate unique recommendation ID
    const recommendationId = `rec_${this.nextRecommendationId++}`;
    
    // Add to queue
    this.recommendationQueue.push({
      id: recommendationId,
      targetFRN,
      amount,
      sourceAccountId,
      createdAt: new Date()
    });

    // Update exposure tracking
    const existing = this.exposures.get(targetFRN);
    if (existing) {
      existing.pendingRecommendations += amount;
      this.recalculateExposure(existing);
    } else {
      // Create new exposure for previously unknown institution
      const exposure: FSCSExposure = {
        frn: targetFRN,
        institutionName,
        currentExposure: 0,
        pendingRecommendations: amount,
        totalExposure: amount,
        availableHeadroom: this.fscsLimit - amount,
        isAtLimit: amount >= this.fscsLimit,
        isOverLimit: amount > this.fscsLimit
      };
      
      this.exposures.set(targetFRN, exposure);
    }

    return recommendationId;
  }

  /**
   * Remove a recommendation from the tracker (frees up FSCS capacity)
   */
  public removeRecommendation(recommendationId: string): boolean {
    const index = this.recommendationQueue.findIndex(rec => rec.id === recommendationId);
    if (index === -1) return false;

    const recommendation = this.recommendationQueue[index];
    if (!recommendation) return false; // Safety check for TypeScript
    
    const exposure = this.exposures.get(recommendation.targetFRN);
    
    if (exposure) {
      exposure.pendingRecommendations -= recommendation.amount;
      this.recalculateExposure(exposure);
    }

    this.recommendationQueue.splice(index, 1);
    return true;
  }

  /**
   * Get current exposure summary for all institutions
   */
  public getExposureSummary(): FSCSExposure[] {
    return Array.from(this.exposures.values())
      .sort((a, b) => b.totalExposure - a.totalExposure);
  }

  /**
   * Get institutions with available headroom for new recommendations
   */
  public getAvailableInstitutions(): FSCSExposure[] {
    return this.getExposureSummary()
      .filter(exposure => exposure.availableHeadroom > 0);
  }

  /**
   * Get institutions that are at or over FSCS limits
   */
  public getOverLimitInstitutions(): FSCSExposure[] {
    return this.getExposureSummary()
      .filter(exposure => exposure.isAtLimit);
  }

  /**
   * Get total number of pending recommendations
   */
  public getPendingRecommendationCount(): number {
    return this.recommendationQueue.length;
  }

  /**
   * Get all pending recommendations
   */
  public getPendingRecommendations(): RecommendationEntry[] {
    return [...this.recommendationQueue];
  }

  /**
   * Clear all pending recommendations (useful for testing different scenarios)
   */
  public clearPendingRecommendations(): void {
    // Reset all pending amounts
    for (const exposure of this.exposures.values()) {
      exposure.pendingRecommendations = 0;
      this.recalculateExposure(exposure);
    }
    
    this.recommendationQueue = [];
    this.nextRecommendationId = 1;
  }

  /**
   * Generate a compliance report
   */
  public generateComplianceReport(): {
    summary: {
      totalInstitutions: number;
      institutionsAtLimit: number;
      institutionsOverLimit: number;
      totalPendingRecommendations: number;
    };
    exposures: FSCSExposure[];
    recommendations: RecommendationEntry[];
  } {
    const exposures = this.getExposureSummary();
    
    return {
      summary: {
        totalInstitutions: exposures.length,
        institutionsAtLimit: exposures.filter(e => e.isAtLimit).length,
        institutionsOverLimit: exposures.filter(e => e.isOverLimit).length,
        totalPendingRecommendations: this.recommendationQueue.length
      },
      exposures,
      recommendations: [...this.recommendationQueue]
    };
  }
}

export default FSCSTracker;
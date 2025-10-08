/**
 * FRN Headroom Manager - Tracks and manages FSCS headroom per FRN
 * 
 * Groups products by FRN to properly track shared FSCS limits and
 * manages dynamic headroom allocation during optimization.
 */

import { Account, PendingDeposit, AvailableProduct } from '../types';

interface FRNInfo {
  frn: string;
  firmName: string;
  currentExposure: number;
  availableHeadroom: number;
  products: AvailableProduct[];
  isExistingAccount: boolean;
}

export class FRNHeadroomManager {
  private readonly fscsLimit: number;
  private frnInfo: Map<string, FRNInfo> = new Map();
  private reservedHeadroom: Map<string, number> = new Map();

  constructor(
    accounts: Account[],
    pendingDeposits: PendingDeposit[] = [],
    availableProducts: AvailableProduct[] = [],
    fscsLimit: number = 85000
  ) {
    this.fscsLimit = fscsLimit;
    this.initialize(accounts, pendingDeposits, availableProducts);
  }

  /**
   * Initialize FRN tracking with current portfolio and available products
   */
  private initialize(
    accounts: Account[],
    pendingDeposits: PendingDeposit[],
    availableProducts: AvailableProduct[]
  ): void {
    // Step 1: Calculate current exposure per FRN from existing accounts
    for (const account of accounts) {
      if (!account.institutionFRN) continue;
      
      const existing = this.frnInfo.get(account.institutionFRN);
      if (existing) {
        existing.currentExposure += account.balance.amount;
      } else {
        this.frnInfo.set(account.institutionFRN, {
          frn: account.institutionFRN,
          firmName: account.bankName,
          currentExposure: account.balance.amount,
          availableHeadroom: 0, // Will calculate after
          products: [],
          isExistingAccount: true
        });
      }
    }

    // Step 2: Add pending deposits to exposure
    for (const pending of pendingDeposits) {
      if (!pending.institutionFRN) continue;
      
      const existing = this.frnInfo.get(pending.institutionFRN);
      if (existing) {
        existing.currentExposure += pending.balance.amount;
      } else {
        this.frnInfo.set(pending.institutionFRN, {
          frn: pending.institutionFRN,
          firmName: pending.bankName,
          currentExposure: pending.balance.amount,
          availableHeadroom: 0,
          products: [],
          isExistingAccount: false
        });
      }
    }

    // Step 3: Group available products by FRN
    for (const product of availableProducts) {
      if (!product.frn) continue;
      
      const existing = this.frnInfo.get(product.frn);
      if (existing) {
        existing.products.push(product);
      } else {
        this.frnInfo.set(product.frn, {
          frn: product.frn,
          firmName: product.bankName,
          currentExposure: 0,
          availableHeadroom: 0,
          products: [product],
          isExistingAccount: false
        });
      }
    }

    // Step 4: Calculate available headroom for each FRN
    for (const info of this.frnInfo.values()) {
      info.availableHeadroom = Math.max(0, this.fscsLimit - info.currentExposure);
      
      // Sort products within each FRN by rate (best first)
      info.products.sort((a, b) => b.aerRate - a.aerRate);
    }
  }

  /**
   * Get available headroom for a specific FRN
   */
  public getAvailableHeadroom(frn: string): number {
    const info = this.frnInfo.get(frn);
    if (!info) return 0;
    
    const reserved = this.reservedHeadroom.get(frn) || 0;
    return Math.max(0, info.availableHeadroom - reserved);
  }

  /**
   * Reserve headroom for a recommendation
   */
  public reserveHeadroom(frn: string, amount: number): boolean {
    const available = this.getAvailableHeadroom(frn);
    if (amount > available) return false;
    
    const currentReserved = this.reservedHeadroom.get(frn) || 0;
    this.reservedHeadroom.set(frn, currentReserved + amount);
    return true;
  }

  /**
   * Get current exposure for an FRN
   */
  public getCurrentExposure(frn: string): number {
    const info = this.frnInfo.get(frn);
    return info?.currentExposure || 0;
  }

  /**
   * Get the best available product for an FRN
   */
  public getBestProductForFRN(frn: string): AvailableProduct | null {
    const info = this.frnInfo.get(frn);
    if (!info || info.products.length === 0) return null;
    
    // Products are already sorted by rate
    return info.products[0] || null;
  }

  /**
   * Check if an FRN represents an existing account
   */
  public isExistingAccount(frn: string): boolean {
    const info = this.frnInfo.get(frn);
    return info?.isExistingAccount || false;
  }

  /**
   * Get all FRNs with available headroom
   */
  public getFRNsWithHeadroom(): string[] {
    const frnsWithHeadroom: string[] = [];
    
    for (const frn of this.frnInfo.keys()) {
      if (this.getAvailableHeadroom(frn) > 0) {
        frnsWithHeadroom.push(frn);
      }
    }
    
    return frnsWithHeadroom;
  }

  /**
   * Get all products grouped by FRN
   */
  public getAllProductsByFRN(): Map<string, AvailableProduct[]> {
    const productsByFRN = new Map<string, AvailableProduct[]>();
    
    for (const [frn, info] of this.frnInfo) {
      if (info.products.length > 0) {
        productsByFRN.set(frn, info.products);
      }
    }
    
    return productsByFRN;
  }

  /**
   * Get summary of FRN status
   */
  public getFRNSummary(): Array<{
    frn: string;
    firmName: string;
    currentExposure: number;
    availableHeadroom: number;
    reservedHeadroom: number;
    remainingHeadroom: number;
    isExistingAccount: boolean;
    productCount: number;
    bestRate: number | null;
  }> {
    const summary = [];
    
    for (const [frn, info] of this.frnInfo) {
      const reserved = this.reservedHeadroom.get(frn) || 0;
      const bestRate = info.products.length > 0 ? info.products[0]?.aerRate || null : null;
      
      summary.push({
        frn,
        firmName: info.firmName,
        currentExposure: info.currentExposure,
        availableHeadroom: info.availableHeadroom,
        reservedHeadroom: reserved,
        remainingHeadroom: this.getAvailableHeadroom(frn),
        isExistingAccount: info.isExistingAccount,
        productCount: info.products.length,
        bestRate
      });
    }
    
    // Sort by remaining headroom (descending)
    summary.sort((a, b) => b.remainingHeadroom - a.remainingHeadroom);
    
    return summary;
  }

  /**
   * Reset all reservations (useful for what-if scenarios)
   */
  public resetReservations(): void {
    this.reservedHeadroom.clear();
  }
}
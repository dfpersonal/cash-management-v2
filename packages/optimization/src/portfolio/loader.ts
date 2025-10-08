import { Portfolio, Account, PendingDeposit, LiquidityTier, AccountType, AccountSubType } from '../types/index';
import { DatabaseConnection } from '../types/index';
import { Money as MoneyImpl } from '../utils/money';

/**
 * Portfolio Loader
 * Loads real portfolio data from my_deposits and my_pending_deposits tables
 */
export class PortfolioLoader {
  constructor(private db: DatabaseConnection) {}

  /**
   * Load complete portfolio from database
   */
  public async loadPortfolio(): Promise<Portfolio> {
    const accounts = await this.loadAccounts();
    const pendingDeposits = await this.loadPendingDeposits();
    
    const totalValue = this.calculateTotalValue(accounts, pendingDeposits);
    const liquidityBreakdown = this.calculateLiquidityBreakdown(accounts);
    const institutionCount = this.calculateInstitutionCount(accounts);
    const averageRate = this.calculateAverageRate(accounts);

    return {
      accounts,
      pendingDeposits,
      totalValue,
      lastUpdated: new Date(),
      institutionCount,
      liquidityBreakdown,
      averageRate
    };
  }

  /**
   * Load all active accounts from my_deposits table
   */
  private async loadAccounts(): Promise<Account[]> {
    const query = `
      SELECT 
        id,
        bank,
        type,
        sub_type,
        frn,
        platform,
        balance,
        aer,
        liquidity_tier,
        can_withdraw_immediately,
        earliest_withdrawal_date,
        is_joint_account,
        num_account_holders,
        is_active,
        is_isa,
        last_updated
      FROM my_deposits 
      WHERE is_active = 1 AND balance > 0
      ORDER BY balance DESC
    `;

    const rows = await this.db.query(query);
    
    return rows.map(row => {
      const account: Account = {
        id: row.id.toString(),
        institutionFRN: row.frn || '',
        bankName: row.bank,
        accountType: this.mapAccountType(row.type),
        accountSubType: this.mapAccountSubType(row.sub_type),
        platform: row.platform,
        balance: new MoneyImpl(row.balance || 0),
        rate: row.aer || 0,
        liquidityTier: this.mapLiquidityTier(row.liquidity_tier),
        canWithdrawImmediately: Boolean(row.can_withdraw_immediately),
        isJointAccount: Boolean(row.is_joint_account),
        numAccountHolders: row.num_account_holders || (row.is_joint_account ? 2 : 1),
        isActive: Boolean(row.is_active),
        isISA: Boolean(row.is_isa),
        lastUpdated: new Date(row.last_updated)
      };
      
      // Add optional fields only if they exist
      if (row.earliest_withdrawal_date) account.earliestWithdrawalDate = new Date(row.earliest_withdrawal_date);
      
      return account;
    });
  }

  /**
   * Load all active pending deposits
   */
  private async loadPendingDeposits(): Promise<PendingDeposit[]> {
    const query = `
      SELECT 
        id,
        bank,
        type,
        sub_type,
        frn,
        platform,
        balance,
        aer,
        liquidity_tier,
        status,
        expected_funding_date,
        source_account_id,
        is_joint_account,
        num_account_holders,
        is_active,
        created_at,
        updated_at
      FROM my_pending_deposits 
      WHERE is_active = 1
      ORDER BY balance DESC
    `;

    const rows = await this.db.query(query);
    
    return rows.map(row => {
      const pendingDeposit: PendingDeposit = {
        id: row.id.toString(),
        institutionFRN: row.frn || '',
        bankName: row.bank,
        accountType: this.mapAccountType(row.type),
        accountSubType: this.mapAccountSubType(row.sub_type),
        platform: row.platform,
        balance: new MoneyImpl(row.balance || 0),
        rate: row.aer,
        liquidityTier: this.mapLiquidityTier(row.liquidity_tier),
        status: row.status as any,
        isJointAccount: Boolean(row.is_joint_account),
        numAccountHolders: row.num_account_holders || (row.is_joint_account ? 2 : 1),
        isActive: Boolean(row.is_active),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      };
      
      // Add optional fields only if they exist
      if (row.expected_funding_date) pendingDeposit.expectedFundingDate = new Date(row.expected_funding_date);
      if (row.source_account_id) pendingDeposit.sourceAccountId = row.source_account_id.toString();
      
      return pendingDeposit;
    });
  }

  /**
   * Calculate total portfolio value
   */
  private calculateTotalValue(accounts: Account[], pendingDeposits: PendingDeposit[]): MoneyImpl {
    const accountsValue = accounts.reduce((sum, account) => sum + account.balance.amount, 0);
    const pendingValue = pendingDeposits.reduce((sum, deposit) => sum + deposit.balance.amount, 0);
    return new MoneyImpl(accountsValue + pendingValue);
  }

  /**
   * Calculate liquidity breakdown by tier
   */
  private calculateLiquidityBreakdown(accounts: Account[]): Record<LiquidityTier, MoneyImpl> {
    const breakdown: Record<LiquidityTier, MoneyImpl> = {
      easy_access: new MoneyImpl(0),
      notice_1_30: new MoneyImpl(0),
      notice_31_60: new MoneyImpl(0), 
      notice_61_90: new MoneyImpl(0),
      'notice_90+': new MoneyImpl(0),
      fixed_9m: new MoneyImpl(0),
      fixed_12m: new MoneyImpl(0),
      fixed_24m: new MoneyImpl(0),
      fixed_36m: new MoneyImpl(0),
      fixed_60m: new MoneyImpl(0)
    };

    for (const account of accounts) {
      const current = breakdown[account.liquidityTier];
      breakdown[account.liquidityTier] = new MoneyImpl(current.amount + account.balance.amount);
    }

    return breakdown;
  }

  /**
   * Calculate number of unique institutions
   */
  private calculateInstitutionCount(accounts: Account[]): number {
    const institutions = new Set(accounts.map(account => account.institutionFRN).filter(frn => frn));
    return institutions.size;
  }

  /**
   * Calculate portfolio average rate weighted by balance
   */
  private calculateAverageRate(accounts: Account[]): number {
    const totalValue = accounts.reduce((sum, account) => sum + account.balance.amount, 0);
    if (totalValue === 0) return 0;
    
    const weightedRates = accounts.reduce(
      (sum, account) => sum + (account.rate * account.balance.amount), 
      0
    );
    
    return weightedRates / totalValue;
  }

  /**
   * Map database account type to typed enum
   */
  private mapAccountType(type: string): AccountType {
    // Handle variations in database values
    const normalizedType = type.toLowerCase().trim();
    if (normalizedType.includes('current')) return 'Current';
    return 'Savings'; // Default to Savings
  }

  /**
   * Map database sub type to typed enum
   */
  private mapAccountSubType(subType: string): AccountSubType {
    if (!subType) return 'n/a';
    
    const normalizedSubType = subType.toLowerCase().trim();
    if (normalizedSubType.includes('easy') || normalizedSubType.includes('instant')) return 'Easy Access';
    if (normalizedSubType.includes('notice')) return 'Notice';
    if (normalizedSubType.includes('term') || normalizedSubType.includes('fixed')) return 'Term';
    return 'n/a';
  }

  /**
   * Map database liquidity tier to typed enum
   */
  private mapLiquidityTier(tier: string | null): LiquidityTier {
    if (!tier) return 'easy_access'; // Default
    
    const normalizedTier = tier.toLowerCase().trim();
    
    // Map common variations
    const tierMapping: Record<string, LiquidityTier> = {
      'easy_access': 'easy_access',
      'easy access': 'easy_access',
      'instant_access': 'easy_access',
      'instant access': 'easy_access',
      'notice_1_30': 'notice_1_30',
      'notice 1-30': 'notice_1_30',
      'notice_31_60': 'notice_31_60',
      'notice 31-60': 'notice_31_60',
      'notice_61_90': 'notice_61_90',
      'notice 61-90': 'notice_61_90',
      'notice_90+': 'notice_90+',
      'notice 90+': 'notice_90+',
      'fixed_9m': 'fixed_9m',
      'fixed_12m': 'fixed_12m',
      'fixed_24m': 'fixed_24m',
      'fixed_36m': 'fixed_36m',
      'fixed_60m': 'fixed_60m'
    };

    return tierMapping[normalizedTier] || 'easy_access';
  }
}
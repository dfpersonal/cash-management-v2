import { Database } from 'sqlite3';
import {
  InterestConfiguration,
  InterestPaymentType,
  InterestPaymentDestination,
  InterestPaymentAnalysis,
  InterestVarianceAnalysis,
  Transaction
} from '../types/TransactionTypes';
import { Deposit } from '../types/PortfolioTypes';
import { TransactionService } from './TransactionService';

export class InterestPaymentService {
  private db: Database;
  private transactionService: TransactionService;

  constructor(database: Database) {
    this.db = database;
    this.transactionService = new TransactionService(database);
  }

  /**
   * Calculate estimated interest for an account with various methods
   */
  calculateEstimatedInterest(
    account: Deposit, 
    method: 'simple' | 'compound' | 'aer' = 'simple',
    periodDays?: number
  ): number {
    if (!account.aer || !account.balance) {
      return 0;
    }

    const balance = account.balance;
    const rate = account.aer / 100;
    const daysInPeriod = periodDays || this.getDaysInPeriod(account);
    const daysInYear = 365;

    switch (method) {
      case 'simple':
        // Simple daily interest calculation
        return (balance * rate * daysInPeriod) / daysInYear;
        
      case 'compound':
        // Monthly compounding
        const monthlyRate = rate / 12;
        const months = daysInPeriod / 30;
        return balance * (Math.pow(1 + monthlyRate, months) - 1);
        
      case 'aer':
        // Using AER directly for period
        const periodRate = Math.pow(1 + rate, daysInPeriod / daysInYear) - 1;
        return balance * periodRate;
        
      default:
        return (balance * rate * daysInPeriod) / daysInYear;
    }
  }

  /**
   * Detect if a transaction is likely an interest payment
   */
  async detectInterestPayment(transaction: Transaction, account: Deposit): Promise<boolean> {
    // Check if it's a credit transaction
    if (!transaction.credit || transaction.credit <= 0) {
      return false;
    }

    // Check transaction type
    if (transaction.transaction_type === 'interest') {
      return true;
    }

    const amount = transaction.credit;
    const balance = transaction.balance_after ? transaction.balance_after - amount : (account.balance || 0);

    // Interest is typically a small percentage of balance
    const percentageOfBalance = balance > 0 ? (amount / balance) * 100 : 0;
    if (percentageOfBalance > 10) {
      return false; // Too large to be interest
    }

    // Check if amount matches expected interest
    const estimatedInterest = this.calculateEstimatedInterest(account);
    const variance = Math.abs(amount - estimatedInterest) / estimatedInterest;
    if (variance < 0.2) { // Within 20% of expected
      return true;
    }

    // Check date patterns
    const isPaymentDue = await this.isInterestPaymentDue(account, transaction.bank_date || transaction.transaction_date);
    if (isPaymentDue && percentageOfBalance < 2) {
      return true;
    }

    // Check for common interest references
    const reference = (transaction.reference || '').toLowerCase();
    const notes = (transaction.optional_notes || '').toLowerCase();
    const interestKeywords = ['interest', 'int', 'credit interest', 'gross interest'];
    
    return interestKeywords.some(keyword => 
      reference.includes(keyword) || notes.includes(keyword)
    );
  }

  /**
   * Check if interest payment is due around a specific date
   */
  private async isInterestPaymentDue(account: Deposit & any, date: string): Promise<boolean> {
    const transactionDate = new Date(date);
    
    switch (account.interest_payment_type) {
      case 'Monthly':
        // Check if it's near end of month
        const endOfMonth = new Date(transactionDate.getFullYear(), transactionDate.getMonth() + 1, 0);
        const daysDiff = Math.abs(endOfMonth.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff <= 3;

      case 'Quarterly':
        // Check if it's near quarterly anniversary (every 3 months from deposit date)
        if (account.deposit_date) {
          const depositDate = new Date(account.deposit_date);
          const monthsDiff = (transactionDate.getFullYear() - depositDate.getFullYear()) * 12
                           + (transactionDate.getMonth() - depositDate.getMonth());
          // Check if it's a multiple of 3 months and within 3 days
          if (monthsDiff % 3 === 0) {
            return Math.abs(transactionDate.getDate() - depositDate.getDate()) <= 3;
          }
        }
        return false;

      case 'Annually':
        // Check if it's near anniversary
        if (account.deposit_date) {
          const depositDate = new Date(account.deposit_date);
          return (
            transactionDate.getMonth() === depositDate.getMonth() &&
            Math.abs(transactionDate.getDate() - depositDate.getDate()) <= 3
          );
        }
        return false;
        
      case 'Fixed_Date':
        // Check if it matches fixed day/month
        if (account.interest_fixed_payment_day && account.interest_fixed_payment_month) {
          return (
            transactionDate.getDate() === account.interest_fixed_payment_day &&
            transactionDate.getMonth() === account.interest_fixed_payment_month - 1
          );
        }
        return false;
        
      case 'At_Maturity':
        // Check if near maturity date
        if (account.term_ends) {
          const maturityDate = new Date(account.term_ends);
          const daysDiff = Math.abs(maturityDate.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24);
          return daysDiff <= 3;
        }
        return false;
        
      default:
        return false;
    }
  }

  /**
   * Get days in the interest period
   */
  private getDaysInPeriod(account: Deposit): number {
    const paymentType = (account as any).interest_payment_type as InterestPaymentType;

    switch (paymentType) {
      case 'Monthly':
        return 30; // Approximate - could be more precise
      case 'Quarterly':
        return 90; // Approximately 3 months
      case 'Annually':
        return 365;
      case 'Fixed_Date':
        return this.getDaysSinceLastPayment(account);
      case 'At_Maturity':
        return this.getDaysToMaturity(account);
      default:
        return 30; // Default to monthly
    }
  }

  /**
   * Calculate days since last interest payment
   */
  private getDaysSinceLastPayment(account: Deposit): number {
    // This would query the last interest transaction
    // For now, return a default
    return 30;
  }

  /**
   * Calculate days to maturity
   */
  private getDaysToMaturity(account: Deposit): number {
    if (!account.term_ends) {
      return 365; // Default if no maturity date
    }

    const today = new Date();
    const maturity = new Date(account.term_ends);
    const diffTime = Math.abs(maturity.getTime() - today.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  /**
   * Calculate next interest payment date
   */
  calculateNextPaymentDate(account: Deposit & InterestConfiguration): Date | null {
    const paymentType = account.interest_payment_type;
    
    switch (paymentType) {
      case 'Monthly':
        if (account.interest_next_payment_date) {
          const nextDate = new Date(account.interest_next_payment_date);
          nextDate.setMonth(nextDate.getMonth() + 1);
          return nextDate;
        }
        // Default to end of current month
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth() + 1, 0);

      case 'Quarterly':
        if (account.interest_next_payment_date) {
          const nextDate = new Date(account.interest_next_payment_date);
          nextDate.setMonth(nextDate.getMonth() + 3);
          return nextDate;
        }
        // Default to 3 months from today
        const quarterly = new Date();
        quarterly.setMonth(quarterly.getMonth() + 3);
        return quarterly;

      case 'Annually':
        if (account.interest_next_payment_date) {
          const nextDate = new Date(account.interest_next_payment_date);
          nextDate.setFullYear(nextDate.getFullYear() + 1);
          return nextDate;
        }
        // Default to one year from today
        const annual = new Date();
        annual.setFullYear(annual.getFullYear() + 1);
        return annual;
      
      case 'Fixed_Date':
        return this.getNextFixedDate(
          account.interest_fixed_payment_day,
          account.interest_fixed_payment_month
        );
      
      case 'At_Maturity':
        return account.term_ends ? new Date(account.term_ends) : null;
      
      default:
        return null;
    }
  }

  /**
   * Get next occurrence of a fixed date
   */
  private getNextFixedDate(day?: number, month?: number): Date | null {
    if (!day || !month) {
      return null;
    }

    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Try this year
    let nextDate = new Date(currentYear, month - 1, day);
    
    // If it's already passed, use next year
    if (nextDate <= today) {
      nextDate = new Date(currentYear + 1, month - 1, day);
    }
    
    return nextDate;
  }

  /**
   * Format fixed payment date for display
   */
  formatFixedPaymentDate(day: number, month: number): string {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const ordinal = this.getOrdinalSuffix(day);
    return `${day}${ordinal} ${monthNames[month - 1]}`;
  }

  /**
   * Get ordinal suffix for a day
   */
  private getOrdinalSuffix(day: number): string {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  /**
   * Check if interest payment is due
   */
  isInterestDue(account: Deposit & InterestConfiguration): boolean {
    const nextPayment = this.calculateNextPaymentDate(account);
    if (!nextPayment) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    nextPayment.setHours(0, 0, 0, 0);
    
    return today >= nextPayment;
  }

  /**
   * Check if variance is significant
   */
  isSignificantVariance(estimated: number, actual: number): boolean {
    if (estimated === 0) return actual !== 0;
    
    const variance = Math.abs(actual - estimated);
    const percentVariance = (variance / estimated) * 100;
    
    // Flag if variance is more than 5% or £1 (whichever is greater)
    return percentVariance > 5 || variance > 1;
  }

  /**
   * Process interest payment and create transactions
   */
  async processInterestPayment(
    account: Deposit & InterestConfiguration,
    interestAmount: number
  ): Promise<{ success: boolean; error?: string }> {
    const destination = account.interest_payment_destination || 'Same_Account';
    
    try {
      if (destination === 'Same_Account') {
        // Single credit transaction
        const result = await this.transactionService.createTransaction({
          account_id: account.id!,
          transaction_date: new Date().toISOString().split('T')[0],
          bank_date: new Date().toISOString().split('T')[0],
          transaction_type: 'interest',
          credit: interestAmount,
          balance_after: (account.balance || 0) + interestAmount,
          estimated_amount: this.calculateEstimatedInterest(account),
          optional_notes: `Interest payment credited to account`,
          source: 'system'
        });
        
        if (!result.success) {
          return { success: false, error: result.error };
        }
      } else {
        // Determine destination account
        const destAccountId = destination === 'Other_Account_Same_Bank'
          ? account.interest_payment_account_id
          : account.designated_account_id;
        
        if (!destAccountId) {
          return { success: false, error: 'Destination account not configured' };
        }
        
        // Get destination account details
        const destAccount = await this.getAccountById(destAccountId);
        if (!destAccount) {
          return { success: false, error: 'Destination account not found' };
        }
        
        // Debit from savings account (interest paid out)
        const debitResult = await this.transactionService.createTransaction({
          account_id: account.id!,
          transaction_date: new Date().toISOString().split('T')[0],
          bank_date: new Date().toISOString().split('T')[0],
          transaction_type: 'interest',
          debit: interestAmount,
          balance_after: account.balance, // Balance unchanged as interest paid elsewhere
          estimated_amount: this.calculateEstimatedInterest(account),
          optional_notes: `Interest £${interestAmount.toFixed(2)} paid to ${destAccount.bank} ${destAccount.account_name || destAccount.type}`,
          source: 'system'
        });
        
        if (!debitResult.success) {
          return { success: false, error: debitResult.error };
        }
        
        // Credit to destination account
        const creditResult = await this.transactionService.createTransaction({
          account_id: destAccountId,
          transaction_date: new Date().toISOString().split('T')[0],
          bank_date: new Date().toISOString().split('T')[0],
          transaction_type: 'deposit',
          credit: interestAmount,
          balance_after: (destAccount.balance || 0) + interestAmount,
          reference: `INT-${account.id}-${new Date().toISOString().split('T')[0]}`,
          optional_notes: `Interest £${interestAmount.toFixed(2)} from ${account.bank} ${account.account_name || account.type}`,
          source: 'system'
        });
        
        if (!creditResult.success) {
          return { success: false, error: creditResult.error };
        }
      }
      
      // Update next payment date
      if (account.interest_payment_type && account.interest_payment_type !== 'At_Maturity') {
        const nextDate = this.calculateNextPaymentDate(account);
        if (nextDate) {
          await this.updateNextPaymentDate(account.id!, nextDate);
        }
      }
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get interest payment analysis
   */
  async getInterestPaymentAnalysis(accountId: number): Promise<InterestPaymentAnalysis[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          at.account_id,
          md.bank as bank_name,
          md.account_name,
          at.bank_date as payment_date,
          at.credit as actual_amount,
          at.estimated_amount,
          (at.credit - at.estimated_amount) as variance,
          CASE 
            WHEN at.estimated_amount > 0 
            THEN ROUND(((at.credit - at.estimated_amount) / at.estimated_amount) * 100, 2)
            ELSE NULL
          END as variance_percentage,
          at.variance_notes,
          md.aer as current_rate
        FROM account_transactions at
        JOIN my_deposits md ON at.account_id = md.id
        WHERE at.account_id = ?
          AND at.transaction_type = 'interest'
          AND at.credit IS NOT NULL
        ORDER BY at.bank_date DESC
        LIMIT 12
      `;

      this.db.all(query, [accountId], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Analyze variance patterns to detect rate changes
   */
  async analyzeVariancePattern(accountId: number): Promise<InterestVarianceAnalysis> {
    const recentPayments = await this.getInterestPaymentAnalysis(accountId);
    
    if (recentPayments.length === 0) {
      return {
        account_id: accountId,
        average_variance: 0,
        trend: 'stable',
        possible_rate_change: false,
        recent_payments: []
      };
    }
    
    // Calculate variances
    const variances = recentPayments
      .filter(p => p.variance !== null && p.variance !== undefined)
      .map(p => p.variance!);
    
    if (variances.length === 0) {
      return {
        account_id: accountId,
        average_variance: 0,
        trend: 'stable',
        possible_rate_change: false,
        recent_payments: recentPayments
      };
    }
    
    // Calculate average variance
    const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
    
    // Detect trend
    const trend = this.detectTrend(variances);
    
    // Check for possible rate change
    const possibleRateChange = Math.abs(avgVariance) > 2 || 
                               (trend !== 'stable' && variances.length >= 3);
    
    // Generate recommendation
    const recommendedAction = this.getRecommendedAction(avgVariance, trend, possibleRateChange);
    
    return {
      account_id: accountId,
      average_variance: avgVariance,
      trend: trend,
      possible_rate_change: possibleRateChange,
      recommended_action: recommendedAction,
      recent_payments: recentPayments
    };
  }

  /**
   * Detect trend in variance data
   */
  private detectTrend(variances: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (variances.length < 3) {
      return 'stable';
    }
    
    // Simple trend detection - compare first half with second half
    const midpoint = Math.floor(variances.length / 2);
    const firstHalf = variances.slice(0, midpoint);
    const secondHalf = variances.slice(midpoint);
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const difference = secondAvg - firstAvg;
    
    if (Math.abs(difference) < 0.5) {
      return 'stable';
    } else if (difference > 0) {
      return 'increasing';
    } else {
      return 'decreasing';
    }
  }

  /**
   * Get recommended action based on variance analysis
   */
  private getRecommendedAction(
    avgVariance: number,
    trend: 'increasing' | 'decreasing' | 'stable',
    possibleRateChange: boolean
  ): string {
    if (possibleRateChange) {
      if (avgVariance < -2) {
        return 'Interest payments are consistently lower than expected. Check if the bank has reduced the interest rate.';
      } else if (avgVariance > 2) {
        return 'Interest payments are consistently higher than expected. Verify the current rate with the bank.';
      }
    }
    
    if (trend === 'decreasing' && avgVariance < 0) {
      return 'Interest payments are trending lower. Monitor for potential rate changes.';
    } else if (trend === 'increasing' && avgVariance > 0) {
      return 'Interest payments are trending higher. This could indicate a rate increase or balance growth.';
    }
    
    return 'Interest payments are consistent with expectations.';
  }

  /**
   * Update interest configuration for an account
   */
  async updateInterestConfiguration(
    accountId: number,
    config: InterestConfiguration
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve, reject) => {
      const updateFields: string[] = [];
      const params: any[] = [];

      // Build update query dynamically
      if (config.interest_payment_type !== undefined) {
        updateFields.push('interest_payment_type = ?');
        params.push(config.interest_payment_type);
      }
      if (config.interest_next_payment_date !== undefined) {
        updateFields.push('interest_next_payment_date = ?');
        params.push(config.interest_next_payment_date);
      }
      if (config.interest_fixed_payment_day !== undefined) {
        updateFields.push('interest_fixed_payment_day = ?');
        params.push(config.interest_fixed_payment_day);
      }
      if (config.interest_fixed_payment_month !== undefined) {
        updateFields.push('interest_fixed_payment_month = ?');
        params.push(config.interest_fixed_payment_month);
      }
      if (config.interest_payment_destination !== undefined) {
        updateFields.push('interest_payment_destination = ?');
        params.push(config.interest_payment_destination);
      }
      if (config.interest_payment_account_id !== undefined) {
        updateFields.push('interest_payment_account_id = ?');
        params.push(config.interest_payment_account_id);
      }
      if (config.designated_account_id !== undefined) {
        updateFields.push('designated_account_id = ?');
        params.push(config.designated_account_id);
      }

      if (updateFields.length === 0) {
        resolve({ success: false, error: 'No fields to update' });
        return;
      }

      params.push(accountId);
      const query = `
        UPDATE my_deposits
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;

      this.db.run(query, params, function(err) {
        if (err) {
          resolve({ success: false, error: err.message });
        } else if (this.changes === 0) {
          resolve({ success: false, error: 'Account not found' });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  /**
   * Get account by ID
   */
  private async getAccountById(accountId: number): Promise<Deposit | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM my_deposits WHERE id = ?',
        [accountId],
        (err, row: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }

  /**
   * Update next payment date
   */
  private async updateNextPaymentDate(
    accountId: number,
    nextDate: Date
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE my_deposits SET interest_next_payment_date = ? WHERE id = ?',
        [nextDate.toISOString().split('T')[0], accountId],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Get accounts with upcoming interest payments
   */
  async getUpcomingInterestPayments(daysAhead: number = 7): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          id,
          bank,
          account_name,
          type,
          sub_type,
          balance,
          aer,
          interest_payment_type,
          interest_next_payment_date,
          interest_fixed_payment_day,
          interest_fixed_payment_month,
          interest_payment_destination
        FROM my_deposits
        WHERE is_active = 1
          AND interest_payment_type IS NOT NULL
          AND (
            (interest_next_payment_date IS NOT NULL 
             AND JULIANDAY(interest_next_payment_date) - JULIANDAY('now') <= ?)
            OR
            (interest_payment_type = 'At_Maturity' 
             AND term_ends IS NOT NULL
             AND JULIANDAY(term_ends) - JULIANDAY('now') <= ?)
          )
        ORDER BY 
          CASE 
            WHEN interest_next_payment_date IS NOT NULL THEN interest_next_payment_date
            WHEN term_ends IS NOT NULL THEN term_ends
            ELSE DATE('now', '+1 year')
          END
      `;

      this.db.all(query, [daysAhead, daysAhead], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Detect potential rate changes based on payment patterns
   */
  async detectRateChange(accountId: number, lookbackMonths: number = 6): Promise<{
    rateChangeDetected: boolean;
    estimatedOldRate?: number;
    estimatedNewRate?: number;
    changeDate?: string;
    confidence: number;
  }> {
    const payments = await this.getInterestPaymentAnalysis(accountId);
    
    if (payments.length < 3) {
      return { rateChangeDetected: false, confidence: 0 };
    }

    // Group payments by estimated rate
    const estimatedRates: { date: string; rate: number; amount: number }[] = [];
    
    for (const payment of payments) {
      if (payment.actual_amount && payment.current_rate) {
        // Use the current rate from the payment analysis
        estimatedRates.push({
          date: payment.payment_date,
          rate: payment.current_rate,
          amount: payment.actual_amount
        });
      }
    }

    if (estimatedRates.length < 3) {
      return { rateChangeDetected: false, confidence: 0 };
    }

    // Look for significant rate changes
    let maxRateDiff = 0;
    let changeIndex = -1;
    
    for (let i = 1; i < estimatedRates.length; i++) {
      const rateDiff = Math.abs(estimatedRates[i].rate - estimatedRates[i - 1].rate);
      if (rateDiff > maxRateDiff && rateDiff > 0.25) { // More than 0.25% change
        maxRateDiff = rateDiff;
        changeIndex = i;
      }
    }

    if (changeIndex > 0 && maxRateDiff > 0.25) {
      const beforeRates = estimatedRates.slice(0, changeIndex).map(r => r.rate);
      const afterRates = estimatedRates.slice(changeIndex).map(r => r.rate);
      
      const avgBefore = beforeRates.reduce((a, b) => a + b, 0) / beforeRates.length;
      const avgAfter = afterRates.reduce((a, b) => a + b, 0) / afterRates.length;
      
      // Calculate confidence based on consistency
      const beforeVariance = this.calculateVariance(beforeRates);
      const afterVariance = this.calculateVariance(afterRates);
      const confidence = Math.max(0, Math.min(100, 100 - (beforeVariance + afterVariance) * 10));

      return {
        rateChangeDetected: true,
        estimatedOldRate: avgBefore,
        estimatedNewRate: avgAfter,
        changeDate: estimatedRates[changeIndex].date,
        confidence: confidence
      };
    }

    return { rateChangeDetected: false, confidence: 0 };
  }

  /**
   * Calculate variance of an array of numbers
   */
  private calculateVariance(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
    
    return variance;
  }

  /**
   * Detect missed interest payments
   */
  async detectMissedPayments(daysOverdue: number = 3): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          d.*,
          CASE 
            WHEN d.interest_next_payment_date IS NOT NULL 
            THEN CAST((julianday('now') - julianday(d.interest_next_payment_date)) AS INTEGER)
            ELSE 0
          END as days_overdue
        FROM my_deposits d
        WHERE d.is_active = 1
          AND d.interest_payment_type IS NOT NULL
          AND d.interest_next_payment_date IS NOT NULL
          AND date(d.interest_next_payment_date) < date('now', '-' || ? || ' days')
        ORDER BY days_overdue DESC
      `;

      this.db.all(query, [daysOverdue], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Automatically process and categorize interest payments
   */
  async processInterestPayments(accountId: number): Promise<number> {
    return new Promise((resolve, reject) => {
      // Get all credit transactions that might be interest
      const query = `
        SELECT * FROM account_transactions
        WHERE account_id = ?
          AND credit > 0
          AND transaction_type != 'interest'
          AND bank_date >= date('now', '-6 months')
        ORDER BY bank_date DESC
      `;

      this.db.all(query, [accountId], async (err, transactions: Transaction[]) => {
        if (err) {
          reject(err);
          return;
        }

        // Get account details
        const accountQuery = 'SELECT * FROM my_deposits WHERE id = ?';
        this.db.get(accountQuery, [accountId], async (err, account: Deposit) => {
          if (err) {
            reject(err);
            return;
          }

          let updatedCount = 0;
          for (const transaction of transactions) {
            const isInterest = await this.detectInterestPayment(transaction, account);
            if (isInterest && transaction.id) {
              // Update transaction type to interest
              await this.transactionService.updateTransaction(transaction.id, {
                transaction_type: 'interest'
              });
              updatedCount++;
            }
          }

          resolve(updatedCount);
        });
      });
    });
  }
}
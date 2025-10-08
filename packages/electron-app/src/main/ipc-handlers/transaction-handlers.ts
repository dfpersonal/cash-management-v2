import { ipcMain } from 'electron';
import { Database } from 'sqlite3';
import { TransactionService } from '@cash-mgmt/shared';
import { ReconciliationService } from '@cash-mgmt/shared';
import { InterestPaymentService } from '@cash-mgmt/shared';
import { InterestEventService } from '@cash-mgmt/shared';
import {
  Transaction,
  TransactionForm,
  TransactionFilters,
  ReconciliationSession,
  InterestConfiguration,
  InterestEventConfig
} from '@cash-mgmt/shared';

/**
 * Register all transaction-related IPC handlers
 */
export function registerTransactionHandlers(db: Database): void {
  const transactionService = new TransactionService(db);
  const reconciliationService = new ReconciliationService(db);
  const interestPaymentService = new InterestPaymentService(db);
  const interestEventService = new InterestEventService(db);

  // ============================================
  // TRANSACTION HANDLERS
  // ============================================

  /**
   * Get transactions for an account
   */
  ipcMain.handle('get-account-transactions', async (_, accountId: number, filters?: TransactionFilters) => {
    try {
      return await transactionService.getAccountTransactions(accountId, filters);
    } catch (error: any) {
      console.error('Error getting account transactions:', error);
      throw error;
    }
  });

  /**
   * Create a new transaction
   */
  ipcMain.handle('create-transaction', async (_, transaction: Partial<Transaction>) => {
    try {
      console.log('📨 IPC: create-transaction called with data:', JSON.stringify(transaction, null, 2));
      const result = await transactionService.createTransaction(transaction);
      console.log('📤 IPC: create-transaction result:', JSON.stringify(result, null, 2));
      return result;
    } catch (error: any) {
      console.error('❌ IPC: Error creating transaction:', error);
      throw error;
    }
  });

  /**
   * Verify balance consistency for an account
   */
  ipcMain.handle('verify-balance-consistency', async (_, accountId: number) => {
    try {
      return await transactionService.verifyBalanceConsistency(accountId);
    } catch (error: any) {
      console.error('Error verifying balance consistency:', error);
      throw error;
    }
  });

  /**
   * Update an existing transaction
   */
  ipcMain.handle('update-transaction', async (_, id: number, updates: Partial<Transaction>) => {
    try {
      return await transactionService.updateTransaction(id, updates);
    } catch (error: any) {
      console.error('Error updating transaction:', error);
      throw error;
    }
  });

  /**
   * Delete a transaction
   */
  ipcMain.handle('delete-transaction', async (_, id: number) => {
    try {
      return await transactionService.deleteTransaction(id);
    } catch (error: any) {
      console.error('Error deleting transaction:', error);
      throw error;
    }
  });

  /**
   * Recalculate balances for an account
   */
  ipcMain.handle('recalculate-balances', async (_, accountId: number, fromDate?: string) => {
    try {
      return await transactionService.recalculateBalances(accountId, fromDate);
    } catch (error: any) {
      console.error('Error recalculating balances:', error);
      throw error;
    }
  });

  /**
   * Get transaction summary for an account
   */
  ipcMain.handle('get-transaction-summary', async (_, accountId: number, startDate?: string, endDate?: string) => {
    try {
      return await transactionService.getTransactionSummary(accountId, startDate, endDate);
    } catch (error: any) {
      console.error('Error getting transaction summary:', error);
      throw error;
    }
  });

  /**
   * Create transaction from balance change
   */
  ipcMain.handle('create-transaction-from-balance-change', 
    async (_, accountId: number, oldBalance: number, newBalance: number, context: string, notes?: string) => {
      try {
        return await transactionService.createFromBalanceChange(accountId, oldBalance, newBalance, context, notes);
      } catch (error: any) {
        console.error('Error creating transaction from balance change:', error);
        throw error;
      }
    }
  );

  /**
   * Create transaction from audit log entry
   */
  ipcMain.handle('create-transaction-from-audit', async (_, auditEntry: any) => {
    try {
      return await transactionService.createFromAuditLog(auditEntry);
    } catch (error: any) {
      console.error('Error creating transaction from audit log:', error);
      throw error;
    }
  });

  /**
   * Seed transactions from audit log
   */
  ipcMain.handle('seed-transactions-from-audit', async () => {
    try {
      return await transactionService.seedFromAuditLog();
    } catch (error: any) {
      console.error('Error seeding transactions from audit log:', error);
      throw error;
    }
  });

  /**
   * Get unreconciled transactions
   */
  ipcMain.handle('get-unreconciled-transactions', async (_, accountId: number) => {
    try {
      return await transactionService.getUnreconciledTransactions(accountId);
    } catch (error: any) {
      console.error('Error getting unreconciled transactions:', error);
      throw error;
    }
  });

  // ============================================
  // RECONCILIATION HANDLERS
  // ============================================

  /**
   * Start a reconciliation session
   */
  ipcMain.handle('start-reconciliation', 
    async (_, accountId: number, statementDate: string, statementBalance: number, createdBy?: string) => {
      try {
        return await reconciliationService.startSession(accountId, statementDate, statementBalance, createdBy);
      } catch (error: any) {
        console.error('Error starting reconciliation:', error);
        throw error;
      }
    }
  );

  /**
   * Get current reconciliation session
   */
  ipcMain.handle('get-current-reconciliation', async (_, accountId: number) => {
    try {
      return await reconciliationService.getCurrentSession(accountId);
    } catch (error: any) {
      console.error('Error getting current reconciliation:', error);
      throw error;
    }
  });

  /**
   * Reconcile transactions
   */
  ipcMain.handle('reconcile-transactions', async (_, sessionId: number, transactionIds: number[]) => {
    try {
      return await reconciliationService.reconcileTransactions(sessionId, transactionIds);
    } catch (error: any) {
      console.error('Error reconciling transactions:', error);
      throw error;
    }
  });

  /**
   * Complete reconciliation session
   */
  ipcMain.handle('complete-reconciliation', 
    async (_, sessionId: number, notes?: string, completedBy?: string) => {
      try {
        return await reconciliationService.completeSession(sessionId, notes, completedBy);
      } catch (error: any) {
        console.error('Error completing reconciliation:', error);
        throw error;
      }
    }
  );

  /**
   * Cancel reconciliation session
   */
  ipcMain.handle('cancel-reconciliation', async (_, sessionId: number) => {
    try {
      return await reconciliationService.cancelSession(sessionId);
    } catch (error: any) {
      console.error('Error canceling reconciliation:', error);
      throw error;
    }
  });

  /**
   * Get reconciliation history
   */
  ipcMain.handle('get-reconciliation-history', async (_, accountId: number, limit?: number) => {
    try {
      return await reconciliationService.getReconciliationHistory(accountId, limit);
    } catch (error: any) {
      console.error('Error getting reconciliation history:', error);
      throw error;
    }
  });

  /**
   * Get reconciliation summary
   */
  ipcMain.handle('get-reconciliation-summary', async () => {
    try {
      return await reconciliationService.getReconciliationSummary();
    } catch (error: any) {
      console.error('Error getting reconciliation summary:', error);
      throw error;
    }
  });

  /**
   * Get reconciliation wizard state
   */
  ipcMain.handle('get-reconciliation-wizard-state', async (_, sessionId: number) => {
    try {
      return await reconciliationService.getWizardState(sessionId);
    } catch (error: any) {
      console.error('Error getting wizard state:', error);
      throw error;
    }
  });

  /**
   * Add reconciliation adjustment
   */
  ipcMain.handle('add-reconciliation-adjustment', async (_, sessionId: number, adjustment: TransactionForm) => {
    try {
      return await reconciliationService.addAdjustment(sessionId, adjustment);
    } catch (error: any) {
      console.error('Error adding adjustment:', error);
      throw error;
    }
  });

  /**
   * Auto-match transactions
   */
  ipcMain.handle('auto-match-transactions', async (_, sessionId: number, tolerance?: number) => {
    try {
      return await reconciliationService.autoMatchTransactions(sessionId, tolerance);
    } catch (error: any) {
      console.error('Error auto-matching transactions:', error);
      throw error;
    }
  });

  // ============================================
  // INTEREST PAYMENT HANDLERS
  // ============================================

  /**
   * Calculate estimated interest
   */
  ipcMain.handle('calculate-estimated-interest', async (_, account: any) => {
    try {
      return interestPaymentService.calculateEstimatedInterest(account);
    } catch (error: any) {
      console.error('Error calculating estimated interest:', error);
      throw error;
    }
  });

  /**
   * Calculate next payment date
   */
  ipcMain.handle('calculate-next-payment-date', async (_, account: any) => {
    try {
      const nextDate = interestPaymentService.calculateNextPaymentDate(account);
      return nextDate ? nextDate.toISOString().split('T')[0] : null;
    } catch (error: any) {
      console.error('Error calculating next payment date:', error);
      throw error;
    }
  });

  /**
   * Process interest payment
   */
  ipcMain.handle('process-interest-payment', async (_, account: any, interestAmount: number) => {
    try {
      return await interestPaymentService.processInterestPayment(account, interestAmount);
    } catch (error: any) {
      console.error('Error processing interest payment:', error);
      throw error;
    }
  });

  /**
   * Get interest payment analysis
   */
  ipcMain.handle('get-interest-payment-analysis', async (_, accountId: number) => {
    try {
      return await interestPaymentService.getInterestPaymentAnalysis(accountId);
    } catch (error: any) {
      console.error('Error getting interest payment analysis:', error);
      throw error;
    }
  });

  /**
   * Analyze variance pattern
   */
  ipcMain.handle('analyze-variance-pattern', async (_, accountId: number) => {
    try {
      return await interestPaymentService.analyzeVariancePattern(accountId);
    } catch (error: any) {
      console.error('Error analyzing variance pattern:', error);
      throw error;
    }
  });

  /**
   * Update interest configuration
   */
  ipcMain.handle('update-interest-configuration', async (_, accountId: number, config: InterestConfiguration) => {
    try {
      return await interestPaymentService.updateInterestConfiguration(accountId, config);
    } catch (error: any) {
      console.error('Error updating interest configuration:', error);
      throw error;
    }
  });

  /**
   * Check if interest is due
   */
  ipcMain.handle('check-interest-due', async (_, account: any) => {
    try {
      return interestPaymentService.isInterestDue(account);
    } catch (error: any) {
      console.error('Error checking if interest is due:', error);
      throw error;
    }
  });

  /**
   * Get upcoming interest payments
   */
  ipcMain.handle('get-upcoming-interest-payments', async (_, daysAhead?: number) => {
    try {
      return await interestPaymentService.getUpcomingInterestPayments(daysAhead);
    } catch (error: any) {
      console.error('Error getting upcoming interest payments:', error);
      throw error;
    }
  });

  // ============================================
  // INTEREST EVENT HANDLERS
  // ============================================

  /**
   * Get interest event configuration
   */
  ipcMain.handle('get-interest-event-config', async () => {
    try {
      return await interestEventService.getConfig();
    } catch (error: any) {
      console.error('Error getting interest event config:', error);
      throw error;
    }
  });

  /**
   * Update interest event configuration
   */
  ipcMain.handle('update-interest-event-config', async (_, key: string, value: string) => {
    try {
      return await interestEventService.updateConfig(key, value);
    } catch (error: any) {
      console.error('Error updating interest event config:', error);
      throw error;
    }
  });

  /**
   * Generate interest event for account
   */
  ipcMain.handle('generate-interest-event', async (_, account: any) => {
    try {
      return await interestEventService.generateInterestEvent(account);
    } catch (error: any) {
      console.error('Error generating interest event:', error);
      throw error;
    }
  });

  /**
   * Check for missed payments
   */
  ipcMain.handle('check-missed-payments', async () => {
    try {
      return await interestEventService.checkMissedPayments();
    } catch (error: any) {
      console.error('Error checking missed payments:', error);
      throw error;
    }
  });

  /**
   * Create missed payment alert
   */
  ipcMain.handle('create-missed-payment-alert', async (_, account: any) => {
    try {
      return await interestEventService.createMissedPaymentAlert(account);
    } catch (error: any) {
      console.error('Error creating missed payment alert:', error);
      throw error;
    }
  });

  /**
   * Get pending interest events
   */
  ipcMain.handle('get-pending-interest-events', async (_, daysAhead?: number) => {
    try {
      return await interestEventService.getPendingInterestEvents(daysAhead);
    } catch (error: any) {
      console.error('Error getting pending interest events:', error);
      throw error;
    }
  });

  /**
   * Process all pending events
   */
  ipcMain.handle('process-pending-interest-events', async () => {
    try {
      return await interestEventService.processAllPendingEvents();
    } catch (error: any) {
      console.error('Error processing pending interest events:', error);
      throw error;
    }
  });

  console.log('[Info] Transaction IPC handlers registered successfully');
}
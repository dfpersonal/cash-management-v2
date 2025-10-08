import { Database } from 'sqlite3';
import {
  ReconciliationSession,
  ReconciliationStatus,
  ReconciliationSummary,
  ReconciliationWizardState,
  ReconciliationResponse,
  Transaction,
  TransactionForm
} from '../types/TransactionTypes';
import { TransactionService } from './TransactionService';

export class ReconciliationService {
  private db: Database;
  private transactionService: TransactionService;

  constructor(database: Database) {
    this.db = database;
    this.transactionService = new TransactionService(database);
  }

  /**
   * Start a new reconciliation session
   */
  async startSession(
    accountId: number,
    statementDate: string,
    statementBalance: number,
    createdBy?: string
  ): Promise<ReconciliationResponse> {
    return new Promise((resolve, reject) => {
      // Check for existing in-progress session
      this.db.get(
        `SELECT id FROM reconciliation_sessions 
         WHERE account_id = ? AND status = 'in_progress'`,
        [accountId],
        (err, existing: any) => {
          if (err) {
            resolve({ success: false, error: err.message });
            return;
          }

          if (existing) {
            resolve({ 
              success: false, 
              error: 'An existing reconciliation session is already in progress for this account' 
            });
            return;
          }

          // Calculate current balance from transactions
          this.calculateAccountBalance(accountId, statementDate).then(calculatedBalance => {
            const discrepancy = statementBalance - calculatedBalance;

            // Create new session
            const query = `
              INSERT INTO reconciliation_sessions (
                account_id, statement_date, statement_balance,
                calculated_balance, discrepancy, status, created_by
              ) VALUES (?, ?, ?, ?, ?, 'in_progress', ?)
            `;

            this.db.run(
              query,
              [accountId, statementDate, statementBalance, calculatedBalance, discrepancy, createdBy || 'system'],
              function(err) {
                if (err) {
                  resolve({ success: false, error: err.message });
                } else {
                  resolve({
                    success: true,
                    session: {
                      id: this.lastID,
                      account_id: accountId,
                      statement_date: statementDate,
                      statement_balance: statementBalance,
                      calculated_balance: calculatedBalance,
                      discrepancy: discrepancy,
                      status: 'in_progress',
                      created_by: createdBy || 'system'
                    }
                  });
                }
              }
            );
          }).catch(error => {
            resolve({ success: false, error: error.message });
          });
        }
      );
    });
  }

  /**
   * Get current reconciliation session for an account
   */
  async getCurrentSession(accountId: number): Promise<ReconciliationSession | null> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM reconciliation_sessions
        WHERE account_id = ? AND status = 'in_progress'
        ORDER BY created_at DESC
        LIMIT 1
      `;

      this.db.get(query, [accountId], (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  /**
   * Mark transactions as reconciled
   */
  async reconcileTransactions(
    sessionId: number,
    transactionIds: number[]
  ): Promise<{ success: boolean; reconciled: number; error?: string }> {
    return new Promise((resolve, reject) => {
      let reconciled = 0;
      const errors: string[] = [];

      // Process each transaction
      const promises = transactionIds.map(transactionId => {
        return this.transactionService.markReconciled(transactionId, sessionId)
          .then(result => {
            if (result.success) {
              reconciled++;
            } else if (result.error) {
              errors.push(result.error);
            }
          });
      });

      Promise.all(promises).then(() => {
        if (errors.length > 0) {
          resolve({
            success: false,
            reconciled,
            error: errors.join('; ')
          });
        } else {
          resolve({
            success: true,
            reconciled
          });
        }
      });
    });
  }

  /**
   * Complete a reconciliation session
   */
  async completeSession(
    sessionId: number,
    notes?: string,
    completedBy?: string
  ): Promise<ReconciliationResponse> {
    return new Promise((resolve, reject) => {
      // Get session details
      this.db.get(
        'SELECT * FROM reconciliation_sessions WHERE id = ?',
        [sessionId],
        (err, session: any) => {
          if (err) {
            resolve({ success: false, error: err.message });
            return;
          }

          if (!session) {
            resolve({ success: false, error: 'Session not found' });
            return;
          }

          if (session.status !== 'in_progress') {
            resolve({ success: false, error: 'Session is not in progress' });
            return;
          }

          // Recalculate final discrepancy
          this.calculateAccountBalance(session.account_id, session.statement_date)
            .then(calculatedBalance => {
              const finalDiscrepancy = session.statement_balance - calculatedBalance;
              const status: ReconciliationStatus = 
                Math.abs(finalDiscrepancy) < 0.01 ? 'completed' : 'discrepancy';

              // Update session
              const updateQuery = `
                UPDATE reconciliation_sessions
                SET status = ?,
                    calculated_balance = ?,
                    discrepancy = ?,
                    completed_at = CURRENT_TIMESTAMP,
                    completed_by = ?,
                    notes = ?
                WHERE id = ?
              `;

              this.db.run(
                updateQuery,
                [status, calculatedBalance, finalDiscrepancy, completedBy || 'system', notes, sessionId],
                function(err) {
                  if (err) {
                    resolve({ success: false, error: err.message });
                  } else {
                    resolve({
                      success: true,
                      session: {
                        ...session,
                        status,
                        calculated_balance: calculatedBalance,
                        discrepancy: finalDiscrepancy,
                        completed_by: completedBy || 'system',
                        notes
                      }
                    });
                  }
                }
              );
            })
            .catch(error => {
              resolve({ success: false, error: error.message });
            });
        }
      );
    });
  }

  /**
   * Cancel a reconciliation session
   */
  async cancelSession(sessionId: number): Promise<ReconciliationResponse> {
    return new Promise((resolve, reject) => {
      // Remove reconciliation marks from transactions
      const updateTransactions = `
        UPDATE account_transactions
        SET reconciled = 0,
            reconciled_date = NULL,
            reconciliation_session_id = NULL
        WHERE reconciliation_session_id = ?
      `;

      this.db.run(updateTransactions, [sessionId], (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
          return;
        }

        // Delete the session
        this.db.run(
          'DELETE FROM reconciliation_sessions WHERE id = ?',
          [sessionId],
          function(err) {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    });
  }

  /**
   * Get reconciliation history for an account
   */
  async getReconciliationHistory(
    accountId: number,
    limit: number = 10
  ): Promise<ReconciliationSession[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM reconciliation_sessions
        WHERE account_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `;

      this.db.all(query, [accountId, limit], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get last successful reconciliation for an account
   */
  async getLastReconciliation(accountId: number): Promise<ReconciliationSession | null> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM reconciliation_sessions
        WHERE account_id = ? AND status = 'completed'
        ORDER BY statement_date DESC
        LIMIT 1
      `;

      this.db.get(query, [accountId], (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  /**
   * Get reconciliation summary for all accounts
   */
  async getReconciliationSummary(): Promise<ReconciliationSummary[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          md.id as account_id,
          md.bank as bank_name,
          md.account_name,
          md.balance as current_balance,
          MAX(rs.statement_date) as last_reconciled_date,
          COUNT(DISTINCT rs.id) as reconciliation_count,
          COUNT(CASE WHEN at.reconciled = 0 THEN 1 END) as unreconciled_transactions,
          CAST(JULIANDAY('now') - JULIANDAY(MAX(rs.statement_date)) AS INTEGER) as days_since_reconciliation
        FROM my_deposits md
        LEFT JOIN reconciliation_sessions rs 
          ON md.id = rs.account_id AND rs.status = 'completed'
        LEFT JOIN account_transactions at 
          ON md.id = at.account_id
        WHERE md.is_active = 1
        GROUP BY md.id, md.bank, md.account_name, md.balance
        ORDER BY days_since_reconciliation DESC NULLS FIRST
      `;

      this.db.all(query, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get wizard state for reconciliation UI
   */
  async getWizardState(sessionId: number): Promise<ReconciliationWizardState | null> {
    return new Promise((resolve, reject) => {
      // Get session
      this.db.get(
        'SELECT * FROM reconciliation_sessions WHERE id = ?',
        [sessionId],
        async (err, session: any) => {
          if (err || !session) {
            resolve(null);
            return;
          }

          // Get unreconciled transactions
          const unreconciled = await this.transactionService.getUnreconciledTransactions(
            session.account_id
          );

          // Get matched transaction IDs
          const matchedQuery = `
            SELECT id FROM account_transactions
            WHERE reconciliation_session_id = ?
          `;

          this.db.all(matchedQuery, [sessionId], (err, matched: any[]) => {
            if (err) {
              reject(err);
            } else {
              resolve({
                session,
                unreconciled_transactions: unreconciled,
                matched_transaction_ids: matched.map(m => m.id),
                discrepancy_amount: session.discrepancy,
                adjustments: []
              });
            }
          });
        }
      );
    });
  }

  /**
   * Add adjustment transaction during reconciliation
   */
  async addAdjustment(
    sessionId: number,
    adjustment: TransactionForm
  ): Promise<ReconciliationResponse> {
    return new Promise(async (resolve, reject) => {
      // Get session
      const session = await this.getSessionById(sessionId);
      if (!session) {
        resolve({ success: false, error: 'Session not found' });
        return;
      }

      // Create adjustment transaction
      const transaction: Partial<Transaction> = {
        account_id: adjustment.account_id,
        transaction_date: adjustment.transaction_date.toISOString().split('T')[0],
        bank_date: adjustment.bank_date?.toISOString().split('T')[0] || 
                   adjustment.transaction_date.toISOString().split('T')[0],
        transaction_type: 'adjustment',
        debit: adjustment.is_debit ? adjustment.amount : undefined,
        credit: !adjustment.is_debit ? adjustment.amount : undefined,
        reference: adjustment.reference,
        optional_notes: adjustment.optional_notes || 'Reconciliation adjustment',
        source: 'manual',
        reconciled: true,
        reconciled_date: new Date().toISOString().split('T')[0],
        reconciliation_session_id: sessionId
      };

      const result = await this.transactionService.createTransaction(transaction);
      
      if (result.success) {
        // Update session adjustments
        const adjustments = JSON.parse(session.adjustments_made || '[]');
        adjustments.push({
          transaction_id: result.transaction?.id,
          amount: adjustment.amount,
          is_debit: adjustment.is_debit,
          notes: adjustment.optional_notes
        });

        this.db.run(
          'UPDATE reconciliation_sessions SET adjustments_made = ? WHERE id = ?',
          [JSON.stringify(adjustments), sessionId],
          (err) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({ success: true });
            }
          }
        );
      } else {
        resolve(result);
      }
    });
  }

  /**
   * Calculate account balance up to a specific date
   */
  private async calculateAccountBalance(
    accountId: number,
    upToDate: string
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT SUM(COALESCE(credit, 0) - COALESCE(debit, 0)) as balance
        FROM account_transactions
        WHERE account_id = ? AND bank_date <= ?
      `;

      this.db.get(query, [accountId, upToDate], (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row?.balance || 0);
        }
      });
    });
  }

  /**
   * Get session by ID
   */
  private async getSessionById(sessionId: number): Promise<ReconciliationSession | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM reconciliation_sessions WHERE id = ?',
        [sessionId],
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
   * Auto-match transactions for reconciliation
   */
  async autoMatchTransactions(
    sessionId: number,
    tolerance: number = 0.01
  ): Promise<{ matched: number; suggestions: any[] }> {
    return new Promise(async (resolve, reject) => {
      const session = await this.getSessionById(sessionId);
      if (!session) {
        resolve({ matched: 0, suggestions: [] });
        return;
      }

      // Get unreconciled transactions near statement date
      const query = `
        SELECT * FROM account_transactions
        WHERE account_id = ?
          AND reconciled = 0
          AND ABS(JULIANDAY(bank_date) - JULIANDAY(?)) <= 7
        ORDER BY ABS(JULIANDAY(bank_date) - JULIANDAY(?))
      `;

      this.db.all(
        query,
        [session.account_id, session.statement_date, session.statement_date],
        (err, transactions: any[]) => {
          if (err) {
            resolve({ matched: 0, suggestions: [] });
            return;
          }

          const suggestions = transactions.map(t => ({
            transaction_id: t.id,
            confidence: this.calculateMatchConfidence(t, session.statement_date),
            bank_date: t.bank_date,
            amount: t.credit || t.debit,
            type: t.transaction_type,
            notes: t.optional_notes
          }));

          // Sort by confidence
          suggestions.sort((a, b) => b.confidence - a.confidence);

          resolve({
            matched: 0,
            suggestions: suggestions.slice(0, 10) // Top 10 suggestions
          });
        }
      );
    });
  }

  /**
   * Calculate match confidence for auto-matching
   */
  private calculateMatchConfidence(
    transaction: any,
    statementDate: string
  ): number {
    let confidence = 100;

    // Reduce confidence based on date difference
    const daysDiff = Math.abs(
      (new Date(transaction.bank_date).getTime() - new Date(statementDate).getTime()) 
      / (1000 * 60 * 60 * 24)
    );
    
    confidence -= daysDiff * 10;

    // Boost confidence for certain transaction types
    if (transaction.transaction_type === 'interest') {
      confidence += 10;
    }

    // Ensure confidence is between 0 and 100
    return Math.max(0, Math.min(100, confidence));
  }
}
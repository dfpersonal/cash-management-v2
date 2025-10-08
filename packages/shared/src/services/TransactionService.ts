import { Database } from 'sqlite3';
import {
  Transaction,
  TransactionForm,
  TransactionWithAccount,
  TransactionFilters,
  TransactionSummary,
  BalanceRecalculationResult,
  TransactionResponse,
  TransactionListResponse,
  TransactionValidationError,
  TransactionImportResult,
  TransactionType,
  TransactionSource
} from '../types/TransactionTypes';

export class TransactionService {
  private db: Database;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 100;
  private transactionCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 30000; // 30 seconds cache

  constructor(database: Database) {
    this.db = database;
  }

  /**
   * Execute database operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    retries: number = this.MAX_RETRIES
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      // Check if error is recoverable
      const isRecoverable = this.isRecoverableError(error);

      if (isRecoverable && retries > 0) {
        console.warn(`[TransactionService] ${operationName} failed, retrying... (${retries} retries left)`, error.message);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
        return this.executeWithRetry(operation, operationName, retries - 1);
      }

      // Log non-recoverable errors or exhausted retries
      console.error(`[TransactionService] ${operationName} failed permanently:`, error);
      throw error;
    }
  }

  /**
   * Check if an error is recoverable
   */
  private isRecoverableError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';

    // SQLite specific recoverable errors
    const recoverablePatterns = [
      'database is locked',
      'database table is locked',
      'database schema has changed',
      'sqlite_busy',
      'sqlite_locked',
      'ebusy',
      'etimedout',
      'econnreset'
    ];

    return recoverablePatterns.some(pattern =>
      errorMessage.includes(pattern) || errorCode.includes(pattern)
    );
  }

  /**
   * Ensure database connection is healthy
   */
  private async ensureConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      this.db.get('SELECT 1', [], (err) => {
        if (err) {
          console.error('[TransactionService] Database connection check failed:', err);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Generate cache key for transaction queries
   */
  private getCacheKey(accountId: number, filters?: TransactionFilters): string {
    return `transactions_${accountId}_${JSON.stringify(filters || {})}`;
  }

  /**
   * Get cached data if valid
   */
  private getCachedData(key: string): any | null {
    const cached = this.transactionCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }
    // Clean up expired cache
    if (cached) {
      this.transactionCache.delete(key);
    }
    return null;
  }

  /**
   * Set cache data
   */
  private setCacheData(key: string, data: any): void {
    // Limit cache size to prevent memory issues
    if (this.transactionCache.size > 100) {
      // Remove oldest entries
      const firstKey = this.transactionCache.keys().next().value;
      if (firstKey !== undefined) {
        this.transactionCache.delete(firstKey);
      }
    }
    this.transactionCache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clear cache for an account
   */
  private clearAccountCache(accountId: number): void {
    for (const key of this.transactionCache.keys()) {
      if (key.startsWith(`transactions_${accountId}_`)) {
        this.transactionCache.delete(key);
      }
    }
  }

  /**
   * Get all transactions for an account with pagination
   */
  async getAccountTransactions(
    accountId: number,
    filters?: TransactionFilters & { page?: number; pageSize?: number }
  ): Promise<TransactionListResponse> {
    // Check cache first
    const cacheKey = this.getCacheKey(accountId, filters);
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    return new Promise((resolve, reject) => {
      // First get total count for pagination
      let countQuery = `
        SELECT COUNT(*) as total
        FROM account_transactions at
        WHERE at.account_id = ?
      `;

      const params: any[] = [accountId];

      // Apply filters to count query
      if (filters?.start_date) {
        countQuery += ` AND at.bank_date >= ?`;
        params.push(filters.start_date);
      }
      if (filters?.end_date) {
        countQuery += ` AND at.bank_date <= ?`;
        params.push(filters.end_date);
      }
      if (filters?.transaction_type) {
        countQuery += ` AND at.transaction_type = ?`;
        params.push(filters.transaction_type);
      }
      if (filters?.reconciled !== undefined) {
        countQuery += ` AND at.reconciled = ?`;
        params.push(filters.reconciled ? 1 : 0);
      }
      if (filters?.min_amount) {
        countQuery += ` AND (at.debit >= ? OR at.credit >= ?)`;
        params.push(filters.min_amount, filters.min_amount);
      }
      if (filters?.max_amount) {
        countQuery += ` AND (at.debit <= ? OR at.credit <= ?)`;
        params.push(filters.max_amount, filters.max_amount);
      }

      this.db.get(countQuery, params, (err, countRow: any) => {
        if (err) {
          reject(err);
          return;
        }

        const totalCount = countRow?.total || 0;
        const page = filters?.page || 1;
        const pageSize = filters?.pageSize || 50; // Default 50 items per page
        const offset = (page - 1) * pageSize;

        // Now get paginated results
        let dataQuery = `
          SELECT
            at.*,
            md.bank as bank_name,
            md.account_name,
            md.type || ' - ' || md.sub_type as account_type
          FROM account_transactions at
          JOIN my_deposits md ON at.account_id = md.id
          WHERE at.account_id = ?
        `;

        const dataParams = [...params]; // Copy params

        // Apply same filters
        if (filters?.start_date) {
          dataQuery += ` AND at.bank_date >= ?`;
        }
        if (filters?.end_date) {
          dataQuery += ` AND at.bank_date <= ?`;
        }
        if (filters?.transaction_type) {
          dataQuery += ` AND at.transaction_type = ?`;
        }
        if (filters?.reconciled !== undefined) {
          dataQuery += ` AND at.reconciled = ?`;
        }
        if (filters?.min_amount) {
          dataQuery += ` AND (at.debit >= ? OR at.credit >= ?)`;
        }
        if (filters?.max_amount) {
          dataQuery += ` AND (at.debit <= ? OR at.credit <= ?)`;
        }

        dataQuery += ` ORDER BY at.bank_date DESC, at.id DESC`;
        dataQuery += ` LIMIT ? OFFSET ?`;
        dataParams.push(pageSize, offset);

        this.db.all(dataQuery, dataParams, (err, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            const response = {
              transactions: rows || [],
              total_count: totalCount,
              page: page,
              page_size: pageSize,
              total_pages: Math.ceil(totalCount / pageSize),
              filters_applied: filters || {}
            };

            // Cache the response
            this.setCacheData(cacheKey, response);

            resolve(response);
          }
        });
      });
    });
  }

  /**
   * Check for duplicate transactions
   */
  private async checkDuplicateTransaction(
    accountId: number,
    bankDate: string,
    reference: string | null,
    amount: number,
    type: string
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // First check: exact duplicate (unique constraint)
      if (reference) {
        const exactQuery = `
          SELECT id FROM account_transactions
          WHERE account_id = ? AND bank_date = ? AND reference = ?
        `;
        this.db.get(exactQuery, [accountId, bankDate, reference], (err, row) => {
          if (err) {
            reject(err);
          } else if (row) {
            resolve(true); // Exact duplicate found
          } else {
            // Check for similar transaction without reference
            this.checkSimilarTransaction(accountId, bankDate, amount, type)
              .then(resolve)
              .catch(reject);
          }
        });
      } else {
        // No reference, check for similar transactions
        this.checkSimilarTransaction(accountId, bankDate, amount, type)
          .then(resolve)
          .catch(reject);
      }
    });
  }

  /**
   * Check for similar transactions (fuzzy duplicate detection)
   */
  private async checkSimilarTransaction(
    accountId: number,
    bankDate: string,
    amount: number,
    type: string
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id, debit, credit, transaction_type, optional_notes
        FROM account_transactions
        WHERE account_id = ?
          AND bank_date = ?
          AND transaction_type = ?
          AND ABS(COALESCE(debit, 0) + COALESCE(credit, 0) - ?) < 0.01
      `;

      this.db.get(query, [accountId, bankDate, type, Math.abs(amount)], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(!!row); // Return true if similar transaction found
        }
      });
    });
  }

  /**
   * Create a new transaction
   */
  async createTransaction(transaction: Partial<Transaction>): Promise<TransactionResponse> {
    return new Promise(async (resolve, reject) => {
      console.log('🏦 TransactionService: Creating transaction:', JSON.stringify(transaction, null, 2));

      // Validate transaction
      const errors = await this.validateTransactionWithContext(transaction);
      console.log('✅ TransactionService: Validation result:', errors.length === 0 ? 'PASSED' : `FAILED - ${errors.length} errors`, errors);

      if (errors.length > 0) {
        resolve({
          success: false,
          error: errors.map(e => e.message).join(', ')
        });
        return;
      }

      // Check for duplicates
      const amount = transaction.debit || transaction.credit || 0;
      console.log('🔍 TransactionService: Checking for duplicates...', {
        account_id: transaction.account_id,
        date: transaction.bank_date || transaction.transaction_date,
        reference: transaction.reference,
        amount,
        type: transaction.transaction_type
      });

      const isDuplicate = await this.checkDuplicateTransaction(
        transaction.account_id!,
        transaction.bank_date || transaction.transaction_date!,
        transaction.reference || null,
        amount,
        transaction.transaction_type!
      ).catch(err => {
        console.error('❌ TransactionService: Error checking for duplicates:', err);
        return false; // Continue if duplicate check fails
      });

      console.log('🔍 TransactionService: Duplicate check result:', isDuplicate ? 'DUPLICATE FOUND' : 'NO DUPLICATE');

      if (isDuplicate) {
        resolve({
          success: false,
          error: 'A similar transaction already exists for this date and amount. Please check existing transactions or add a unique reference.'
        });
        return;
      }

      // Calculate balance_after if not provided
      let calculatedBalanceAfter = transaction.balance_after;
      if (calculatedBalanceAfter === undefined || calculatedBalanceAfter === null) {
        // Get the last balance for this account
        const lastBalanceQuery = `
          SELECT balance_after
          FROM account_transactions
          WHERE account_id = ?
            AND balance_after IS NOT NULL
          ORDER BY transaction_date DESC, id DESC
          LIMIT 1
        `;

        const lastBalance = await new Promise<number>((resolveBalance) => {
          this.db.get(lastBalanceQuery, [transaction.account_id], (err, row: any) => {
            if (err || !row) {
              // If no previous balance, start from 0
              console.log('⚠️ TransactionService: No previous balance found, starting from 0');
              resolveBalance(0);
            } else {
              console.log('💰 TransactionService: Previous balance found:', row.balance_after);
              resolveBalance(row.balance_after);
            }
          });
        });

        // Calculate new balance
        const creditAmount = transaction.credit || 0;
        const debitAmount = transaction.debit || 0;
        calculatedBalanceAfter = lastBalance + creditAmount - debitAmount;

        console.log('💰 TransactionService: Calculated balance_after:', {
          lastBalance,
          credit: creditAmount,
          debit: debitAmount,
          newBalance: calculatedBalanceAfter
        });
      }

      const query = `
        INSERT INTO account_transactions (
          account_id, transaction_date, bank_date, value_date,
          transaction_type, debit, credit, balance_after,
          estimated_amount, variance_notes,
          reference, optional_notes, source,
          reconciled, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        transaction.account_id,
        transaction.transaction_date,
        transaction.bank_date || transaction.transaction_date,
        transaction.value_date || null,
        transaction.transaction_type,
        transaction.debit || null,
        transaction.credit || null,
        calculatedBalanceAfter,
        transaction.estimated_amount || null,
        transaction.variance_notes || null,
        transaction.reference || null,
        transaction.optional_notes || null,
        transaction.source || 'manual',
        transaction.reconciled ? 1 : 0,
        transaction.created_by || 'system'
      ];

      console.log('💾 TransactionService: Executing SQL INSERT...', { query: query.trim(), params });

      this.db.run(query, params, (err) => {
        if (err) {
          console.error('❌ TransactionService: SQL execution failed:', err);
          // Handle unique constraint violations
          if (err.message?.includes('UNIQUE constraint failed')) {
            resolve({
              success: false,
              error: 'Transaction already exists. Please check for duplicates or use a unique reference.'
            });
          } else {
            resolve({
              success: false,
              error: err.message
            });
          }
        } else {
          const newId = (this.db as any).lastID;
          console.log('✅ TransactionService: SQL execution successful, new transaction ID:', newId);

          // Update the account balance in my_deposits table
          if (calculatedBalanceAfter !== undefined && calculatedBalanceAfter !== null) {
            const updateBalanceQuery = `
              UPDATE my_deposits
              SET balance = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `;

            this.db.run(updateBalanceQuery, [calculatedBalanceAfter, transaction.account_id], (updateErr) => {
              if (updateErr) {
                console.error('⚠️ TransactionService: Failed to update account balance in my_deposits:', updateErr);
                // Continue anyway - transaction was saved successfully
              } else {
                console.log('✅ TransactionService: Account balance updated in my_deposits to:', calculatedBalanceAfter);
              }
            });
          }

          // Clear cache for this account
          this.clearAccountCache(transaction.account_id!);

          resolve({
            success: true,
            transaction: {
              ...transaction,
              id: newId,
              balance_after: calculatedBalanceAfter
            } as Transaction
          });
        }
      });
    });
  }

  /**
   * Create transaction with automatic recovery
   */
  async createTransactionSafe(transaction: Partial<Transaction>): Promise<TransactionResponse> {
    // Ensure connection before attempting
    const isConnected = await this.ensureConnection();
    if (!isConnected) {
      return {
        success: false,
        error: 'Database connection unavailable'
      };
    }

    return this.executeWithRetry(
      () => this.createTransaction(transaction),
      'createTransaction'
    ).catch(error => ({
      success: false,
      error: error.message || 'Unknown error occurred'
    }));
  }

  /**
   * Update an existing transaction
   */
  async updateTransaction(id: number, updates: Partial<Transaction>): Promise<TransactionResponse> {
    return new Promise((resolve, reject) => {
      // Build dynamic update query
      const updateFields: string[] = [];
      const params: any[] = [];

      // Only update allowed fields
      const allowedFields = [
        'bank_date', 'value_date', 'reference', 'optional_notes',
        'reconciled', 'reconciled_date', 'reconciliation_session_id',
        'estimated_amount', 'variance_notes'
      ];

      for (const field of allowedFields) {
        if (field in updates) {
          updateFields.push(`${field} = ?`);
          params.push((updates as any)[field]);
        }
      }

      if (updateFields.length === 0) {
        resolve({
          success: false,
          error: 'No valid fields to update'
        });
        return;
      }

      params.push(id);
      const query = `
        UPDATE account_transactions
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      // First get the account_id for cache invalidation
      this.db.get('SELECT account_id FROM account_transactions WHERE id = ?', [id], (err, row: any) => {
        if (err || !row) {
          resolve({
            success: false,
            error: err?.message || 'Transaction not found'
          });
          return;
        }

        const accountId = row.account_id;

        this.db.run(query, params, (err) => {
          if (err) {
            resolve({
              success: false,
              error: err.message
            });
          } else if ((this.db as any).changes === 0) {
            resolve({
              success: false,
              error: 'Transaction not found'
            });
          } else {
            // Clear cache for this account
            this.clearAccountCache(accountId);
            resolve({
              success: true
            });
          }
        });
      });
    });
  }

  /**
   * Delete a transaction
   */
  async deleteTransaction(id: number): Promise<TransactionResponse> {
    return new Promise((resolve, reject) => {
      // Check if transaction can be deleted and get account_id
      this.db.get(
        'SELECT account_id, reconciled, source FROM account_transactions WHERE id = ?',
        [id],
        (err, row: any) => {
          if (err) {
            resolve({ success: false, error: err.message });
            return;
          }
          if (!row) {
            resolve({ success: false, error: 'Transaction not found' });
            return;
          }
          if (row.reconciled) {
            resolve({ success: false, error: 'Cannot delete reconciled transaction' });
            return;
          }
          if (row.source === 'system') {
            resolve({ success: false, error: 'Cannot delete system-generated transaction' });
            return;
          }

          const accountId = row.account_id;

          // Delete the transaction
          this.db.run('DELETE FROM account_transactions WHERE id = ?', [id], (err) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              // Clear cache for this account
              this.clearAccountCache(accountId);
              resolve({ success: true });
            }
          });
        }
      );
    });
  }

  /**
   * Verify balance consistency for an account
   */
  async verifyBalanceConsistency(accountId: number): Promise<{
    isConsistent: boolean;
    discrepancies: Array<{
      transactionId: number;
      expectedBalance: number;
      actualBalance: number;
      difference: number;
    }>;
    finalBalance: number;
    accountBalance: number;
  }> {
    return new Promise((resolve, reject) => {
      // Get all transactions ordered by date
      const query = `
        SELECT id, transaction_date, bank_date, debit, credit, balance_after, transaction_type
        FROM account_transactions
        WHERE account_id = ?
        ORDER BY bank_date ASC, id ASC
      `;

      this.db.all(query, [accountId], (err, transactions: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const discrepancies: any[] = [];
        let runningBalance = 0;
        let isConsistent = true;

        transactions.forEach((tx, index) => {
          // Calculate expected balance
          if (tx.credit) {
            runningBalance += tx.credit;
          }
          if (tx.debit) {
            runningBalance -= tx.debit;
          }

          // Check if balance_after matches expected
          if (tx.balance_after !== null && Math.abs(tx.balance_after - runningBalance) > 0.01) {
            discrepancies.push({
              transactionId: tx.id,
              expectedBalance: runningBalance,
              actualBalance: tx.balance_after,
              difference: tx.balance_after - runningBalance
            });
            isConsistent = false;
            // Use the recorded balance for next calculation
            runningBalance = tx.balance_after;
          }
        });

        // Get account's current balance
        this.db.get(
          'SELECT balance FROM my_deposits WHERE id = ?',
          [accountId],
          (err, account: any) => {
            if (err) {
              reject(err);
              return;
            }

            resolve({
              isConsistent: isConsistent && Math.abs(runningBalance - (account?.balance || 0)) < 0.01,
              discrepancies,
              finalBalance: runningBalance,
              accountBalance: account?.balance || 0
            });
          }
        );
      });
    });
  }

  /**
   * Recalculate running balances for an account
   */
  async recalculateBalances(
    accountId: number,
    fromDate?: string
  ): Promise<BalanceRecalculationResult> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // First verify current consistency
        this.verifyBalanceConsistency(accountId).then(consistency => {
          if (!consistency.isConsistent && !fromDate) {
            console.warn(`Account ${accountId} has ${consistency.discrepancies.length} balance discrepancies`);
          }
        }).catch(err => {
          console.error('Error verifying balance consistency:', err);
        });

        // Get starting balance
        let startingBalanceQuery = `
          SELECT balance_after
          FROM account_transactions
          WHERE account_id = ?
        `;

        const params: any[] = [accountId];

        if (fromDate) {
          startingBalanceQuery += ` AND bank_date < ? ORDER BY bank_date DESC, id DESC LIMIT 1`;
          params.push(fromDate);
        } else {
          startingBalanceQuery += ` AND transaction_type = 'account_opened' LIMIT 1`;
        }

        this.db.get(startingBalanceQuery, params, (err, row: any) => {
          if (err) {
            resolve({
              account_id: accountId,
              transactions_processed: 0,
              starting_balance: 0,
              ending_balance: 0,
              discrepancies_found: 0,
              success: false,
              error: err.message
            });
            return;
          }

          let runningBalance = row?.balance_after || 0;
          const startingBalance = runningBalance;

          // Get transactions to recalculate
          let transactionsQuery = `
            SELECT id, debit, credit, balance_after
            FROM account_transactions
            WHERE account_id = ?
          `;
          
          const transParams: any[] = [accountId];
          
          if (fromDate) {
            transactionsQuery += ` AND bank_date >= ?`;
            transParams.push(fromDate);
          }
          
          transactionsQuery += ` ORDER BY bank_date ASC, id ASC`;

          this.db.all(transactionsQuery, transParams, (err, transactions: any[]) => {
            if (err) {
              resolve({
                account_id: accountId,
                transactions_processed: 0,
                starting_balance: startingBalance,
                ending_balance: 0,
                discrepancies_found: 0,
                success: false,
                error: err.message
              });
              return;
            }

            let processed = 0;
            let discrepancies = 0;

            // Process each transaction
            const updatePromises = transactions.map((trans) => {
              return new Promise<void>((resolveUpdate) => {
                // Calculate new balance
                if (trans.credit) {
                  runningBalance += trans.credit;
                } else if (trans.debit) {
                  runningBalance -= trans.debit;
                }

                // Check for discrepancy
                if (trans.balance_after && Math.abs(trans.balance_after - runningBalance) > 0.01) {
                  discrepancies++;
                }

                // Update balance
                this.db.run(
                  'UPDATE account_transactions SET balance_after = ? WHERE id = ?',
                  [runningBalance, trans.id],
                  () => {
                    processed++;
                    resolveUpdate();
                  }
                );
              });
            });

            Promise.all(updatePromises).then(() => {
              resolve({
                account_id: accountId,
                transactions_processed: processed,
                starting_balance: startingBalance,
                ending_balance: runningBalance,
                discrepancies_found: discrepancies,
                success: true
              });
            });
          });
        });
      });
    });
  }

  /**
   * Get transaction summary for an account
   */
  async getTransactionSummary(
    accountId: number,
    startDate?: string,
    endDate?: string
  ): Promise<TransactionSummary> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          SUM(CASE WHEN transaction_type = 'deposit' THEN credit ELSE 0 END) as total_deposits,
          SUM(CASE WHEN transaction_type = 'withdrawal' THEN debit ELSE 0 END) as total_withdrawals,
          SUM(CASE WHEN transaction_type = 'interest' THEN COALESCE(credit, 0) - COALESCE(debit, 0) END) as total_interest,
          SUM(CASE WHEN transaction_type = 'fee' THEN debit ELSE 0 END) as total_fees,
          SUM(COALESCE(credit, 0) - COALESCE(debit, 0)) as net_change,
          COUNT(*) as transaction_count,
          SUM(CASE WHEN reconciled = 0 THEN 1 ELSE 0 END) as unreconciled_count
        FROM account_transactions
        WHERE account_id = ?
          ${startDate ? 'AND bank_date >= ?' : ''}
          ${endDate ? 'AND bank_date <= ?' : ''}
      `;

      const params: any[] = [accountId];
      if (startDate) params.push(startDate);
      if (endDate) params.push(endDate);

      this.db.get(query, params, (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            total_deposits: row?.total_deposits || 0,
            total_withdrawals: row?.total_withdrawals || 0,
            total_interest: row?.total_interest || 0,
            total_fees: row?.total_fees || 0,
            net_change: row?.net_change || 0,
            transaction_count: row?.transaction_count || 0,
            unreconciled_count: row?.unreconciled_count || 0
          });
        }
      });
    });
  }

  /**
   * Create transaction from balance change
   */
  async createFromBalanceChange(
    accountId: number,
    oldBalance: number,
    newBalance: number,
    context: string,
    notes?: string
  ): Promise<TransactionResponse> {
    const difference = newBalance - oldBalance;
    
    let transactionType: TransactionType = 'adjustment';
    if (context.includes('INTEREST')) {
      transactionType = 'interest';
    } else if (context.includes('WITHDRAWAL')) {
      transactionType = 'withdrawal';
    } else if (context.includes('DEPOSIT') || context.includes('PENDING_MOVE')) {
      transactionType = 'deposit';
    } else if (context.includes('FEE')) {
      transactionType = 'fee';
    }

    const transaction: Partial<Transaction> = {
      account_id: accountId,
      transaction_date: new Date().toISOString().split('T')[0],
      bank_date: new Date().toISOString().split('T')[0],
      transaction_type: transactionType,
      debit: difference < 0 ? Math.abs(difference) : undefined,
      credit: difference > 0 ? difference : undefined,
      balance_after: newBalance,
      optional_notes: notes || `Balance ${difference >= 0 ? 'increased' : 'decreased'} by £${Math.abs(difference).toFixed(2)} (${context})`,
      source: 'system'
    };

    return this.createTransaction(transaction);
  }

  /**
   * Create transaction from audit log entry
   */
  async createFromAuditLog(auditEntry: any): Promise<TransactionResponse> {
    if (auditEntry.table_name !== 'my_deposits' || auditEntry.field_name !== 'balance') {
      return {
        success: false,
        error: 'Invalid audit log entry for transaction creation'
      };
    }

    const oldBalance = parseFloat(auditEntry.old_value);
    const newBalance = parseFloat(auditEntry.new_value);
    const difference = newBalance - oldBalance;

    if (Math.abs(difference) < 0.01) {
      return {
        success: false,
        error: 'No significant balance change'
      };
    }

    // Determine transaction type from context
    let transactionType: TransactionType = 'adjustment';
    const context = auditEntry.operation_context || '';
    
    if (context.includes('INTEREST')) {
      transactionType = 'interest';
    } else if (context.includes('WITHDRAWAL')) {
      transactionType = 'withdrawal';
    } else if (context.includes('DEPOSIT') || context.includes('EXECUTE_PENDING_MOVE')) {
      transactionType = 'deposit';
    } else if (context.includes('FEE')) {
      transactionType = 'fee';
    } else if (context === 'BALANCE_CHECK') {
      transactionType = 'adjustment';
    }

    const transaction: Partial<Transaction> = {
      account_id: auditEntry.record_id,
      transaction_date: auditEntry.timestamp.split('T')[0],
      bank_date: auditEntry.timestamp.split('T')[0],
      transaction_type: transactionType,
      debit: difference < 0 ? Math.abs(difference) : undefined,
      credit: difference > 0 ? difference : undefined,
      balance_after: newBalance,
      optional_notes: auditEntry.notes || `Balance change from £${oldBalance.toFixed(2)} to £${newBalance.toFixed(2)} (${context})`,
      audit_log_id: auditEntry.id,
      source: 'audit_log'
    };

    return this.createTransaction(transaction);
  }

  /**
   * Mark transaction as reconciled
   */
  async markReconciled(
    transactionId: number,
    sessionId: number
  ): Promise<TransactionResponse> {
    return this.updateTransaction(transactionId, {
      reconciled: true,
      reconciled_date: new Date().toISOString().split('T')[0],
      reconciliation_session_id: sessionId
    });
  }

  /**
   * Get unreconciled transactions for an account
   */
  async getUnreconciledTransactions(accountId: number): Promise<Transaction[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM account_transactions
        WHERE account_id = ? AND reconciled = 0
        ORDER BY bank_date DESC, id DESC
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
   * Validate transaction data
   */
  private validateTransaction(transaction: Partial<Transaction>): TransactionValidationError[] {
    const errors: TransactionValidationError[] = [];

    if (!transaction.account_id) {
      errors.push({ field: 'account_id', message: 'Account ID is required' });
    }

    if (!transaction.transaction_date) {
      errors.push({ field: 'transaction_date', message: 'Transaction date is required' });
    }

    if (!transaction.transaction_type) {
      errors.push({ field: 'transaction_type', message: 'Transaction type is required' });
    }

    // Ensure either debit or credit is set, but not both
    if (transaction.debit && transaction.credit) {
      errors.push({ field: 'amount', message: 'Transaction cannot have both debit and credit' });
    }

    if (!transaction.debit && !transaction.credit) {
      errors.push({ field: 'amount', message: 'Transaction must have either debit or credit amount' });
    }

    // Validate amounts are positive
    if (transaction.debit && transaction.debit <= 0) {
      errors.push({ field: 'debit', message: 'Debit amount must be positive' });
    }

    if (transaction.credit && transaction.credit <= 0) {
      errors.push({ field: 'credit', message: 'Credit amount must be positive' });
    }

    return errors;
  }

  /**
   * Enhanced validation with account context
   */
  private async validateTransactionWithContext(transaction: Partial<Transaction>): Promise<TransactionValidationError[]> {
    // Start with basic validation
    const errors = this.validateTransaction(transaction);

    // Return early if basic validation fails
    if (errors.length > 0 || !transaction.account_id) {
      return errors;
    }

    // Check account status
    return new Promise((resolve) => {
      this.db.get(
        'SELECT is_active, type, sub_type, balance FROM my_deposits WHERE id = ?',
        [transaction.account_id],
        (err, account: any) => {
          if (err || !account) {
            errors.push({ field: 'account_id', message: 'Account not found or inaccessible' });
            resolve(errors);
            return;
          }

          // Check if account is active
          if (!account.is_active) {
            errors.push({ field: 'account_id', message: 'Cannot add transactions to inactive account' });
          }

          // Validate transaction type based on account type
          const validTypes = this.getValidTransactionTypes(account.type, account.sub_type);
          if (!validTypes.includes(transaction.transaction_type!)) {
            errors.push({
              field: 'transaction_type',
              message: `Invalid transaction type '${transaction.transaction_type}' for ${account.type} account`
            });
          }

          // Check for negative balance (except for certain transaction types)
          if (transaction.debit && transaction.transaction_type !== 'adjustment') {
            const projectedBalance = account.balance - transaction.debit;
            if (projectedBalance < 0) {
              errors.push({
                field: 'debit',
                message: `Transaction would result in negative balance (£${projectedBalance.toFixed(2)})`
              });
            }
          }

          // Validate dates
          const txDate = new Date(transaction.transaction_date!);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Warn about future dates (but don't block)
          if (txDate > today && transaction.source !== 'system') {
            errors.push({
              field: 'transaction_date',
              message: 'Warning: Transaction date is in the future'
            });
          }

          resolve(errors);
        }
      );
    });
  }

  /**
   * Get valid transaction types for an account type
   */
  private getValidTransactionTypes(accountType: string, subType: string): TransactionType[] {
    const baseTypes: TransactionType[] = ['adjustment'];

    if (accountType === 'Current') {
      return [...baseTypes, 'deposit', 'withdrawal', 'interest', 'fee'];
    }

    // Savings accounts
    const savingsTypes: TransactionType[] = [...baseTypes, 'deposit', 'interest'];

    // Easy Access accounts can have withdrawals
    if (subType === 'Easy Access') {
      savingsTypes.push('withdrawal');
    }

    // Notice accounts can have withdrawals with restrictions
    if (subType === 'Notice') {
      savingsTypes.push('withdrawal');
    }

    // Term accounts typically don't allow withdrawals until maturity
    if (subType === 'Term' || subType === 'Fixed Term') {
      // May add 'account_closed' for maturity withdrawals
      savingsTypes.push('account_closed');
    }

    // All accounts can have fees
    savingsTypes.push('fee');

    return savingsTypes;
  }

  /**
   * Seed initial transactions from audit log
   */
  async seedFromAuditLog(): Promise<TransactionImportResult> {
    return new Promise((resolve, reject) => {
      // This is handled by the SQL migration, but we can trigger it manually if needed
      const query = `
        SELECT COUNT(*) as imported
        FROM account_transactions
        WHERE source = 'audit_log'
      `;

      this.db.get(query, (err, row: any) => {
        if (err) {
          resolve({
            imported: 0,
            skipped: 0,
            errors: [{ field: 'database', message: err.message }]
          });
        } else {
          resolve({
            imported: row?.imported || 0,
            skipped: 0,
            errors: []
          });
        }
      });
    });
  }
}
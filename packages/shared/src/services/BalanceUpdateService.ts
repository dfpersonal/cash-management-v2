import { Database } from 'sqlite3';
import {
  BalanceUpdateSession,
  BalanceUpdateLog,
  DepositBalanceStatus,
  BalanceUpdateSessionProgress,
  BalanceUpdateFilters,
  Deposit,
  BalanceUpdateFrequency,
  BalanceUpdateStatus,
  Reminder
} from '../types/PortfolioTypes';
import { AuditService } from './AuditService';
import { TransactionService } from './TransactionService';
import { TransactionType } from '../types/TransactionTypes';

export class BalanceUpdateService {
  private db: Database;
  private auditService: AuditService | null;
  private transactionService: TransactionService | null;

  constructor(db: Database, auditService: AuditService | null = null, transactionService: TransactionService | null = null) {
    this.db = db;
    this.auditService = auditService;
    this.transactionService = transactionService;
  }

  /**
   * Create a new balance update session
   */
  async createBalanceUpdateSession(sessionType: 'manual' | 'scheduled' = 'manual'): Promise<number> {
    return new Promise((resolve, reject) => {
      // First get the count of active deposits
      this.db.get(
        'SELECT COUNT(*) as count FROM my_deposits WHERE is_active = 1',
        (countErr, countRow: any) => {
          if (countErr) {
            reject(countErr);
            return;
          }

          const totalDeposits = countRow.count;
          
          // Create the session
          const query = `
            INSERT INTO balance_update_sessions (total_deposits, session_type)
            VALUES (?, ?)
          `;

          this.db.run(query, [totalDeposits, sessionType], function(err) {
            if (err) {
              console.error('Error creating balance update session:', err);
              reject(err);
            } else {
              const sessionId = this.lastID;
              console.log(`Created balance update session ${sessionId} with ${totalDeposits} deposits`);
              resolve(sessionId);
            }
          });
        }
      );
    });
  }

  /**
   * Get all active deposits with their balance status
   */
  async getDepositsWithBalanceStatus(filters?: BalanceUpdateFilters): Promise<DepositBalanceStatus[]> {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          d.*,
          CASE 
            WHEN d.next_balance_check IS NULL THEN 1
            WHEN datetime(d.next_balance_check) <= datetime('now') THEN 1
            ELSE 0
          END as is_overdue,
          CASE 
            WHEN d.next_balance_check IS NULL THEN -999
            ELSE CAST((julianday(d.next_balance_check) - julianday('now')) AS INTEGER)
          END as days_until_due
        FROM my_deposits d
        WHERE d.is_active = 1
      `;

      const params: any[] = [];

      // Apply filters
      if (filters?.bank) {
        query += ' AND d.bank = ?';
        params.push(filters.bank);
      }

      if (filters?.platform) {
        query += ' AND d.platform = ?';
        params.push(filters.platform);
      }

      if (filters?.frequency) {
        query += ' AND d.balance_update_frequency = ?';
        params.push(filters.frequency);
      }

      query += ' ORDER BY d.next_balance_check ASC NULLS FIRST, d.bank, d.account_name';

      this.db.all(query, params, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const deposits: DepositBalanceStatus[] = rows.map(row => ({
            deposit: this.mapRowToDeposit(row),
            last_balance_update: row.last_balance_update,
            next_balance_check: row.next_balance_check,
            balance_update_frequency: row.balance_update_frequency || 'monthly',
            is_overdue: Boolean(row.is_overdue),
            days_until_due: row.days_until_due,
            update_status: this.determineUpdateStatus(row.is_overdue, row.days_until_due)
          }));

          // Apply status filter after mapping
          const filteredDeposits = filters?.status && filters.status !== 'all' 
            ? deposits.filter(d => d.update_status === filters.status)
            : deposits;

          resolve(filteredDeposits);
        }
      });
    });
  }

  /**
   * Update deposit balance and optionally AER, and log the changes
   */
  async updateDepositBalance(
    sessionId: number,
    depositId: number,
    newBalance: number,
    resetSchedule: boolean = true,
    reminderConfig?: { reminderDaysBefore: number; autoCalendar: boolean },
    newAer?: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // First get the current balance, AER, and frequency
      this.db.get(
        'SELECT balance, aer, balance_update_frequency FROM my_deposits WHERE id = ?',
        [depositId],
        async (getErr, currentRow: any) => {
          if (getErr) {
            reject(getErr);
            return;
          }

          const oldBalance = currentRow.balance;
          const oldAer = currentRow.aer;
          const frequency = currentRow.balance_update_frequency || 'monthly';

          // Calculate next check date if resetting schedule
          let nextCheckDate = null;
          if (resetSchedule) {
            nextCheckDate = this.calculateNextCheckDate(frequency);
          }

          // Update the deposit balance, optionally AER, and timestamps
          const updateQuery = `
            UPDATE my_deposits 
            SET 
              balance = ?,
              ${newAer !== undefined ? 'aer = ?,' : ''}
              last_balance_update = CURRENT_TIMESTAMP,
              last_updated = CURRENT_TIMESTAMP
              ${resetSchedule ? ', next_balance_check = ?' : ''}
            WHERE id = ?
          `;

          const updateParams = [];
          updateParams.push(newBalance);
          if (newAer !== undefined) {
            updateParams.push(newAer);
          }
          if (resetSchedule) {
            updateParams.push(nextCheckDate);
          }
          updateParams.push(depositId);

          this.db.run(updateQuery, updateParams, async (updateErr) => {
            if (updateErr) {
              reject(updateErr);
              return;
            }

            // Log the balance update
            const logQuery = `
              INSERT INTO balance_update_log (session_id, deposit_id, old_balance, new_balance, status)
              VALUES (?, ?, ?, ?, 'updated')
            `;

            this.db.run(logQuery, [sessionId, depositId, oldBalance, newBalance], async (logErr) => {
              if (logErr) {
                console.error('Error logging balance update:', logErr);
                // Don't reject here - the main update succeeded
              }

              // Update session count
              this.db.run(
                'UPDATE balance_update_sessions SET updated_count = updated_count + 1 WHERE id = ?',
                [sessionId],
                (sessionErr) => {
                  if (sessionErr) {
                    console.error('Error updating session count:', sessionErr);
                  }
                }
              );

              // Create automatic transaction if balance changed
              if (this.transactionService && oldBalance !== newBalance) {
                try {
                  const difference = newBalance - oldBalance;
                  const transactionType: TransactionType = difference > 0 ? 'deposit' : 'withdrawal';
                  
                  // Determine if this is likely an interest payment
                  const isLikelyInterest = difference > 0 && Math.abs(difference) < oldBalance * 0.01; // Less than 1% of balance
                  
                  await this.transactionService.createTransaction({
                    account_id: depositId,
                    transaction_date: new Date().toISOString().split('T')[0],
                    bank_date: new Date().toISOString().split('T')[0],
                    transaction_type: isLikelyInterest ? 'interest' : transactionType,
                    debit: difference < 0 ? Math.abs(difference) : undefined,
                    credit: difference > 0 ? difference : undefined,
                    balance_after: newBalance,
                    optional_notes: `Balance update: ${oldBalance.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })} → ${newBalance.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}`,
                    source: 'system'
                  });
                  console.log(`Created automatic transaction for balance change on deposit ${depositId}`);
                } catch (transactionError) {
                  console.error('Failed to create automatic transaction:', transactionError);
                  // Don't reject - transaction creation failure shouldn't fail the balance update
                }
              }

              // Create balance check reminder if configured and schedule was reset
              if (resetSchedule && nextCheckDate && reminderConfig) {
                try {
                  // Remove existing reminders first
                  await this.removeExistingBalanceCheckReminders(depositId);
                  
                  // Create new reminder if auto-calendar is enabled
                  if (reminderConfig.autoCalendar) {
                    await this.createBalanceCheckReminder(
                      depositId,
                      nextCheckDate,
                      reminderConfig.reminderDaysBefore,
                      reminderConfig.autoCalendar
                    );
                    console.log(`Created balance check reminder for deposit ${depositId}`);
                  }
                } catch (reminderError) {
                  console.error('Failed to create balance check reminder:', reminderError);
                  // Don't reject - reminder creation failure shouldn't fail the balance update
                }
              }

              // Log to audit service if available
              if (this.auditService) {
                try {
                  // Log balance change
                  await this.auditService.logFieldChange({
                    tableName: 'my_deposits',
                    recordId: depositId,
                    fieldName: 'balance',
                    oldValue: oldBalance.toString(),
                    newValue: newBalance.toString(),
                    operationContext: 'BALANCE_UPDATE',
                    notes: `Balance updated via session ${sessionId}`
                  });
                  
                  // Log AER change if it was updated
                  if (newAer !== undefined && oldAer !== newAer) {
                    await this.auditService.logFieldChange({
                      tableName: 'my_deposits',
                      recordId: depositId,
                      fieldName: 'aer',
                      oldValue: oldAer ? oldAer.toString() : '',
                      newValue: newAer.toString(),
                      operationContext: 'AER_UPDATE',
                      notes: `AER updated via session ${sessionId}`
                    });
                  }
                } catch (auditError) {
                  console.error('Audit logging failed for balance/AER update:', auditError);
                }
              }

              resolve();
            });
          });
        }
      );
    });
  }

  /**
   * Complete a balance update session
   */
  async completeBalanceUpdateSession(sessionId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE balance_update_sessions 
        SET completed_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `;

      this.db.run(query, [sessionId], (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Completed balance update session ${sessionId}`);
          resolve();
        }
      });
    });
  }

  /**
   * Get session progress
   */
  async getSessionProgress(sessionId: number): Promise<BalanceUpdateSessionProgress | null> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          s.*,
          COALESCE(s.updated_count, 0) as current_updated_count
        FROM balance_update_sessions s
        WHERE s.id = ?
      `;

      this.db.get(query, [sessionId], (err, row: any) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          const progress: BalanceUpdateSessionProgress = {
            session: {
              id: row.id,
              started_at: row.started_at,
              completed_at: row.completed_at,
              total_deposits: row.total_deposits,
              updated_count: row.current_updated_count,
              session_type: row.session_type
            },
            progress_percentage: (row.current_updated_count / row.total_deposits) * 100,
            deposits_remaining: row.total_deposits - row.current_updated_count,
            current_deposit_index: row.current_updated_count,
            total_deposits: row.total_deposits
          };
          resolve(progress);
        }
      });
    });
  }

  /**
   * Get overdue deposits count
   */
  async getOverdueDepositsCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COUNT(*) as count 
        FROM my_deposits 
        WHERE is_active = 1 
        AND (next_balance_check IS NULL OR datetime(next_balance_check) <= datetime('now'))
      `;

      this.db.get(query, (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count || 0);
        }
      });
    });
  }

  /**
   * Helper method to calculate next check date based on frequency
   */
  private calculateNextCheckDate(frequency: BalanceUpdateFrequency): string {
    const now = new Date();
    let nextDate = new Date(now);

    switch (frequency) {
      case 'weekly':
        nextDate.setDate(now.getDate() + 7);
        break;
      case 'bi-weekly':
        nextDate.setDate(now.getDate() + 14);
        break;
      case 'monthly':
        nextDate.setMonth(now.getMonth() + 1);
        break;
      case 'quarterly':
        nextDate.setMonth(now.getMonth() + 3);
        break;
    }

    return nextDate.toISOString();
  }

  /**
   * Helper method to determine update status
   */
  private determineUpdateStatus(isOverdue: boolean, daysUntilDue: number): BalanceUpdateStatus {
    if (isOverdue) {
      return 'overdue';
    } else if (daysUntilDue <= 7) {
      return 'pending';
    } else {
      return 'current';
    }
  }

  /**
   * Create balance check reminder for a deposit
   */
  async createBalanceCheckReminder(
    depositId: number,
    nextCheckDate: string,
    reminderDaysBefore: number = 3,
    autoCalendar: boolean = true
  ): Promise<number | null> {
    if (!autoCalendar) {
      return null; // Skip reminder creation if auto-calendar is disabled
    }

    return new Promise((resolve, reject) => {
      // First get deposit information for the reminder
      this.db.get(
        'SELECT bank, account_name, balance, balance_update_frequency FROM my_deposits WHERE id = ?',
        [depositId],
        (err, deposit: any) => {
          if (err) {
            console.error('Error getting deposit for reminder:', err);
            reject(err);
            return;
          }

          if (!deposit) {
            console.warn(`Deposit ${depositId} not found for reminder creation`);
            resolve(null);
            return;
          }

          // Calculate reminder date
          const checkDate = new Date(nextCheckDate);
          const reminderDate = new Date(checkDate);
          reminderDate.setDate(checkDate.getDate() - reminderDaysBefore);

          // Create reminder
          const reminder: Reminder = {
            deposit_id: depositId,
            reminder_type: 'balance_check',
            lead_days: reminderDaysBefore,
            reminder_date: reminderDate.toISOString(),
            title: `Balance Check: ${deposit.bank}`,
            description: `Time to update balance for ${deposit.bank} - ${deposit.account_name || 'Account'}. Current balance: ${deposit.balance ? this.formatCurrency(deposit.balance) : 'Unknown'}. Update frequency: ${deposit.balance_update_frequency || 'monthly'}.`,
            priority: 'medium'
          };

          // Insert reminder
          const query = `
            INSERT INTO reminders (
              deposit_id, reminder_type, lead_days, reminder_date,
              title, description, priority, is_sent, is_snoozed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
          `;

          this.db.run(query, [
            reminder.deposit_id,
            reminder.reminder_type,
            reminder.lead_days,
            reminder.reminder_date,
            reminder.title,
            reminder.description,
            reminder.priority
          ], function(insertErr) {
            if (insertErr) {
              console.error('Error creating balance check reminder:', insertErr);
              reject(insertErr);
            } else {
              const reminderId = this.lastID;
              console.log(`Created balance check reminder ${reminderId} for deposit ${depositId}`);
              resolve(reminderId);
            }
          });
        }
      );
    });
  }

  /**
   * Remove existing balance check reminders for a deposit
   */
  async removeExistingBalanceCheckReminders(depositId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `
        DELETE FROM reminders 
        WHERE deposit_id = ? 
        AND reminder_type = 'balance_check' 
        AND reminder_date > datetime('now')
        AND is_sent = 0
      `;

      this.db.run(query, [depositId], (err) => {
        if (err) {
          console.error('Error removing existing balance check reminders:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Generate balance check reminders for all active deposits
   */
  async generateBalanceCheckReminders(
    reminderDaysBefore: number = 3,
    autoCalendar: boolean = true
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    if (!autoCalendar) {
      return { created: 0, skipped: 0, errors: ['Auto-calendar generation is disabled'] };
    }

    return new Promise((resolve, reject) => {
      // Get all active deposits that need reminders
      const query = `
        SELECT id, bank, account_name, balance, balance_update_frequency, next_balance_check
        FROM my_deposits 
        WHERE is_active = 1 
        AND next_balance_check IS NOT NULL
        AND datetime(next_balance_check) > datetime('now')
      `;

      this.db.all(query, async (err, deposits: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const results = { created: 0, skipped: 0, errors: [] as string[] };

        for (const deposit of deposits) {
          try {
            // Check if reminder already exists for this deposit and check date
            const existingReminder = await this.checkExistingReminder(
              deposit.id, 
              deposit.next_balance_check,
              reminderDaysBefore
            );

            if (existingReminder) {
              results.skipped++;
              continue;
            }

            // Remove any old reminders for this deposit
            await this.removeExistingBalanceCheckReminders(deposit.id);

            // Create new reminder
            const reminderId = await this.createBalanceCheckReminder(
              deposit.id,
              deposit.next_balance_check,
              reminderDaysBefore,
              autoCalendar
            );

            if (reminderId) {
              results.created++;
            } else {
              results.skipped++;
            }
          } catch (error) {
            const errorMsg = `Failed to create reminder for deposit ${deposit.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            results.errors.push(errorMsg);
            console.error(errorMsg);
          }
        }

        resolve(results);
      });
    });
  }

  /**
   * Check if a reminder already exists for a specific check date
   */
  private async checkExistingReminder(
    depositId: number, 
    nextCheckDate: string, 
    reminderDaysBefore: number
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const checkDate = new Date(nextCheckDate);
      const reminderDate = new Date(checkDate);
      reminderDate.setDate(checkDate.getDate() - reminderDaysBefore);

      // Check for existing reminder within ±1 day of the calculated reminder date
      const reminderDateStr = reminderDate.toISOString().split('T')[0]; // Get date part only

      const query = `
        SELECT COUNT(*) as count 
        FROM reminders 
        WHERE deposit_id = ? 
        AND reminder_type = 'balance_check'
        AND date(reminder_date) = date(?)
        AND is_sent = 0
      `;

      this.db.get(query, [depositId, reminderDateStr], (err, result: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(result.count > 0);
        }
      });
    });
  }

  /**
   * Helper method to format currency for reminders
   */
  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(value);
  }

  /**
   * Helper method to map database row to Deposit interface
   */
  private mapRowToDeposit(row: any): Deposit {
    return {
      id: row.id,
      bank: row.bank,
      type: row.type,
      sub_type: row.sub_type,
      is_isa: Boolean(row.is_isa),
      platform: row.platform,
      frn: row.frn,
      account_name: row.account_name,
      sort_code: row.sort_code,
      account_number: row.account_number,
      reference: row.reference,
      designated_account: row.designated_account,
      aer: row.aer,
      notice_period_days: row.notice_period_days,
      term_months: row.term_months,
      deposit_date: row.deposit_date,
      term_ends: row.term_ends,
      balance: row.balance,
      min_deposit: row.min_deposit,
      max_deposit: row.max_deposit,
      liquidity_tier: row.liquidity_tier,
      can_withdraw_immediately: Boolean(row.can_withdraw_immediately),
      earliest_withdrawal_date: row.earliest_withdrawal_date,
      is_active: Boolean(row.is_active),
      notes: row.notes,
      last_updated: row.last_updated,
      created_at: row.created_at
    };
  }
}
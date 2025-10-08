import { Database } from 'sqlite3';
import { TransactionService } from './TransactionService';
import { TransactionType } from '../types/TransactionTypes';

interface AuditLogEntry {
  id: number;
  table_name: string;
  record_id: number;
  field_name: string;
  old_value: string;
  new_value: string;
  operation_context: string;
  timestamp: string;
  notes: string;
}

interface ProcessedAuditLog {
  audit_log_id: number;
  transaction_id: number;
  processed_at: string;
}

/**
 * Service to monitor audit log for balance changes and create transactions
 */
export class AuditLogMonitorService {
  private db: Database;
  private transactionService: TransactionService;
  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(db: Database, transactionService: TransactionService) {
    this.db = db;
    this.transactionService = transactionService;
    this.initializeProcessingTable();
  }

  /**
   * Initialize table to track processed audit log entries
   */
  private initializeProcessingTable(): void {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS processed_audit_logs (
        audit_log_id INTEGER PRIMARY KEY,
        transaction_id INTEGER,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audit_log_id) REFERENCES audit_log(id),
        FOREIGN KEY (transaction_id) REFERENCES account_transactions(id)
      )
    `;

    this.db.run(createTableQuery, (err) => {
      if (err) {
        console.error('Failed to create processed_audit_logs table:', err);
      } else {
        console.log('Audit log processing table initialized');
      }
    });
  }

  /**
   * Start monitoring audit log for unprocessed entries
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.isMonitoring) {
      console.log('Audit log monitoring already active');
      return;
    }

    this.isMonitoring = true;
    console.log(`Starting audit log monitoring with ${intervalMs}ms interval`);

    // Process immediately, then on interval
    this.processUnprocessedEntries();
    
    this.monitoringInterval = setInterval(() => {
      this.processUnprocessedEntries();
    }, intervalMs);
  }

  /**
   * Stop monitoring audit log
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('Audit log monitoring stopped');
  }

  /**
   * Process unprocessed audit log entries
   */
  async processUnprocessedEntries(): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT a.*
        FROM audit_log a
        LEFT JOIN processed_audit_logs p ON a.id = p.audit_log_id
        WHERE p.audit_log_id IS NULL
          AND a.table_name = 'my_deposits'
          AND a.field_name = 'balance'
          AND a.timestamp >= datetime('now', '-30 days')
        ORDER BY a.timestamp ASC
        LIMIT 100
      `;

      this.db.all(query, async (err, rows: AuditLogEntry[]) => {
        if (err) {
          console.error('Failed to fetch unprocessed audit entries:', err);
          reject(err);
          return;
        }

        console.log(`Found ${rows.length} unprocessed audit entries`);

        for (const entry of rows) {
          try {
            await this.processAuditEntry(entry);
          } catch (error) {
            console.error(`Failed to process audit entry ${entry.id}:`, error);
          }
        }

        resolve();
      });
    });
  }

  /**
   * Process a single audit log entry and create transaction
   */
  private async processAuditEntry(entry: AuditLogEntry): Promise<void> {
    // Skip if no actual balance change
    const oldBalance = parseFloat(entry.old_value) || 0;
    const newBalance = parseFloat(entry.new_value) || 0;
    const difference = newBalance - oldBalance;

    if (Math.abs(difference) < 0.01) {
      // Mark as processed even if no transaction needed
      await this.markAsProcessed(entry.id, null);
      return;
    }

    // Check if transaction already exists for this audit entry
    const existingTransaction = await this.getExistingTransaction(entry.id);
    if (existingTransaction) {
      console.log(`Transaction already exists for audit entry ${entry.id}`);
      return;
    }

    // Determine transaction type from context and amount
    const transactionType = this.determineTransactionType(entry, difference);

    // Create transaction from audit entry
    try {
      const response = await this.transactionService.createTransaction({
        account_id: entry.record_id,
        transaction_date: entry.timestamp.split(' ')[0], // Extract date from timestamp
        bank_date: entry.timestamp.split(' ')[0],
        transaction_type: transactionType,
        debit: difference < 0 ? Math.abs(difference) : undefined,
        credit: difference > 0 ? difference : undefined,
        balance_after: newBalance,
        optional_notes: entry.notes || `Balance change from ${oldBalance.toFixed(2)} to ${newBalance.toFixed(2)}`,
        audit_log_id: entry.id,
        source: 'audit_log'
      });

      // Mark audit entry as processed
      const transactionId = typeof response === 'object' && response.transaction && response.transaction.id ? response.transaction.id : null;
      await this.markAsProcessed(entry.id, transactionId);
      
      console.log(`Created transaction ${transactionId} from audit entry ${entry.id}`);
    } catch (error) {
      console.error(`Failed to create transaction from audit entry ${entry.id}:`, error);
      throw error;
    }
  }

  /**
   * Determine transaction type from audit context
   */
  private determineTransactionType(entry: AuditLogEntry, difference: number): TransactionType {
    const context = entry.operation_context?.toUpperCase() || '';
    const notes = entry.notes?.toLowerCase() || '';
    
    // Check for specific contexts
    if (context.includes('INTEREST') || notes.includes('interest')) {
      return 'interest';
    }
    
    if (context.includes('FEE') || notes.includes('fee') || notes.includes('charge')) {
      return 'fee';
    }
    
    if (context.includes('WITHDRAWAL') || notes.includes('withdraw') || notes.includes('debited')) {
      return 'withdrawal';
    }
    
    if (context.includes('DEPOSIT') || notes.includes('deposit') || notes.includes('credited')) {
      return 'deposit';
    }
    
    if (context.includes('BALANCE_CHECK') || context.includes('ADJUSTMENT')) {
      return 'adjustment';
    }
    
    if (context.includes('EXECUTE_PENDING_MOVE')) {
      return difference > 0 ? 'deposit' : 'withdrawal';
    }
    
    if (context.includes('ACCOUNT_OPENED')) {
      return 'account_opened';
    }
    
    if (context.includes('ACCOUNT_CLOSED')) {
      return 'account_closed';
    }
    
    // Default based on amount
    if (difference > 0) {
      // Small positive changes likely interest
      const oldBalance = parseFloat(entry.old_value) || 0;
      if (oldBalance > 0 && difference < oldBalance * 0.01) {
        return 'interest';
      }
      return 'deposit';
    } else {
      return 'withdrawal';
    }
  }

  /**
   * Check if transaction already exists for audit entry
   */
  private async getExistingTransaction(auditLogId: number): Promise<boolean> {
    return new Promise((resolve) => {
      const query = `
        SELECT id FROM account_transactions 
        WHERE audit_log_id = ? 
        LIMIT 1
      `;

      this.db.get(query, [auditLogId], (err, row) => {
        if (err) {
          console.error('Error checking existing transaction:', err);
          resolve(false);
        } else {
          resolve(!!row);
        }
      });
    });
  }

  /**
   * Mark audit entry as processed
   */
  private async markAsProcessed(auditLogId: number, transactionId: number | null): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT OR IGNORE INTO processed_audit_logs (audit_log_id, transaction_id)
        VALUES (?, ?)
      `;

      this.db.run(query, [auditLogId, transactionId], (err) => {
        if (err) {
          console.error('Failed to mark audit entry as processed:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<{
    totalProcessed: number;
    processedToday: number;
    lastProcessedAt: string | null;
  }> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as total_processed,
          SUM(CASE WHEN DATE(processed_at) = DATE('now') THEN 1 ELSE 0 END) as processed_today,
          MAX(processed_at) as last_processed_at
        FROM processed_audit_logs
      `;

      this.db.get(query, (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            totalProcessed: row.total_processed || 0,
            processedToday: row.processed_today || 0,
            lastProcessedAt: row.last_processed_at
          });
        }
      });
    });
  }

  /**
   * Manually process specific date range
   */
  async processDateRange(startDate: string, endDate: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT a.*
        FROM audit_log a
        LEFT JOIN processed_audit_logs p ON a.id = p.audit_log_id
        WHERE p.audit_log_id IS NULL
          AND a.table_name = 'my_deposits'
          AND a.field_name = 'balance'
          AND DATE(a.timestamp) BETWEEN ? AND ?
        ORDER BY a.timestamp ASC
      `;

      this.db.all(query, [startDate, endDate], async (err, rows: AuditLogEntry[]) => {
        if (err) {
          reject(err);
          return;
        }

        let processedCount = 0;
        for (const entry of rows) {
          try {
            await this.processAuditEntry(entry);
            processedCount++;
          } catch (error) {
            console.error(`Failed to process audit entry ${entry.id}:`, error);
          }
        }

        resolve(processedCount);
      });
    });
  }
}
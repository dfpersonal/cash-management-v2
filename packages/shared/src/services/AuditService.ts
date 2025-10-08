import { Database } from 'sqlite3';

// Audit configuration interface
export interface AuditConfig {
  enabled: boolean;
  level: 'disabled' | 'key_fields' | 'full';
  include_events: boolean;
  event_types: string[];
  retention_days: number;
  max_entries: number;
  auto_cleanup: boolean;
}

// Audit log entry interface
export interface AuditLogEntry {
  id: number;
  table_name: string;
  record_id: number;
  field_name: string;
  old_value: string;
  new_value: string;
  operation_context: string;
  timestamp: string;
  notes?: string;
}

// Field change statistics interface
export interface FieldChangeStats {
  field_name: string;
  change_count: number;
  records_affected: number;
  first_change: string;
  last_change: string;
}

// Balance change summary interface
export interface BalanceChangeSummary {
  total_changes: number;
  total_increases: number;
  total_decreases: number;
  avg_change: number;
}

/**
 * AuditService for comprehensive field-per-record audit logging
 */
export class AuditService {
  private db: Database;
  private config: AuditConfig;
  private keyFields: Record<string, string[]> = {};

  constructor(database: Database, config: AuditConfig) {
    this.db = database;
    this.config = config;
    this.initializeKeyFields();
  }

  /**
   * Initialize key fields for audit_key_fields_only mode
   */
  private initializeKeyFields(): void {
    this.keyFields = {
      'my_deposits': [
        'balance',      // Financial impact (most critical)
        'aer',          // Interest rate changes affect income
        'bank',         // Institution changes (risk/regulatory)
        'is_active',    // Account status (active/inactive)
        'term_ends',    // Maturity date changes (liquidity planning)
        'type',         // Account classification changes
        'sub_type'      // Account classification changes
      ],
      'my_pending_deposits': [
        'balance',                 // Financial amount being moved
        'status',                  // Status changes (PENDING → FUNDED, etc.)
        'bank',                    // Destination institution
        'expected_funding_date',   // Timing changes
        'source_account_id'        // Funding source changes
      ],
      'notice_events': [
        'notice_given_date',      // When notice was given
        'planned_withdrawal_amount', // Amount planning to withdraw  
        'funds_available_date',   // When funds become available
        'status'                  // Notice status changes
      ],
      'rate_changes': [
        'current_rate',           // Original rate
        'new_rate',              // New rate being applied
        'effective_date',        // When rate change takes effect
        'status'                 // Rate change status
      ],
      'reminders': [
        'reminder_date',         // When reminder is due
        'is_sent',              // Whether reminder was triggered
        'is_snoozed'            // If reminder was postponed
      ],
      'action_items': [
        'status',               // Action status (pending → approved/rejected)
        'timeline',            // When action should be completed
        'amount_affected',      // Financial impact of the action
        'pending_deposit_id',   // Link to pending deposit
        'dismissed_reason'      // Reason for dismissal
      ]
    };
  }

  /**
   * Log individual field changes - core method for field-per-record approach
   */
  async logFieldChange(params: {
    tableName: string;
    recordId: number;
    fieldName: string;
    oldValue: any;
    newValue: any;
    operationContext: string;  // CREATE_DEPOSIT, UPDATE_DEPOSIT, etc.
    notes?: string;
  }): Promise<void> {
    
    if (!this.config.enabled) return;
    
    // Skip if field is not in key fields list (unless level is FULL)
    if (!this.shouldLogField(params.tableName, params.fieldName)) {
      return;
    }

    // Don't log if values are the same
    if (this.serializeValue(params.oldValue) === this.serializeValue(params.newValue)) {
      return;
    }

    const query = `
      INSERT INTO audit_log (
        table_name, record_id, field_name, old_value, new_value, 
        operation_context, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      params.tableName,
      params.recordId,
      params.fieldName,
      this.serializeValue(params.oldValue),
      this.serializeValue(params.newValue),
      params.operationContext,
      params.notes
    ];

    return new Promise((resolve, reject) => {
      this.db.run(query, values, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Log changes for multiple fields (generates multiple records)
   */
  async logDataChanges(params: {
    tableName: string;
    recordId: number;
    oldData: any;
    newData: any;
    operationContext: string;
    notes?: string;
  }): Promise<void> {
    
    if (!this.config.enabled) return;

    const oldObj = params.oldData || {};
    const newObj = params.newData || {};
    
    // Get all fields that exist in either old or new data
    const allFields = new Set([
      ...Object.keys(oldObj),
      ...Object.keys(newObj)
    ]);

    // Log each changed field as a separate record
    for (const fieldName of allFields) {
      const oldValue = oldObj[fieldName];
      const newValue = newObj[fieldName];
      
      await this.logFieldChange({
        tableName: params.tableName,
        recordId: params.recordId,
        fieldName,
        oldValue,
        newValue,
        operationContext: params.operationContext,
        notes: params.notes
      });
    }
  }

  /**
   * Get audit trail for a specific record
   */
  async getRecordAuditTrail(tableName: string, recordId: number): Promise<AuditLogEntry[]> {
    const query = `
      SELECT * FROM audit_log 
      WHERE table_name = ? AND record_id = ? 
      ORDER BY timestamp DESC, field_name
    `;

    return this.executeQuery(query, [tableName, recordId]);
  }

  /**
   * Get changes for a specific field across all records
   */
  async getFieldChanges(fieldName: string, limit = 100): Promise<AuditLogEntry[]> {
    const query = `
      SELECT * FROM audit_log 
      WHERE field_name = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `;

    return this.executeQuery(query, [fieldName, limit]);
  }

  /**
   * Get field change statistics
   */
  async getFieldChangeStats(daysBack = 30): Promise<FieldChangeStats[]> {
    const query = `
      SELECT 
        field_name,
        COUNT(*) as change_count,
        COUNT(DISTINCT record_id) as records_affected,
        MIN(timestamp) as first_change,
        MAX(timestamp) as last_change
      FROM audit_log 
      WHERE timestamp > date('now', '-${daysBack} days')
      GROUP BY field_name
      ORDER BY change_count DESC
    `;

    return this.executeQuery(query, []);
  }

  /**
   * Get balance change summary (financial analysis)
   */
  async getBalanceChangeSummary(daysBack = 30): Promise<BalanceChangeSummary> {
    const query = `
      SELECT 
        COUNT(*) as total_changes,
        SUM(CASE 
          WHEN CAST(new_value AS REAL) > CAST(old_value AS REAL) 
          THEN CAST(new_value AS REAL) - CAST(old_value AS REAL) 
          ELSE 0 
        END) as total_increases,
        SUM(CASE 
          WHEN CAST(new_value AS REAL) < CAST(old_value AS REAL) 
          THEN CAST(old_value AS REAL) - CAST(new_value AS REAL) 
          ELSE 0 
        END) as total_decreases,
        AVG(CAST(new_value AS REAL) - CAST(old_value AS REAL)) as avg_change
      FROM audit_log 
      WHERE field_name = 'balance' 
      AND timestamp > date('now', '-${daysBack} days')
      AND old_value != '' AND new_value != ''
    `;

    const result = await this.executeQuery(query, []);
    return result[0] || { total_changes: 0, total_increases: 0, total_decreases: 0, avg_change: 0 };
  }

  /**
   * Cleanup old entries based on configuration
   */
  async cleanupOldEntries(): Promise<number> {
    if (!this.config.auto_cleanup) return 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retention_days);

    const query = `
      DELETE FROM audit_log 
      WHERE timestamp < ? 
      OR id IN (
        SELECT id FROM audit_log 
        ORDER BY timestamp DESC 
        LIMIT -1 OFFSET ?
      )
    `;

    return new Promise((resolve, reject) => {
      this.db.run(query, [cutoffDate.toISOString(), this.config.max_entries], function(err) {
        if (err) reject(err);
        else resolve(this.changes || 0);
      });
    });
  }

  /**
   * Update audit configuration
   */
  updateConfig(newConfig: Partial<AuditConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Check if a field should be logged based on configuration
   */
  private shouldLogField(tableName: string, fieldName: string): boolean {
    if (this.config.level === 'full') return true;
    if (this.config.level === 'disabled') return false;
    
    const keyFields = this.keyFields[tableName] || [];
    return keyFields.includes(fieldName);
  }

  /**
   * Serialize a value for storage
   */
  private serializeValue(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * Execute a database query and return results
   */
  private async executeQuery(query: string, params: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // ============= Optimization-Specific Audit Methods =============

  /**
   * Log optimization run event
   */
  async logOptimizationRun(params: {
    module: 'fscs-compliance' | 'rate-optimizer';
    runId: string;
    status: 'started' | 'completed' | 'failed';
    resultSummary?: any;
  }): Promise<void> {
    if (!this.config.enabled) return;

    const operationContext = `OPTIMIZATION_RUN_${params.status.toUpperCase()}`;
    const notes = JSON.stringify({
      module: params.module,
      runId: params.runId,
      summary: params.resultSummary
    });

    // Log as a system event (record_id = 0 for system events)
    await this.logFieldChange({
      tableName: 'action_items',
      recordId: 0,
      fieldName: 'optimization_run',
      oldValue: params.status === 'started' ? null : 'running',
      newValue: params.status,
      operationContext,
      notes
    });
  }

  /**
   * Log conflict resolution event
   */
  async logConflictResolution(params: {
    conflictCount: number;
    resolutionStrategy: string;
    deletedMoves: number;
    preservedMoves: number;
  }): Promise<void> {
    if (!this.config.enabled) return;

    const notes = JSON.stringify(params);

    await this.logFieldChange({
      tableName: 'action_items',
      recordId: 0,
      fieldName: 'conflict_resolution',
      oldValue: null,
      newValue: `${params.deletedMoves} deleted, ${params.preservedMoves} preserved`,
      operationContext: 'CONFLICT_RESOLVED',
      notes
    });
  }

  /**
   * Log action item status change
   */
  async logActionItemStatusChange(params: {
    actionId: string;
    recordId: number;
    oldStatus: string;
    newStatus: string;
    pendingDepositId?: number;
    dismissalReason?: string;
  }): Promise<void> {
    if (!this.config.enabled) return;

    await this.logFieldChange({
      tableName: 'action_items',
      recordId: params.recordId,
      fieldName: 'status',
      oldValue: params.oldStatus,
      newValue: params.newStatus,
      operationContext: 'ACTION_ITEM_STATUS_CHANGE',
      notes: params.dismissalReason || `Pending deposit: ${params.pendingDepositId}`
    });
  }

  /**
   * Get optimization audit trail
   */
  async getOptimizationAuditTrail(
    module?: string,
    daysBack: number = 30
  ): Promise<AuditLogEntry[]> {
    let query = `
      SELECT * FROM audit_log 
      WHERE (operation_context LIKE 'OPTIMIZATION_%' 
             OR operation_context LIKE 'CONFLICT_%'
             OR operation_context = 'ACTION_ITEM_STATUS_CHANGE')
      AND timestamp > date('now', '-${daysBack} days')
    `;

    if (module) {
      query += ` AND notes LIKE '%"module":"${module}"%'`;
    }

    query += ' ORDER BY timestamp DESC';

    return this.executeQuery(query, []);
  }
}
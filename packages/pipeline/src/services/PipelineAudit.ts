import { Database } from 'better-sqlite3';

// Pipeline Audit Configuration (Environment-based)
interface PipelineAuditConfig {
  enabled: boolean;     // From PIPELINE_AUDIT_ENABLED environment variable
  level: 'minimal' | 'standard' | 'verbose';  // From PIPELINE_AUDIT_LEVEL
  persistRejected: boolean;
  outputFormat: 'database' | 'console' | 'json';
}

// Pipeline Audit Record Interfaces
interface PipelineAuditRecord {
  pipelineId: string;
  stage: string;
  timestamp: Date;
  inputCount: number;
  passedCount: number;
  rejectedCount: number;
  processingTime?: number;
  errorCount?: number;
  passedItems?: any[];
  rejectedItems?: any[];
  reasons?: Array<[string, any]>;
  metadata?: Record<string, any>;
}

interface PipelineAuditItemRecord {
  auditId: number;
  batchId: string;
  productId?: string;
  bankName?: string;
  platform?: string;
  stage: string;
  status: 'passed' | 'rejected' | 'error';
  rejectionReason?: string;
  metadata?: Record<string, any>;
}

// Service Result Interface for Audit
interface ServiceResult<T> {
  passed: T[];
  rejected: T[];
  reasons?: Map<string, any>;
  statistics?: any;
  metadata?: Record<string, any>;
}

/**
 * Pipeline Audit System (Development Only)
 *
 * This is separate from the existing audit_log table used for deposit tracking.
 * Purpose: Debug JSON ingestion → FRN → Deduplication pipeline processing
 *
 * Production: Always disabled for zero performance impact
 * Development: Opt-in with environment variables
 */
export class PipelineAudit {
  // Static counter for batch ID uniqueness across all instances
  private static batchIdCounter: number = 0;

  private config: PipelineAuditConfig;
  private db: Database | null = null;
  private batchId: string;
  private auditBatch: PipelineAuditRecord[] = [];
  private batchCreated: boolean = false;

  constructor(private pipelineId: string, database?: Database) {
    // Generate highly unique batch ID with timestamp, process ID, counter, and random component
    // This prevents collisions even when multiple instances are created rapidly
    const timestamp = Date.now();
    const processId = process.pid.toString(36);
    const counter = (++PipelineAudit.batchIdCounter).toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    this.batchId = `${timestamp}-${processId}${counter}${random}`;

    // Production always disables pipeline auditing (zero overhead)
    if (process.env.NODE_ENV === 'production') {
      this.config = {
        enabled: false,
        level: 'minimal',
        persistRejected: false,
        outputFormat: 'console'
      };
    } else {
      // Development requires explicit opt-in
      this.config = {
        enabled: process.env.PIPELINE_AUDIT_ENABLED === 'true',
        level: (process.env.PIPELINE_AUDIT_LEVEL as any) || 'standard',
        persistRejected: process.env.PIPELINE_AUDIT_PERSIST_REJECTED === 'true',
        outputFormat: (process.env.PIPELINE_AUDIT_OUTPUT as any) || 'console'
      };
    }

    // Only set database if auditing is enabled and we want database output
    console.log(`🔍 PipelineAudit config: enabled=${this.config.enabled}, outputFormat=${this.config.outputFormat}, database=${!!database}`);
    if (this.config.enabled && this.config.outputFormat === 'database' && database) {
      this.db = database;
      this.ensureAuditTables();
      console.log(`✅ PipelineAudit database connection established`);
    } else {
      console.log(`⚠️  PipelineAudit database connection NOT established`);
    }
  }

  /**
   * Record a pipeline stage result
   */
  record(stage: string, result: ServiceResult<any>, processingTime?: number): void {
    console.log(`🔍 PipelineAudit.record called: stage=${stage}, enabled=${this.config.enabled}, db=${!!this.db}`);
    if (!this.config.enabled) return; // No-op in production or when disabled

    const record: PipelineAuditRecord = {
      pipelineId: this.pipelineId,
      stage,
      timestamp: new Date(),
      inputCount: result.passed.length + result.rejected.length,
      passedCount: result.passed.length,
      rejectedCount: result.rejected.length,
      processingTime,
      errorCount: 0
    };

    // Add detailed data for verbose mode
    if (this.config.level === 'verbose') {
      record.passedItems = result.passed;
      record.rejectedItems = this.config.persistRejected ? result.rejected : [];
      record.reasons = result.reasons ? Array.from(result.reasons.entries()) : [];
      record.metadata = result.metadata || {};
    }

    this.persistAuditRecord(record);
  }

  /**
   * Record an error during pipeline processing
   */
  recordError(stage: string, error: Error, context?: any): void {
    if (!this.config.enabled) return;

    const record: PipelineAuditRecord = {
      pipelineId: this.pipelineId,
      stage,
      timestamp: new Date(),
      inputCount: 0,
      passedCount: 0,
      rejectedCount: 0,
      errorCount: 1,
      metadata: {
        error: error.message,
        stack: error.stack,
        context
      }
    };

    this.persistAuditRecord(record);
  }

  /**
   * Get the current batch ID for this audit session
   */
  getBatchId(): string {
    return this.batchId;
  }

  /**
   * Check if auditing is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Create master batch record in pipeline_batch table immediately
   */
  createBatch(): void {
    if (!this.config.enabled || !this.db) return;

    try {
      const batchStmt = this.db.prepare(`
        INSERT INTO pipeline_batch (batch_id, pipeline_id, status, metadata)
        VALUES (?, ?, 'running', ?)
      `);

      const metadata = {
        pipeline_id: this.pipelineId,
        audit_config: {
          enabled: this.config.enabled,
          level: this.config.level,
          output_format: this.config.outputFormat
        }
      };

      batchStmt.run(this.batchId, this.pipelineId, JSON.stringify(metadata));
      this.batchCreated = true;
      console.log(`🔍 PipelineAudit: Created master batch record for ${this.batchId}`);
    } catch (error) {
      console.error('PipelineAudit: Failed to create batch record:', error);
      throw error;
    }
  }

  /**
   * Complete batch and mark status
   */
  completeBatch(status: 'completed' | 'failed', errorMessage?: string): void {
    if (!this.config.enabled || !this.db) return;

    try {
      const stmt = this.db.prepare(`
        UPDATE pipeline_batch
        SET status = ?, completed_at = CURRENT_TIMESTAMP, error_message = ?
        WHERE batch_id = ?
      `);

      stmt.run(status, errorMessage || null, this.batchId);
      console.log(`🔍 PipelineAudit: Completed batch ${this.batchId} with status: ${status}`);
    } catch (error) {
      console.error('PipelineAudit: Failed to complete batch:', error);
      throw error;
    }
  }

  /**
   * Flush all batched audit records to database in a single transaction
   */
  flush(): void {
    if (!this.config.enabled || !this.db || this.auditBatch.length === 0) {
      console.log(`🔍 PipelineAudit: Flush skipped - enabled=${this.config.enabled}, db=${!!this.db}, records=${this.auditBatch.length}`);
      return;
    }

    console.log(`🔍 PipelineAudit: Flushing ${this.auditBatch.length} audit records to database`);

    try {
      this.db.transaction(() => {
        // Batch record should already be created by createBatch() method

        // Write all audit records
        const auditStmt = this.db!.prepare(`
          INSERT INTO pipeline_audit (
            batch_id, pipeline_id, stage, stage_order, input_count, output_count,
            passed_count, rejected_count, processing_time, error_count, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const record of this.auditBatch) {
          const stageOrder = record.metadata?.stage_order || this.getStageOrder(record.stage);

          auditStmt.run(
            this.batchId,
            record.pipelineId,
            record.stage,
            stageOrder,
            record.inputCount,
            record.passedCount + record.rejectedCount, // output_count
            record.passedCount,
            record.rejectedCount,
            record.processingTime || null,
            record.errorCount || 0,
            JSON.stringify(record.metadata || {})
          );
        }
      })();

      console.log(`✅ PipelineAudit: Successfully flushed ${this.auditBatch.length} records`);
      this.auditBatch = []; // Clear the batch
    } catch (error) {
      console.error('❌ PipelineAudit: Failed to flush audit records:', error);
      throw error;
    }
  }

  /**
   * Initialize pipeline audit entries for all stages upfront
   * This allows other services to reference pipeline_audit entries during stage execution
   */
  initializeAllStages(): void {
    if (!this.config.enabled) return;

    // First create the master batch record
    this.createBatch();

    // Then create stage records
    const stages = ['json_ingestion', 'frn_matching', 'deduplication'];

    stages.forEach((stage, index) => {
      const record: PipelineAuditRecord = {
        pipelineId: this.pipelineId,
        stage,
        timestamp: new Date(),
        inputCount: 0,
        passedCount: 0,
        rejectedCount: 0,
        metadata: {
          status: 'initialized',
          stage_order: index + 1
        }
      };

      this.persistAuditRecord(record);
    });

    console.log(`🔍 PipelineAudit: initialized master batch and ${stages.length} stage entries`);
  }

  /**
   * Persist audit record based on output format (batched for database)
   */
  private persistAuditRecord(record: PipelineAuditRecord): void {
    if (this.config.outputFormat === 'database' && this.db) {
      // Add to batch instead of immediate write
      this.auditBatch.push(record);
      console.log(`🔍 PipelineAudit: Added ${record.stage} record to batch (${this.auditBatch.length} records queued)`);
    } else if (this.config.outputFormat === 'console') {
      this.logToConsole(record);
    } else if (this.config.outputFormat === 'json') {
      this.logAsJson(record);
    }
  }

  /**
   * Persist to pipeline_audit table (separate from deposit audit_log)
   */
  private persistToDatabase(record: PipelineAuditRecord): void {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO pipeline_audit (
          batch_id, pipeline_id, stage, stage_order, input_count, output_count,
          passed_count, rejected_count, processing_time, error_count, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Extract stage_order from metadata or determine from stage name
      const stageOrder = record.metadata?.stage_order || this.getStageOrder(record.stage);

      stmt.run(
        this.batchId,
        record.pipelineId,
        record.stage,
        stageOrder,
        record.inputCount,
        record.passedCount + record.rejectedCount, // output_count
        record.passedCount,
        record.rejectedCount,
        record.processingTime || null,
        record.errorCount || 0,
        JSON.stringify(record.metadata || {})
      );
    } catch (error) {
      console.error('Pipeline Audit Database Error:', error);
      throw error; // CRITICAL FIX: Re-throw the error to ensure the pipeline fails
    }
  }

  /**
   * Get stage order number for a given stage name
   */
  private getStageOrder(stage: string): number {
    switch (stage) {
      case 'json_ingestion': return 1;
      case 'frn_matching': return 2;
      case 'deduplication': return 3;
      default: return 0;
    }
  }

  /**
   * Persist detailed product items for verbose mode
   */
  private persistDetailedItems(auditId: number, stage: string, items: any[], status: 'passed' | 'rejected' | 'error'): void {
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT INTO pipeline_audit_items (
        audit_id, batch_id, product_id, bank_name, platform,
        stage, status, rejection_reason, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    items.forEach(item => {
      try {
        stmt.run(
          auditId,
          this.batchId,
          item.id || item.productId || null,
          item.bankName || null,
          item.platform || null,
          stage,
          status,
          item.rejectionReason || null,
          JSON.stringify(item)
        );
      } catch (error) {
        console.error('Pipeline Audit Item Error:', error);
      }
    });
  }

  /**
   * Log to console (development default)
   */
  private logToConsole(record: PipelineAuditRecord): void {
    const summary = `🔍 Pipeline Audit [${record.stage}]: ${record.passedCount}/${record.inputCount} passed`;

    if (this.config.level === 'minimal') {
      console.log(summary);
    } else if (this.config.level === 'standard') {
      console.log(`${summary} (${record.processingTime || '?'}ms)`);
      if (record.rejectedCount > 0) {
        console.log(`  ↳ ${record.rejectedCount} rejected`);
      }
    } else if (this.config.level === 'verbose') {
      console.log(`${summary} (${record.processingTime || '?'}ms)`);
      console.log('  ↳ Full Record:', JSON.stringify(record, null, 2));
    }
  }

  /**
   * Log as structured JSON
   */
  private logAsJson(record: PipelineAuditRecord): void {
    console.log(JSON.stringify({
      type: 'pipeline_audit',
      ...record
    }));
  }

  /**
   * Ensure audit tables exist (development only)
   */
  private ensureAuditTables(): void {
    if (!this.db) return;

    try {
      // Check if tables exist
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='pipeline_audit'
      `).get();

      if (!tableExists) {
        console.log('📊 Creating pipeline audit tables for development...');

        // Read and execute the migration SQL
        const fs = require('fs');
        const path = require('path');
        const migrationPath = path.join(__dirname, '../../../data/database/migrations/create_pipeline_audit_tables.sql');

        if (fs.existsSync(migrationPath)) {
          const migrationSql = fs.readFileSync(migrationPath, 'utf8');
          this.db.exec(migrationSql);
          console.log('✅ Pipeline audit tables created successfully');
        } else {
          console.warn('⚠️ Pipeline audit migration file not found, creating tables inline');
          this.createTablesInline();
        }
      }
    } catch (error) {
      console.error('Pipeline Audit Table Creation Error:', error);
      console.log('⚠️ Falling back to console logging');
      this.config.outputFormat = 'console';
    }
  }

  /**
   * Create tables inline as fallback
   */
  private createTablesInline(): void {
    if (!this.db) return;

    const createTablesSql = `
      CREATE TABLE IF NOT EXISTS pipeline_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          batch_id TEXT NOT NULL,
          pipeline_id TEXT NOT NULL,
          stage TEXT NOT NULL,
          input_count INTEGER,
          output_count INTEGER,
          passed_count INTEGER,
          rejected_count INTEGER,
          processing_time INTEGER,
          error_count INTEGER DEFAULT 0,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pipeline_audit_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          audit_id INTEGER REFERENCES pipeline_audit(id),
          batch_id TEXT NOT NULL,
          product_id TEXT,
          bank_name TEXT,
          platform TEXT,
          stage TEXT,
          status TEXT CHECK(status IN ('passed', 'rejected', 'error')),
          rejection_reason TEXT,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_pipeline_audit_batch_id ON pipeline_audit(batch_id);
      CREATE INDEX IF NOT EXISTS idx_pipeline_audit_pipeline_id ON pipeline_audit(pipeline_id);
    `;

    this.db.exec(createTablesSql);
  }
}

// Export types for use in other modules
export type { PipelineAuditConfig, PipelineAuditRecord, ServiceResult };
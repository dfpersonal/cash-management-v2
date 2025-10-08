import * as Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

/**
 * TestDatabase Helper for Phase 4 Integration Tests
 *
 * Provides database setup, teardown, and validation utilities
 * for comprehensive integration testing with audit trail validation.
 */

export interface DatabaseValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  tableCount: number;
  auditTableCount: number;
  frnDataCount: number;
}

export interface TestDatabaseOptions {
  templateDb?: string;
  testDbPath?: string;
  enableWAL?: boolean;
  enableForeignKeys?: boolean;
  timeout?: number;
}

export class TestDatabase {
  private db: Database.Database | null = null;
  private testDbPath: string;
  private templateDbPath: string;

  constructor(options: TestDatabaseOptions = {}) {
    this.templateDbPath = options.templateDb ||
      process.env.DATABASE_PATH ||
      path.resolve(__dirname, '../../../data/test/databases/cash_savings_test_phase4.db');

    // If SHARED_TEST_DB is set, use a shared database for sequential tests
    if (process.env.SHARED_TEST_DB && !options.testDbPath) {
      this.testDbPath = path.resolve(__dirname, '../../../data/test/databases/shared_sequential_test.db');
    } else {
      this.testDbPath = options.testDbPath ||
        path.resolve(__dirname, `../../../data/test/databases/test_${Date.now()}.db`);
    }
  }

  /**
   * Initialize test database from template
   */
  async setup(): Promise<void> {
    try {
      // In shared mode, don't recreate the database if it already exists
      const isSharedMode = process.env.SHARED_TEST_DB === '1';
      const sharedDbExists = fs.existsSync(this.testDbPath);

      if (!sharedDbExists || !isSharedMode) {
        // Copy template database to test location
        if (fs.existsSync(this.testDbPath)) {
          fs.unlinkSync(this.testDbPath);
        }

        // Ensure test directory exists
        const testDir = path.dirname(this.testDbPath);
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir, { recursive: true });
        }

        // Copy template to test location
        fs.copyFileSync(this.templateDbPath, this.testDbPath);
      }

      // Open database connection
      this.db = new Database.default(this.testDbPath);

      // Configure database
      this.db!.pragma('journal_mode = WAL');
      this.db!.pragma('foreign_keys = ON');
      this.db!.pragma('synchronous = NORMAL');
      this.db!.pragma('cache_size = 1000');
      this.db!.pragma('temp_store = memory');

      // Create cross-platform deduplication views if deduplication_groups table exists
      this.createCrossPlatformViews();

      console.log(`✓ Test database initialized: ${this.testDbPath}`);
    } catch (error) {
      throw new Error(`Failed to setup test database: ${error}`);
    }
  }

  /**
   * Clean up test database
   */
  async teardown(): Promise<void> {
    try {
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      if (fs.existsSync(this.testDbPath)) {
        fs.unlinkSync(this.testDbPath);
      }

      // Clean up WAL and SHM files
      const walFile = this.testDbPath + '-wal';
      const shmFile = this.testDbPath + '-shm';

      if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
      if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);

      console.log(`✓ Test database cleaned up`);
    } catch (error) {
      console.warn(`Warning: Failed to fully clean up test database: ${error}`);
    }
  }

  /**
   * Get database connection
   */
  getConnection(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call setup() first.');
    }
    return this.db;
  }

  /**
   * Get test database path
   */
  getPath(): string {
    return this.testDbPath;
  }

  /**
   * Validate database schema and data integrity
   */
  validateDatabase(): DatabaseValidationResult {
    if (!this.db) {
      return {
        valid: false,
        errors: ['Database not initialized'],
        warnings: [],
        tableCount: 0,
        auditTableCount: 0,
        frnDataCount: 0
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check core tables exist
      const requiredTables = [
        'frn_lookup_helper',
        'frn_research_queue',
        'boe_institutions',
        'boe_shared_brands',
        'frn_manual_overrides',
        'unified_config',
        'available_products'
      ];

      const auditTables = [
        'json_ingestion_audit',
        'frn_matching_audit',
        'deduplication_audit',
        'deduplication_groups'
      ];

      // Get existing tables
      const existingTables = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row: any) => row.name) as string[];

      // Check required tables
      for (const table of requiredTables) {
        if (!existingTables.includes(table) && table !== 'frn_lookup_helper') {
          errors.push(`Required table missing: ${table}`);
        }
      }

      // Check for frn_lookup_helper view
      const views = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='view'")
        .all()
        .map((row: any) => row.name) as string[];

      if (!views.includes('frn_lookup_helper')) {
        errors.push('Required view missing: frn_lookup_helper');
      }

      // Check audit tables (warn if missing, don't error)
      let auditTableCount = 0;
      for (const table of auditTables) {
        if (existingTables.includes(table)) {
          auditTableCount++;
        } else {
          warnings.push(`Audit table missing: ${table}`);
        }
      }

      // Check FRN data availability
      let frnDataCount = 0;
      try {
        const result = this.db
          .prepare('SELECT COUNT(*) as count FROM frn_lookup_helper')
          .get() as any;
        frnDataCount = result?.count || 0;

        if (frnDataCount === 0) {
          warnings.push('No FRN data found in frn_lookup_helper');
        }
      } catch (error) {
        errors.push(`Failed to check FRN data: ${error}`);
      }

      // Check configuration data
      try {
        const configCount = this.db
          .prepare('SELECT COUNT(*) as count FROM unified_config')
          .get() as any;

        if ((configCount?.count || 0) === 0) {
          warnings.push('No configuration data found');
        }
      } catch (error) {
        warnings.push(`Could not check configuration data: ${error}`);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        tableCount: existingTables.length,
        auditTableCount,
        frnDataCount
      };

    } catch (error) {
      return {
        valid: false,
        errors: [`Database validation failed: ${error}`],
        warnings,
        tableCount: 0,
        auditTableCount: 0,
        frnDataCount: 0
      };
    }
  }

  /**
   * Clear audit tables for fresh test runs
   */
  clearAuditTables(): void {
    if (!this.db) return;

    // Clear child tables first (those with foreign key references)
    const childAuditTables = [
      'pipeline_audit',
      'json_ingestion_audit',
      'frn_matching_audit',
      'deduplication_audit',
      'deduplication_groups',
      'frn_research_queue'
    ];

    // Clear parent tables last (those referenced by foreign keys)
    const parentAuditTables = [
      'pipeline_batch'
    ];

    // Also clear product tables for test isolation
    const productTables = [
      'available_products',
      'excluded_products'
    ];

    try {
      this.db.transaction(() => {
        // Clear child audit tables first (those with foreign key references)
        for (const table of childAuditTables) {
          try {
            this.db!.prepare(`DELETE FROM ${table}`).run();
          } catch (error) {
            // Table might not exist, which is fine for some tests
            console.warn(`Could not clear child audit table ${table}: ${error}`);
          }
        }

        // Clear parent audit tables last (those referenced by foreign keys)
        for (const table of parentAuditTables) {
          try {
            this.db!.prepare(`DELETE FROM ${table}`).run();
          } catch (error) {
            // Table might not exist, which is fine for some tests
            console.warn(`Could not clear parent audit table ${table}: ${error}`);
          }
        }

        // Clear product tables for test isolation
        for (const table of productTables) {
          try {
            this.db!.prepare(`DELETE FROM ${table}`).run();
          } catch (error) {
            // Table might not exist, which is fine for some tests
            console.warn(`Could not clear product table ${table}: ${error}`);
          }
        }
      })();

      console.log('✓ Audit tables cleared');
    } catch (error) {
      console.warn(`Warning: Failed to clear some audit tables: ${error}`);
    }
  }

  /**
   * Insert test configuration by copying from existing database or adding custom config
   */
  insertTestConfig(config?: Record<string, string>): void {
    if (!this.db) return;

    try {
      // If no custom config provided, use existing config for JSON pipeline services
      if (!config) {
        // Check that we have the required categories for JSON pipeline
        const pipelineCategories = ['json_ingestion', 'deduplication', 'orchestrator', 'frn_management'];
        const existingConfig = this.db.prepare(`
          SELECT config_key, config_value, config_type, category, description
          FROM unified_config
          WHERE category IN (?, ?, ?, ?)
          ORDER BY category, config_key
        `).all(...pipelineCategories) as Array<{
          config_key: string;
          config_value: string;
          config_type: string;
          category: string;
          description: string;
        }>;

        const categoryCount = this.db.prepare(`
          SELECT category, COUNT(*) as count
          FROM unified_config
          WHERE category IN (?, ?, ?, ?)
          GROUP BY category
          ORDER BY category
        `).all(...pipelineCategories) as Array<{ category: string; count: number }>;

        console.log(`✓ Test configuration ready: ${existingConfig.length} parameters from JSON pipeline categories`);
        categoryCount.forEach(({ category, count }) => {
          console.log(`  - ${category}: ${count} parameters`);
        });
        return;
      }

      // Custom config insertion (original functionality)
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO unified_config
        (category, config_key, config_value, config_type, description)
        VALUES ('json_ingestion', ?, ?, ?, 'Test configuration')
      `);

      this.db.transaction(() => {
        for (const [key, value] of Object.entries(config)) {
          // Determine config_type based on value
          let configType = 'string';
          if (value === 'true' || value === 'false') {
            configType = 'boolean';
          } else if (!isNaN(Number(value)) && !isNaN(parseFloat(value))) {
            configType = 'number';
          }

          stmt.run(key, value, configType);
        }
      })();

      console.log(`✓ Test configuration inserted: ${Object.keys(config).length} items`);
    } catch (error) {
      throw new Error(`Failed to insert test configuration: ${error}`);
    }
  }

  /**
   * Get audit trail entries for validation
   */
  getAuditTrail(batchId: string): any {
    if (!this.db) return null;

    try {
      const result = {
        jsonIngestion: [] as any[],
        frnMatching: [] as any[],
        deduplication: null as any,
        dedupGroups: [] as any[]
      };

      // Get JSON ingestion audit entries
      try {
        result.jsonIngestion = this.db
          .prepare('SELECT * FROM json_ingestion_audit WHERE batch_id = ?')
          .all(batchId) as any[];
      } catch (error) {
        console.warn('json_ingestion_audit table not available');
      }

      // Get FRN matching audit entries
      try {
        result.frnMatching = this.db
          .prepare('SELECT * FROM frn_matching_audit WHERE batch_id = ?')
          .all(batchId) as any[];
      } catch (error) {
        console.warn('frn_matching_audit table not available');
      }

      // Get deduplication audit entry
      try {
        result.deduplication = this.db
          .prepare('SELECT * FROM deduplication_audit WHERE batch_id = ?')
          .get(batchId) as any;
      } catch (error) {
        console.warn('deduplication_audit table not available');
      }

      // Get deduplication groups
      try {
        result.dedupGroups = this.db
          .prepare('SELECT * FROM deduplication_groups WHERE batch_id = ?')
          .all(batchId) as any[];
      } catch (error) {
        console.warn('deduplication_groups table not available');
      }

      return result;
    } catch (error) {
      console.error(`Failed to get audit trail: ${error}`);
      return null;
    }
  }

  /**
   * Create database snapshot for test restoration
   */
  createSnapshot(snapshotName: string): void {
    if (!this.db) return;

    try {
      const snapshotPath = this.testDbPath.replace('.db', `_${snapshotName}.db`);

      // Close current connection temporarily
      this.db.close();

      // Copy database file
      fs.copyFileSync(this.testDbPath, snapshotPath);

      // Reopen connection
      this.db = new Database.default(this.testDbPath);
      this.db!.pragma('journal_mode = WAL');
      this.db!.pragma('foreign_keys = ON');

      console.log(`✓ Database snapshot created: ${snapshotName}`);
    } catch (error) {
      // Ensure we reopen the connection even if snapshot fails
      if (!this.db || !this.db.open) {
        this.db = new Database.default(this.testDbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
      }
      throw new Error(`Failed to create snapshot: ${error}`);
    }
  }

  /**
   * Restore database from snapshot
   */
  restoreSnapshot(snapshotName: string): void {
    if (!this.db) return;

    try {
      const snapshotPath = this.testDbPath.replace('.db', `_${snapshotName}.db`);

      if (!fs.existsSync(snapshotPath)) {
        throw new Error(`Snapshot not found: ${snapshotName}`);
      }

      // Close current connection
      this.db.close();

      // Restore from snapshot
      fs.copyFileSync(snapshotPath, this.testDbPath);

      // Reopen connection
      this.db = new Database.default(this.testDbPath);
      this.db!.pragma('journal_mode = WAL');
      this.db!.pragma('foreign_keys = ON');

      console.log(`✓ Database restored from snapshot: ${snapshotName}`);
    } catch (error) {
      // Ensure we reopen the connection even if restore fails
      if (!this.db || !this.db.open) {
        this.db = new Database.default(this.testDbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
      }
      throw new Error(`Failed to restore snapshot: ${error}`);
    }
  }

  /**
   * Create cross-platform deduplication views for tracking removed products
   */
  private createCrossPlatformViews(): void {
    if (!this.db) return;

    try {
      // Check if deduplication_groups table exists
      const tableCheck = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='deduplication_groups'")
        .get() as any;

      if (!tableCheck) {
        console.log('✓ Deduplication views skipped (deduplication_groups table not found)');
        return;
      }

      // Drop existing views first
      this.db.prepare('DROP VIEW IF EXISTS v_cross_platform_deduplication').run();
      this.db.prepare('DROP VIEW IF EXISTS v_deduplication_summary').run();
      this.db.prepare('DROP VIEW IF EXISTS v_cross_platform_removals_only').run();

      // Create comprehensive cross-platform deduplication view
      this.db.prepare(`
        CREATE VIEW v_cross_platform_deduplication AS
        SELECT
            -- Basic identification
            dg.id,
            dg.business_key,
            dg.batch_id,
            dg.products_in_group,

            -- Selection details (what was kept)
            dg.selected_product_id,
            dg.selected_product_platform,
            dg.selected_product_source,
            dg.selection_reason,

            -- Removal flag (simple boolean for easy querying)
            CASE
                WHEN dg.selection_reason = 'platform_separation' THEN 1
                WHEN dg.selection_reason = 'fscs_bank_separation' THEN 1
                WHEN dg.products_in_group > 1 THEN 1
                ELSE 0
            END as removed_by_cross_platform_dedup,

            -- Details about what was removed
            dg.rejected_products,
            dg.platforms_in_group,
            dg.sources_in_group,
            dg.quality_scores,

            -- Computed removal statistics
            (dg.products_in_group - 1) as products_removed_count,

            -- Platform analysis
            CASE
                WHEN JSON_VALID(dg.platforms_in_group) THEN JSON_ARRAY_LENGTH(dg.platforms_in_group)
                ELSE 0
            END as unique_platforms_count,

            CASE
                WHEN JSON_VALID(dg.sources_in_group) THEN JSON_ARRAY_LENGTH(dg.sources_in_group)
                ELSE 0
            END as unique_sources_count,

            -- Removal reason categories
            CASE
                WHEN dg.selection_reason = 'platform_separation' THEN 'Platform-based removal'
                WHEN dg.selection_reason = 'fscs_bank_separation' THEN 'FSCS compliance removal'
                WHEN dg.selection_reason = 'single_product' THEN 'No removal (single product)'
                ELSE 'Other removal reason'
            END as removal_category,

            -- Audit metadata
            dg.created_at as deduplication_timestamp

        FROM deduplication_groups dg
        WHERE dg.products_in_group >= 1
        ORDER BY dg.created_at DESC
      `).run();

      // Create summary view
      this.db.prepare(`
        CREATE VIEW v_deduplication_summary AS
        SELECT
            -- Selection reason breakdown
            dg.selection_reason,

            -- Group statistics
            COUNT(*) as group_count,
            SUM(CASE WHEN dg.products_in_group > 1 THEN 1 ELSE 0 END) as groups_with_removals,
            SUM(dg.products_in_group - 1) as total_products_removed,

            -- Group size analysis
            ROUND(AVG(CAST(dg.products_in_group as FLOAT)), 2) as avg_group_size,
            MIN(dg.products_in_group) as min_group_size,
            MAX(dg.products_in_group) as max_group_size,

            -- Processing statistics
            COUNT(DISTINCT dg.batch_id) as batch_count,
            MIN(dg.created_at) as first_occurrence,
            MAX(dg.created_at) as last_occurrence,

            -- Removal rate calculation
            ROUND(100.0 * SUM(dg.products_in_group - 1) / SUM(dg.products_in_group), 2) as removal_percentage

        FROM deduplication_groups dg
        GROUP BY dg.selection_reason
        ORDER BY total_products_removed DESC
      `).run();

      // Create simplified removals-only view
      this.db.prepare(`
        CREATE VIEW v_cross_platform_removals_only AS
        SELECT
            business_key,
            batch_id,
            products_in_group,
            products_removed_count,
            selected_product_platform as kept_platform,
            selected_product_source as kept_source,
            platforms_in_group as competing_platforms,
            rejected_products as removed_product_ids,
            selection_reason as removal_reason,
            deduplication_timestamp
        FROM v_cross_platform_deduplication
        WHERE removed_by_cross_platform_dedup = 1
        ORDER BY products_removed_count DESC, deduplication_timestamp DESC
      `).run();

      console.log('✓ Cross-platform deduplication views created for test database');
    } catch (error) {
      console.warn(`Warning: Failed to create cross-platform deduplication views: ${error}`);
    }
  }
}
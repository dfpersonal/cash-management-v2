import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

/**
 * FSCS Test Database Helper
 *
 * Provides database setup, teardown, and test data injection utilities
 * for FSCS compliance engine integration tests.
 *
 * Follows the pattern from pipeline tests for consistent test infrastructure.
 */

export interface TestAccountParams {
  frn: string;
  bank: string;
  balance: number;
  type?: 'Current' | 'Savings';
  subType?: string;
  isJointAccount?: boolean;
  isActive?: boolean;
}

export class FSCSTestDatabase {
  private db: Database.Database | null = null;
  private testDbPath: string;
  private templateDbPath: string;

  constructor() {
    this.templateDbPath = path.resolve(__dirname, '../../../data/test/databases/cash_savings_test_phase4.db');
    this.testDbPath = path.resolve(__dirname, `../../../data/test/databases/fscs_test_${Date.now()}.db`);
  }

  /**
   * Initialize test database from template
   */
  async setup(): Promise<void> {
    try {
      // Ensure test directory exists
      const testDir = path.dirname(this.testDbPath);
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      // Copy template to test location
      fs.copyFileSync(this.templateDbPath, this.testDbPath);

      // Open connection
      this.db = new Database(this.testDbPath);

      // Configure database
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');

      console.log(`✓ FSCS test database initialized: ${this.testDbPath}`);
    } catch (error) {
      throw new Error(`Failed to setup FSCS test database: ${error}`);
    }
  }

  /**
   * Get direct database connection for test queries
   */
  getConnection(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call setup() first.');
    }
    return this.db;
  }

  /**
   * Get database path for passing to FSCSComplianceEngine
   */
  getPath(): string {
    return this.testDbPath;
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

      // Delete test database file
      if (fs.existsSync(this.testDbPath)) {
        fs.unlinkSync(this.testDbPath);
      }

      // Delete WAL and SHM files if they exist
      const walPath = this.testDbPath + '-wal';
      const shmPath = this.testDbPath + '-shm';
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

      console.log(`✓ FSCS test database cleaned up`);
    } catch (error) {
      console.error(`Warning: Failed to cleanup test database: ${error}`);
    }
  }

  /**
   * Insert test account into my_deposits table
   */
  insertTestAccount(params: TestAccountParams): void {
    const stmt = this.db!.prepare(`
      INSERT INTO my_deposits (frn, bank, type, balance, sub_type, is_joint_account, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      params.frn,
      params.bank,
      params.type || 'Savings',
      params.balance,
      params.subType || 'Easy Access',
      params.isJointAccount ? 1 : 0,
      params.isActive !== false ? 1 : 0
    );
  }

  /**
   * Clear test accounts (default: accounts with FRN starting with 'TEST')
   */
  clearTestAccounts(pattern: string = 'TEST%'): void {
    this.db!.prepare('DELETE FROM my_deposits WHERE frn LIKE ?').run(pattern);
  }

  /**
   * Clear ALL accounts from my_deposits (use for isolated tests)
   */
  clearAllAccounts(): void {
    // Temporarily disable foreign keys for deletion
    this.db!.pragma('foreign_keys = OFF');
    this.db!.prepare('DELETE FROM my_deposits').run();
    this.db!.pragma('foreign_keys = ON');
  }

  /**
   * Update compliance configuration value
   */
  updateConfig(key: string, value: string): void {
    const stmt = this.db!.prepare(`
      UPDATE compliance_config
      SET config_value = ?
      WHERE config_key = ?
    `);
    stmt.run(value, key);
  }

  /**
   * Get compliance configuration value
   */
  getConfig(key: string): string | null {
    const row = this.db!.prepare(`
      SELECT config_value
      FROM compliance_config
      WHERE config_key = ?
    `).get(key) as { config_value: string } | undefined;

    return row ? row.config_value : null;
  }

  /**
   * Insert institution preference for testing
   */
  insertInstitutionPreference(params: {
    frn: string;
    bankName: string;
    personalLimit: number;
    easyAccessRequired?: boolean;
    trustLevel?: 'high' | 'medium' | 'low';
    riskNotes?: string;
  }): void {
    const stmt = this.db!.prepare(`
      INSERT INTO institution_preferences
      (frn, bank_name, personal_limit, easy_access_required_above_fscs, trust_level, risk_notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      params.frn,
      params.bankName,
      params.personalLimit,
      params.easyAccessRequired !== false ? 1 : 0,
      params.trustLevel || 'medium',
      params.riskNotes || null
    );
  }

  /**
   * Clear test institution preferences
   */
  clearTestPreferences(pattern: string = 'TEST%'): void {
    this.db!.prepare('DELETE FROM institution_preferences WHERE frn LIKE ?').run(pattern);
  }

  /**
   * Get account count for verification
   */
  getAccountCount(): number {
    const row = this.db!.prepare('SELECT COUNT(*) as count FROM my_deposits WHERE is_active = 1').get() as { count: number };
    return row.count;
  }

  /**
   * Get total balance for a specific FRN
   */
  getFRNBalance(frn: string): number {
    const row = this.db!.prepare(`
      SELECT COALESCE(SUM(balance), 0) as total
      FROM my_deposits
      WHERE frn = ? AND is_active = 1
    `).get(frn) as { total: number };
    return row.total;
  }
}

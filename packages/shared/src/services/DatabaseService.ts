import { Database } from 'sqlite3';
import { 
  PortfolioSummary, 
  PortfolioHolding, 
  AllocationAnalysis, 
  Configuration, 
  CalendarEvent,
  CalendarSummary,
  RateChange,
  NoticeEvent,
  Reminder,
  BalanceUpdateSession,
  BalanceUpdateLog,
  DepositBalanceStatus,
  BalanceUpdateSessionProgress,
  IncomeHistoryPoint,
  BalanceUpdateFilters,
  Deposit
} from '../types/PortfolioTypes';
import { AuditService, AuditConfig } from './AuditService';
import { TransactionService } from './TransactionService';
import { BalanceUpdateService } from './BalanceUpdateService';
import { DatabaseValidator } from '../utils/DatabaseValidator';

export class DatabaseService {
  private db: Database;
  private auditService: AuditService | null = null;
  private transactionService: TransactionService | null = null;

  constructor(databasePath: string) {
    // Pre-flight validation
    const validation = DatabaseValidator.validateDatabase(databasePath);
    if (!validation.isValid) {
      console.error('❌ Database validation failed:', validation.error);
      throw new Error(`Database validation failed: ${validation.error}`);
    }

    console.log('✅ Database validation passed:', validation.path);

    this.db = new Database(databasePath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      } else {
        console.log('Connected to SQLite database at:', databasePath);
        
        // Configure database for immediate write visibility
        this.db.run("PRAGMA synchronous = FULL", (err) => {
          if (err) console.error('Error setting synchronous mode:', err);
          else console.log('Database synchronous mode set to FULL');
        });
        
        // Use WAL mode for better concurrency
        this.db.run("PRAGMA journal_mode = WAL", (err) => {
          if (err) console.error('Error setting journal mode:', err);
          else console.log('Database journal mode set to WAL');
        });
        
        // Ensure read consistency
        this.db.run("PRAGMA read_uncommitted = 0", (err) => {
          if (err) console.error('Error setting read_uncommitted:', err);
          else console.log('Database read consistency ensured');
        });
        
        this.initializeBalanceUpdateTables();
        this.initializeAuditService();
      }
    });
  }

  /**
   * Initialize balance update tables and columns
   */
  private initializeBalanceUpdateTables(): void {
    this.db.serialize(() => {
      try {
        // Create balance_update_sessions table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS balance_update_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP NULL,
            total_deposits INTEGER NOT NULL,
            updated_count INTEGER DEFAULT 0,
            session_type TEXT DEFAULT 'manual' CHECK (session_type IN ('manual', 'scheduled', 'partial'))
          )
        `, (err) => {
          if (err) {
            console.error('Error creating balance_update_sessions table:', err);
          } else {
            console.log('Created balance_update_sessions table');
          }
        });

        // Create balance_update_log table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS balance_update_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            deposit_id INTEGER NOT NULL,
            old_balance DECIMAL(10,2),
            new_balance DECIMAL(10,2),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'updated' CHECK (status IN ('updated', 'skipped', 'pending')),
            FOREIGN KEY (session_id) REFERENCES balance_update_sessions(id),
            FOREIGN KEY (deposit_id) REFERENCES my_deposits(id)
          )
        `, (err) => {
          if (err) {
            console.error('Error creating balance_update_log table:', err);
          } else {
            console.log('Created balance_update_log table');
          }
        });

        // Add new columns to my_deposits table
        this.db.run(`ALTER TABLE my_deposits ADD COLUMN last_balance_update TIMESTAMP`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding last_balance_update column:', err);
          }
        });
        
        this.db.run(`ALTER TABLE my_deposits ADD COLUMN balance_update_frequency TEXT DEFAULT 'monthly' CHECK (balance_update_frequency IN ('weekly', 'bi-weekly', 'monthly', 'quarterly'))`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding balance_update_frequency column:', err);
          }
        });
        
        this.db.run(`ALTER TABLE my_deposits ADD COLUMN next_balance_check TIMESTAMP`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding next_balance_check column:', err);
          }
        });

        // Add destination_account_id to my_pending_deposits for existing vs new account handling
        this.db.run(`ALTER TABLE my_pending_deposits ADD COLUMN destination_account_id INTEGER REFERENCES my_deposits(id)`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding destination_account_id column:', err);
          }
        });

        // Create indexes for better performance
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_balance_sessions_type ON balance_update_sessions(session_type)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_balance_log_session ON balance_update_log(session_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_balance_log_deposit ON balance_update_log(deposit_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_deposits_next_check ON my_deposits(next_balance_check)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_deposits_frequency ON my_deposits(balance_update_frequency)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_pending_destination ON my_pending_deposits(destination_account_id)`);

        console.log('Balance update tables and indexes initialized');
      } catch (error) {
        console.error('Error initializing balance update tables:', error);
      }
    });
  }


  /**
   * Initialize audit service with configuration
   */
  private async initializeAuditService(): Promise<void> {
    try {
      const auditConfig = await this.getAuditConfig();
      this.auditService = new AuditService(this.db, auditConfig);
      
      // Initialize transaction service as well
      this.transactionService = new TransactionService(this.db);
    } catch (error) {
      console.error('Failed to initialize audit service:', error);
      // Continue without audit service if initialization fails
    }
  }

  /**
   * Get portfolio summary statistics including projected income from pending deposits
   */
  async getPortfolioSummary(): Promise<PortfolioSummary> {
    return new Promise((resolve, reject) => {
      // Get current deposits summary
      const currentQuery = `
        SELECT 
          COUNT(*) as total_accounts,
          COUNT(DISTINCT frn) as institution_count,
          SUM(balance) as total_value,
          SUM(balance * aer) / SUM(balance) as weighted_average_rate,
          SUM(CASE WHEN is_active = 1 THEN balance ELSE 0 END) as active_value,
          SUM(CASE WHEN liquidity_tier <= 2 THEN balance ELSE 0 END) as liquid_value
        FROM my_deposits 
        WHERE balance > 0
      `;

      this.db.get(currentQuery, (err, currentRow: any) => {
        if (err) {
          reject(err);
          return;
        }

        // Get pending deposits summary
        // We need to separate internal transfers from external deposits
        const pendingQuery = `
          SELECT 
            COUNT(*) as pending_count,
            COUNT(DISTINCT frn) as pending_institution_count,
            SUM(balance) as pending_value,
            SUM(CASE WHEN source_account_id IS NULL THEN balance ELSE 0 END) as external_value,
            SUM(CASE WHEN source_account_id IS NOT NULL THEN balance ELSE 0 END) as internal_value,
            SUM(CASE WHEN aer IS NOT NULL THEN balance * aer ELSE 0 END) / 
              SUM(CASE WHEN aer IS NOT NULL THEN balance ELSE NULL END) as pending_weighted_rate,
            SUM(CASE WHEN source_account_id IS NULL AND aer IS NOT NULL THEN balance * aer ELSE 0 END) / 
              NULLIF(SUM(CASE WHEN source_account_id IS NULL AND aer IS NOT NULL THEN balance ELSE NULL END), 0) as external_weighted_rate
          FROM my_pending_deposits 
          WHERE balance > 0 
            AND status IN ('PENDING', 'APPROVED')
            AND is_active = 1
        `;

        this.db.get(pendingQuery, (err, pendingRow: any) => {
          if (err) {
            reject(err);
            return;
          }

          // Calculate current values
          const currentValue = currentRow.total_value || 0;
          const currentRate = currentRow.weighted_average_rate || 0;
          const currentIncome = currentValue * currentRate / 100;

          // Calculate pending values - separate external from internal
          const pendingValue = pendingRow.pending_value || 0;
          const externalValue = pendingRow.external_value || 0;  // Only new money
          const internalValue = pendingRow.internal_value || 0;  // Transfers between accounts
          const externalRate = pendingRow.external_weighted_rate || 0;
          const externalIncome = externalValue * externalRate / 100;

          // Calculate projected values (current + external deposits only)
          // Internal transfers don't add to total value, they just move money around
          const projectedTotalValue = currentValue + externalValue;
          const projectedWeightedRate = projectedTotalValue > 0 
            ? ((currentValue * currentRate) + (externalValue * externalRate)) / projectedTotalValue
            : currentRate;
          const projectedAnnualIncome = currentIncome + externalIncome;

          const summary: PortfolioSummary = {
            // Current portfolio metrics
            totalValue: currentValue,
            totalAccounts: currentRow.total_accounts || 0,
            institutionCount: currentRow.institution_count || 0,
            weightedAverageRate: currentRate,
            activeValue: currentRow.active_value || 0,
            liquidValue: currentRow.liquid_value || 0,
            annualIncome: currentIncome,
            liquidityPercentage: ((currentRow.liquid_value || 0) / (currentValue || 1)) * 100,
            lastUpdated: new Date(),
            
            // Enhanced income tracking (current + pending)
            projectedAnnualIncome: projectedAnnualIncome,
            projectedTotalValue: projectedTotalValue,
            projectedWeightedAverageRate: projectedWeightedRate,
            pendingDepositCount: pendingRow.pending_count || 0,
            pendingDepositValue: pendingValue
          };
          
          resolve(summary);
        });
      });
    });
  }

  /**
   * Capture income snapshot for historical tracking
   */
  async captureIncomeSnapshot(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Get current portfolio summary
        const summary = await this.getPortfolioSummary();
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        // Insert or update today's snapshot
        const insertQuery = `
          INSERT OR REPLACE INTO annual_income_history (
            snapshot_date,
            current_annual_income,
            projected_annual_income,
            current_portfolio_value,
            projected_portfolio_value,
            current_weighted_rate,
            projected_weighted_rate,
            active_deposit_count,
            pending_deposit_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        this.db.run(insertQuery, [
          today,
          summary.annualIncome,
          summary.projectedAnnualIncome,
          summary.totalValue,
          summary.projectedTotalValue,
          summary.weightedAverageRate,
          summary.projectedWeightedAverageRate,
          summary.totalAccounts,
          summary.pendingDepositCount
        ], (err) => {
          if (err) {
            console.error('Error capturing income snapshot:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get income history for trend analysis with enhanced granularity
   */
  async getIncomeHistory(period: number = 12, unit: 'days' | 'weeks' | 'months' = 'months'): Promise<IncomeHistoryPoint[]> {
    return new Promise((resolve, reject) => {
      let query: string;
      let dateFilter: string;

      // Determine date filter based on period and unit
      if (unit === 'days') {
        dateFilter = `date('now', '-${period} days')`;
      } else if (unit === 'weeks') {
        dateFilter = `date('now', '-${period * 7} days')`;
      } else {
        dateFilter = `date('now', '-${period} months')`;
      }

      if (unit === 'weeks' && period === 4) {
        // For 1-month view: aggregate by week (4 weeks = 28 days)
        query = `
          SELECT 
            date(snapshot_date, 'weekday 0', '-6 days') as date,
            AVG(current_annual_income) as currentIncome,
            AVG(projected_annual_income) as projectedIncome,
            AVG(current_portfolio_value) as portfolioValue,
            AVG(current_weighted_rate) as weightedRate
          FROM annual_income_history 
          WHERE snapshot_date >= date('now', '-28 days')
          GROUP BY strftime('%Y-%W', snapshot_date)
          ORDER BY date ASC
        `;
      } else {
        // For daily and monthly views: direct query
        query = `
          SELECT 
            snapshot_date as date,
            current_annual_income as currentIncome,
            projected_annual_income as projectedIncome,
            current_portfolio_value as portfolioValue,
            current_weighted_rate as weightedRate
          FROM annual_income_history 
          WHERE snapshot_date >= ${dateFilter}
          ORDER BY snapshot_date ASC
        `;
      }

      this.db.all(query, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const historyPoints: IncomeHistoryPoint[] = (rows || []).map(row => ({
            date: row.date,
            currentIncome: row.currentIncome || 0,
            projectedIncome: row.projectedIncome || 0,
            portfolioValue: row.portfolioValue || 0,
            weightedRate: row.weightedRate || 0
          }));
          resolve(historyPoints);
        }
      });
    });
  }

  /**
   * Get latest income comparison (current vs previous snapshot)
   */
  async getIncomeComparison(): Promise<{ current: number; previous: number; change: number; changePercentage: number } | null> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          current_annual_income,
          snapshot_date,
          LAG(current_annual_income) OVER (ORDER BY snapshot_date) as previous_income
        FROM annual_income_history 
        ORDER BY snapshot_date DESC 
        LIMIT 1
      `;

      this.db.get(query, (err, row: any) => {
        if (err) {
          reject(err);
        } else if (!row || row.previous_income === null) {
          resolve(null); // Not enough data for comparison
        } else {
          const current = row.current_annual_income || 0;
          const previous = row.previous_income || 0;
          const change = current - previous;
          const changePercentage = previous > 0 ? (change / previous) * 100 : 0;

          resolve({
            current,
            previous,
            change,
            changePercentage
          });
        }
      });
    });
  }

  /**
   * Check audit trail and capture snapshot if income-affecting changes are detected
   */
  async checkAndCaptureSnapshot(): Promise<{ captured: boolean; reason?: string }> {
    return new Promise(async (resolve, reject) => {
      try {
        // Get the date of the last snapshot
        const lastSnapshotQuery = `
          SELECT snapshot_date 
          FROM annual_income_history 
          ORDER BY snapshot_date DESC 
          LIMIT 1
        `;

        this.db.get(lastSnapshotQuery, async (err, row: any) => {
          if (err) {
            reject(err);
            return;
          }

          const today = new Date().toISOString().split('T')[0];
          const lastSnapshotDate = row?.snapshot_date || '1900-01-01';

          // If we already have a snapshot for today, no need to capture another
          if (lastSnapshotDate === today) {
            resolve({ captured: false, reason: 'Snapshot already exists for today' });
            return;
          }

          // Check for income-affecting changes in audit trail since last snapshot
          const auditQuery = `
            SELECT COUNT(*) as change_count, 
                   GROUP_CONCAT(DISTINCT table_name || '.' || field_name) as changed_fields
            FROM audit_log 
            WHERE timestamp > datetime(? || ' 23:59:59')
              AND (
                (table_name = 'my_deposits' AND field_name IN ('balance', 'aer'))
                OR 
                (table_name = 'my_pending_deposits' AND field_name IN ('balance', 'status'))
              )
          `;

          this.db.get(auditQuery, [lastSnapshotDate], async (auditErr, auditRow: any) => {
            if (auditErr) {
              reject(auditErr);
              return;
            }

            const changeCount = auditRow?.change_count || 0;
            
            // Capture daily snapshots for historical tracking
            try {
              await this.captureIncomeSnapshot();
              if (changeCount > 0) {
                resolve({ 
                  captured: true, 
                  reason: `${changeCount} income-affecting changes detected: ${auditRow.changed_fields}` 
                });
              } else {
                resolve({ 
                  captured: true, 
                  reason: 'Daily snapshot captured for historical tracking' 
                });
              }
            } catch (captureError) {
              reject(captureError);
            }
          });
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get all portfolio holdings
   */
  async getPortfolioHoldings(): Promise<PortfolioHolding[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          bank,
          type as account_type,
          balance,
          aer,
          term_months,
          notice_period_days,
          term_ends as maturity_date,
          liquidity_tier,
          platform,
          frn,
          is_active,
          can_withdraw_immediately,
          CASE 
            WHEN term_ends IS NOT NULL AND DATE(term_ends) <= DATE('now', '+30 days') THEN 1
            ELSE 0
          END as upcoming_maturity
        FROM my_deposits 
        WHERE balance > 0 
        ORDER BY balance DESC
      `;

      this.db.all(query, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const holdings: PortfolioHolding[] = rows.map(row => ({
            bank: row.bank,
            accountType: row.account_type,
            balance: row.balance,
            rate: row.aer,
            termMonths: row.term_months,
            noticePeriodDays: row.notice_period_days,
            maturityDate: row.maturity_date ? new Date(row.maturity_date) : undefined,
            liquidityTier: row.liquidity_tier,
            platform: row.platform,
            frn: row.frn,
            isActive: Boolean(row.is_active),
            canWithdrawImmediately: Boolean(row.can_withdraw_immediately),
            upcomingMaturity: Boolean(row.upcoming_maturity)
          }));
          resolve(holdings);
        }
      });
    });
  }

  /**
   * Get strategic allocation analysis
   */
  async getAllocationAnalysis(): Promise<AllocationAnalysis[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          pas.liquidity_tier,
          pas.tier_description,
          lac.tier_short_name,
          pas.target_percentage,
          pas.current_percentage,
          pas.current_balance,
          pas.available_balance,
          pas.locked_balance,
          pas.allocation_gap,
          pas.allocation_status,
          pas.target_balance,
          pas.rebalancing_amount,
          pas.account_count
        FROM portfolio_allocation_summary pas
        LEFT JOIN liquidity_allocation_config lac ON pas.liquidity_tier = lac.liquidity_tier
        WHERE pas.current_balance > 0
        ORDER BY lac.tier_order ASC
      `;

      this.db.all(query, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const analysis: AllocationAnalysis[] = rows.map(row => ({
            liquidityTier: row.liquidity_tier,
            tierDescription: row.tier_description,
            tierShortName: row.tier_short_name,
            targetPercentage: row.target_percentage,
            currentPercentage: row.current_percentage,
            currentBalance: row.current_balance,
            availableBalance: row.available_balance,
            lockedBalance: row.locked_balance,
            allocationGap: row.allocation_gap,
            allocationStatus: row.allocation_status,
            targetBalance: row.target_balance,
            rebalancingAmount: row.rebalancing_amount,
            accountCount: row.account_count
          }));
          resolve(analysis);
        }
      });
    });
  }

  /**
   * Get projected allocation analysis including pending moves
   */
  async getProjectedAllocationAnalysis(): Promise<AllocationAnalysis[]> {
    return new Promise((resolve, reject) => {
      const query = `
        WITH combined_deposits AS (
          -- Current active deposits
          SELECT 
            liquidity_tier,
            SUM(balance) as total_balance
          FROM my_deposits 
          WHERE is_active = 1 AND balance > 0
          GROUP BY liquidity_tier
          
          UNION ALL
          
          -- Add pending deposits
          SELECT 
            liquidity_tier,
            SUM(balance) as total_balance
          FROM my_pending_deposits 
          WHERE status IN ('PENDING', 'APPROVED') AND balance > 0
          GROUP BY liquidity_tier
          
          UNION ALL
          
          -- Subtract source amounts for pending moves  
          SELECT 
            md.liquidity_tier,
            -SUM(pd.balance) as total_balance
          FROM my_pending_deposits pd
          JOIN my_deposits md ON pd.source_account_id = md.id
          WHERE pd.status IN ('PENDING', 'APPROVED') 
            AND pd.source_account_id IS NOT NULL
          GROUP BY md.liquidity_tier
        ),
        tier_totals AS (
          SELECT 
            liquidity_tier,
            SUM(total_balance) as tier_balance
          FROM combined_deposits
          WHERE total_balance != 0
          GROUP BY liquidity_tier
        ),
        portfolio_total AS (
          SELECT SUM(tier_balance) as total_value
          FROM tier_totals
        )
        SELECT 
          tt.liquidity_tier,
          lac.tier_description,
          lac.tier_short_name,
          lac.target_percentage,
          ROUND((tt.tier_balance / pt.total_value) * 100, 1) as current_percentage,
          tt.tier_balance as current_balance,
          tt.tier_balance as available_balance,
          0 as locked_balance,
          ROUND((tt.tier_balance / pt.total_value) * 100 - lac.target_percentage, 1) as allocation_gap,
          CASE 
            WHEN ABS((tt.tier_balance / pt.total_value) * 100 - lac.target_percentage) <= 2 THEN 'target'
            WHEN (tt.tier_balance / pt.total_value) * 100 > lac.target_percentage THEN 'overweight'
            ELSE 'underweight'
          END as allocation_status,
          ROUND(pt.total_value * lac.target_percentage / 100, 2) as target_balance,
          ROUND(tt.tier_balance - (pt.total_value * lac.target_percentage / 100), 2) as rebalancing_amount,
          0 as account_count
        FROM tier_totals tt
        CROSS JOIN portfolio_total pt
        LEFT JOIN liquidity_allocation_config lac ON tt.liquidity_tier = lac.liquidity_tier
        WHERE tt.tier_balance > 0 AND lac.is_active = 1
        ORDER BY lac.tier_order ASC
      `;

      this.db.all(query, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const analysis: AllocationAnalysis[] = rows.map(row => ({
            liquidityTier: row.liquidity_tier,
            tierDescription: row.tier_description,
            tierShortName: row.tier_short_name,
            targetPercentage: row.target_percentage,
            currentPercentage: row.current_percentage,
            currentBalance: row.current_balance,
            availableBalance: row.available_balance,
            lockedBalance: row.locked_balance,
            allocationGap: row.allocation_gap,
            allocationStatus: row.allocation_status,
            targetBalance: row.target_balance,
            rebalancingAmount: row.rebalancing_amount,
            accountCount: row.account_count
          }));
          resolve(analysis);
        }
      });
    });
  }

  /**
   * Check if there are any pending deposits
   */
  async hasPendingDeposits(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COUNT(*) as count
        FROM my_pending_deposits 
        WHERE status IN ('PENDING', 'APPROVED')
      `;

      this.db.get(query, (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count > 0);
        }
      });
    });
  }

  /**
   * Get pending moves summary data
   */
  async getPendingMovesSummary(): Promise<{
    totalValue: number;
    moveCount: number;
    avgMoveSize: number;
    externalValue: number;
    externalCount: number;
    internalValue: number;
    internalCount: number;
  }> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as move_count,
          COALESCE(SUM(balance), 0) as total_value,
          COALESCE(AVG(balance), 0) as avg_move_size,
          COALESCE(SUM(CASE WHEN source_account_id IS NULL THEN balance ELSE 0 END), 0) as external_value,
          COALESCE(SUM(CASE WHEN source_account_id IS NULL THEN 1 ELSE 0 END), 0) as external_count,
          COALESCE(SUM(CASE WHEN source_account_id IS NOT NULL THEN balance ELSE 0 END), 0) as internal_value,
          COALESCE(SUM(CASE WHEN source_account_id IS NOT NULL THEN 1 ELSE 0 END), 0) as internal_count
        FROM my_pending_deposits 
        WHERE status IN ('PENDING', 'APPROVED')
      `;

      this.db.get(query, (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            totalValue: row.total_value || 0,
            moveCount: row.move_count || 0,
            avgMoveSize: row.avg_move_size || 0,
            externalValue: row.external_value || 0,
            externalCount: row.external_count || 0,
            internalValue: row.internal_value || 0,
            internalCount: row.internal_count || 0
          });
        }
      });
    });
  }

  /**
   * Get configuration settings
   */
  async getConfiguration(): Promise<Configuration> {
    return new Promise(async (resolve, reject) => {
      try {
        // Query unified_config for actual values
        const query = `
          SELECT config_key, config_value, config_type 
          FROM unified_config 
          WHERE config_key IN ('fscs_limit', 'concentration_threshold', 'minimum_liquidity')
          AND is_active = 1
        `;
        
        this.db.all(query, async (err, rows: any[]) => {
          if (err) {
            console.error('Error fetching configuration:', err);
            // Fall back to defaults if query fails
            const config: Configuration = {
              allocationTargets: {
                emergency: 15,
                shortTerm: 20,
                mediumTerm: 30,
                longTerm: 25,
                strategic: 10
              },
              riskTolerances: {
                fscsLimit: 85000,
                concentrationThreshold: 20,
                minimumLiquidity: 15
              },
              reportSettings: {
                defaultPriorities: [1, 2, 3, 4],
                maturityHorizon: 90,
                optimizationThreshold: 50
              }
            };
            resolve(config);
            return;
          }
          
          // Build config from database values
          let fscsLimit = 85000;
          let concentrationThreshold = 20;
          let minimumLiquidity = 15;
          
          for (const row of rows) {
            const value = row.config_type === 'number' ? parseFloat(row.config_value) : row.config_value;
            switch (row.config_key) {
              case 'fscs_limit':
                fscsLimit = value as number;
                break;
              case 'concentration_threshold':
                concentrationThreshold = value as number;
                break;
              case 'minimum_liquidity':
                minimumLiquidity = value as number;
                break;
            }
          }
          
          const config: Configuration = {
            allocationTargets: {
              emergency: 15,
              shortTerm: 20,
              mediumTerm: 30,
              longTerm: 25,
              strategic: 10
            },
            riskTolerances: {
              fscsLimit,
              concentrationThreshold,
              minimumLiquidity
            },
            reportSettings: {
              defaultPriorities: [1, 2, 3, 4],
              maturityHorizon: 90,
              optimizationThreshold: 50
            }
          };
          
          resolve(config);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get audit configuration from compliance_config table
   */
  async getAuditConfig(): Promise<import('./AuditService').AuditConfig> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT config_key, config_value, config_type 
        FROM compliance_config 
        WHERE config_key LIKE 'audit_%'
      `;

      this.db.all(query, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          // Set defaults
          const config = {
            enabled: true,
            level: 'key_fields' as const,
            include_events: true,
            event_types: ['notice_events', 'rate_changes', 'report_actions'],
            retention_days: 90,
            max_entries: 5000,
            auto_cleanup: true
          };

          // Override with database values
          rows.forEach(row => {
            const key = row.config_key.replace('audit_', '');
            let value = row.config_value;

            // Convert value based on type
            if (row.config_type === 'boolean') {
              value = value.toLowerCase() === 'true';
            } else if (row.config_type === 'number') {
              value = parseInt(value, 10);
            }

            (config as any)[key] = value;
          });

          resolve(config);
        }
      });
    });
  }

  /**
   * Get all deposits for CRUD operations
   */
  async getAllDeposits(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM my_deposits 
        ORDER BY last_updated DESC
      `;

      this.db.all(query, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get all pending deposits for CRUD operations
   */
  async getAllPendingDeposits(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT pd.rowid as id, pd.*, 
               md.bank as source_bank, 
               md.type as source_type, 
               md.sub_type as source_sub_type,
               dest.bank as destination_bank,
               dest.type as destination_type,
               dest.sub_type as destination_sub_type,
               dest.balance as destination_balance,
               dest.aer as destination_aer,
               dest.account_name as destination_account_name
        FROM my_pending_deposits pd
        LEFT JOIN my_deposits md ON pd.source_account_id = md.id
        LEFT JOIN my_deposits dest ON pd.destination_account_id = dest.id
        ORDER BY pd.expected_funding_date ASC
      `;

      this.db.all(query, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get all accounts for dropdown selection (bank + account info)
   */
  async getAllAccounts(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id, bank, account_name, type, sub_type, balance 
        FROM my_deposits 
        WHERE is_active = 1
        ORDER BY bank, account_name
      `;

      this.db.all(query, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get active liquidity tiers for dropdown selection
   */
  async getLiquidityTiers(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT liquidity_tier, tier_short_name, tier_description, tier_order
        FROM liquidity_allocation_config
        WHERE is_active = 1
        ORDER BY tier_order
      `;

      this.db.all(query, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get platforms for dropdown selection
   */
  async getPlatformsForDropdown(): Promise<Array<{platform_variant: string, display_name: string}>> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT platform_variant, display_name
        FROM known_platforms
        WHERE show_in_dropdown = 1 AND is_active = 1
        ORDER BY display_name
      `;

      this.db.all(query, (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Create a new deposit
   */
  async createDeposit(deposit: any): Promise<number> {
    const auditService = this.auditService; // Store reference for callback
    const db = this.db; // Store db reference for callback
    
    return new Promise((resolve, reject) => {
      const fields = Object.keys(deposit).filter(key => key !== 'id');
      const placeholders = fields.map(() => '?').join(', ');
      const values = fields.map(field => deposit[field]);

      const query = `
        INSERT INTO my_deposits (${fields.join(', ')}, last_updated, created_at)
        VALUES (${placeholders}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;

      this.db.run(query, values, async function(err) {
        if (err) {
          reject(err);
        } else {
          const depositId = this.lastID;
          
          // Audit logging - for CREATE, log all key fields with empty old values
          if (auditService) {
            try {
              await auditService.logDataChanges({
                tableName: 'my_deposits',
                recordId: depositId,
                oldData: {}, // Empty for new records
                newData: deposit,
                operationContext: 'CREATE_DEPOSIT',
                notes: 'New deposit account created'
              });
            } catch (auditError) {
              console.error('Audit logging failed for createDeposit:', auditError);
              // Continue without failing the operation
            }
          }
          
          // Force WAL checkpoint to ensure write is immediately visible to subsequent reads
          db.run("PRAGMA wal_checkpoint(TRUNCATE)", (checkpointErr) => {
            if (checkpointErr) {
              console.error('Warning: WAL checkpoint failed after createDeposit:', checkpointErr);
            }
            // Resolve regardless of checkpoint success
            resolve(depositId);
          });
        }
      });
    });
  }

  /**
   * Update an existing deposit
   */
  async updateDeposit(deposit: any): Promise<boolean> {
    // Get current data for comparison (for audit logging)
    const oldData = await this.getDepositById(deposit.id);
    const auditService = this.auditService; // Store reference for callback
    const db = this.db; // Store db reference for callback
    
    return new Promise((resolve, reject) => {
      const fields = Object.keys(deposit).filter(key => key !== 'id');
      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => deposit[field]);
      values.push(deposit.id);

      const query = `
        UPDATE my_deposits 
        SET ${setClause}, last_updated = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      this.db.run(query, values, async function(err) {
        if (err) {
          reject(err);
        } else {
          const success = this.changes > 0;
          
          // Audit logging - this will generate multiple records, one per changed field
          if (success && auditService && oldData) {
            try {
              await auditService.logDataChanges({
                tableName: 'my_deposits',
                recordId: deposit.id,
                oldData: oldData,
                newData: deposit,
                operationContext: 'UPDATE_DEPOSIT',
                notes: 'Deposit account updated'
              });
            } catch (auditError) {
              console.error('Audit logging failed for updateDeposit:', auditError);
              // Continue without failing the operation
            }
          }
          
          // Force WAL checkpoint to ensure write is immediately visible to subsequent reads
          db.run("PRAGMA wal_checkpoint(TRUNCATE)", (checkpointErr) => {
            if (checkpointErr) {
              console.error('Warning: WAL checkpoint failed after updateDeposit:', checkpointErr);
            }
            // Resolve regardless of checkpoint success
            resolve(success);
          });
        }
      });
    });
  }

  /**
   * Get a deposit by ID for audit comparison
   */
  async getDepositById(id: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM my_deposits WHERE id = ?`;
      
      this.db.get(query, [id], (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Delete a deposit
   */
  async deleteDeposit(id: number): Promise<boolean> {
    // Get current data for audit logging before deletion
    const oldData = await this.getDepositById(id);
    const auditService = this.auditService; // Store reference for callback
    
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM my_deposits WHERE id = ?`;

      this.db.run(query, [id], async function(err) {
        if (err) {
          reject(err);
        } else {
          const success = this.changes > 0;
          
          // Audit logging for deletion
          if (success && auditService && oldData) {
            try {
              await auditService.logDataChanges({
                tableName: 'my_deposits',
                recordId: id,
                oldData: oldData,
                newData: {}, // Empty for deleted records
                operationContext: 'DELETE_DEPOSIT',
                notes: 'Deposit account deleted'
              });
            } catch (auditError) {
              console.error('Audit logging failed for deleteDeposit:', auditError);
              // Continue without failing the operation
            }
          }
          
          resolve(success);
        }
      });
    });
  }

  /**
   * Create a new pending deposit
   */
  async createPendingDeposit(pendingDeposit: any): Promise<number> {
    // Add debug logging at the start
    console.log('[DEBUG: DatabaseService] Start createPendingDeposit:', {
      balance: pendingDeposit.balance,
      type: typeof pendingDeposit.balance,
      isInteger: Number.isInteger(pendingDeposit.balance)
    });
    
    const auditService = this.auditService; // Store reference for callback
    const db = this.db; // Store db reference for callback
    
    return new Promise((resolve, reject) => {
      try {
        // Validate required fields
        const requiredFields = ['bank', 'frn', 'type', 'sub_type', 'balance'];
        for (const field of requiredFields) {
          if (!pendingDeposit[field]) {
            reject(new Error(`Missing required field: ${field}`));
            return;
          }
        }

        // Validate balance is positive number
        if (typeof pendingDeposit.balance !== 'number' || pendingDeposit.balance <= 0) {
          reject(new Error('Balance must be a positive number'));
          return;
        }

        const fields = Object.keys(pendingDeposit).filter(key => key !== 'id');
        const placeholders = fields.map(() => '?').join(', ');
        const values = fields.map(field => pendingDeposit[field]);

        // Add debug logging before INSERT
        console.log('[DEBUG: DatabaseService] Before INSERT:', {
          fieldsList: fields,
          valuesList: values,
          balanceIndex: fields.indexOf('balance'),
          balanceValue: values[fields.indexOf('balance')]
        });

        const query = `
          INSERT INTO my_pending_deposits (${fields.join(', ')}, created_at, updated_at)
          VALUES (${placeholders}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;

        this.db.run(query, values, async function(err) {
          if (err) {
            console.error('Database error creating pending deposit:', err);
            if (err.message.includes('UNIQUE constraint failed')) {
              reject(new Error('A pending deposit with these details already exists'));
            } else if (err.message.includes('NOT NULL constraint failed')) {
              reject(new Error('Missing required field in database'));
            } else {
              reject(new Error(`Failed to create pending deposit: ${err.message}`));
            }
          } else {
            const pendingDepositId = this.lastID;
            
            // Audit logging for pending deposit creation
            if (auditService) {
              try {
                await auditService.logDataChanges({
                  tableName: 'my_pending_deposits',
                  recordId: pendingDepositId,
                  oldData: {}, // Empty for new records
                  newData: pendingDeposit,
                  operationContext: 'CREATE_PENDING_DEPOSIT',
                  notes: 'New pending move created'
                });
              } catch (auditError) {
                console.error('Audit logging failed for createPendingDeposit:', auditError);
                // Continue without failing the operation
              }
            }
            
            // Force WAL checkpoint to ensure write is immediately visible to subsequent reads
            db.run("PRAGMA wal_checkpoint(TRUNCATE)", (checkpointErr) => {
              if (checkpointErr) {
                console.error('Warning: WAL checkpoint failed after createPendingDeposit:', checkpointErr);
              }
              // Resolve regardless of checkpoint success
              resolve(pendingDepositId);
            });
          }
        });
      } catch (validationError) {
        console.error('Validation error in createPendingDeposit:', validationError);
        reject(new Error(`Validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`));
      }
    });
  }

  /**
   * Get a pending deposit by ID for audit comparison
   */
  async getPendingDepositById(id: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM my_pending_deposits WHERE rowid = ?`;
      
      this.db.get(query, [id], (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Update an existing pending deposit
   */
  async updatePendingDeposit(pendingDeposit: any): Promise<boolean> {
    // Add debug logging at the start
    console.log('[DEBUG: DatabaseService] Start updatePendingDeposit:', {
      balance: pendingDeposit.balance,
      type: typeof pendingDeposit.balance,
      isInteger: Number.isInteger(pendingDeposit.balance)
    });
    
    // Get current data for comparison (for audit logging)
    const recordId = pendingDeposit.rowid || pendingDeposit.id;
    const oldData = recordId ? await this.getPendingDepositById(recordId) : null;
    const auditService = this.auditService; // Store reference for callback
    
    return new Promise((resolve, reject) => {
      try {
        // Validate record ID
        if (!recordId) {
          reject(new Error('Missing record ID for update'));
          return;
        }

        // Validate balance if provided
        if (pendingDeposit.balance !== undefined && 
            (typeof pendingDeposit.balance !== 'number' || pendingDeposit.balance <= 0)) {
          reject(new Error('Balance must be a positive number'));
          return;
        }

        // Filter out joined fields and id/rowid fields, only keep actual my_pending_deposits columns
        const validFields = ['bank', 'frn', 'type', 'sub_type', 'balance', 'aer', 'status', 
                             'expected_funding_date', 'source_account_id', 'is_active', 'is_isa', 
                             'liquidity_tier', 'earliest_withdrawal_date', 'platform', 'term_months', 'notice_period_days'];
        
        const fields = validFields.filter(field => 
          pendingDeposit.hasOwnProperty(field) && field !== 'id'
        );

        if (fields.length === 0) {
          resolve(true); // No fields to update
          return;
        }

        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = fields.map(field => pendingDeposit[field]);
        values.push(recordId);

        // Add debug logging before UPDATE
        console.log('[DEBUG: DatabaseService] Before UPDATE:', {
          fieldsList: fields,
          valuesList: values,
          balanceIndex: fields.indexOf('balance'),
          balanceValue: values[fields.indexOf('balance')]
        });

        const query = `
          UPDATE my_pending_deposits 
          SET ${setClause}, updated_at = CURRENT_TIMESTAMP
          WHERE rowid = ?
        `;

        this.db.run(query, values, async function(err) {
          if (err) {
            console.error('Database error updating pending deposit:', err);
            if (err.message.includes('UNIQUE constraint failed')) {
              reject(new Error('Update would create duplicate pending deposit'));
            } else if (err.message.includes('NOT NULL constraint failed')) {
              reject(new Error('Cannot set required field to empty'));
            } else {
              reject(new Error(`Failed to update pending deposit: ${err.message}`));
            }
          } else {
            if (this.changes === 0) {
              reject(new Error('No pending deposit found with the provided ID'));
            } else {
              // Audit logging - this will generate multiple records, one per changed field
              if (auditService && oldData) {
                try {
                  await auditService.logDataChanges({
                    tableName: 'my_pending_deposits',
                    recordId: recordId,
                    oldData: oldData,
                    newData: pendingDeposit,
                    operationContext: 'UPDATE_PENDING_DEPOSIT',
                    notes: 'Pending move updated'
                  });
                } catch (auditError) {
                  console.error('Audit logging failed for updatePendingDeposit:', auditError);
                  // Continue without failing the operation
                }
              }
              
              resolve(true);
            }
          }
        });
      } catch (validationError) {
        console.error('Validation error in updatePendingDeposit:', validationError);
        reject(new Error(`Validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`));
      }
    });
  }

  /**
   * Delete a pending deposit
   */
  async deletePendingDeposit(id: number): Promise<boolean> {
    // Get current data for audit logging before deletion
    const oldData = await this.getPendingDepositById(id);
    const auditService = this.auditService; // Store reference for callback
    
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM my_pending_deposits WHERE rowid = ?`;

      this.db.run(query, [id], async function(err) {
        if (err) {
          reject(err);
        } else {
          const success = this.changes > 0;
          
          // Audit logging for deletion
          if (success && auditService && oldData) {
            try {
              await auditService.logDataChanges({
                tableName: 'my_pending_deposits',
                recordId: id,
                oldData: oldData,
                newData: {}, // Empty for deleted records
                operationContext: 'DELETE_PENDING_DEPOSIT',
                notes: 'Pending move deleted'
              });
            } catch (auditError) {
              console.error('Audit logging failed for deletePendingDeposit:', auditError);
              // Continue without failing the operation
            }
          }
          
          resolve(success);
        }
      });
    });
  }

  /**
   * Execute a pending move by creating new account and reducing source balance
   */
  async executePendingMove(pendingMoveId: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        // Validate input
        if (!pendingMoveId || typeof pendingMoveId !== 'number' || pendingMoveId <= 0) {
          reject(new Error('Invalid pending move ID provided'));
          return;
        }

        // Start transaction
        this.db.serialize(() => {
          try {
            this.db.run('BEGIN TRANSACTION', (err) => {
              if (err) {
                console.error('Failed to start transaction for pending move execution:', err);
                reject(new Error(`Transaction failed to start: ${err.message}`));
                return;
              }

              // Get pending move details
              const getPendingMoveQuery = `
                SELECT * FROM my_pending_deposits WHERE id = ?
              `;

              this.db.get(getPendingMoveQuery, [pendingMoveId], (err, pendingMove: any) => {
                if (err) {
                  this.db.run('ROLLBACK');
                  reject(err);
                  return;
                }

                if (!pendingMove) {
                  this.db.run('ROLLBACK');
                  reject(new Error('Pending move not found'));
                  return;
                }

                // Get source account details if source_account_id is provided
                if (pendingMove.source_account_id) {
                  const getSourceAccountQuery = `
                    SELECT * FROM my_deposits WHERE id = ? AND is_active = 1
                  `;

                  this.db.get(getSourceAccountQuery, [pendingMove.source_account_id], (err, sourceAccount: any) => {
                    if (err) {
                      this.db.run('ROLLBACK');
                      reject(err);
                      return;
                    }

                    if (!sourceAccount) {
                      this.db.run('ROLLBACK');
                      reject(new Error('Source account not found or inactive'));
                      return;
                    }

                    // Check if source account has sufficient balance
                    if (sourceAccount.balance < pendingMove.balance) {
                      this.db.run('ROLLBACK');
                      reject(new Error(`Insufficient balance in source account. Available: £${sourceAccount.balance.toLocaleString()}, Required: £${pendingMove.balance.toLocaleString()}`));
                      return;
                    }

                    // Execute the move
                    this.executeMove(pendingMove, sourceAccount, resolve, reject);
                  });
                } else {
                  // No source account specified, just create the new account
                  this.executeMove(pendingMove, null, resolve, reject);
                }
              });
            });
          } catch (transactionError) {
            console.error('Transaction error in executePendingMove:', transactionError);
            this.db.run('ROLLBACK');
            reject(new Error(`Transaction error: ${transactionError instanceof Error ? transactionError.message : String(transactionError)}`));
          }
        });
      } catch (executionError) {
        console.error('Unexpected error in executePendingMove:', executionError);
        reject(new Error(`Execution failed: ${executionError instanceof Error ? executionError.message : String(executionError)}`));
      }
    });
  }

  /**
   * Helper method to execute the actual move operations
   */
  private executeMove(pendingMove: any, sourceAccount: any, resolve: Function, reject: Function): void {
    const auditService = this.auditService; // Store reference for audit logging
    const self = this; // Store reference to this for callbacks
    
    // Check if we should add to existing account or create new one
    if (pendingMove.destination_account_id) {
      // Get current destination account data for audit logging
      this.db.get('SELECT * FROM my_deposits WHERE id = ?', [pendingMove.destination_account_id], async (err: any, destAccount: any) => {
        if (err) {
          this.db.run('ROLLBACK');
          reject(new Error(`Failed to get destination account: ${err.message}`));
          return;
        }
        
        const oldDestBalance = destAccount ? destAccount.balance : 0;
        const newDestBalance = oldDestBalance + pendingMove.balance;
        
        // Add funds to existing account
        const updateDestinationQuery = `
          UPDATE my_deposits 
          SET balance = ?, last_updated = CURRENT_TIMESTAMP
          WHERE id = ?
        `;

        this.db.run(updateDestinationQuery, [newDestBalance, pendingMove.destination_account_id], async (err: any) => {
          if (err) {
            this.db.run('ROLLBACK');
            reject(new Error(`Failed to update destination account balance: ${err.message}`));
            return;
          }
          
          // Audit log the destination account balance change
          if (auditService && destAccount) {
            try {
              await auditService.logFieldChange({
                tableName: 'my_deposits',
                recordId: pendingMove.destination_account_id,
                fieldName: 'balance',
                oldValue: oldDestBalance,
                newValue: newDestBalance,
                operationContext: 'EXECUTE_PENDING_MOVE',
                notes: `£${pendingMove.balance.toLocaleString()} credited from ${sourceAccount ? `${sourceAccount.bank} ${sourceAccount.account_name || ''}`.trim() : 'external source'}`
              });
            } catch (auditError) {
              console.error('Audit logging failed for destination account update:', auditError);
            }
          }
          
          // Create automatic transaction for the destination account
          if (self.transactionService) {
            try {
              await self.transactionService.createTransaction({
                account_id: pendingMove.destination_account_id,
                transaction_date: new Date().toISOString().split('T')[0],
                bank_date: new Date().toISOString().split('T')[0],
                transaction_type: 'deposit',
                credit: pendingMove.balance,
                balance_after: newDestBalance,
                reference: `MOVE-${pendingMove.id}`,
                optional_notes: `£${pendingMove.balance.toLocaleString()} credited from ${sourceAccount ? `${sourceAccount.bank} ${sourceAccount.account_name || ''}`.trim() : 'external source'}`,
                source: 'system'
              });
              console.log(`Created automatic transaction for pending move credit to deposit ${pendingMove.destination_account_id}`);
            } catch (transactionError) {
              console.error('Failed to create automatic transaction for destination:', transactionError);
              // Don't fail the whole operation if transaction creation fails
            }
          }

          // If there's a source account, reduce its balance
          if (sourceAccount) {
            const oldSourceBalance = sourceAccount.balance;
            const newSourceBalance = sourceAccount.balance - pendingMove.balance;
            const updateSourceQuery = `
              UPDATE my_deposits 
              SET balance = ?, last_updated = CURRENT_TIMESTAMP
              WHERE id = ?
            `;

            this.db.run(updateSourceQuery, [newSourceBalance, sourceAccount.id], async (err: any) => {
              if (err) {
                this.db.run('ROLLBACK');
                reject(new Error(`Failed to update source account balance: ${err.message}`));
                return;
              }
              
              // Audit log the source account balance change
              if (auditService) {
                try {
                  await auditService.logFieldChange({
                    tableName: 'my_deposits',
                    recordId: sourceAccount.id,
                    fieldName: 'balance',
                    oldValue: oldSourceBalance,
                    newValue: newSourceBalance,
                    operationContext: 'EXECUTE_PENDING_MOVE',
                    notes: `£${pendingMove.balance.toLocaleString()} debited for transfer to ${destAccount.bank} ${destAccount.account_name || ''}`.trim()
                  });
                } catch (auditError) {
                  console.error('Audit logging failed for source account update:', auditError);
                }
              }
              
              // Create automatic transaction for the source account
              if (self.transactionService) {
                try {
                  await self.transactionService.createTransaction({
                    account_id: sourceAccount.id,
                    transaction_date: new Date().toISOString().split('T')[0],
                    bank_date: new Date().toISOString().split('T')[0],
                    transaction_type: 'withdrawal',
                    debit: pendingMove.balance,
                    balance_after: newSourceBalance,
                    reference: `MOVE-${pendingMove.id}`,
                    optional_notes: `£${pendingMove.balance.toLocaleString()} moved to ${destAccount.bank} ${destAccount.account_name || ''}`.trim(),
                    source: 'system'
                  });
                  console.log(`Created automatic transaction for pending move debit from deposit ${sourceAccount.id}`);
                } catch (transactionError) {
                  console.error('Failed to create automatic transaction for source:', transactionError);
                  // Don't fail the whole operation if transaction creation fails
                }
              }

              // Mark pending move as executed (using destination account ID)
              self.completePendingMove(pendingMove.id, pendingMove.destination_account_id, sourceAccount, destAccount, pendingMove, resolve, reject);
            });
          } else {
            // No source account, just mark pending move as executed
            self.completePendingMove(pendingMove.id, pendingMove.destination_account_id, null, destAccount, pendingMove, resolve, reject);
          }
        });
      });
    } else {
      // Create new account in my_deposits
      const createAccountQuery = `
        INSERT INTO my_deposits (
          bank, frn, type, sub_type, balance, aer, platform, 
          liquidity_tier, earliest_withdrawal_date, is_isa,
          deposit_date, is_active, created_at, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;

      const accountValues = [
        pendingMove.bank,
        pendingMove.frn,
        pendingMove.type,
        pendingMove.sub_type,
        pendingMove.balance,
        pendingMove.aer,
        pendingMove.platform,
        pendingMove.liquidity_tier,
        pendingMove.earliest_withdrawal_date,
        pendingMove.is_isa,
        pendingMove.expected_funding_date // Use as deposit_date
      ];

      const db = this.db; // Store db reference for callbacks
      
      db.run(createAccountQuery, accountValues, async function(err: any) {
        if (err) {
          db.run('ROLLBACK');
          reject(new Error(`Failed to create new account: ${err.message}`));
          return;
        }

        const newAccountId = this.lastID;
        
        // Audit log the new account creation
        if (auditService) {
          try {
            await auditService.logDataChanges({
              tableName: 'my_deposits',
              recordId: newAccountId,
              oldData: {}, // Empty for new record
              newData: {
                bank: pendingMove.bank,
                balance: pendingMove.balance,
                aer: pendingMove.aer,
                type: pendingMove.type,
                sub_type: pendingMove.sub_type
              },
              operationContext: 'EXECUTE_PENDING_MOVE',
              notes: `New ${pendingMove.bank} ${pendingMove.account_name || 'account'} created with £${pendingMove.balance.toLocaleString()} ${sourceAccount ? `from ${sourceAccount.bank} ${sourceAccount.account_name || ''}`.trim() : ''}`
            });
          } catch (auditError) {
            console.error('Audit logging failed for new account creation:', auditError);
          }
        }

        // Get the newly created account for audit context
        db.get('SELECT * FROM my_deposits WHERE id = ?', [newAccountId], async (err: any, newAccount: any) => {
          if (err) {
            console.error('Warning: Could not fetch new account for audit context:', err);
          }

          // If there's a source account, reduce its balance
          if (sourceAccount) {
            const oldSourceBalance = sourceAccount.balance;
            const newSourceBalance = sourceAccount.balance - pendingMove.balance;
            const updateSourceQuery = `
              UPDATE my_deposits 
              SET balance = ?, last_updated = CURRENT_TIMESTAMP
              WHERE id = ?
            `;

            db.run(updateSourceQuery, [newSourceBalance, sourceAccount.id], async (err: any) => {
              if (err) {
                db.run('ROLLBACK');
                reject(new Error(`Failed to update source account balance: ${err.message}`));
                return;
              }
              
              // Audit log the source account balance change
              if (auditService) {
                try {
                  await auditService.logFieldChange({
                    tableName: 'my_deposits',
                    recordId: sourceAccount.id,
                    fieldName: 'balance',
                    oldValue: oldSourceBalance,
                    newValue: newSourceBalance,
                    operationContext: 'EXECUTE_PENDING_MOVE',
                    notes: `£${pendingMove.balance.toLocaleString()} debited for transfer to new ${pendingMove.bank} account`
                  });
                } catch (auditError) {
                  console.error('Audit logging failed for source account update:', auditError);
                }
              }

              // Mark pending move as executed
              self.completePendingMove(pendingMove.id, newAccountId, sourceAccount, newAccount, pendingMove, resolve, reject);
            });
          } else {
            // No source account, just mark pending move as executed
            self.completePendingMove(pendingMove.id, newAccountId, null, newAccount, pendingMove, resolve, reject);
          }
        });
      });
    }
  }

  /**
   * Helper method to mark pending move as executed
   */
  private completePendingMove(pendingMoveRowId: number, newAccountId: number, sourceAccount: any, destAccount: any, pendingMove: any, resolve: Function, reject: Function): void {
    const auditService = this.auditService;
    
    const updatePendingQuery = `
      UPDATE my_pending_deposits 
      SET status = 'FUNDED', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    this.db.run(updatePendingQuery, [pendingMoveRowId], async (err) => {
      if (err) {
        console.error('Update failed:', err);
        this.db.run('ROLLBACK');
        reject(new Error(`Failed to update pending move status: ${err.message}`));
        return;
      }
      
      // Audit log the pending move status change
      if (auditService) {
        try {
          await auditService.logFieldChange({
            tableName: 'my_pending_deposits',
            recordId: pendingMoveRowId,
            fieldName: 'status',
            oldValue: 'PENDING',
            newValue: 'FUNDED',
            operationContext: 'EXECUTE_PENDING_MOVE',
            notes: `Move executed: £${pendingMove.balance?.toLocaleString() || 'unknown'} from ${sourceAccount ? `${sourceAccount.bank} ${sourceAccount.account_name || ''}`.trim() : 'external'} to ${destAccount ? `${destAccount.bank} ${destAccount.account_name || ''}`.trim() : 'new account'}`
          });
        } catch (auditError) {
          console.error('Audit logging failed for pending move status update:', auditError);
        }
      }
      
      // Commit transaction
      this.db.run('COMMIT', (err) => {
        if (err) {
          console.error('COMMIT failed:', err);
          this.db.run('ROLLBACK');
          reject(err);
          return;
        }

        resolve(true);
      });
    });
  }

  /**
   * Normalize bank name for duplicate detection
   */
  private normalizeBankName(name: string): string {
    if (!name) return '';
    return name
      .toLowerCase()
      .trim()
      // Remove common banking suffixes/terms
      .replace(/\b(bank|plc|ltd|limited|group|uk|international|inc|corp)\b/g, '')
      // Remove common words
      .replace(/\b(the|and|&)\b/g, '')
      // Remove special characters and extra spaces
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '');
  }

  /**
   * Normalize account type for duplicate detection
   */
  private normalizeAccountType(type: string): string {
    if (!type) return '';
    return type
      .toLowerCase()
      .replace(/\b(account|saver|savings|deposit)\b/g, '')
      .replace(/\s+/g, '');
  }

  /**
   * Find potential duplicate accounts for a new pending move
   */
  async findPotentialDuplicates(accountDetails: {
    frn: string;
    bank: string;
    type: string;
    sub_type: string;
    term_months?: number;
    notice_period_days?: number;
    is_isa: boolean;
    platform: string;
  }): Promise<any[]> {
    return new Promise((resolve, reject) => {
      // Validate required fields
      if (!accountDetails.frn || !accountDetails.bank || !accountDetails.type || !accountDetails.sub_type) {
        reject(new Error('Missing required fields for duplicate detection'));
        return;
      }

      try {
        const normalizedBank = this.normalizeBankName(accountDetails.bank);
        const normalizedType = this.normalizeAccountType(accountDetails.type);
        const normalizedSubType = this.normalizeAccountType(accountDetails.sub_type);

        let query = `
          SELECT id, bank, type, sub_type, balance, platform, is_isa, aer,
                 term_months, notice_period_days
          FROM my_deposits 
          WHERE frn = ? 
            AND is_active = 1
        `;
        
        const params = [accountDetails.frn];

        this.db.all(query, params, (err, rows: any[]) => {
          if (err) {
            console.error('Database error in findPotentialDuplicates:', err);
            reject(new Error(`Failed to check for duplicates: ${err.message}`));
          } else {
            try {
              // Filter matches using normalization
              const matches = (rows || []).filter(row => {
                try {
                  const rowNormalizedBank = this.normalizeBankName(row.bank || '');
                  const rowNormalizedType = this.normalizeAccountType(row.type || '');
                  const rowNormalizedSubType = this.normalizeAccountType(row.sub_type || '');

                  // Check normalized name matches
                  const bankMatches = rowNormalizedBank === normalizedBank;
                  const typeMatches = rowNormalizedType === normalizedType;
                  const subTypeMatches = rowNormalizedSubType === normalizedSubType;

                  // Check exact field matches
                  const isaMatches = row.is_isa === accountDetails.is_isa;
                  const platformMatches = (row.platform || '').trim() === (accountDetails.platform || '').trim();

                  // Check term/notice matches (must be exact for these)
                  let termMatches = true;
                  let noticeMatches = true;
                  
                  if (accountDetails.sub_type === 'Term') {
                    termMatches = row.term_months === accountDetails.term_months;
                  }
                  
                  if (accountDetails.sub_type === 'Notice') {
                    noticeMatches = row.notice_period_days === accountDetails.notice_period_days;
                  }

                  return bankMatches && typeMatches && subTypeMatches && 
                         isaMatches && platformMatches && termMatches && noticeMatches;
                } catch (filterError) {
                  console.error('Error filtering duplicate for row:', row, filterError);
                  return false; // Skip problematic row
                }
              });

              resolve(matches);
            } catch (processingError) {
              console.error('Error processing duplicate matches:', processingError);
              reject(new Error(`Failed to process duplicate results: ${processingError instanceof Error ? processingError.message : String(processingError)}`));
            }
          }
        });
      } catch (validationError) {
        console.error('Validation error in findPotentialDuplicates:', validationError);
        reject(new Error(`Validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`));
      }
    });
  }

  /**
   * Find accounts by FRN for smart account selection
   */
  async findAccountsByFRN(frn: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!frn || frn.trim() === '') {
        resolve([]);
        return;
      }

      // Validate FRN format (basic check)
      if (frn.length < 6) {
        reject(new Error('FRN must be at least 6 characters'));
        return;
      }

      const query = `
        SELECT id, bank, type, sub_type, balance, platform, is_isa, 
               term_months, notice_period_days, aer, liquidity_tier
        FROM my_deposits 
        WHERE frn = ? AND is_active = 1
        ORDER BY bank, type, sub_type, balance DESC
      `;

      this.db.all(query, [frn.trim()], (err, rows: any[]) => {
        if (err) {
          console.error('Database error in findAccountsByFRN:', err);
          reject(new Error(`Failed to search accounts: ${err.message}`));
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Update configuration settings in unified_config table
   */
  async updateConfiguration(config: any): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Build update statements for each config key
      const updates: { sql: string; params: any[] }[] = [];
      
      Object.keys(config).forEach(key => {
        updates.push({
          sql: `
            UPDATE unified_config 
            SET config_value = ?, updated_at = datetime('now')
            WHERE config_key = ?
          `,
          params: [String(config[key]), key]
        });
      });
      
      if (updates.length === 0) {
        resolve(true);
        return;
      }
      
      // Execute all updates in a transaction
      const db = this.db; // Capture db reference for closure
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        let completedUpdates = 0;
        let errorOccurred = false;
        
        updates.forEach(({ sql, params }) => {
          db.run(sql, params, function(err) {
            completedUpdates++;
            
            if (err) {
              errorOccurred = true;
              console.error(`Error updating ${params[1]}:`, err);
            } else if (this.changes === 0) {
              console.warn(`Config key '${params[1]}' not found in unified_config table`);
            } else {
              console.log(`Updated ${params[1]} to ${params[0]}`);
            }
            
            // Check if all updates are complete
            if (completedUpdates === updates.length) {
              db.run(errorOccurred ? 'ROLLBACK' : 'COMMIT', (commitErr) => {
                if (commitErr || errorOccurred) {
                  reject(commitErr || new Error('Configuration update failed'));
                } else {
                  resolve(true);
                }
              });
            }
          });
        });
      });
    });
  }

  /**
   * Calendar & Reminder Methods
   */

  /**
   * Get upcoming actions from the unified view
   */
  async getUpcomingActions(): Promise<CalendarEvent[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          action_type || '_' || event_source_id || '_' || action_date as id,
          action_type,
          deposit_id,
          event_source_id,
          bank,
          account_type,
          amount,
          action_date,
          days_until,
          title,
          description,
          priority,
          category,
          current_rate,
          new_rate
        FROM upcoming_actions
        ORDER BY days_until ASC, priority DESC
      `;

      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          console.error('Error fetching upcoming actions:', err);
          reject(err);
        } else {
          const events: CalendarEvent[] = rows.map(row => ({
            id: row.id,
            action_type: row.action_type,
            deposit_id: row.deposit_id,
            bank: row.bank,
            account_type: row.account_type,
            amount: row.amount,
            action_date: row.action_date,
            days_until: row.days_until,
            title: row.title,
            description: row.description,
            priority: row.priority as 'low' | 'medium' | 'high' | 'urgent',
            category: row.category,
            current_rate: row.current_rate,
            new_rate: row.new_rate
          }));
          resolve(events);
        }
      });
    });
  }

  /**
   * Get calendar summary for dashboard
   */
  async getCalendarSummary(): Promise<CalendarSummary> {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM calendar_summary`;

      this.db.get(query, [], (err, row: any) => {
        if (err) {
          console.error('Error fetching calendar summary:', err);
          reject(err);
        } else {
          resolve({
            total_events: row?.total_events || 0,
            this_week: row?.this_week || 0,
            this_month: row?.this_month || 0,
            urgent_count: row?.urgent_count || 0,
            high_count: row?.high_count || 0,
            maturing_this_month: row?.maturing_this_month || 0,
            notice_periods_ending: row?.notice_periods_ending || 0
          });
        }
      });
    });
  }

  /**
   * Create a new rate change event
   */
  async createRateChange(rateChange: RateChange): Promise<number> {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO rate_changes (
          deposit_id, change_type, current_rate, new_rate,
          effective_date, notification_source, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        rateChange.deposit_id,
        rateChange.change_type,
        rateChange.current_rate || null,
        rateChange.new_rate || null,
        rateChange.effective_date,
        rateChange.notification_source || null,
        rateChange.notes || null,
        rateChange.status || 'pending'
      ];

      const auditService = this.auditService;
      this.db.run(query, params, async function(err) {
        if (err) {
          console.error('Error creating rate change:', err);
          reject(err);
        } else {
          const rateChangeId = this.lastID;
          
          // Add audit logging
          if (auditService) {
            try {
              await auditService.logDataChanges({
                tableName: 'rate_changes',
                recordId: rateChangeId,
                oldData: {}, // Empty for new records
                newData: rateChange,
                operationContext: 'CREATE_RATE_CHANGE',
                notes: 'New rate change notification created'
              });
            } catch (auditError) {
              console.error('Audit logging failed for rate change creation:', auditError);
              // Don't fail the main operation due to audit errors
            }
          }
          
          resolve(rateChangeId);
        }
      });
    });
  }

  /**
   * Create a new notice event
   */
  async createNoticeEvent(noticeEvent: NoticeEvent): Promise<number> {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO notice_events (
          deposit_id, notice_given_date, planned_withdrawal_amount,
          funds_available_date, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      const params = [
        noticeEvent.deposit_id,
        noticeEvent.notice_given_date,
        noticeEvent.planned_withdrawal_amount || null,
        noticeEvent.funds_available_date,
        noticeEvent.status || 'given',
        noticeEvent.notes || null
      ];

      const auditService = this.auditService;
      this.db.run(query, params, async function(err) {
        if (err) {
          console.error('Error creating notice event:', err);
          reject(err);
        } else {
          const noticeEventId = this.lastID;
          
          // Add audit logging
          if (auditService) {
            try {
              await auditService.logDataChanges({
                tableName: 'notice_events',
                recordId: noticeEventId,
                oldData: {}, // Empty for new records
                newData: noticeEvent,
                operationContext: 'CREATE_NOTICE_EVENT',
                notes: 'New notice event created'
              });
            } catch (auditError) {
              console.error('Audit logging failed for notice event creation:', auditError);
              // Don't fail the main operation due to audit errors
            }
          }
          
          resolve(noticeEventId);
        }
      });
    });
  }

  /**
   * Search my_deposits table for autocomplete
   */
  async searchMyDeposits(searchTerm: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!searchTerm || searchTerm.trim().length < 2) {
        resolve([]);
        return;
      }
      
      const query = `
        SELECT 
          id, 
          bank, 
          account_name, 
          type, 
          sub_type, 
          balance, 
          aer, 
          frn, 
          platform,
          is_isa,
          liquidity_tier,
          term_months,
          notice_period_days,
          CASE 
            WHEN account_name IS NOT NULL THEN account_name
            WHEN type = 'Current' THEN bank || ' - Current'
            WHEN sub_type = 'Term' AND term_months IS NOT NULL THEN 
              bank || ' - Term ' || term_months || 'm'
            WHEN sub_type = 'Notice' AND notice_period_days IS NOT NULL THEN 
              bank || ' - Notice ' || notice_period_days || 'd'
            WHEN sub_type = 'Easy Access' THEN bank || ' - Easy Access'
            ELSE bank || ' - ' || COALESCE(sub_type, type)
          END as display_name
        FROM my_deposits
        WHERE is_active = 1 
          AND (
            LOWER(bank) LIKE LOWER('%' || ? || '%') OR
            LOWER(account_name) LIKE LOWER('%' || ? || '%') OR
            LOWER(sub_type) LIKE LOWER('%' || ? || '%')
          )
        ORDER BY 
          CASE 
            WHEN LOWER(bank) LIKE LOWER(? || '%') THEN 1
            WHEN LOWER(account_name) LIKE LOWER(? || '%') THEN 2
            ELSE 3
          END,
          bank, 
          balance DESC
        LIMIT 15
      `;
      
      const params = [
        searchTerm, searchTerm, searchTerm,  // For WHERE clause
        searchTerm, searchTerm  // For ORDER BY clause
      ];
      
      this.db.all(query, params, (err, rows) => {
        if (err) {
          console.error('Error searching my_deposits:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Create a new reminder
   */
  async createReminder(reminder: Reminder): Promise<number> {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO reminders (
          deposit_id, reminder_type, lead_days, reminder_date,
          title, description, priority
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        reminder.deposit_id || null,
        reminder.reminder_type,
        reminder.lead_days || 7,
        reminder.reminder_date,
        reminder.title,
        reminder.description || null,
        reminder.priority || 'medium'
      ];

      const auditService = this.auditService;
      this.db.run(query, params, async function(err) {
        if (err) {
          console.error('Error creating reminder:', err);
          reject(err);
        } else {
          const reminderId = this.lastID;
          
          // Add audit logging
          if (auditService) {
            try {
              await auditService.logDataChanges({
                tableName: 'reminders',
                recordId: reminderId,
                oldData: {}, // Empty for new records
                newData: reminder,
                operationContext: 'CREATE_REMINDER',
                notes: 'New reminder created'
              });
            } catch (auditError) {
              console.error('Audit logging failed for reminder creation:', auditError);
              // Don't fail the main operation due to audit errors
            }
          }
          
          resolve(reminderId);
        }
      });
    });
  }

  /**
   * Get notice account status
   */
  async getNoticeAccountStatus(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM notice_status ORDER BY availability_status, days_to_availability`;

      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          console.error('Error fetching notice status:', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Mark rate change reminder as completed
   */
  /**
   * Get dashboard action summary counts
   */
  async getDashboardActionSummary(): Promise<{
    urgent_actions: {
      overdue_count: number;
      urgent_count: number;
      notice_deadlines: number;
    };
    this_week: {
      maturities: number;
      rate_changes: number;
      notice_periods_ending: number;
      scheduled_reminders: number;
    };
    portfolio_health: {
      compliance_issues: number;
      optimization_opportunities: number;
      rebalancing_needs: number;
      pending_actions: number; // From action_items table
    };
  }> {
    return new Promise((resolve, reject) => {
      // Urgent actions query
      const urgentQuery = `
        SELECT 
          COUNT(CASE WHEN days_until < 0 THEN 1 END) as overdue_count,
          COUNT(CASE WHEN priority = 'urgent' AND days_until >= 0 THEN 1 END) as urgent_count,
          COUNT(CASE WHEN action_type IN ('notice_available', 'custom_reminder') AND priority IN ('urgent', 'high') AND days_until BETWEEN 0 AND 3 THEN 1 END) as notice_deadlines
        FROM upcoming_actions
      `;

      // This week query
      const thisWeekQuery = `
        SELECT 
          COUNT(CASE WHEN action_type = 'maturity' AND days_until BETWEEN 0 AND 7 THEN 1 END) as maturities,
          COUNT(CASE WHEN action_type IN ('rate_change_reminder', 'rate_change_effective') AND days_until BETWEEN 0 AND 7 THEN 1 END) as rate_changes,
          COUNT(CASE WHEN action_type = 'notice_available' AND days_until BETWEEN 0 AND 7 THEN 1 END) as notice_periods_ending,
          COUNT(CASE WHEN action_type = 'custom_reminder' AND days_until BETWEEN 0 AND 7 THEN 1 END) as scheduled_reminders
        FROM upcoming_actions
      `;

      // Portfolio health query
      const healthQuery = `
        SELECT 
          COUNT(CASE WHEN category = 'COMPLIANCE' THEN 1 END) as compliance_issues,
          COUNT(CASE WHEN category = 'OPTIMIZATION' THEN 1 END) as optimization_opportunities,
          COUNT(CASE WHEN category = 'REBALANCING' THEN 1 END) as rebalancing_needs,
          COUNT(*) as pending_actions
        FROM action_items 
        WHERE status = 'pending'
      `;

      Promise.all([
        new Promise((resolve, reject) => {
          this.db.get(urgentQuery, [], (err, row) => err ? reject(err) : resolve(row || {}));
        }),
        new Promise((resolve, reject) => {
          this.db.get(thisWeekQuery, [], (err, row) => err ? reject(err) : resolve(row || {}));
        }),
        new Promise((resolve, reject) => {
          this.db.get(healthQuery, [], (err, row) => err ? reject(err) : resolve(row || {}));
        })
      ]).then(([urgent, thisWeek, health]: any[]) => {
        resolve({
          urgent_actions: {
            overdue_count: urgent.overdue_count || 0,
            urgent_count: urgent.urgent_count || 0,
            notice_deadlines: urgent.notice_deadlines || 0
          },
          this_week: {
            maturities: thisWeek.maturities || 0,
            rate_changes: thisWeek.rate_changes || 0,
            notice_periods_ending: thisWeek.notice_periods_ending || 0,
            scheduled_reminders: thisWeek.scheduled_reminders || 0
          },
          portfolio_health: {
            compliance_issues: health.compliance_issues || 0,
            optimization_opportunities: health.optimization_opportunities || 0,
            rebalancing_needs: health.rebalancing_needs || 0,
            pending_actions: health.pending_actions || 0
          }
        });
      }).catch(reject);
    });
  }

  /**
   * Get dashboard notification summary (legacy - for notification center)
   */
  async getDashboardNotifications(): Promise<{
    urgent_actions: Array<{
      type: string;
      title: string;
      due_date: string;
      days_until: number;
      priority: string;
      bank?: string;
    }>;
    this_week: Array<{
      type: string;
      title: string;
      due_date: string;
      days_until: number;
      amount?: number;
      bank?: string;
    }>;
    portfolio_health: Array<{
      type: string;
      title: string;
      description: string;
      priority: string;
      amount_affected?: number;
    }>;
    recent_activity: Array<{
      type: string;
      title: string;
      date: string;
      description?: string;
    }>;
    summary_counts: {
      overdue_actions: number;
      urgent_actions: number;
      this_week_actions: number;
      pending_reports: number;
    };
  }> {
    return new Promise((resolve, reject) => {
      // Get urgent/overdue actions
      const urgentQuery = `
        SELECT 
          action_type as type,
          title,
          action_date as due_date,
          days_until,
          priority,
          bank
        FROM upcoming_actions 
        WHERE (days_until < 0 OR priority IN ('urgent', 'high')) 
          AND days_until >= -30
        ORDER BY days_until ASC, 
          CASE priority 
            WHEN 'urgent' THEN 1 
            WHEN 'high' THEN 2 
            ELSE 3 
          END
        LIMIT 10
      `;

      // Get this week's events
      const thisWeekQuery = `
        SELECT 
          action_type as type,
          title,
          action_date as due_date,
          days_until,
          amount,
          bank
        FROM upcoming_actions 
        WHERE days_until BETWEEN 0 AND 7
        ORDER BY days_until ASC
        LIMIT 10
      `;

      // Get portfolio health issues (compliance/optimization)
      const healthQuery = `
        SELECT 
          'compliance' as type,
          title,
          description,
          priority,
          amount_affected
        FROM action_items 
        WHERE status = 'pending' 
          AND category IN ('COMPLIANCE', 'OPTIMIZATION')
        ORDER BY 
          CASE priority 
            WHEN 'URGENT' THEN 1 
            WHEN 'HIGH' THEN 2 
            ELSE 3 
          END
        LIMIT 5
      `;

      // Get recent activity (completed actions, imported reports)
      const recentQuery = `
        SELECT 
          'completed' as type,
          'Rate Change Completed' as title,
          updated_at as date,
          notes as description
        FROM rate_changes 
        WHERE reminder_completed = 1 
          AND updated_at >= datetime('now', '-7 days')
        
        UNION ALL
        
        SELECT 
          'action_created' as type,
          'New Action: ' || title as title,
          created_at as date,
          description
        FROM action_items 
        WHERE created_at >= datetime('now', '-7 days')
        ORDER BY date DESC
        LIMIT 8
      `;

      // Get summary counts
      const countQuery = `
        SELECT 
          COUNT(CASE WHEN days_until < 0 THEN 1 END) as overdue_actions,
          COUNT(CASE WHEN priority = 'urgent' THEN 1 END) as urgent_actions,
          COUNT(CASE WHEN days_until BETWEEN 0 AND 7 THEN 1 END) as this_week_actions,
          (SELECT COUNT(*) FROM action_items WHERE status = 'pending') as pending_reports
        FROM upcoming_actions
      `;

      Promise.all([
        new Promise((resolve, reject) => {
          this.db.all(urgentQuery, [], (err, rows) => err ? reject(err) : resolve(rows || []));
        }),
        new Promise((resolve, reject) => {
          this.db.all(thisWeekQuery, [], (err, rows) => err ? reject(err) : resolve(rows || []));
        }),
        new Promise((resolve, reject) => {
          this.db.all(healthQuery, [], (err, rows) => err ? reject(err) : resolve(rows || []));
        }),
        new Promise((resolve, reject) => {
          this.db.all(recentQuery, [], (err, rows) => err ? reject(err) : resolve(rows || []));
        }),
        new Promise((resolve, reject) => {
          this.db.get(countQuery, [], (err, row) => err ? reject(err) : resolve(row || {}));
        })
      ]).then(([urgent, thisWeek, health, recent, counts]: any[]) => {
        resolve({
          urgent_actions: urgent,
          this_week: thisWeek,
          portfolio_health: health,
          recent_activity: recent,
          summary_counts: counts
        });
      }).catch(reject);
    });
  }

  async markRateChangeReminderCompleted(rateChangeId: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // First get the old data for audit logging
      const selectQuery = 'SELECT * FROM rate_changes WHERE id = ?';
      this.db.get(selectQuery, [rateChangeId], (selectErr, oldData: any) => {
        if (selectErr) {
          console.error('Error fetching rate change for audit:', selectErr);
          reject(selectErr);
          return;
        }

        const query = `
          UPDATE rate_changes 
          SET reminder_completed = 1, reminder_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;

        const auditService = this.auditService;
        this.db.run(query, [rateChangeId], async function(err) {
          if (err) {
            console.error('Error marking rate change reminder as completed:', err);
            reject(err);
          } else {
            const success = this.changes > 0;
            
            // Add audit logging
            if (success && auditService && oldData) {
              try {
                await auditService.logDataChanges({
                  tableName: 'rate_changes',
                  recordId: rateChangeId,
                  oldData: oldData,
                  newData: { ...oldData, reminder_completed: 1 },
                  operationContext: 'UPDATE_RATE_CHANGE_REMINDER',
                  notes: 'Rate change reminder marked as completed'
                });
              } catch (auditError) {
                console.error('Audit logging failed for rate change reminder completion:', auditError);
                // Don't fail the main operation due to audit errors
              }
            }
            
            resolve(success);
          }
        });
      });
    });
  }

  /**
   * Update reminder status (sent, snoozed, etc.)
   */
  async updateReminderStatus(reminderId: number, updates: Partial<Reminder>): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const fields = [];
      const params = [];
      
      if (updates.is_sent !== undefined) {
        fields.push('is_sent = ?');
        params.push(updates.is_sent ? 1 : 0);
      }
      
      if (updates.is_snoozed !== undefined) {
        fields.push('is_snoozed = ?');
        params.push(updates.is_snoozed ? 1 : 0);
      }
      
      if (updates.snoozed_until !== undefined) {
        fields.push('snoozed_until = ?');
        params.push(updates.snoozed_until);
      }

      if (fields.length === 0) {
        resolve(true);
        return;
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(reminderId);

      const query = `UPDATE reminders SET ${fields.join(', ')} WHERE id = ?`;

      this.db.run(query, params, function(err) {
        if (err) {
          console.error('Error updating reminder status:', err);
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  /**
   * Dismiss a calendar event based on its type
   */
  async dismissCalendarEvent(eventType: string, eventId: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let query = '';
      const params = [eventId];

      switch(eventType) {
        case 'rate_change_reminder':
          query = `
            UPDATE rate_changes 
            SET reminder_dismissed = 1, 
                reminder_dismissed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          break;
        
        case 'custom_reminder':
          query = `
            UPDATE reminders 
            SET is_dismissed = 1, 
                dismissed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          break;
        
        case 'notice_available':
          query = `
            UPDATE notice_events 
            SET dismissed = 1, 
                dismissed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          break;
        
        case 'report_action':
          query = `
            UPDATE report_actions 
            SET dismissed = 1, 
                dismissed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          break;
        
        default:
          reject(new Error(`Unknown event type: ${eventType}`));
          return;
      }

      this.db.run(query, params, function(err) {
        if (err) {
          console.error(`Error dismissing ${eventType} event:`, err);
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  /**
   * Snooze a calendar event until a specified date/time
   */
  async snoozeCalendarEvent(eventType: string, eventId: number, snoozedUntil: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let query = '';
      const params = [snoozedUntil, eventId];

      switch(eventType) {
        case 'rate_change_reminder':
          // For rate changes, update the reminder date
          query = `
            UPDATE rate_changes 
            SET reminder_date = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          break;
        
        case 'custom_reminder':
          query = `
            UPDATE reminders 
            SET is_snoozed = 1, 
                snoozed_until = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          break;
        
        case 'notice_available':
          // Notice events can't really be snoozed, but we can push the date
          query = `
            UPDATE notice_events 
            SET funds_available_date = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          break;
        
        case 'report_action':
          query = `
            UPDATE report_actions 
            SET due_date = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          break;
        
        default:
          reject(new Error(`Cannot snooze event type: ${eventType}`));
          return;
      }

      this.db.run(query, params, function(err) {
        if (err) {
          console.error(`Error snoozing ${eventType} event:`, err);
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  /**
   * Complete/mark as done a calendar event
   */
  async completeCalendarEvent(eventType: string, eventId: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let query = '';
      const params = [eventId];

      switch(eventType) {
        case 'rate_change_reminder':
          // Use existing method
          return this.markRateChangeReminderCompleted(eventId).then(resolve).catch(reject);
        
        case 'custom_reminder':
          query = `
            UPDATE reminders 
            SET is_sent = 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          break;
        
        case 'notice_available':
          // Mark as completed/processed
          query = `
            UPDATE notice_events 
            SET status = 'completed',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          break;
        
        case 'report_action':
          query = `
            UPDATE report_actions 
            SET status = 'completed',
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;
          break;
        
        default:
          reject(new Error(`Cannot complete event type: ${eventType}`));
          return;
      }

      this.db.run(query, params, function(err) {
        if (err) {
          console.error(`Error completing ${eventType} event:`, err);
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      });
    });
  }

  /**
   * Get snooze configuration from unified_config
   */
  async getSnoozeConfig(): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT config_key, config_value, config_type
        FROM unified_config
        WHERE category = 'calendar' 
          AND config_key LIKE 'reminder.%'
          AND is_active = 1
      `;

      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          console.error('Error fetching snooze config:', err);
          reject(err);
        } else {
          const config: any = {};
          rows.forEach(row => {
            const key = row.config_key.replace('reminder.', '');
            let value = row.config_value;
            
            // Parse value based on type
            if (row.config_type === 'number') {
              value = parseFloat(value);
            } else if (row.config_type === 'boolean') {
              value = value === 'true';
            } else if (row.config_type === 'json') {
              try {
                value = JSON.parse(value);
              } catch (e) {
                console.error(`Failed to parse JSON config ${row.config_key}:`, e);
              }
            }
            
            // Convert snake_case to camelCase for JavaScript
            const camelKey = key.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
            config[camelKey] = value;
          });
          
          resolve(config);
        }
      });
    });
  }

  /**
   * Search FRN suggestions from frn_lookup_helper for partial matches
   */
  async searchFRNSuggestions(partialFRN: string): Promise<{frn: string, search_name: string}[]> {
    return new Promise((resolve, reject) => {
      if (!partialFRN || partialFRN.trim() === '') {
        resolve([]);
        return;
      }

      const trimmedFRN = partialFRN.trim();
      
      // Search for FRNs that start with the partial FRN or contain it
      const query = `
        SELECT DISTINCT frn, search_name
        FROM frn_lookup_helper 
        WHERE frn LIKE ? OR frn LIKE ?
        ORDER BY 
          CASE 
            WHEN frn = ? THEN 1
            WHEN frn LIKE ? THEN 2
            ELSE 3
          END,
          search_name
        LIMIT 10
      `;

      const exactMatch = trimmedFRN;
      const startsWithPattern = `${trimmedFRN}%`;
      const containsPattern = `%${trimmedFRN}%`;

      this.db.all(query, [startsWithPattern, containsPattern, exactMatch, startsWithPattern], (err, rows: any[]) => {
        if (err) {
          console.error('Database error in searchFRNSuggestions:', err);
          reject(new Error(`Failed to search FRN suggestions: ${err.message}`));
        } else {
          // Convert search_name to title case
          const suggestions = (rows || []).map(row => ({
            frn: row.frn,
            search_name: this.toTitleCase(row.search_name)
          }));
          resolve(suggestions);
        }
      });
    });
  }

  /**
   * Convert string to title case
   */
  private toTitleCase(str: string): string {
    return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  }

  /**
   * Get valid platforms for dropdown from known_platforms table
   */
  async getValidPlatforms(): Promise<{id: number, canonical_name: string, display_name: string}[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id, canonical_name, display_name
        FROM known_platforms 
        WHERE show_in_dropdown = 1 AND is_active = 1
        ORDER BY display_name
      `;

      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          console.error('Database error in getValidPlatforms:', err);
          reject(new Error(`Failed to fetch platforms: ${err.message}`));
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get all institutions associated with a FRN
   */
  async getInstitutionsByFRN(frn: string): Promise<Array<{ search_name: string; canonical_name: string }>> {
    return new Promise((resolve, reject) => {
      if (!frn || frn.trim() === '') {
        resolve([]);
        return;
      }
      
      // Query to get all institutions with this FRN
      // Priority order: manual overrides first, then boe_institutions
      const query = `
        SELECT DISTINCT 
          COALESCE(search_name, canonical_name) as search_name,
          canonical_name
        FROM frn_lookup_helper 
        WHERE frn = ?
        ORDER BY priority, canonical_name
      `;
      
      this.db.all(query, [frn.trim()], (err, rows: any[]) => {
        if (err) {
          console.error('Database error in getInstitutionsByFRN:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Validate FRN format and check existence in frn_lookup_helper
   */
  async validateFRN(frn: string): Promise<{
    isValid: boolean;
    isNumeric: boolean;
    exists: boolean;
    canonicalName?: string;
    institutions?: Array<{ search_name: string; canonical_name: string }>;
    message?: string;
  }> {
    return new Promise((resolve, reject) => {
      if (!frn || frn.trim() === '') {
        resolve({
          isValid: false,
          isNumeric: false,
          exists: false,
          message: 'FRN is required'
        });
        return;
      }

      const trimmedFRN = frn.trim();
      
      // Check if numeric
      const isNumeric = /^\d+$/.test(trimmedFRN);
      
      // Check length (at least 6 digits)
      const hasValidLength = trimmedFRN.length >= 6;
      
      const isValid = isNumeric && hasValidLength;

      if (!isValid) {
        let message = '';
        if (!isNumeric) {
          message = 'FRN must contain only numeric characters';
        } else if (!hasValidLength) {
          message = 'FRN must be at least 6 digits';
        }
        
        resolve({
          isValid: false,
          isNumeric,
          exists: false,
          message
        });
        return;
      }

      // Check if FRN exists and get all institutions
      const query = `
        SELECT DISTINCT 
          COALESCE(search_name, canonical_name) as search_name,
          canonical_name
        FROM frn_lookup_helper 
        WHERE frn = ?
        ORDER BY priority, canonical_name
      `;

      this.db.all(query, [trimmedFRN], async (err, rows: any[]) => {
        if (err) {
          console.error('Database error in validateFRN:', err);
          reject(new Error(`Failed to validate FRN: ${err.message}`));
        } else {
          const exists = rows && rows.length > 0;
          let message = '';
          
          if (exists) {
            if (rows.length === 1) {
              message = `Found: ${rows[0].canonical_name}`;
            } else {
              message = `Found ${rows.length} institutions with this FRN`;
            }
          } else {
            message = 'FRN not found in registry. Please check the FRN or add to FRN Management.';
          }
          
          resolve({
            isValid: true,
            isNumeric: true,
            exists,
            canonicalName: exists ? rows[0].canonical_name : undefined,
            institutions: rows || [],
            message
          });
        }
      });
    });
  }

  /**
   * Get audit trail for a specific record
   */
  async getRecordAuditTrail(tableName: string, recordId: number): Promise<any[]> {
    if (!this.auditService) {
      return [];
    }
    
    try {
      return await this.auditService.getRecordAuditTrail(tableName, recordId);
    } catch (error) {
      console.error('Error getting record audit trail:', error);
      return [];
    }
  }

  /**
   * Get changes for a specific field across all records
   */
  async getFieldChanges(fieldName: string, limit = 100): Promise<any[]> {
    if (!this.auditService) {
      return [];
    }
    
    try {
      return await this.auditService.getFieldChanges(fieldName, limit);
    } catch (error) {
      console.error('Error getting field changes:', error);
      return [];
    }
  }

  /**
   * Get field change statistics
   */
  async getFieldChangeStats(daysBack = 30): Promise<any[]> {
    if (!this.auditService) {
      return [];
    }
    
    try {
      return await this.auditService.getFieldChangeStats(daysBack);
    } catch (error) {
      console.error('Error getting field change stats:', error);
      return [];
    }
  }

  /**
   * Get balance change summary (financial analysis)
   */
  async getBalanceChangeSummary(daysBack = 30): Promise<any> {
    if (!this.auditService) {
      return { total_changes: 0, total_increases: 0, total_decreases: 0, avg_change: 0 };
    }
    
    try {
      return await this.auditService.getBalanceChangeSummary(daysBack);
    } catch (error) {
      console.error('Error getting balance change summary:', error);
      return { total_changes: 0, total_increases: 0, total_decreases: 0, avg_change: 0 };
    }
  }

  /**
   * Get all audit entries with optional filtering
   */
  async getAllAuditEntries(filters?: {
    tableName?: string;
    fieldName?: string;
    operationContext?: string;
    daysBack?: number;
    limit?: number;
  }): Promise<any[]> {
    if (!this.auditService) {
      return [];
    }
    
    try {
      const { tableName, fieldName, operationContext, daysBack = 90, limit = 1000 } = filters || {};
      
      let query = `
        SELECT * FROM audit_log 
        WHERE 1=1
      `;
      const params: any[] = [];
      
      if (tableName) {
        query += ` AND table_name = ?`;
        params.push(tableName);
      }
      
      if (fieldName) {
        query += ` AND field_name = ?`;
        params.push(fieldName);
      }
      
      if (operationContext) {
        query += ` AND operation_context = ?`;
        params.push(operationContext);
      }
      
      if (daysBack) {
        query += ` AND timestamp > date('now', '-${daysBack} days')`;
      }
      
      query += ` ORDER BY timestamp DESC LIMIT ?`;
      params.push(limit);
      
      return new Promise((resolve, reject) => {
        this.db.all(query, params, (err, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
    } catch (error) {
      console.error('Error getting all audit entries:', error);
      return [];
    }
  }

  // ============================================================================
  // BALANCE UPDATE METHODS
  // ============================================================================

  /**
   * Create balance update service instance
   */
  getBalanceUpdateService() {
    return new BalanceUpdateService(this.db, this.auditService);
  }

  /**
   * Get deposits with balance status for the balance checker
   */
  async getDepositsWithBalanceStatus(filters?: BalanceUpdateFilters): Promise<DepositBalanceStatus[]> {
    const balanceUpdateService = this.getBalanceUpdateService();
    return balanceUpdateService.getDepositsWithBalanceStatus(filters);
  }

  /**
   * Create a new balance update session
   */
  async createBalanceUpdateSession(sessionType: 'manual' | 'scheduled' = 'manual'): Promise<number> {
    const balanceUpdateService = this.getBalanceUpdateService();
    return balanceUpdateService.createBalanceUpdateSession(sessionType);
  }

  /**
   * Update deposit balance in a session
   */
  async updateDepositBalanceInSession(
    sessionId: number,
    depositId: number,
    newBalance: number,
    resetSchedule: boolean = true,
    newAer?: number
  ): Promise<void> {
    const balanceUpdateService = this.getBalanceUpdateService();
    
    // Get reminder configuration
    const config = await this.getConfiguration();
    const reminderConfig = {
      reminderDaysBefore: config.balance_check_reminder_days || 3,
      autoCalendar: config.balance_check_auto_calendar !== false // Default to true
    };
    
    return balanceUpdateService.updateDepositBalance(
      sessionId, 
      depositId, 
      newBalance, 
      resetSchedule,
      reminderConfig,
      newAer
    );
  }

  /**
   * Complete a balance update session
   */
  async completeBalanceUpdateSession(sessionId: number): Promise<void> {
    const balanceUpdateService = this.getBalanceUpdateService();
    return balanceUpdateService.completeBalanceUpdateSession(sessionId);
  }

  /**
   * Get session progress
   */
  async getBalanceUpdateSessionProgress(sessionId: number): Promise<BalanceUpdateSessionProgress | null> {
    const balanceUpdateService = this.getBalanceUpdateService();
    return balanceUpdateService.getSessionProgress(sessionId);
  }

  /**
   * Get count of overdue deposits
   */
  async getOverdueDepositsCount(): Promise<number> {
    const balanceUpdateService = this.getBalanceUpdateService();
    return balanceUpdateService.getOverdueDepositsCount();
  }

  /**
   * Initialize next balance check dates for existing deposits
   */
  async initializeBalanceCheckSchedules(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Get configuration for default frequency
      this.getConfiguration().then(config => {
        const defaultFrequency = config.balance_check_frequency || 'monthly';
        
        // Update deposits that don't have a next_balance_check date
        const query = `
          UPDATE my_deposits 
          SET 
            balance_update_frequency = COALESCE(balance_update_frequency, ?),
            next_balance_check = CASE 
              WHEN next_balance_check IS NULL THEN 
                CASE balance_update_frequency
                  WHEN 'weekly' THEN datetime('now', '+7 days')
                  WHEN 'bi-weekly' THEN datetime('now', '+14 days')
                  WHEN 'monthly' THEN datetime('now', '+1 month')
                  WHEN 'quarterly' THEN datetime('now', '+3 months')
                  ELSE datetime('now', '+1 month')
                END
              ELSE next_balance_check
            END
          WHERE is_active = 1
        `;

        this.db.run(query, [defaultFrequency], (err) => {
          if (err) {
            console.error('Error initializing balance check schedules:', err);
            reject(err);
          } else {
            console.log('Balance check schedules initialized');
            resolve();
          }
        });
      }).catch(reject);
    });
  }

  /**
   * Generate balance check reminders for all active deposits
   */
  async generateBalanceCheckReminders(): Promise<{ created: number; skipped: number; errors: string[] }> {
    const balanceUpdateService = this.getBalanceUpdateService();
    const config = await this.getConfiguration();
    
    const reminderDaysBefore = config.balance_check_reminder_days || 3;
    const autoCalendar = config.balance_check_auto_calendar !== false; // Default to true
    
    return balanceUpdateService.generateBalanceCheckReminders(reminderDaysBefore, autoCalendar);
  }

  /**
   * Create balance check reminder for a specific deposit
   */
  async createBalanceCheckReminderForDeposit(
    depositId: number,
    nextCheckDate: string
  ): Promise<number | null> {
    const balanceUpdateService = this.getBalanceUpdateService();
    const config = await this.getConfiguration();
    
    const reminderDaysBefore = config.balance_check_reminder_days || 3;
    const autoCalendar = config.balance_check_auto_calendar !== false; // Default to true
    
    return balanceUpdateService.createBalanceCheckReminder(
      depositId,
      nextCheckDate,
      reminderDaysBefore,
      autoCalendar
    );
  }

  // ==================== FRN Management Methods ====================

  /**
   * Get FRN coverage statistics for dashboard
   */
  async getFRNStatistics(): Promise<{
    totalFRNs: number;
    totalOverrides: number;
    pendingResearch: number;
    completedResearch: number;
    coveragePercentage: number;
    recentActivity: number;
  }> {
    return new Promise((resolve, reject) => {
      const queries = {
        totalFRNs: `SELECT COUNT(DISTINCT frn) as count FROM frn_lookup_helper WHERE frn IS NOT NULL`,
        totalOverrides: `SELECT COUNT(*) as count FROM frn_manual_overrides`,
        pendingResearch: `SELECT COUNT(*) as count FROM frn_research_temp WHERE researched_frn IS NULL`,
        completedResearch: `SELECT COUNT(*) as count FROM frn_research_temp WHERE researched_frn IS NOT NULL`,
        uniqueBanks: `SELECT COUNT(DISTINCT bank) as count FROM my_deposits WHERE is_active = 1`,
        banksWithFRN: `SELECT COUNT(DISTINCT bank) as count FROM my_deposits WHERE is_active = 1 AND frn IS NOT NULL AND frn != ''`,
        recentActivity: `SELECT COUNT(*) as count FROM frn_manual_overrides WHERE created_at >= datetime('now', '-7 days')`
      };

      const results: any = {};
      let queriesCompleted = 0;
      const totalQueries = Object.keys(queries).length;

      Object.entries(queries).forEach(([key, query]) => {
        this.db.get(query, [], (err, row: any) => {
          if (err) {
            console.error(`Error in getFRNStatistics (${key}):`, err);
            results[key] = 0;
          } else {
            results[key] = row?.count || 0;
          }
          
          queriesCompleted++;
          if (queriesCompleted === totalQueries) {
            const coveragePercentage = results.uniqueBanks > 0 
              ? Math.round((results.banksWithFRN / results.uniqueBanks) * 100)
              : 0;
            
            resolve({
              totalFRNs: results.totalFRNs,
              totalOverrides: results.totalOverrides,
              pendingResearch: results.pendingResearch,
              completedResearch: results.completedResearch,
              coveragePercentage,
              recentActivity: results.recentActivity
            });
          }
        });
      });
    });
  }

  /**
   * Get recent FRN activity for dashboard
   */
  async getFRNRecentActivity(limit = 10): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          'override' as type,
          scraped_name as entity_name,
          frn,
          firm_name,
          created_at as activity_date,
          notes
        FROM frn_manual_overrides
        
        UNION ALL
        
        SELECT 
          'research_completed' as type,
          bank_name as entity_name,
          researched_frn as frn,
          researched_firm_name as firm_name,
          research_date as activity_date,
          research_notes as notes
        FROM frn_research_temp
        WHERE researched_frn IS NOT NULL
        
        ORDER BY activity_date DESC
        LIMIT ?
      `;

      this.db.all(query, [limit], (err, rows) => {
        if (err) {
          console.error('Error in getFRNRecentActivity:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get all FRN manual overrides with optional filtering
   */
  async getFRNManualOverrides(filters?: {
    searchTerm?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ overrides: any[]; total: number }> {
    return new Promise((resolve, reject) => {
      const { searchTerm, limit = 50, offset = 0 } = filters || {};
      
      let whereClause = '';
      const params: any[] = [];
      
      if (searchTerm) {
        whereClause = `WHERE 
          scraped_name LIKE ? OR 
          frn LIKE ? OR 
          firm_name LIKE ? OR 
          notes LIKE ?`;
        const searchPattern = `%${searchTerm}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
      }
      
      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM frn_manual_overrides ${whereClause}`;
      
      this.db.get(countQuery, params, (err, countRow: any) => {
        if (err) {
          console.error('Error counting FRN overrides:', err);
          reject(err);
          return;
        }
        
        const total = countRow?.total || 0;
        
        // Get paginated results
        const dataQuery = `
          SELECT * FROM frn_manual_overrides
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `;
        
        this.db.all(dataQuery, [...params, limit, offset], (err, rows) => {
          if (err) {
            console.error('Error fetching FRN overrides:', err);
            reject(err);
          } else {
            resolve({ overrides: rows || [], total });
          }
        });
      });
    });
  }

  /**
   * Create a new FRN override
   */
  async createFRNOverride(override: {
    scraped_name: string;
    frn: string;
    firm_name: string;
    confidence_score?: number;
    notes?: string;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      const { scraped_name, frn, firm_name, confidence_score = 1.0, notes = '' } = override;
      
      const query = `
        INSERT INTO frn_manual_overrides (scraped_name, frn, firm_name, confidence_score, notes)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      this.db.run(query, [scraped_name, frn, firm_name, confidence_score, notes], function(err) {
        if (err) {
          console.error('Error creating FRN override:', err);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  /**
   * Update an existing FRN override
   */
  async updateFRNOverride(id: number, updates: {
    scraped_name?: string;
    frn?: string;
    firm_name?: string;
    confidence_score?: number;
    notes?: string;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const fields: string[] = [];
      const values: any[] = [];
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      });
      
      if (fields.length === 0) {
        resolve();
        return;
      }
      
      values.push(id);
      const query = `UPDATE frn_manual_overrides SET ${fields.join(', ')} WHERE id = ?`;
      
      this.db.run(query, values, (err) => {
        if (err) {
          console.error('Error updating FRN override:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Delete an FRN override
   */
  async deleteFRNOverride(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM frn_manual_overrides WHERE id = ?`;
      
      this.db.run(query, [id], (err) => {
        if (err) {
          console.error('Error deleting FRN override:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get FRN research queue items
   */
  async getFRNResearchQueue(filters?: {
    searchTerm?: string;
    status?: 'pending' | 'completed';
    limit?: number;
    offset?: number;
  }): Promise<{ items: any[]; total: number }> {
    return new Promise((resolve, reject) => {
      const { searchTerm, status = 'pending', limit = 50, offset = 0 } = filters || {};
      
      let whereClause = status === 'pending' 
        ? 'WHERE researched_frn IS NULL'
        : 'WHERE researched_frn IS NOT NULL';
      
      const params: any[] = [];
      
      if (searchTerm) {
        whereClause += ` AND (
          bank_name LIKE ? OR 
          platform LIKE ? OR 
          research_notes LIKE ?
        )`;
        const searchPattern = `%${searchTerm}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }
      
      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM frn_research_temp ${whereClause}`;
      
      this.db.get(countQuery, params, (err, countRow: any) => {
        if (err) {
          console.error('Error counting research queue:', err);
          reject(err);
          return;
        }
        
        const total = countRow?.total || 0;
        
        // Get paginated results
        const dataQuery = `
          SELECT 
            rowid,
            bank_name,
            platform,
            source,
            account_type,
            product_count,
            min_rate,
            max_rate,
            avg_rate,
            first_seen,
            last_seen,
            researched_frn,
            researched_firm_name,
            research_notes,
            research_status,
            research_date,
            applied_date
          FROM frn_research_temp
          ${whereClause}
          ORDER BY 
            CASE WHEN researched_frn IS NULL THEN 0 ELSE 1 END,
            last_seen DESC
          LIMIT ? OFFSET ?
        `;
        
        this.db.all(dataQuery, [...params, limit, offset], (err, rows) => {
          if (err) {
            console.error('Error fetching research queue:', err);
            reject(err);
          } else {
            resolve({ items: rows || [], total });
          }
        });
      });
    });
  }

  /**
   * Complete FRN research by providing FRN and firm name
   */
  async completeFRNResearch(rowId: number, frn: string, firmName: string, notes?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE frn_research_temp 
        SET 
          researched_frn = ?,
          researched_firm_name = ?,
          research_notes = ?,
          research_status = 'completed',
          research_date = datetime('now')
        WHERE rowid = ?
      `;
      
      this.db.run(query, [frn, firmName, notes || '', rowId], (err) => {
        if (err) {
          console.error('Error completing FRN research:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Dismiss FRN research item
   */
  async dismissFRNResearch(rowId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM frn_research_temp WHERE rowid = ?`;
      
      this.db.run(query, [rowId], (err) => {
        if (err) {
          console.error('Error dismissing FRN research:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get FRN lookup helper data
   */
  async getFRNLookupHelper(filters?: {
    searchTerm?: string;
    matchType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: any[]; total: number }> {
    return new Promise((resolve, reject) => {
      const { searchTerm, matchType, limit = 100, offset = 0 } = filters || {};
      
      let whereClause = 'WHERE 1=1';
      const params: any[] = [];
      
      if (searchTerm) {
        whereClause += ` AND (
          frn LIKE ? OR 
          canonical_name LIKE ? OR 
          search_name LIKE ?
        )`;
        const searchPattern = `%${searchTerm}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }
      
      if (matchType) {
        whereClause += ` AND match_type = ?`;
        params.push(matchType);
      }
      
      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM frn_lookup_helper ${whereClause}`;
      
      this.db.get(countQuery, params, (err, countRow: any) => {
        if (err) {
          console.error('Error counting lookup helper:', err);
          reject(err);
          return;
        }
        
        const total = countRow?.total || 0;
        
        // Get paginated results
        const dataQuery = `
          SELECT 
            frn,
            canonical_name,
            search_name,
            match_type,
            confidence_score,
            match_rank
          FROM frn_lookup_helper
          ${whereClause}
          ORDER BY match_rank, canonical_name
          LIMIT ? OFFSET ?
        `;
        
        this.db.all(dataQuery, [...params, limit, offset], (err, rows) => {
          if (err) {
            console.error('Error fetching lookup helper:', err);
            reject(err);
          } else {
            resolve({ items: rows || [], total });
          }
        });
      });
    });
  }

  /**
   * Get BOE institutions data
   */
  async getBOEInstitutions(filters?: {
    searchTerm?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ institutions: any[]; total: number }> {
    return new Promise((resolve, reject) => {
      const { searchTerm, limit = 50, offset = 0 } = filters || {};
      
      let whereClause = '';
      const params: any[] = [];
      
      if (searchTerm) {
        whereClause = `WHERE frn LIKE ? OR firm_name LIKE ?`;
        const searchPattern = `%${searchTerm}%`;
        params.push(searchPattern, searchPattern);
      }
      
      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM boe_institutions ${whereClause}`;
      
      this.db.get(countQuery, params, (err, countRow: any) => {
        if (err) {
          console.error('Error counting BOE institutions:', err);
          reject(err);
          return;
        }
        
        const total = countRow?.total || 0;
        
        // Get paginated results with shared brands info
        // Note: Using subquery to avoid issues with GROUP BY
        const dataQuery = `
          SELECT 
            bi.*,
            (SELECT GROUP_CONCAT(trading_name, ', ') 
             FROM boe_shared_brands 
             WHERE primary_frn = bi.frn) as shared_brands
          FROM boe_institutions bi
          ${whereClause}
          ORDER BY bi.firm_name
          LIMIT ? OFFSET ?
        `;
        
        this.db.all(dataQuery, [...params, limit, offset], (err, rows) => {
          if (err) {
            console.error('Error fetching BOE institutions:', err);
            reject(err);
          } else {
            resolve({ institutions: rows || [], total });
          }
        });
      });
    });
  }

  /**
   * Get bank statistics by name for research
   */
  async getBankStatsByName(bankName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as product_count,
          MIN(aer) as min_rate,
          MAX(aer) as max_rate,
          AVG(aer) as avg_rate,
          GROUP_CONCAT(DISTINCT platform) as platforms,
          GROUP_CONCAT(DISTINCT type) as account_types,
          SUM(balance) as total_balance
        FROM my_deposits
        WHERE bank = ? AND is_active = 1
      `;
      
      this.db.get(query, [bankName], (err, row) => {
        if (err) {
          console.error('Error getting bank stats:', err);
          reject(err);
        } else {
          resolve(row || {});
        }
      });
    });
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
    });
  }
}
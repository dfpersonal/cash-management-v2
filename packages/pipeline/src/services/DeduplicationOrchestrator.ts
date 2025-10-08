import { EventEmitter } from 'events';
import { Database } from 'sqlite3';
import { ProductDeduplicationService } from './ProductDeduplicationService';
import { LogCategory } from '@cash-mgmt/shared';

/**
 * Deduplication Orchestrator - Event-Driven Processing
 *
 * Handles automatic deduplication processing after scraper completion.
 * Implements silent operation with error resilience and circuit breaker pattern.
 * Designed for zero user disruption - users only see scraper success messages.
 */

export interface OrchestratorConfig {
  enableAutomaticProcessing?: boolean;
  processingTimeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
  batchSize?: number;
  enableFallbackProcessing?: boolean;
}

export interface ProcessingStats {
  lastProcessedAt?: Date;
  totalProcessed: number;
  totalErrors: number;
  consecutiveErrors: number;
  circuitBreakerOpen: boolean;
  lastCircuitBreakerOpenAt?: Date;
}

export interface ProcessingEvent {
  type: 'scraper:completed' | 'manual:trigger' | 'scheduled:trigger' | 'recovery:trigger';
  source: string;
  data?: any;
  timestamp: Date;
}

/**
 * Circuit breaker states for fault tolerance
 */
enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Circuit open, failing fast
  HALF_OPEN = 'half_open' // Testing if service has recovered
}

/**
 * Orchestrates automatic deduplication processing with resilience patterns
 */
export class DeduplicationOrchestrator extends EventEmitter {
  private db: Database;
  private deduplicationService: ProductDeduplicationService;
  private config: Required<OrchestratorConfig>;
  private stats: ProcessingStats;
  private circuitBreakerState: CircuitBreakerState;
  private processingInProgress: boolean = false;
  private failsafeInterval?: NodeJS.Timeout;
  private recoveryInterval?: NodeJS.Timeout;

  constructor(db: Database, config: OrchestratorConfig = {}) {
    super();

    this.db = db;
    this.deduplicationService = new ProductDeduplicationService(db);

    // Default configuration for silent, resilient operation
    this.config = {
      enableAutomaticProcessing: true,
      processingTimeoutMs: 30000,        // 30 seconds timeout
      maxRetries: 3,
      retryDelayMs: 2000,                // 2 seconds between retries
      circuitBreakerThreshold: 3,        // 3 consecutive failures trigger circuit breaker
      circuitBreakerResetMs: 300000,     // 5 minutes recovery window
      batchSize: 10000,                  // Process up to 10k products at once
      enableFallbackProcessing: true,
      ...config
    };

    this.stats = {
      totalProcessed: 0,
      totalErrors: 0,
      consecutiveErrors: 0,
      circuitBreakerOpen: false
    };

    this.circuitBreakerState = CircuitBreakerState.CLOSED;

    this.setupEventListeners();
    this.startFailsafeProcessing();
  }

  /**
   * Initialize the orchestrator and underlying services
   */
  public async initialize(): Promise<void> {
    try {
      console.log(`${LogCategory.DEBUG} 🔧 Initializing deduplication orchestrator...`);

      await this.deduplicationService.initialize();

      console.log(`${LogCategory.DEBUG} ✅ Deduplication orchestrator initialized`);
    } catch (error) {
      console.log(`${LogCategory.ERROR} ❌ Failed to initialize deduplication orchestrator: ${error}`);
      throw error;
    }
  }

  /**
   * Set up event listeners for automatic processing triggers
   */
  private setupEventListeners(): void {
    // Listen for scraper completion events
    this.on('scraper:completed', this.handleScraperCompletion.bind(this));

    // Listen for manual processing triggers
    this.on('manual:trigger', this.handleManualTrigger.bind(this));

    // Listen for recovery triggers
    this.on('recovery:trigger', this.handleRecoveryTrigger.bind(this));
  }

  /**
   * Handle scraper completion event - main entry point for automatic processing
   */
  private async handleScraperCompletion(event: ProcessingEvent): Promise<void> {
    if (!this.config.enableAutomaticProcessing) {
      console.log(`${LogCategory.DEBUG} 🔧 Automatic processing disabled, skipping deduplication`);
      return;
    }

    console.log(`${LogCategory.DEBUG} 🔄 Scraper completed: ${event.source}, triggering deduplication`);

    // Process asynchronously to not block scraper response
    setImmediate(async () => {
      await this.processWithResilience(event);
    });
  }

  /**
   * Handle manual processing trigger
   */
  private async handleManualTrigger(event: ProcessingEvent): Promise<void> {
    console.log(`${LogCategory.PROGRESS} 🔄 Manual deduplication trigger received from ${event.source}`);
    await this.processWithResilience(event);
  }

  /**
   * Handle recovery processing trigger
   */
  private async handleRecoveryTrigger(event: ProcessingEvent): Promise<void> {
    console.log(`${LogCategory.PROGRESS} 🔄 Recovery deduplication trigger from ${event.source}`);
    await this.processWithResilience(event);
  }

  /**
   * Process deduplication with resilience patterns (circuit breaker, retries)
   */
  private async processWithResilience(event: ProcessingEvent): Promise<void> {
    // Check circuit breaker state
    if (this.circuitBreakerState === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptRecovery()) {
        this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        console.log(`${LogCategory.INFO} 🔄 Circuit breaker half-open, attempting recovery`);
      } else {
        console.log(`${LogCategory.DEBUG} ⏸️ Circuit breaker open, skipping deduplication`);
        return;
      }
    }

    // Prevent concurrent processing with database-backed locking
    const lockAcquired = await this.acquireProcessingLock('deduplication');
    if (!lockAcquired) {
      console.log(`${LogCategory.DEBUG} ⏸️ Could not acquire processing lock, another instance is running`);
      return;
    }

    try {
      console.log(`${LogCategory.DEBUG} 🔄 Starting deduplication processing (${event.type})`);

      const result = await this.executeWithTimeout(
        () => this.deduplicationService.processRawProducts(),
        this.config.processingTimeoutMs
      );

      // Success - reset circuit breaker and update stats
      this.onProcessingSuccess(result);

      console.log(`${LogCategory.DEBUG} ✅ Deduplication completed: ${result.unique} unique, ${result.duplicates} duplicates`);

    } catch (error) {
      this.onProcessingError(error, event);
    } finally {
      await this.releaseProcessingLock('deduplication');
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Processing timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Handle successful processing
   */
  private onProcessingSuccess(result: any): void {
    this.stats.totalProcessed += result.processed;
    this.stats.consecutiveErrors = 0;
    this.stats.lastProcessedAt = new Date();

    // Reset circuit breaker if it was half-open
    if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreakerState = CircuitBreakerState.CLOSED;
      this.stats.circuitBreakerOpen = false;
      console.log(`${LogCategory.INFO} ✅ Circuit breaker reset - service recovered`);
    }

    this.emit('processing:success', result);
  }

  /**
   * Handle processing error with circuit breaker logic
   */
  private onProcessingError(error: any, event: ProcessingEvent): void {
    this.stats.totalErrors++;
    this.stats.consecutiveErrors++;

    console.log(`${LogCategory.WARNING} ⚠️ Deduplication failed (attempt ${this.stats.consecutiveErrors}): ${error.message}`);

    // Check if circuit breaker should open
    if (this.stats.consecutiveErrors >= this.config.circuitBreakerThreshold) {
      this.openCircuitBreaker();
    }

    // Try fallback processing if enabled
    if (this.config.enableFallbackProcessing && this.circuitBreakerState !== CircuitBreakerState.OPEN) {
      console.log(`${LogCategory.INFO} 🔄 Attempting fallback processing...`);
      setImmediate(() => this.attemptFallbackProcessing(event));
    }

    this.emit('processing:error', { error, event, stats: this.stats });
  }

  /**
   * Open circuit breaker
   */
  private openCircuitBreaker(): void {
    this.circuitBreakerState = CircuitBreakerState.OPEN;
    this.stats.circuitBreakerOpen = true;
    this.stats.lastCircuitBreakerOpenAt = new Date();

    console.log(`${LogCategory.WARNING} ⚠️ Circuit breaker opened - deduplication temporarily disabled`);

    // Schedule automatic recovery attempt
    this.scheduleRecoveryAttempt();
  }

  /**
   * Check if circuit breaker should attempt recovery
   */
  private shouldAttemptRecovery(): boolean {
    if (!this.stats.lastCircuitBreakerOpenAt) {
      return true;
    }

    const timeSinceOpen = Date.now() - this.stats.lastCircuitBreakerOpenAt.getTime();
    return timeSinceOpen >= this.config.circuitBreakerResetMs;
  }

  /**
   * Schedule automatic recovery attempt
   */
  private scheduleRecoveryAttempt(): void {
    if (this.recoveryInterval) {
      clearTimeout(this.recoveryInterval);
    }

    this.recoveryInterval = setTimeout(() => {
      console.log(`${LogCategory.INFO} 🔄 Scheduled recovery attempt`);
      this.emit('recovery:trigger', {
        type: 'recovery:trigger',
        source: 'circuit_breaker_recovery',
        timestamp: new Date()
      });
    }, this.config.circuitBreakerResetMs);
  }

  /**
   * Attempt fallback processing with reduced functionality
   * Copies raw data directly to clean table without deduplication
   */
  private async attemptFallbackProcessing(event: ProcessingEvent): Promise<void> {
    try {
      console.log(`${LogCategory.DEBUG} 🔄 Executing fallback processing...`);

      // Enhanced fallback - copy raw data to clean table AND mark as processed
      await this.copyRawToCleanFallback();
      await this.markUnprocessedAsCompleted();

      console.log(`${LogCategory.INFO} ✅ Fallback processing completed`);
    } catch (error) {
      console.log(`${LogCategory.ERROR} ❌ Fallback processing failed: ${error instanceof Error ? error.message : error}`);
      // If even fallback fails, just mark as processed so we don't keep retrying
      try {
        await this.markUnprocessedAsCompleted();
      } catch (markError) {
        console.log(`${LogCategory.ERROR} ❌ Could not even mark as processed: ${markError}`);
      }
    }
  }

  /**
   * Mark unprocessed raw data as completed (fallback mode)
   */
  private async markUnprocessedAsCompleted(): Promise<void> {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE available_products_raw
        SET processed_at = ?, dedup_status = ?, dedup_reason = ?
        WHERE processed_at IS NULL
      `;

      this.db.run(query, [
        new Date().toISOString(),
        'fallback',
        'Processed via fallback mode'
      ], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Copy unprocessed raw data directly to available_products (fallback mode)
   * This ensures users always see their data even if deduplication fails
   */
  private async copyRawToCleanFallback(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`${LogCategory.INFO} 🚨 Fallback mode: Copying raw data directly to clean table`);

      // Start transaction for atomic fallback operation
      this.db.run('BEGIN TRANSACTION', (beginErr) => {
        if (beginErr) {
          reject(new Error(`Fallback: Failed to start transaction: ${beginErr.message}`));
          return;
        }

        // First, archive existing clean products (same logic as normal processing)
        const countQuery = 'SELECT COUNT(*) as count FROM available_products';
        this.db.get(countQuery, (countErr: any, countResult: any) => {
          if (countErr) {
            this.rollbackFallbackTransaction(reject, `Fallback: Failed to count products: ${countErr.message}`);
            return;
          }

          const hasProducts = countResult && countResult.count > 0;

          if (hasProducts) {
            const archiveQuery = `
              INSERT OR IGNORE INTO historical_products (
                platform, source, bank_name, frn, account_type, aer_rate, gross_rate,
                term_months, notice_period_days, min_deposit, max_deposit,
                fscs_protected, interest_payment_frequency, apply_by_date,
                special_features, scrape_date, confidence_score, fuzzy_match_notes,
                created_at
              )
              SELECT
                platform, source, bank_name, frn, account_type, aer_rate, gross_rate,
                term_months, notice_period_days, min_deposit, max_deposit,
                fscs_protected, interest_payment_frequency, apply_by_date,
                special_features, scrape_date, confidence_score, fuzzy_match_notes,
                created_at
              FROM available_products
            `;

            this.db.run(archiveQuery, (archiveErr: any) => {
              if (archiveErr) {
                this.rollbackFallbackTransaction(reject, `Fallback: Failed to archive: ${archiveErr.message}`);
                return;
              }
              this.continueFallbackCopy(resolve, reject);
            });
          } else {
            this.continueFallbackCopy(resolve, reject);
          }
        });
      });
    });
  }

  /**
   * Continue fallback copy after archiving
   */
  private continueFallbackCopy(resolve: Function, reject: Function): void {
    // Clear existing products
    this.db.run('DELETE FROM available_products', (clearErr) => {
      if (clearErr) {
        this.rollbackFallbackTransaction(reject, `Fallback: Failed to clear products: ${clearErr.message}`);
        return;
      }

      // Copy unprocessed raw data directly to clean table
      // Generate basic business keys for fallback data
      const fallbackCopyQuery = `
        INSERT INTO available_products (
          platform, source, bank_name, frn, account_type, aer_rate, gross_rate,
          term_months, notice_period_days, min_deposit, max_deposit, fscs_protected,
          interest_payment_frequency, apply_by_date, special_features, scrape_date,
          confidence_score, fuzzy_match_notes, business_key, deduplication_metadata,
          raw_platform, created_at
        )
        SELECT
          platform, source, bank_name, frn, account_type, aer_rate, gross_rate,
          term_months, notice_period_days, min_deposit, max_deposit, fscs_protected,
          interest_payment_frequency, apply_by_date, special_features, scrape_date,
          confidence_score, fuzzy_match_notes,
          COALESCE(business_key, 'fallback_' || rowid) as business_key,
          '{"mode":"fallback","timestamp":"' || datetime('now') || '"}' as deduplication_metadata,
          raw_platform,
          datetime('now') as created_at
        FROM available_products_raw
        WHERE processed_at IS NULL
      `;

      this.db.run(fallbackCopyQuery, (copyErr: any, copyResult: any) => {
        if (copyErr) {
          this.rollbackFallbackTransaction(reject, `Fallback: Failed to copy raw data: ${copyErr.message}`);
          return;
        }

        // Commit transaction
        this.db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            this.rollbackFallbackTransaction(reject, `Fallback: Failed to commit: ${commitErr.message}`);
            return;
          }

          const copiedCount = copyResult?.changes || 0;
          console.log(`${LogCategory.INFO} ✅ Fallback: Copied ${copiedCount} products directly to clean table`);
          resolve();
        });
      });
    });
  }

  /**
   * Helper method to rollback fallback transaction
   */
  private rollbackFallbackTransaction(reject: Function, message: string): void {
    console.log(`${LogCategory.ERROR} ❌ ${message}`);

    this.db.run('ROLLBACK', (rollbackErr) => {
      if (rollbackErr) {
        console.log(`${LogCategory.ERROR} ❌ Fallback rollback error: ${rollbackErr.message}`);
      } else {
        console.log(`${LogCategory.INFO} 🔄 Fallback transaction rolled back`);
      }
      reject(new Error(message));
    });
  }

  /**
   * Start failsafe processing that runs every 5 minutes
   */
  private startFailsafeProcessing(): void {
    if (this.failsafeInterval) {
      clearInterval(this.failsafeInterval);
    }

    // Run failsafe every 5 minutes
    this.failsafeInterval = setInterval(() => {
      if (!this.processingInProgress && this.circuitBreakerState !== CircuitBreakerState.OPEN) {
        console.log(`${LogCategory.DEBUG} 🔄 Failsafe processing check`);

        this.emit('recovery:trigger', {
          type: 'recovery:trigger',
          source: 'failsafe_interval',
          timestamp: new Date()
        });
      }
    }, 300000); // 5 minutes
  }

  /**
   * Trigger manual deduplication processing
   */
  public async triggerManualProcessing(): Promise<void> {
    this.emit('manual:trigger', {
      type: 'manual:trigger',
      source: 'user_request',
      timestamp: new Date()
    });
  }

  /**
   * Get current orchestrator statistics
   */
  public getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Get current circuit breaker state
   */
  public getCircuitBreakerState(): string {
    return this.circuitBreakerState;
  }

  /**
   * Shutdown orchestrator and clean up resources
   */
  public shutdown(): void {
    console.log(`${LogCategory.INFO} 🛑 Shutting down deduplication orchestrator`);

    if (this.failsafeInterval) {
      clearInterval(this.failsafeInterval);
    }

    if (this.recoveryInterval) {
      clearTimeout(this.recoveryInterval);
    }

    this.removeAllListeners();
  }

  /**
   * Force reset circuit breaker (for administrative use)
   */
  public resetCircuitBreaker(): void {
    this.circuitBreakerState = CircuitBreakerState.CLOSED;
    this.stats.circuitBreakerOpen = false;
    this.stats.consecutiveErrors = 0;

    console.log(`${LogCategory.INFO} 🔧 Circuit breaker manually reset`);
  }

  /**
   * Acquire processing lock to prevent concurrent deduplication
   */
  private async acquireProcessingLock(processType: string): Promise<boolean> {
    return new Promise((resolve) => {
      // First check if there's already a running process
      const checkQuery = `
        SELECT id, started_at FROM processing_state
        WHERE process_type = ? AND status = 'running'
        ORDER BY started_at DESC LIMIT 1
      `;

      this.db.get(checkQuery, [processType], (err: any, existingProcess: any) => {
        if (err) {
          console.log(`${LogCategory.WARNING} ⚠️ Error checking processing lock: ${err.message}`);
          resolve(false);
          return;
        }

        // If there's a running process, check if it's stale (older than 10 minutes)
        if (existingProcess) {
          const startedAt = new Date(existingProcess.started_at);
          const now = new Date();
          const ageMinutes = (now.getTime() - startedAt.getTime()) / (1000 * 60);

          if (ageMinutes < 10) {
            console.log(`${LogCategory.DEBUG} ⏸️ Recent process found (${Math.round(ageMinutes)}min old), lock not acquired`);
            resolve(false);
            return;
          } else {
            console.log(`${LogCategory.WARNING} ⚠️ Stale process found (${Math.round(ageMinutes)}min old), cleaning up`);
            // Clean up stale process
            this.db.run('UPDATE processing_state SET status = ?, completed_at = ?, error_message = ? WHERE id = ?',
              ['failed', new Date().toISOString(), 'Process timed out', existingProcess.id]);
          }
        }

        // Acquire new lock
        const insertQuery = `
          INSERT INTO processing_state (process_type, status, started_at, metadata)
          VALUES (?, ?, ?, ?)
        `;

        this.db.run(insertQuery, [
          processType,
          'running',
          new Date().toISOString(),
          JSON.stringify({
            pid: process.pid,
            circuitBreakerState: this.circuitBreakerState,
            stats: this.stats
          })
        ], (insertErr: any) => {
          if (insertErr) {
            console.log(`${LogCategory.ERROR} ❌ Failed to acquire processing lock: ${insertErr.message}`);
            resolve(false);
          } else {
            console.log(`${LogCategory.INFO} 🔒 Processing lock acquired for ${processType}`);
            resolve(true);
          }
        });
      });
    });
  }

  /**
   * Release processing lock
   */
  private async releaseProcessingLock(processType: string): Promise<void> {
    return new Promise((resolve) => {
      const updateQuery = `
        UPDATE processing_state
        SET status = ?, completed_at = ?, metadata = ?
        WHERE process_type = ? AND status = 'running'
        ORDER BY started_at DESC LIMIT 1
      `;

      this.db.run(updateQuery, [
        'completed',
        new Date().toISOString(),
        JSON.stringify({
          pid: process.pid,
          finalStats: this.stats,
          circuitBreakerState: this.circuitBreakerState
        }),
        processType
      ], (err: any) => {
        if (err) {
          console.log(`${LogCategory.WARNING} ⚠️ Failed to release processing lock: ${err.message}`);
        } else {
          console.log(`${LogCategory.INFO} 🔓 Processing lock released for ${processType}`);
        }
        resolve();
      });
    });
  }
}

/**
 * Global orchestrator instance for application-wide use
 */
let globalOrchestrator: DeduplicationOrchestrator | null = null;

/**
 * Get or create global orchestrator instance
 */
export function getDeduplicationOrchestrator(db?: Database, config?: OrchestratorConfig): DeduplicationOrchestrator {
  if (!globalOrchestrator && db) {
    globalOrchestrator = new DeduplicationOrchestrator(db, config);
  }

  if (!globalOrchestrator) {
    throw new Error('Deduplication orchestrator not initialized - database required for first call');
  }

  return globalOrchestrator;
}

/**
 * Initialize global orchestrator
 */
export async function initializeDeduplicationOrchestrator(db: Database, config?: OrchestratorConfig): Promise<DeduplicationOrchestrator> {
  globalOrchestrator = new DeduplicationOrchestrator(db, config);
  await globalOrchestrator.initialize();
  return globalOrchestrator;
}

/**
 * Shutdown global orchestrator
 */
export function shutdownDeduplicationOrchestrator(): void {
  if (globalOrchestrator) {
    globalOrchestrator.shutdown();
    globalOrchestrator = null;
  }
}
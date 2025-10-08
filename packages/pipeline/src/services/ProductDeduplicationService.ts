import { Database } from 'sqlite3';
import { Engine } from 'json-rules-engine';
import { LogCategory } from '@cash-mgmt/shared';

/**
 * Product Deduplication Service - Migration Phase 1
 *
 * Handles deduplication of product data using a raw/clean table pattern.
 * Ports business key generation logic from JavaScript scrapers to TypeScript.
 * Integrates with rules engine for configurable deduplication logic.
 */

// Type definitions for deduplication
export interface RawProduct {
  id: number;
  platform: string;
  source?: string;
  bank_name: string;
  frn?: string;
  account_type: string;
  aer_rate: number;
  gross_rate?: number;
  term_months?: number;
  notice_period_days?: number;
  min_deposit?: number;
  max_deposit?: number;
  fscs_protected?: boolean;
  interest_payment_frequency?: string;
  apply_by_date?: string;
  special_features?: string;
  scrape_date: string;
  confidence_score?: number;
  fuzzy_match_notes?: string;
  created_at: string;
  business_key?: string;
  deduplication_metadata?: string;
  raw_platform?: string;
  imported_at: string;
  processed_at?: string;
  dedup_status?: string;
  dedup_reason?: string;
}

export interface ProductWithKey extends RawProduct {
  businessKey: string;
}

export interface DeduplicationConfig {
  rateTolerance?: number;
  enableRateTolerance?: boolean;
  enableCrossPlatformDedup?: boolean;
  platformInclusionStrategy?: 'never' | 'always' | 'conditional';
  userPreferences?: {
    deduplicationPreference?: 'prefer_registered' | 'show_all';
  };
}

export interface ProcessingResult {
  processed: number;
  unique: number;
  duplicates: number;
  errors: number;
  failed: RawProduct[];
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export interface BusinessKeyResult {
  businessKey: string | null;
  valid: boolean;
  issues: string[];
}

export interface DeduplicationRule {
  id: number;
  rule_name: string;
  rule_type: string;
  conditions: string;
  event_type: string;
  event_params?: string;
  priority: number;
  enabled: boolean;
  description?: string;
}

/**
 * Main deduplication service class
 */
export class ProductDeduplicationService {
  private db: Database;
  private rulesEngine: Engine;
  private config: DeduplicationConfig;
  private rulesLoaded: boolean = false;

  constructor(db: Database, config: DeduplicationConfig = {}) {
    this.db = db;
    this.rulesEngine = new Engine();
    this.config = {
      rateTolerance: 0.0005, // 5 basis points default (0.05%)
      enableRateTolerance: true,
      enableCrossPlatformDedup: true,
      platformInclusionStrategy: 'conditional',
      userPreferences: {},
      ...config
    };
  }

  /**
   * Initialize the rules engine with deduplication rules from database
   */
  public async initialize(): Promise<void> {
    if (this.rulesLoaded) {
      return;
    }

    console.log(`${LogCategory.PROGRESS} 🔄 Loading deduplication rules...`);

    try {
      const rules = await this.loadDeduplicationRules();

      for (const rule of rules) {
        let conditions: any;
        try {
          conditions = JSON.parse(rule.conditions);
        } catch (error) {
          console.log(`${LogCategory.WARNING} ⚠️ Invalid rule conditions for ${rule.rule_name}: ${error}`);
          continue;
        }

        let eventParams: any = {};
        if (rule.event_params) {
          try {
            eventParams = JSON.parse(rule.event_params);
          } catch (error) {
            console.log(`${LogCategory.WARNING} ⚠️ Invalid event params for ${rule.rule_name}: ${error}`);
          }
        }

        this.rulesEngine.addRule({
          conditions,
          event: {
            type: rule.event_type,
            params: eventParams
          },
          priority: rule.priority
        });
      }

      this.rulesLoaded = true;
      console.log(`${LogCategory.INFO} 📊 Loaded ${rules.length} deduplication rules`);
    } catch (error) {
      console.log(`${LogCategory.ERROR} ❌ Failed to load deduplication rules: ${error}`);
      throw error;
    }
  }

  /**
   * Process unprocessed raw products through the deduplication pipeline
   */
  public async processRawProducts(): Promise<ProcessingResult> {
    console.log(`${LogCategory.PROGRESS} 🔄 Starting deduplication processing...`);

    // 1. Load unprocessed products from available_products_raw
    const rawProducts = await this.getUnprocessedProducts();
    console.log(`${LogCategory.INFO} 📊 Found ${rawProducts.length} unprocessed products`);

    if (rawProducts.length === 0) {
      return {
        processed: 0,
        unique: 0,
        duplicates: 0,
        errors: 0,
        failed: []
      };
    }

    // 2. Generate business keys
    const productsWithKeys = await this.generateBusinessKeys(rawProducts);
    console.log(`${LogCategory.INFO} 🔑 Generated business keys for ${productsWithKeys.length} products`);

    // 3. Apply deduplication rules
    const deduplicationResults = await this.applyDeduplicationRules(productsWithKeys);
    console.log(`${LogCategory.INFO} 🎯 Deduplication: ${deduplicationResults.unique} unique, ${deduplicationResults.duplicates} duplicates`);

    // 4. Write clean data to available_products
    await this.writeCleanProducts(deduplicationResults.uniqueProducts);

    // 5. Mark raw records as processed
    await this.markAsProcessed(productsWithKeys, deduplicationResults);

    console.log(`${LogCategory.INFO} ✅ Deduplication completed successfully`);

    return {
      processed: rawProducts.length,
      unique: deduplicationResults.unique,
      duplicates: deduplicationResults.duplicates,
      errors: deduplicationResults.errors,
      failed: deduplicationResults.failed
    };
  }

  /**
   * Generate business keys for products using ported JavaScript logic
   */
  private async generateBusinessKeys(products: RawProduct[]): Promise<ProductWithKey[]> {
    const results = await Promise.all(
      products.map(async (product) => {
        const businessKeyResult = await this.generateBusinessKeyWithValidation(product);

        return {
          ...product,
          businessKey: businessKeyResult.businessKey || `invalid_${Date.now()}_${Math.random()}`
        };
      })
    );

    return results;
  }

  /**
   * Generate business key with validation (ported from JavaScript)
   */
  public async generateBusinessKeyWithValidation(product: RawProduct): Promise<BusinessKeyResult> {
    const validation = this.validateBusinessKeyComponents(product);

    if (!validation.valid) {
      return {
        businessKey: null,
        valid: false,
        issues: validation.issues
      };
    }

    try {
      const businessKey = await this.generateBusinessKey(product, this.config);

      return {
        businessKey: businessKey,
        valid: true,
        issues: []
      };
    } catch (error) {
      return {
        businessKey: null,
        valid: false,
        issues: [`Business key generation failed: ${error}`]
      };
    }
  }

  /**
   * Generate business key for cross-platform deduplication (ported from JavaScript)
   */
  public async generateBusinessKey(product: RawProduct, deduplicationConfig: DeduplicationConfig = {}): Promise<string> {
    // Use rules engine to determine business key generation configuration
    const facts = {
      generatingBusinessKey: true,
      hasAerRate: product.aer_rate != null && product.aer_rate > 0,
      bankName: product.bank_name,
      platform: product.platform || 'direct',
      accountType: product.account_type
    };

    const ruleResults = await this.rulesEngine.run(facts);

    // Extract configuration from rule events
    let shouldIncludePlatform = false;
    let rateTolerance = 0.05; // Default 5 basis points
    let enableRateTolerance = false;

    for (const event of ruleResults.events) {
      if (event.type === 'include_platform') {
        shouldIncludePlatform = true;
      } else if (event.type === 'apply_rate_bucketing') {
        enableRateTolerance = true;
        rateTolerance = event.params?.tolerancePercent || 0.05;
      }
    }

    // Robust normalization with fallback values
    const bankSlug = this.normalizeBankNameSafely(product.bank_name, product.id);
    const platformSlug = this.normalizePlatformSafely(product.platform);
    const accountTypeSlug = this.normalizeAccountTypeSafely(product.account_type);

    // Smart rate bucketing with error handling
    let rateBucket: number;
    try {
      if (enableRateTolerance && rateTolerance > 0 && typeof product.aer_rate === 'number' && !isNaN(product.aer_rate)) {
        // Convert rate from percentage to decimal, then to basis points
        const rateDecimal = product.aer_rate / 100; // 4.43% -> 0.0443
        const rateBasisPoints = Math.round(rateDecimal * 10000); // 0.0443 -> 443 BP
        const toleranceBasisPoints = Math.round(rateTolerance * 10000); // 0.05 -> 500 BP
        const bucketBasisPoints = Math.floor(rateBasisPoints / toleranceBasisPoints) * toleranceBasisPoints;
        rateBucket = bucketBasisPoints / 100; // Convert back to percentage for display (440 BP -> 4.40)
      } else {
        rateBucket = this.normalizeRateSafely(product.aer_rate);
      }
    } catch (error) {
      console.log(`${LogCategory.WARNING} ⚠️ Rate bucketing failed for product ${product.id}, using safe fallback`);
      rateBucket = this.normalizeRateSafely(product.aer_rate);
    }

    // Proper term bucket handling with error handling
    let termBucket: string;
    try {
      termBucket = this.canonicalizeTermBucket(product);
    } catch (error) {
      console.log(`${LogCategory.WARNING} ⚠️ Term canonicalization failed for product ${product.id}, using safe fallback`);
      termBucket = this.normalizeTermSafely(product.term_months, product.notice_period_days);
    }

    // Generate business key with conditional platform inclusion based on rules
    if (shouldIncludePlatform) {
      return `${bankSlug}_${platformSlug}_${accountTypeSlug}_${rateBucket}_${termBucket}`;
    } else {
      return `${bankSlug}_${accountTypeSlug}_${rateBucket}_${termBucket}`;
    }
  }

  /**
   * Safely normalize bank name with fallback for missing/invalid data
   */
  private normalizeBankNameSafely(bankName: any, productId?: any): string {
    try {
      if (bankName && typeof bankName === 'string' && bankName.trim()) {
        return this.normalizeBankName(bankName);
      } else {
        console.log(`${LogCategory.WARNING} ⚠️ Invalid bank name for product ${productId}: ${bankName}`);
        return `unknown_bank_${productId || 'noId'}`;
      }
    } catch (error) {
      console.log(`${LogCategory.WARNING} ⚠️ Bank name normalization error for product ${productId}: ${error}`);
      return `error_bank_${productId || 'noId'}`;
    }
  }

  /**
   * Safely normalize platform with fallback
   */
  private normalizePlatformSafely(platform: any): string {
    try {
      if (platform && typeof platform === 'string' && platform.trim()) {
        return platform.toLowerCase().trim();
      } else {
        return 'direct';
      }
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Safely normalize account type with fallback
   */
  private normalizeAccountTypeSafely(accountType: any): string {
    try {
      if (accountType && typeof accountType === 'string' && accountType.trim()) {
        return accountType.toLowerCase().replace(/\s+/g, '_');
      } else {
        return 'unknown_type';
      }
    } catch (error) {
      return 'error_type';
    }
  }

  /**
   * Safely normalize rate with fallback for invalid values
   */
  private normalizeRateSafely(rate: any): number {
    try {
      if (typeof rate === 'number' && !isNaN(rate) && rate >= 0 && rate <= 100) {
        return Math.floor(rate * 100) / 100; // Round to 2 decimal places
      } else if (typeof rate === 'string') {
        const parsed = parseFloat(rate);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
          return Math.floor(parsed * 100) / 100;
        }
      }
      console.log(`${LogCategory.WARNING} ⚠️ Invalid rate: ${rate}, using 0.00 as fallback`);
      return 0.00;
    } catch (error) {
      console.log(`${LogCategory.WARNING} ⚠️ Rate normalization error: ${error}, using 0.00 as fallback`);
      return 0.00;
    }
  }

  /**
   * Safely normalize term with fallback
   */
  private normalizeTermSafely(termMonths: any, noticeDays: any): string {
    try {
      if (typeof termMonths === 'number' && termMonths > 0) {
        return `${termMonths}m`;
      } else if (typeof noticeDays === 'number' && noticeDays > 0) {
        return `${noticeDays}d_notice`;
      } else {
        return 'variable';
      }
    } catch (error) {
      return 'unknown_term';
    }
  }

  /**
   * Normalize bank name for consistent business key generation (ported from JavaScript)
   */
  private normalizeBankName(bankName: string): string {
    if (!bankName || typeof bankName !== 'string') {
      return 'unknown';
    }

    // Normalize bank names by removing common corporate suffixes
    let normalized = bankName
      .toLowerCase()
      .replace(/\s+(plc|ltd|limited|bank|uk)(\s|$)/g, '') // Remove common suffixes
      .replace(/[^a-z0-9]/g, '_')  // Replace non-alphanumeric with underscore
      .replace(/_+/g, '_')         // Collapse multiple underscores
      .replace(/^_|_$/g, '');      // Remove leading/trailing underscores

    return normalized;
  }

  /**
   * Canonicalize term bucket for different account types (ported from JavaScript)
   */
  public canonicalizeTermBucket(product: RawProduct): string {
    // Handle notice accounts with notice period in days
    if (product.account_type === 'notice' && product.notice_period_days) {
      return `notice_${product.notice_period_days}d`;
    }

    // Handle fixed term accounts with term in months
    if (product.account_type === 'fixed_term' && product.term_months) {
      return `fixed_${product.term_months}m`;
    }

    // Easy access accounts don't have terms
    if (product.account_type === 'easy_access') {
      return 'easy_access';
    }

    // Fallback for other account types
    if (product.account_type) {
      return product.account_type.toLowerCase();
    }

    return 'unknown';
  }


  /**
   * Validate business key components (ported from JavaScript)
   */
  public validateBusinessKeyComponents(product: RawProduct): ValidationResult {
    const issues: string[] = [];

    if (!product.bank_name || product.bank_name.trim() === '') {
      issues.push('Missing or empty bank name');
    }

    if (!product.aer_rate || typeof product.aer_rate !== 'number') {
      issues.push('Missing or invalid AER rate');
    }

    if (!product.account_type || product.account_type.trim() === '') {
      issues.push('Missing or empty account type');
    }

    if (product.account_type === 'notice' && !product.notice_period_days) {
      issues.push('Notice account missing notice period days');
    }

    if (product.account_type === 'fixed_term' && !product.term_months) {
      issues.push('Fixed term account missing term months');
    }

    return {
      valid: issues.length === 0,
      issues: issues
    };
  }

  /**
   * Load unprocessed products from available_products_raw table
   */
  private async getUnprocessedProducts(): Promise<RawProduct[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT *, rowid as id FROM available_products_raw
        WHERE processed_at IS NULL
        ORDER BY imported_at ASC
      `;

      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as RawProduct[]);
        }
      });
    });
  }


  /**
   * Load deduplication rules from database
   */
  private async loadDeduplicationRules(): Promise<DeduplicationRule[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM deduplication_rules
        WHERE enabled = 1
        ORDER BY priority DESC
      `;

      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as DeduplicationRule[]);
        }
      });
    });
  }

  /**
   * Apply deduplication rules to products with business keys
   */
  private async applyDeduplicationRules(productsWithKeys: ProductWithKey[]): Promise<{
    uniqueProducts: ProductWithKey[];
    duplicates: number;
    unique: number;
    errors: number;
    failed: RawProduct[];
  }> {
    // For now, implement simple business key based deduplication
    // Future enhancement: use rules engine for more complex logic

    const seenKeys = new Map<string, ProductWithKey>();
    const uniqueProducts: ProductWithKey[] = [];
    let duplicates = 0;
    const failed: RawProduct[] = [];

    for (const product of productsWithKeys) {
      try {
        if (seenKeys.has(product.businessKey)) {
          duplicates++;
          // Could apply rules here to determine which product to keep
        } else {
          seenKeys.set(product.businessKey, product);
          uniqueProducts.push(product);
        }
      } catch (error) {
        console.log(`${LogCategory.WARNING} ⚠️ Failed to process product ${product.id}: ${error}`);
        failed.push(product);
      }
    }

    return {
      uniqueProducts,
      duplicates,
      unique: uniqueProducts.length,
      errors: failed.length,
      failed
    };
  }

  /**
   * Write clean deduplicated products to available_products table
   * Uses transactions to ensure atomicity and prevents double-archiving
   */
  private async writeCleanProducts(products: ProductWithKey[]): Promise<void> {
    if (products.length === 0) {
      return;
    }

    return new Promise((resolve, reject) => {
      console.log(`${LogCategory.INFO} 🔒 Starting transaction for writing ${products.length} clean products`);

      // Start transaction for atomic operations
      this.db.run('BEGIN TRANSACTION', (beginErr) => {
        if (beginErr) {
          reject(new Error(`Failed to start transaction: ${beginErr.message}`));
          return;
        }

        // Check if we need to archive (prevent double-archiving)
        const countQuery = 'SELECT COUNT(*) as count FROM available_products';
        this.db.get(countQuery, (countErr: any, countResult: any) => {
          if (countErr) {
            this.rollbackTransaction(reject, `Failed to count products: ${countErr.message}`);
            return;
          }

          const hasProducts = countResult && countResult.count > 0;

          if (hasProducts) {
            // Archive existing products with INSERT OR IGNORE to prevent duplicates
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

            this.db.run(archiveQuery, (archiveErr: any, archiveResult: any) => {
              if (archiveErr) {
                this.rollbackTransaction(reject, `Failed to archive products: ${archiveErr.message}`);
                return;
              }

              console.log(`${LogCategory.INFO} 📦 Archived ${archiveResult?.changes || 0} products to historical_products`);

              // Continue with clearing and inserting
              this.clearAndInsertProducts(products, resolve, reject);
            });
          } else {
            console.log(`${LogCategory.INFO} 📦 No existing products to archive, proceeding with insert`);
            // No products to archive, proceed directly
            this.clearAndInsertProducts(products, resolve, reject);
          }
        });
      });
    });
  }

  /**
   * Helper method to clear available_products and insert new ones
   */
  private clearAndInsertProducts(products: ProductWithKey[], resolve: Function, reject: Function): void {
    // Clear existing products
    this.db.run('DELETE FROM available_products', (clearErr) => {
      if (clearErr) {
        this.rollbackTransaction(reject, `Failed to clear products: ${clearErr.message}`);
        return;
      }

      console.log(`${LogCategory.INFO} 🧹 Cleared available_products table`);

      // Insert clean products using prepared statement for efficiency
      const insertQuery = `
        INSERT INTO available_products (
          platform, source, bank_name, frn, account_type, aer_rate, gross_rate,
          term_months, notice_period_days, min_deposit, max_deposit, fscs_protected,
          interest_payment_frequency, apply_by_date, special_features, scrape_date,
          confidence_score, fuzzy_match_notes, business_key, deduplication_metadata,
          raw_platform, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const stmt = this.db.prepare(insertQuery);
      let insertedCount = 0;
      let hasError = false;

      for (const product of products) {
        try {
          stmt.run([
            product.platform, product.source, product.bank_name, product.frn,
            product.account_type, product.aer_rate, product.gross_rate,
            product.term_months, product.notice_period_days, product.min_deposit,
            product.max_deposit, product.fscs_protected, product.interest_payment_frequency,
            product.apply_by_date, product.special_features, product.scrape_date,
            product.confidence_score, product.fuzzy_match_notes, product.businessKey,
            product.deduplication_metadata, product.raw_platform, new Date().toISOString()
          ]);
          insertedCount++;
        } catch (err: any) {
          if (!hasError) {
            hasError = true;
            stmt.finalize();
            this.rollbackTransaction(reject, `Failed to insert product: ${err.message}`);
            return;
          }
        }
      }

      stmt.finalize();

      if (!hasError) {
        // Commit transaction
        this.db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            this.rollbackTransaction(reject, `Failed to commit transaction: ${commitErr.message}`);
            return;
          }

          console.log(`${LogCategory.INFO} ✅ Transaction committed: ${insertedCount} products inserted`);
          resolve();
        });
      }
    });
  }

  /**
   * Helper method to rollback transaction and reject with error
   */
  private rollbackTransaction(reject: Function, message: string): void {
    console.log(`${LogCategory.ERROR} ❌ ${message}`);

    this.db.run('ROLLBACK', (rollbackErr) => {
      if (rollbackErr) {
        console.log(`${LogCategory.ERROR} ❌ Additional rollback error: ${rollbackErr.message}`);
      } else {
        console.log(`${LogCategory.INFO} 🔄 Transaction rolled back successfully`);
      }
      reject(new Error(message));
    });
  }

  /**
   * Mark raw products as processed
   */
  private async markAsProcessed(productsWithKeys: ProductWithKey[], results: any): Promise<void> {
    console.log(`${LogCategory.INFO} 📝 Marking ${productsWithKeys.length} products as processed...`);

    if (productsWithKeys.length === 0) {
      console.log(`${LogCategory.INFO} 📝 No products to mark as processed`);
      return;
    }

    return new Promise((resolve, reject) => {
      const updateQuery = `
        UPDATE available_products_raw
        SET processed_at = ?, dedup_status = ?, dedup_reason = ?, business_key = ?
        WHERE rowid = ?
      `;

      let completed = 0;
      let hasError = false;
      const now = new Date().toISOString();

      for (const product of productsWithKeys) {
        this.db.run(updateQuery, [
          now,
          'completed',
          'Processed successfully',
          product.businessKey,
          product.id
        ], (err) => {
          if (err && !hasError) {
            console.log(`${LogCategory.ERROR} ❌ Failed to update product ${product.id}: ${err.message}`);
            hasError = true;
            reject(err);
            return;
          }

          completed++;
          if (completed === productsWithKeys.length && !hasError) {
            console.log(`${LogCategory.INFO} ✅ Successfully marked ${completed} products as processed`);
            resolve();
          }
        });
      }
    });
  }
}
import { AvailableProduct, LiquidityTier } from '../types/index';
import { DatabaseConnection } from '../types/index';
import { Money as MoneyImpl } from '../utils/money';

/**
 * Product Loader
 * Loads available product data from available_products table
 */
export class ProductLoader {
  constructor(private db: DatabaseConnection) {}

  /**
   * Load available products for easy access accounts
   */
  /**
   * Load all available easy access products
   * For rate optimization, we only consider easy access to easy access moves
   */
  public async getAvailableProducts(): Promise<AvailableProduct[]> {
    const query = `
      SELECT 
        id,
        platform,
        bank_name,
        frn,
        account_type,
        aer_rate,
        notice_period_days,
        min_deposit,
        max_deposit,
        fscs_protected,
        scrape_date
      FROM available_products_filtered_aer
      WHERE (notice_period_days IS NULL OR notice_period_days = 0)
        AND (term_months IS NULL OR term_months = 0)
      ORDER BY aer_rate DESC
    `;

    const rows = await this.db.query<any>(query);
    
    const products: AvailableProduct[] = rows.map(row => {
      const product: AvailableProduct = {
        id: row.id?.toString(),
        platform: row.platform,
        source: row.platform, // Use platform as source
        bankName: row.bank_name,
        frn: row.frn,
        accountType: row.account_type,
        aerRate: row.aer_rate,
        grossRate: row.aer_rate, // Use AER as gross rate for now
        noticePeriodDays: row.notice_period_days,
        fscsProtected: row.fscs_protected === 1 || row.fscs_protected === true, // Use actual DB field
        liquidityTier: 'easy_access', // We're only loading easy access products
        confidenceScore: 1.0, // Default confidence
        scrapeDate: new Date(row.scrape_date),
        missingFRN: !row.frn
      };
      
      // Add optional properties only if they exist
      if (row.min_deposit !== null && row.min_deposit !== undefined) {
        product.minDeposit = new MoneyImpl(row.min_deposit);
      }
      if (row.max_deposit !== null && row.max_deposit !== undefined) {
        product.maxDeposit = new MoneyImpl(row.max_deposit);
      }
      
      return product;
    });

    return this.deduplicateProducts(products);
  }

  public async loadEasyAccessProducts(): Promise<AvailableProduct[]> {
    const query = `
      SELECT 
        id,
        platform,
        source,
        bank_name,
        frn,
        account_type,
        aer_rate,
        gross_rate,
        term_months,
        notice_period_days,
        min_deposit,
        max_deposit,
        fscs_protected,
        interest_payment_frequency,
        apply_by_date,
        special_features,
        scrape_date,
        confidence_score
      FROM available_products 
      WHERE aer_rate > 0 
        AND (
          (term_months IS NULL OR term_months = 0) 
          AND (notice_period_days IS NULL OR notice_period_days <= 30)
        )
        AND confidence_score >= 0.7  -- Only high-confidence products
      ORDER BY aer_rate DESC, confidence_score DESC
    `;

    const rows = await this.db.query(query);
    
    const products = rows.map(row => {
      const product: AvailableProduct = {
        id: row.id.toString(),
        platform: row.platform || 'Direct',
        source: row.source || 'Manual',
        bankName: row.bank_name,
        frn: row.frn,
        accountType: row.account_type,
        aerRate: row.aer_rate,
        grossRate: row.gross_rate || row.aer_rate,
        fscsProtected: Boolean(row.fscs_protected ?? true),
        liquidityTier: this.determineLiquidityTier(row.term_months, row.notice_period_days),
        confidenceScore: row.confidence_score * 100, // Convert to percentage
        scrapeDate: new Date(row.scrape_date)
      };
      
      // Add optional fields only if they exist
      if (row.term_months) product.termMonths = row.term_months;
      if (row.notice_period_days) product.noticePeriodDays = row.notice_period_days;
      if (row.min_deposit) product.minDeposit = new MoneyImpl(row.min_deposit);
      if (row.max_deposit) product.maxDeposit = new MoneyImpl(row.max_deposit);
      if (row.interest_payment_frequency) product.interestPaymentFrequency = row.interest_payment_frequency;
      if (row.apply_by_date) product.applyByDate = new Date(row.apply_by_date);
      if (row.special_features) product.specialFeatures = row.special_features.split(',');
      
      return product;
    });

    // Deduplicate products by FRN, keeping highest rate per FRN
    return await this.deduplicateProducts(products);
  }

  /**
   * Load products for a specific institution
   */
  public async loadProductsForInstitution(frn: string): Promise<AvailableProduct[]> {
    const query = `
      SELECT 
        id,
        platform,
        source,
        bank_name,
        frn,
        account_type,
        aer_rate,
        gross_rate,
        term_months,
        notice_period_days,
        min_deposit,
        max_deposit,
        fscs_protected,
        interest_payment_frequency,
        apply_by_date,
        special_features,
        scrape_date,
        confidence_score
      FROM available_products 
      WHERE frn = ? 
        AND aer_rate > 0 
        AND confidence_score >= 0.7
      ORDER BY aer_rate DESC, confidence_score DESC
    `;

    const rows = await this.db.query(query, [frn]);
    
    return rows.map(row => {
      const product: AvailableProduct = {
        id: row.id.toString(),
        platform: row.platform || 'Direct',
        source: row.source || 'Manual',
        bankName: row.bank_name,
        frn: row.frn,
        accountType: row.account_type,
        aerRate: row.aer_rate,
        grossRate: row.gross_rate || row.aer_rate,
        fscsProtected: Boolean(row.fscs_protected ?? true),
        liquidityTier: this.determineLiquidityTier(row.term_months, row.notice_period_days),
        confidenceScore: row.confidence_score * 100,
        scrapeDate: new Date(row.scrape_date)
      };
      
      // Add optional fields only if they exist
      if (row.term_months) product.termMonths = row.term_months;
      if (row.notice_period_days) product.noticePeriodDays = row.notice_period_days;
      if (row.min_deposit) product.minDeposit = new MoneyImpl(row.min_deposit);
      if (row.max_deposit) product.maxDeposit = new MoneyImpl(row.max_deposit);
      if (row.interest_payment_frequency) product.interestPaymentFrequency = row.interest_payment_frequency;
      if (row.apply_by_date) product.applyByDate = new Date(row.apply_by_date);
      if (row.special_features) product.specialFeatures = row.special_features.split(',');
      
      return product;
    });
  }

  /**
   * Get count of available products
   */
  public async getProductCount(): Promise<number> {
    const result = await this.db.query<{count: number}>(`
      SELECT COUNT(*) as count 
      FROM available_products_filtered_aer
    `);
    return result[0]?.count || 0;
  }

  /**
   * Get best available rate for easy access products
   */
  public async getBestEasyAccessRate(): Promise<number> {
    const query = `
      SELECT MAX(aer_rate) as best_rate
      FROM available_products 
      WHERE aer_rate > 0 
        AND (term_months IS NULL OR term_months = 0) 
        AND (notice_period_days IS NULL OR notice_period_days <= 30)
        AND confidence_score >= 0.8
    `;

    const result = await this.db.queryOne(query);
    return result?.best_rate || 0;
  }

  /**
   * Get products better than a given rate
   */
  public async getProductsBetterThan(minRate: number, liquidityTier: LiquidityTier = 'easy_access'): Promise<AvailableProduct[]> {
    let termFilter = '';
    let noticeFilter = '';
    let accountTypeFilter = '';

    // Filter by liquidity tier
    switch (liquidityTier) {
      case 'easy_access':
        accountTypeFilter = "AND account_type = 'easy_access'";
        termFilter = 'AND (term_months IS NULL OR term_months = 0)';
        noticeFilter = 'AND (notice_period_days IS NULL OR notice_period_days = 0)';
        break;
      case 'notice_1_30':
        noticeFilter = 'AND notice_period_days BETWEEN 1 AND 30';
        break;
      case 'fixed_12m':
        termFilter = 'AND term_months = 12';
        break;
      // Add more cases as needed
    }

    const query = `
      SELECT 
        id,
        platform,
        source,
        bank_name,
        frn,
        account_type,
        aer_rate,
        gross_rate,
        term_months,
        notice_period_days,
        min_deposit,
        max_deposit,
        fscs_protected,
        interest_payment_frequency,
        apply_by_date,
        special_features,
        scrape_date,
        confidence_score
      FROM available_products 
      WHERE aer_rate > ? 
        ${accountTypeFilter}
        ${termFilter}
        ${noticeFilter}
        AND confidence_score >= 0.7
      ORDER BY aer_rate DESC, confidence_score DESC
      LIMIT 50
    `;

    const rows = await this.db.query(query, [minRate]);
    
    return rows.map(row => {
      const product: AvailableProduct = {
        id: row.id.toString(),
        platform: row.platform || 'Direct',
        source: row.source || 'Manual',
        bankName: row.bank_name,
        frn: row.frn,
        accountType: row.account_type,
        aerRate: row.aer_rate,
        grossRate: row.gross_rate || row.aer_rate,
        fscsProtected: Boolean(row.fscs_protected ?? true),
        liquidityTier: this.determineLiquidityTier(row.term_months, row.notice_period_days),
        confidenceScore: row.confidence_score * 100,
        scrapeDate: new Date(row.scrape_date)
      };
      
      // Add optional fields only if they exist
      if (row.term_months) product.termMonths = row.term_months;
      if (row.notice_period_days) product.noticePeriodDays = row.notice_period_days;
      if (row.min_deposit) product.minDeposit = new MoneyImpl(row.min_deposit);
      if (row.max_deposit) product.maxDeposit = new MoneyImpl(row.max_deposit);
      if (row.interest_payment_frequency) product.interestPaymentFrequency = row.interest_payment_frequency;
      if (row.apply_by_date) product.applyByDate = new Date(row.apply_by_date);
      if (row.special_features) product.specialFeatures = row.special_features.split(',');
      
      return product;
    });
  }

  /**
   * Determine liquidity tier based on term and notice period
   */
  private determineLiquidityTier(termMonths: number | null, noticeDays: number | null): LiquidityTier {
    // Fixed term products
    if (termMonths && termMonths > 0) {
      if (termMonths <= 9) return 'fixed_9m';
      if (termMonths <= 12) return 'fixed_12m';
      if (termMonths <= 24) return 'fixed_24m';
      if (termMonths <= 36) return 'fixed_36m';
      return 'fixed_60m';
    }

    // Notice products
    if (noticeDays && noticeDays > 0) {
      if (noticeDays <= 30) return 'notice_1_30';
      if (noticeDays <= 60) return 'notice_31_60';
      if (noticeDays <= 90) return 'notice_61_90';
      return 'notice_90+';
    }

    // Default to easy access
    return 'easy_access';
  }

  /**
   * Deduplicate products by FRN (Financial Reference Number)
   * Keeps the product with highest rate for each FRN
   * IMPORTANT: FSCS protection applies per FRN, not per bank name
   * Multiple banks may share the same FRN and thus the same FSCS limit
   */
  private async deduplicateProducts(products: AvailableProduct[]): Promise<AvailableProduct[]> {
    // Load configuration to check if products without FRN should be included
    const configLoader = new (await import('../configuration/loader')).ConfigurationLoader(this.db);
    const complianceConfig = await configLoader.loadComplianceConfig();
    
    const frnMap = new Map<string, AvailableProduct>();
    const noFrnProducts: AvailableProduct[] = [];

    for (const product of products) {
      // Use FRN only as the key for deduplication (FSCS protection is per FRN)
      const frnKey = product.frn;
      
      if (!frnKey) {
        // Handle products without FRN based on configuration
        if (complianceConfig.includeProductsWithoutFRN) {
          // Flag the product as missing FRN and include it
          const flaggedProduct = { ...product, missingFRN: true };
          noFrnProducts.push(flaggedProduct);
        }
        // Skip products without FRN if not configured to include them
        continue;
      }
      
      const existing = frnMap.get(frnKey);
      if (!existing || product.aerRate > existing.aerRate) {
        // Keep this product if it's the first for this FRN or has a higher rate
        frnMap.set(frnKey, product);
      } else if (product.aerRate === existing.aerRate && product.confidenceScore > existing.confidenceScore) {
        // If rates are equal, prefer higher confidence score
        frnMap.set(frnKey, product);
      } else if (product.aerRate === existing.aerRate && product.confidenceScore === existing.confidenceScore) {
        // If rates and confidence are identical, prefer the one with lower ID (older/more stable record)
        if (parseInt(product.id) < parseInt(existing.id)) {
          frnMap.set(frnKey, product);
        }
      }
    }

    // Combine FRN products with no-FRN products (if enabled)
    const result = [...Array.from(frnMap.values()), ...noFrnProducts];
    return result.sort((a, b) => b.aerRate - a.aerRate);
  }
}
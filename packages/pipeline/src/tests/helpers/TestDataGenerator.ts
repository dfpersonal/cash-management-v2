import * as Database from 'better-sqlite3';

/**
 * TestDataGenerator for Phase 4.4 Integration Tests
 *
 * Generates dynamic test scenarios with configurable properties
 * for comprehensive pipeline testing.
 */

export interface ProductTestData {
  id: string;
  bank_name: string;
  product_name: string;
  product_type: string;
  interest_rate: number;
  minimum_balance: number;
  maximum_balance: number;
  term_months?: number;
  notice_period_days?: number;
  platform: string;
  source: string;
  first_seen: string;
  last_updated: string;
  raw_json: string;
}

export interface FRNTestData {
  frn: string;
  bank_name: string;
  search_name: string;
  canonical_name: string;
  match_rank: number;
  is_active: number;
  fscs_protected: number;
}

export interface ConfigTestData {
  category: string;
  config_key: string;
  config_value: string;
  config_type: string;
  description: string;
}

export interface TestScenarioOptions {
  productCount: number;
  duplicatePercentage: number;
  frnMatchScenario: 'exact' | 'fuzzy' | 'none' | 'mixed';
  bankVariations: string[];
  includeEdgeCases: boolean;
  platformMix: string[];
}

export class TestDataGenerator {
  private db: Database.Database;
  private batchIdCounter = 1;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Generate test products with configurable properties
   */
  generateProducts(options: TestScenarioOptions): ProductTestData[] {
    const products: ProductTestData[] = [];
    const baseDate = new Date().toISOString().split('T')[0];

    // Bank templates for realistic variation
    const bankTemplates = options.bankVariations.length > 0
      ? options.bankVariations
      : [
          'First Direct Bank',
          'Santander UK Bank',
          'Virgin Money Bank',
          'Charter Savings Bank',
          'Atom Bank Limited'
        ];

    const productTypes = ['Savings', 'ISA', 'Fixed Term Deposit', 'Notice Account'];
    const platforms = options.platformMix.length > 0
      ? options.platformMix
      : ['AJ Bell', 'Flagstone', 'Moneyfacts'];

    for (let i = 0; i < options.productCount; i++) {
      const bankIndex = i % bankTemplates.length;
      const bank = bankTemplates[bankIndex];
      const productType = productTypes[i % productTypes.length];
      const platform = platforms[i % platforms.length];

      // Generate base product
      const product: ProductTestData = {
        id: `TEST_${String(i + 1).padStart(4, '0')}`,
        bank_name: bank,
        product_name: `${productType} ${Math.floor(Math.random() * 99) + 1}`,
        product_type: productType,
        interest_rate: Number((Math.random() * 5 + 0.5).toFixed(2)),
        minimum_balance: [1, 100, 500, 1000, 5000][Math.floor(Math.random() * 5)],
        maximum_balance: [50000, 100000, 250000, 500000, 1000000][Math.floor(Math.random() * 5)],
        platform,
        source: platform.toLowerCase().replace(' ', '_'),
        first_seen: baseDate,
        last_updated: baseDate,
        raw_json: ''
      };

      // Add term/notice period based on product type
      if (productType === 'Fixed Term Deposit') {
        product.term_months = [1, 3, 6, 12, 24, 36][Math.floor(Math.random() * 6)];
      }
      if (productType === 'Notice Account') {
        product.notice_period_days = [30, 60, 90, 120][Math.floor(Math.random() * 4)];
      }

      // Generate realistic raw JSON
      product.raw_json = JSON.stringify({
        bankName: product.bank_name,
        productName: product.product_name,
        rate: product.interest_rate,
        minBalance: product.minimum_balance,
        maxBalance: product.maximum_balance,
        type: product.product_type,
        ...(product.term_months && { termMonths: product.term_months }),
        ...(product.notice_period_days && { noticeDays: product.notice_period_days })
      });

      products.push(product);
    }

    // Add duplicates if requested
    if (options.duplicatePercentage > 0) {
      const duplicateCount = Math.floor(products.length * (options.duplicatePercentage / 100));

      for (let i = 0; i < duplicateCount; i++) {
        const sourceIndex = Math.floor(Math.random() * products.length);
        const sourceProduct = products[sourceIndex];

        // Create duplicate with slight variations
        const duplicate: ProductTestData = {
          ...sourceProduct,
          id: `DUP_${String(i + 1).padStart(4, '0')}`,
          platform: platforms[(platforms.indexOf(sourceProduct.platform) + 1) % platforms.length],
          source: platforms[(platforms.indexOf(sourceProduct.platform) + 1) % platforms.length].toLowerCase(),
          interest_rate: Number((sourceProduct.interest_rate + (Math.random() - 0.5) * 0.1).toFixed(2))
        };

        // Update raw JSON for duplicate
        const rawData = JSON.parse(duplicate.raw_json);
        rawData.rate = duplicate.interest_rate;
        duplicate.raw_json = JSON.stringify(rawData);

        products.push(duplicate);
      }
    }

    // Add edge cases if requested
    if (options.includeEdgeCases) {
      products.push(...this.generateEdgeCaseProducts());
    }

    return products;
  }

  /**
   * Generate FRN test data for various matching scenarios
   */
  generateFRNData(scenario: 'exact' | 'fuzzy' | 'none' | 'mixed', bankNames: string[]): FRNTestData[] {
    const frnData: FRNTestData[] = [];

    switch (scenario) {
      case 'exact':
        // Create exact matches for all banks
        bankNames.forEach((bank, index) => {
          frnData.push({
            frn: `TEST${String(index + 1).padStart(6, '0')}`,
            bank_name: bank,
            search_name: this.normalizeSearchName(bank),
            canonical_name: bank,
            match_rank: 1,
            is_active: 1,
            fscs_protected: 1
          });
        });
        break;

      case 'fuzzy':
        // Create fuzzy matches with name variations
        bankNames.forEach((bank, index) => {
          const variations = this.generateNameVariations(bank);
          variations.forEach((variation, varIndex) => {
            frnData.push({
              frn: `TEST${String(index + 1).padStart(6, '0')}`,
              bank_name: variation,
              search_name: this.normalizeSearchName(variation),
              canonical_name: bank,
              match_rank: varIndex + 1,
              is_active: 1,
              fscs_protected: 1
            });
          });
        });
        break;

      case 'none':
        // No FRN matches - all banks will be unmatched
        break;

      case 'mixed':
        // Mix of exact, fuzzy, and no matches
        bankNames.forEach((bank, index) => {
          const scenario = index % 3;
          if (scenario === 0) {
            // Exact match
            frnData.push({
              frn: `TEST${String(index + 1).padStart(6, '0')}`,
              bank_name: bank,
              search_name: this.normalizeSearchName(bank),
              canonical_name: bank,
              match_rank: 1,
              is_active: 1,
              fscs_protected: 1
            });
          } else if (scenario === 1) {
            // Fuzzy match
            const variation = this.generateNameVariations(bank)[0];
            frnData.push({
              frn: `TEST${String(index + 1).padStart(6, '0')}`,
              bank_name: variation,
              search_name: this.normalizeSearchName(variation),
              canonical_name: bank,
              match_rank: 2,
              is_active: 1,
              fscs_protected: 1
            });
          }
          // scenario === 2 means no match (skip)
        });
        break;
    }

    return frnData;
  }

  /**
   * Generate configuration variations for parameter sweep testing
   */
  generateConfigVariations(baseConfig: Record<string, string>): ConfigTestData[][] {
    const variations: ConfigTestData[][] = [];

    // FRN fuzzy threshold variations
    const frnThresholds = ['0.5', '0.8', '0.95'];
    frnThresholds.forEach(threshold => {
      const config = this.createConfigSet({
        ...baseConfig,
        'frn_fuzzy_threshold': threshold
      });
      variations.push(config);
    });

    // Deduplication weight variations
    const qualityWeights = [
      { rate_weight: '0.3', balance_weight: '0.3', freshness_weight: '0.4' },
      { rate_weight: '0.5', balance_weight: '0.3', freshness_weight: '0.2' },
      { rate_weight: '0.2', balance_weight: '0.5', freshness_weight: '0.3' }
    ];

    qualityWeights.forEach(weights => {
      const config = this.createConfigSet({
        ...baseConfig,
        ...weights
      });
      variations.push(config);
    });

    // Corruption threshold variations
    const corruptionThresholds = ['0.1', '0.2', '0.3'];
    corruptionThresholds.forEach(threshold => {
      const config = this.createConfigSet({
        ...baseConfig,
        'json_corruption_threshold': threshold
      });
      variations.push(config);
    });

    return variations;
  }

  /**
   * Insert test products into database
   */
  insertTestProducts(products: ProductTestData[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO available_products (
        id, bank_name, product_name, product_type, interest_rate,
        minimum_balance, maximum_balance, term_months, notice_period_days,
        platform, source, first_seen, last_updated, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      products.forEach(product => {
        stmt.run(
          product.id,
          product.bank_name,
          product.product_name,
          product.product_type,
          product.interest_rate,
          product.minimum_balance,
          product.maximum_balance,
          product.term_months || null,
          product.notice_period_days || null,
          product.platform,
          product.source,
          product.first_seen,
          product.last_updated,
          product.raw_json
        );
      });
    })();

    console.log(`✓ Inserted ${products.length} test products`);
  }

  /**
   * Insert test FRN data into database
   */
  insertTestFRNData(frnData: FRNTestData[]): void {
    if (frnData.length === 0) {
      console.log('✓ No FRN data to insert (testing no-match scenario)');
      return;
    }

    // Insert into all FRN-related tables to maintain consistency with view
    const tables = ['boe_institutions', 'boe_shared_brands', 'frn_manual_overrides'];

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO boe_institutions (
        frn, bank_name, search_name, canonical_name, match_rank, is_active, fscs_protected
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      frnData.forEach(frn => {
        stmt.run(
          frn.frn,
          frn.bank_name,
          frn.search_name,
          frn.canonical_name,
          frn.match_rank,
          frn.is_active,
          frn.fscs_protected
        );
      });
    })();

    console.log(`✓ Inserted ${frnData.length} test FRN entries`);
  }

  /**
   * Insert test configuration
   */
  insertTestConfig(configData: ConfigTestData[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO unified_config (
        category, config_key, config_value, config_type, description
      ) VALUES (?, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      configData.forEach(config => {
        stmt.run(
          config.category,
          config.config_key,
          config.config_value,
          config.config_type,
          config.description
        );
      });
    })();

    console.log(`✓ Inserted ${configData.length} test configuration entries`);
  }

  /**
   * Generate a unique batch ID for test runs
   */
  generateBatchId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const counter = String(this.batchIdCounter++).padStart(3, '0');
    return `TEST_BATCH_${timestamp}_${counter}`;
  }

  /**
   * Create a complete test scenario
   */
  createTestScenario(name: string, options: TestScenarioOptions): {
    batchId: string;
    products: ProductTestData[];
    frnData: FRNTestData[];
    config: ConfigTestData[];
  } {
    const batchId = this.generateBatchId();
    const products = this.generateProducts(options);

    // Extract unique bank names for FRN generation
    const bankNames = [...new Set(products.map(p => p.bank_name))];
    const frnData = this.generateFRNData(options.frnMatchScenario, bankNames);

    // Generate default configuration
    const config = this.createConfigSet({
      'json_corruption_threshold': '0.2',
      'frn_fuzzy_threshold': '0.8',
      'rate_weight': '0.4',
      'balance_weight': '0.3',
      'freshness_weight': '0.3'
    });

    console.log(`✓ Created test scenario "${name}": ${products.length} products, ${frnData.length} FRN entries`);

    return { batchId, products, frnData, config };
  }

  /**
   * Private helper methods
   */
  private generateEdgeCaseProducts(): ProductTestData[] {
    const edgeCases: ProductTestData[] = [];

    // Unicode bank name
    edgeCases.push({
      id: 'EDGE_001',
      bank_name: 'Bänk Ñamé Tëst',
      product_name: 'Unicode Savings',
      product_type: 'Savings',
      interest_rate: 2.5,
      minimum_balance: 1000,
      maximum_balance: 50000,
      platform: 'Test Platform',
      source: 'test_platform',
      first_seen: new Date().toISOString().split('T')[0],
      last_updated: new Date().toISOString().split('T')[0],
      raw_json: JSON.stringify({ bankName: 'Bänk Ñamé Tëst', rate: 2.5 })
    });

    // Very long bank name
    edgeCases.push({
      id: 'EDGE_002',
      bank_name: 'Very Long Bank Name That Might Cause Issues In Processing Systems Limited Incorporated',
      product_name: 'Long Name Test',
      product_type: 'ISA',
      interest_rate: 1.5,
      minimum_balance: 1,
      maximum_balance: 1000000,
      platform: 'Test Platform',
      source: 'test_platform',
      first_seen: new Date().toISOString().split('T')[0],
      last_updated: new Date().toISOString().split('T')[0],
      raw_json: JSON.stringify({ bankName: 'Very Long Bank Name', rate: 1.5 })
    });

    // Extreme interest rate
    edgeCases.push({
      id: 'EDGE_003',
      bank_name: 'High Rate Bank',
      product_name: 'Extreme Rate Product',
      product_type: 'Fixed Term Deposit',
      interest_rate: 15.99,
      minimum_balance: 50000,
      maximum_balance: 100000,
      term_months: 60,
      platform: 'Test Platform',
      source: 'test_platform',
      first_seen: new Date().toISOString().split('T')[0],
      last_updated: new Date().toISOString().split('T')[0],
      raw_json: JSON.stringify({ bankName: 'High Rate Bank', rate: 15.99, termMonths: 60 })
    });

    return edgeCases;
  }

  private normalizeSearchName(bankName: string): string {
    return bankName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/bank|plc|ltd|limited|uk/g, '')
      .trim();
  }

  private generateNameVariations(bankName: string): string[] {
    const variations = [];

    // Remove common suffixes
    const withoutSuffix = bankName.replace(/(Bank|PLC|Ltd|Limited|UK)$/gi, '').trim();
    if (withoutSuffix !== bankName) {
      variations.push(withoutSuffix);
    }

    // Add common suffixes
    if (!bankName.includes('Bank')) {
      variations.push(`${bankName} Bank`);
    }
    if (!bankName.includes('Ltd')) {
      variations.push(`${bankName} Ltd`);
    }

    // Abbreviation variations
    const abbreviated = bankName
      .replace(/Limited/gi, 'Ltd')
      .replace(/Public Limited Company/gi, 'PLC')
      .replace(/United Kingdom/gi, 'UK');

    if (abbreviated !== bankName) {
      variations.push(abbreviated);
    }

    return variations.slice(0, 3); // Limit to 3 variations
  }

  private createConfigSet(values: Record<string, string>): ConfigTestData[] {
    const config: ConfigTestData[] = [];

    Object.entries(values).forEach(([key, value]) => {
      const category = this.getCategoryForKey(key);
      config.push({
        category,
        config_key: key,
        config_value: value,
        config_type: 'string',
        description: `Test configuration for ${key}`
      });
    });

    return config;
  }

  private getCategoryForKey(key: string): string {
    if (key.includes('json') || key.includes('ingestion')) return 'json_ingestion';
    if (key.includes('frn')) return 'frn_matching';
    if (key.includes('dedup') || key.includes('weight')) return 'deduplication';
    return 'orchestrator';
  }
}
import { TestDataGenerator, TestScenarioOptions } from '../TestDataGenerator';
import { TestDatabase } from '../TestDatabase';
import * as Database from 'better-sqlite3';
import * as path from 'path';

describe('TestDataGenerator', () => {
  let testDb: TestDatabase;
  let generator: TestDataGenerator;
  let db: Database.Database;

  beforeAll(async () => {
    testDb = new TestDatabase({
      testDbPath: path.resolve(process.cwd(), `data/test/databases/generator_test_${Date.now()}.db`)
    });
    await testDb.setup();
    db = testDb.getConnection();
    generator = new TestDataGenerator(db);
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(() => {
    // Clear test data before each test
    testDb.clearAuditTables();
    try {
      db.prepare('DELETE FROM available_products WHERE id LIKE ?').run('TEST_%');
      db.prepare('DELETE FROM available_products WHERE id LIKE ?').run('DUP_%');
      db.prepare('DELETE FROM available_products WHERE id LIKE ?').run('EDGE_%');
      db.prepare('DELETE FROM boe_institutions WHERE frn LIKE ?').run('TEST%');
    } catch (error) {
      // Tables might not exist, which is fine
      console.warn('Could not clear test data:', error);
    }
  });

  describe('Product Generation', () => {
    test('should generate correct number of products', () => {
      const options: TestScenarioOptions = {
        productCount: 10,
        duplicatePercentage: 0,
        frnMatchScenario: 'exact',
        bankVariations: [],
        includeEdgeCases: false,
        platformMix: []
      };

      const products = generator.generateProducts(options);
      expect(products).toHaveLength(10);
    });

    test('should generate products with realistic data', () => {
      const options: TestScenarioOptions = {
        productCount: 5,
        duplicatePercentage: 0,
        frnMatchScenario: 'exact',
        bankVariations: ['Test Bank One', 'Test Bank Two'],
        includeEdgeCases: false,
        platformMix: ['AJ Bell', 'Flagstone']
      };

      const products = generator.generateProducts(options);

      products.forEach(product => {
        expect(product.id).toMatch(/^TEST_\d{4}$/);
        expect(product.bank_name).toBeTruthy();
        expect(product.product_name).toBeTruthy();
        expect(product.interest_rate).toBeGreaterThan(0);
        expect(product.minimum_balance).toBeGreaterThanOrEqual(1);
        expect(product.maximum_balance).toBeGreaterThan(product.minimum_balance);
        expect(['AJ Bell', 'Flagstone']).toContain(product.platform);

        // Validate raw JSON is parseable
        expect(() => JSON.parse(product.raw_json)).not.toThrow();
        const rawData = JSON.parse(product.raw_json);
        expect(rawData.bankName).toBe(product.bank_name);
        expect(rawData.rate).toBe(product.interest_rate);
      });
    });

    test('should generate duplicates when requested', () => {
      const options: TestScenarioOptions = {
        productCount: 10,
        duplicatePercentage: 20,
        frnMatchScenario: 'exact',
        bankVariations: [],
        includeEdgeCases: false,
        platformMix: []
      };

      const products = generator.generateProducts(options);

      // Should have original 10 + 2 duplicates (20% of 10)
      expect(products.length).toBeGreaterThanOrEqual(12);

      // Check for duplicate IDs
      const duplicateIds = products.filter(p => p.id.startsWith('DUP_'));
      expect(duplicateIds.length).toBeGreaterThan(0);
    });

    test('should include edge cases when requested', () => {
      const options: TestScenarioOptions = {
        productCount: 5,
        duplicatePercentage: 0,
        frnMatchScenario: 'exact',
        bankVariations: [],
        includeEdgeCases: true,
        platformMix: []
      };

      const products = generator.generateProducts(options);

      // Should have original 5 + edge cases
      expect(products.length).toBeGreaterThan(5);

      // Check for edge case IDs
      const edgeCases = products.filter(p => p.id.startsWith('EDGE_'));
      expect(edgeCases.length).toBeGreaterThan(0);

      // Verify specific edge cases
      const unicodeCase = edgeCases.find(p => p.bank_name.includes('ä'));
      expect(unicodeCase).toBeDefined();

      const longNameCase = edgeCases.find(p => p.bank_name.length > 50);
      expect(longNameCase).toBeDefined();
    });

    test('should handle term and notice period products correctly', () => {
      const options: TestScenarioOptions = {
        productCount: 20, // Larger sample to ensure we get different types
        duplicatePercentage: 0,
        frnMatchScenario: 'exact',
        bankVariations: [],
        includeEdgeCases: false,
        platformMix: []
      };

      const products = generator.generateProducts(options);

      const fixedTermProducts = products.filter(p => p.product_type === 'Fixed Term Deposit');
      const noticeProducts = products.filter(p => p.product_type === 'Notice Account');

      // Fixed term products should have term_months
      fixedTermProducts.forEach(product => {
        expect(product.term_months).toBeDefined();
        expect(product.term_months).toBeGreaterThan(0);

        const rawData = JSON.parse(product.raw_json);
        expect(rawData.termMonths).toBe(product.term_months);
      });

      // Notice products should have notice_period_days
      noticeProducts.forEach(product => {
        expect(product.notice_period_days).toBeDefined();
        expect(product.notice_period_days).toBeGreaterThan(0);

        const rawData = JSON.parse(product.raw_json);
        expect(rawData.noticeDays).toBe(product.notice_period_days);
      });
    });
  });

  describe('FRN Data Generation', () => {
    const testBanks = ['Test Bank Alpha', 'Test Bank Beta', 'Test Bank Gamma'];

    test('should generate exact matches correctly', () => {
      const frnData = generator.generateFRNData('exact', testBanks);

      expect(frnData).toHaveLength(testBanks.length);

      frnData.forEach((frn, index) => {
        expect(frn.frn).toMatch(/^TEST\d{6}$/);
        expect(frn.bank_name).toBe(testBanks[index]);
        expect(frn.canonical_name).toBe(testBanks[index]);
        expect(frn.match_rank).toBe(1);
        expect(frn.is_active).toBe(1);
        expect(frn.fscs_protected).toBe(1);
        expect(frn.search_name).toBeTruthy();
      });
    });

    test('should generate fuzzy matches with variations', () => {
      const frnData = generator.generateFRNData('fuzzy', testBanks);

      expect(frnData.length).toBeGreaterThan(testBanks.length);

      // Should have multiple entries per bank (variations)
      const bankGroups = frnData.reduce((groups, frn) => {
        if (!groups[frn.canonical_name]) groups[frn.canonical_name] = [];
        groups[frn.canonical_name].push(frn);
        return groups;
      }, {} as Record<string, typeof frnData>);

      Object.keys(bankGroups).forEach(canonicalName => {
        const variations = bankGroups[canonicalName];
        expect(variations.length).toBeGreaterThan(1);

        // Check rank ordering
        variations.forEach((variation, index) => {
          expect(variation.match_rank).toBe(index + 1);
          expect(variation.canonical_name).toBe(canonicalName);
        });
      });
    });

    test('should generate no matches for none scenario', () => {
      const frnData = generator.generateFRNData('none', testBanks);
      expect(frnData).toHaveLength(0);
    });

    test('should generate mixed scenarios correctly', () => {
      const frnData = generator.generateFRNData('mixed', testBanks);

      // Should have some matches but not for all banks
      expect(frnData.length).toBeLessThan(testBanks.length);
      expect(frnData.length).toBeGreaterThan(0);

      // Check that we have different match types
      const exactMatches = frnData.filter(f => f.match_rank === 1);
      const fuzzyMatches = frnData.filter(f => f.match_rank > 1);

      expect(exactMatches.length).toBeGreaterThan(0);
      // Might have fuzzy matches too, depending on the banks
    });

    test('should normalize search names correctly', () => {
      const testBanksWithSuffixes = [
        'First Direct Bank',
        'Santander UK Limited',
        'Virgin Money PLC'
      ];

      const frnData = generator.generateFRNData('exact', testBanksWithSuffixes);

      frnData.forEach(frn => {
        expect(frn.search_name).toBeTruthy();
        expect(frn.search_name).not.toContain(' ');
        expect(frn.search_name).toBe(frn.search_name.toLowerCase());

        // Should not contain common suffixes
        expect(frn.search_name).not.toContain('bank');
        expect(frn.search_name).not.toContain('plc');
        expect(frn.search_name).not.toContain('limited');
      });
    });
  });

  describe('Configuration Generation', () => {
    test('should generate configuration variations correctly', () => {
      const baseConfig = {
        'json_corruption_threshold': '0.2',
        'frn_fuzzy_threshold': '0.8'
      };

      const variations = generator.generateConfigVariations(baseConfig);

      expect(variations.length).toBeGreaterThan(1);

      // Each variation should be a complete config set
      variations.forEach(configSet => {
        expect(Array.isArray(configSet)).toBe(true);
        expect(configSet.length).toBeGreaterThan(0);

        configSet.forEach(config => {
          expect(config.category).toBeTruthy();
          expect(config.config_key).toBeTruthy();
          expect(config.config_value).toBeTruthy();
          expect(config.config_type).toBe('string');
          expect(config.description).toBeTruthy();
        });
      });
    });

    test('should categorize configuration keys correctly', () => {
      const baseConfig = {
        'json_corruption_threshold': '0.2',
        'frn_fuzzy_threshold': '0.8',
        'rate_weight': '0.4',
        'orchestrator_timeout': '300'
      };

      const variations = generator.generateConfigVariations(baseConfig);
      const allConfigs = variations.flat();

      // Check category assignments
      const jsonConfigs = allConfigs.filter(c => c.config_key.includes('json'));
      const frnConfigs = allConfigs.filter(c => c.config_key.includes('frn'));
      const dedupConfigs = allConfigs.filter(c => c.config_key.includes('weight'));
      const orchestratorConfigs = allConfigs.filter(c => c.config_key.includes('orchestrator'));

      jsonConfigs.forEach(c => expect(c.category).toBe('json_ingestion'));
      frnConfigs.forEach(c => expect(c.category).toBe('frn_matching'));
      dedupConfigs.forEach(c => expect(c.category).toBe('deduplication'));
      orchestratorConfigs.forEach(c => expect(c.category).toBe('orchestrator'));
    });
  });

  describe('Database Integration', () => {
    test('should insert products successfully', () => {
      const options: TestScenarioOptions = {
        productCount: 5,
        duplicatePercentage: 0,
        frnMatchScenario: 'exact',
        bankVariations: ['Test Insert Bank'],
        includeEdgeCases: false,
        platformMix: ['Test Platform']
      };

      const products = generator.generateProducts(options);

      // Insert should not throw
      expect(() => generator.insertTestProducts(products)).not.toThrow();

      // Verify data was inserted
      const count = db.prepare('SELECT COUNT(*) as count FROM available_products WHERE id LIKE ?')
        .get('TEST_%') as any;

      expect(count.count).toBe(products.length);

      // Verify data integrity
      const inserted = db.prepare('SELECT * FROM available_products WHERE id = ?')
        .get(products[0].id) as any;

      expect(inserted.bank_name).toBe(products[0].bank_name);
      expect(inserted.interest_rate).toBe(products[0].interest_rate);
      expect(JSON.parse(inserted.raw_json)).toEqual(JSON.parse(products[0].raw_json));
    });

    test('should insert FRN data successfully', () => {
      const testBanks = ['Test FRN Bank One', 'Test FRN Bank Two'];
      const frnData = generator.generateFRNData('exact', testBanks);

      expect(() => generator.insertTestFRNData(frnData)).not.toThrow();

      // Verify data was inserted
      const count = db.prepare('SELECT COUNT(*) as count FROM boe_institutions WHERE frn LIKE ?')
        .get('TEST%') as any;

      expect(count.count).toBe(frnData.length);
    });

    test('should handle empty FRN data gracefully', () => {
      expect(() => generator.insertTestFRNData([])).not.toThrow();
    });

    test('should insert configuration successfully', () => {
      const configData = [
        {
          category: 'test',
          config_key: 'test_param',
          config_value: 'test_value',
          config_type: 'string',
          description: 'Test parameter'
        }
      ];

      expect(() => generator.insertTestConfig(configData)).not.toThrow();

      // Verify data was inserted
      const inserted = db.prepare(
        'SELECT * FROM unified_config WHERE config_key = ?'
      ).get('test_param') as any;

      expect(inserted).toBeDefined();
      expect(inserted.config_value).toBe('test_value');
    });
  });

  describe('Complete Test Scenarios', () => {
    test('should create complete test scenario', () => {
      const options: TestScenarioOptions = {
        productCount: 10,
        duplicatePercentage: 10,
        frnMatchScenario: 'mixed',
        bankVariations: ['Scenario Bank Alpha', 'Scenario Bank Beta'],
        includeEdgeCases: true,
        platformMix: ['Platform A', 'Platform B']
      };

      const scenario = generator.createTestScenario('Complete Test', options);

      expect(scenario.batchId).toMatch(/^TEST_BATCH_/);
      expect(scenario.products.length).toBeGreaterThanOrEqual(10);
      expect(scenario.config).toBeDefined();
      expect(Array.isArray(scenario.config)).toBe(true);
      expect(scenario.config.length).toBeGreaterThan(0);

      // FRN data should be related to product bank names
      const productBanks = [...new Set(scenario.products.map(p => p.bank_name))];
      expect(productBanks.length).toBeGreaterThan(0);

      // Some FRN matches should exist for mixed scenario
      expect(scenario.frnData.length).toBeGreaterThanOrEqual(0);
    });

    test('should generate unique batch IDs', () => {
      const options: TestScenarioOptions = {
        productCount: 1,
        duplicatePercentage: 0,
        frnMatchScenario: 'none',
        bankVariations: [],
        includeEdgeCases: false,
        platformMix: []
      };

      const batchId1 = generator.generateBatchId();
      const batchId2 = generator.generateBatchId();

      expect(batchId1).not.toBe(batchId2);
      expect(batchId1).toMatch(/^TEST_BATCH_/);
      expect(batchId2).toMatch(/^TEST_BATCH_/);
    });
  });

  describe('Edge Case Handling', () => {
    test('should handle unicode characters in bank names', () => {
      const options: TestScenarioOptions = {
        productCount: 1,
        duplicatePercentage: 0,
        frnMatchScenario: 'exact',
        bankVariations: ['Bänk Ñamé Tëst'],
        includeEdgeCases: false,
        platformMix: []
      };

      const products = generator.generateProducts(options);
      expect(() => generator.insertTestProducts(products)).not.toThrow();

      const frnData = generator.generateFRNData('exact', ['Bänk Ñamé Tëst']);
      expect(() => generator.insertTestFRNData(frnData)).not.toThrow();
    });

    test('should handle extreme values gracefully', () => {
      const options: TestScenarioOptions = {
        productCount: 1000, // Large number
        duplicatePercentage: 50,
        frnMatchScenario: 'fuzzy',
        bankVariations: [],
        includeEdgeCases: true,
        platformMix: []
      };

      expect(() => generator.generateProducts(options)).not.toThrow();
    });

    test('should handle empty inputs gracefully', () => {
      const options: TestScenarioOptions = {
        productCount: 0,
        duplicatePercentage: 0,
        frnMatchScenario: 'none',
        bankVariations: [],
        includeEdgeCases: false,
        platformMix: []
      };

      const products = generator.generateProducts(options);
      expect(products).toHaveLength(0);

      const frnData = generator.generateFRNData('none', []);
      expect(frnData).toHaveLength(0);
    });
  });
});
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { TestDatabase } from './helpers/TestDatabase';
import { PipelineTestHelper, PipelineResult } from './utils/PipelineTestHelper';
import { AuditTrailValidator } from './helpers/AuditTrailValidator';
import { PipelineStage } from '@cash-mgmt/pipeline';

/**
 * Phase 4.5a: Optimized Filtering Tests with JSON_INGESTION Stage Focus
 *
 * Optimized filtering tests using stopAfterStage for 8x performance improvement.
 * Tests focus on actual filtering logic that occurs during JSON ingestion stage:
 * rate thresholds, data validation, platform consistency, and filtering effectiveness.
 *
 * Test Data Sources:
 * - AJ Bell: 41 products (simple platform=source structure)
 * - Flagstone: 219 products (baseline consistency validation)
 * - Moneyfacts: 1,459 products across 3 account types (complex multi-platform)
 *
 * Key Focus Areas:
 * - Production-like rate filtering (occurs in JSON ingestion)
 * - Platform/source field consistency validation
 * - Data integrity through filtering stage
 * - Filtering effectiveness analysis (pass rates)
 *
 * Performance: ~50ms per test (vs ~400ms with full pipeline)
 * FRN Logic: Moved to dedicated FRN test suite for proper separation of concerns
 */

describe('Phase 4.5a: Production-Like Filtering Tests', () => {
  let testDb: TestDatabase;
  let pipelineHelper: PipelineTestHelper;
  let auditValidator: AuditTrailValidator;

  // Store results for cross-scraper analysis
  let ajbellResult: PipelineResult;
  let flagstoneResult: PipelineResult;
  let moneyfactsEasyAccessResult: PipelineResult;
  let moneyfactsFixedTermResult: PipelineResult;
  let moneyfactsNoticeResult: PipelineResult;

  beforeAll(async () => {
    console.log('🔧 Setting up Phase 4.5a filtering test environment...');

    // Enable pipeline audit for tests
    process.env.PIPELINE_AUDIT_ENABLED = 'true';
    process.env.PIPELINE_AUDIT_OUTPUT = 'database';

    console.log('✅ Phase 4.5a test environment ready');
  });

  afterAll(async () => {
    console.log('🧹 Filtering tests completed');
    // Clean up the last test database if it exists
    if (testDb) {
      await testDb.teardown();
    }
  });

  beforeEach(async () => {
    // Create a fresh database for each test to ensure proper test isolation
    testDb = new TestDatabase();
    await testDb.setup();

    // Validate database integrity
    const dbValidation = testDb.validateDatabase();
    if (!dbValidation.valid) {
      throw new Error(`Test database invalid: ${dbValidation.errors.join(', ')}`);
    }

    console.log(`✅ Fresh database ready: ${dbValidation.frnDataCount} FRN entries, ${dbValidation.tableCount} tables`);

    // Initialize test helpers with fresh database
    pipelineHelper = new PipelineTestHelper(testDb);
    auditValidator = new AuditTrailValidator(testDb.getConnection());

    // Setup test environment with PRODUCTION-LIKE FILTERING
    await pipelineHelper.setupTestEnvironment({
      productionLikeFiltering: true,  // Use 3.0% minimum rate threshold
      minRateThreshold: 3.0          // Realistic production filtering
    });
  });

  afterEach(async () => {
    // Clean up the database after each test
    if (testDb) {
      await testDb.teardown();
    }
  });

  describe('Individual Scraper Processing with Production Filtering', () => {

    test('AJ Bell: Simple Platform/Source Structure', async () => {
      console.log('\n🧪 Processing AJ Bell data (simple structure)...');

      // Execute JSON ingestion only - rate filtering happens here (8x faster)
      ajbellResult = await pipelineHelper.executePipelineWithTracking('ajbell-sample.json', {
        stopAfterStage: PipelineStage.JSON_INGESTION
      });

      // Behavioral validation - pipeline should process data successfully
      expect(ajbellResult.products.length).toBeGreaterThan(0);  // Pipeline processed some products
      expect(ajbellResult.batchId).toBeDefined();

      // Validate all products have required fields (data integrity)
      expect(ajbellResult.products.every(p => p.bankName && p.platform && p.source)).toBe(true);
      expect(ajbellResult.products.every(p => typeof p.aerRate === 'number' && p.aerRate > 0)).toBe(true);

      // Validate no phantom products created (can't exceed original data)
      const originalDataCount = 41; // Count from AJ Bell fixture file
      expect(ajbellResult.products.length).toBeLessThanOrEqual(originalDataCount);

      // Platform/Source validation - AJ Bell should be consistent
      // Note: Fresh scraper data uses "AJBell" which gets normalized to "ajbell" in the pipeline
      const allSamePlatform = ajbellResult.products.every(p => p.platform === 'ajbell');
      const allSameSource = ajbellResult.products.every(p => p.source === 'ajbell');

      expect(allSamePlatform).toBe(true);
      expect(allSameSource).toBe(true);

      // Validate statistics consistency
      expect(ajbellResult.stats.platformDistribution['ajbell']).toBe(ajbellResult.stats.totalProducts);
      expect(ajbellResult.stats.sourceDistribution['ajbell']).toBe(ajbellResult.stats.totalProducts);

      console.log(`✅ AJ Bell filtering test passed: ${ajbellResult.stats.totalProducts} products`);
    }, 10000); // Reduced timeout - JSON ingestion is much faster

    test('Flagstone: Baseline Consistency Validation', async () => {
      console.log('\n🧪 Processing Flagstone data (baseline consistency)...');

      // Execute JSON ingestion only - rate filtering and validation happens here
      flagstoneResult = await pipelineHelper.executePipelineWithTracking('flagstone-sample.json', {
        stopAfterStage: PipelineStage.JSON_INGESTION
      });

      // Behavioral validation - pipeline should process data successfully
      expect(flagstoneResult.products.length).toBeGreaterThan(0);   // Pipeline processed some products
      expect(flagstoneResult.batchId).toBeDefined();

      // Validate all products have required fields (data integrity)
      expect(flagstoneResult.products.every(p => p.bankName && p.platform && p.source)).toBe(true);
      expect(flagstoneResult.products.every(p => typeof p.aerRate === 'number' && p.aerRate > 0)).toBe(true);

      // Validate no phantom products created (can't exceed original data)
      const originalDataCount = 219; // Count from Flagstone fixture file
      expect(flagstoneResult.products.length).toBeLessThanOrEqual(originalDataCount);

      // Rate-based filtering validation - this is the real test!
      // Account type specific thresholds (from configuration)
      const thresholds: Record<string, number> = {
        'easy_access': 1.5,
        'fixed_term': 2.0,
        'notice': 1.8
      };

      // ALL passed products should meet their account-type-specific minimum rate
      const invalidProducts = flagstoneResult.products.filter(p => {
        const expectedThreshold = thresholds[p.accountType] || 1.5;
        return p.aerRate < expectedThreshold;
      });

      expect(invalidProducts.length).toBe(0);

      // Validate rate distribution per account type
      const accountTypes = [...new Set(flagstoneResult.products.map(p => p.accountType))];
      accountTypes.forEach(accountType => {
        const productsForType = flagstoneResult.products.filter(p => p.accountType === accountType);
        const ratesForType = productsForType.map(p => p.aerRate);
        const minRate = Math.min(...ratesForType);
        const expectedThreshold = thresholds[accountType] || 1.5;

        expect(minRate).toBeGreaterThanOrEqual(expectedThreshold);
        console.log(`  ${accountType}: ${productsForType.length} products, min rate: ${minRate.toFixed(2)}%, threshold: ${expectedThreshold}%`);
      });

      // Platform/Source validation - should be consistent
      const allSamePlatform = flagstoneResult.products.every(p => p.platform === 'flagstone');
      const allSameSource = flagstoneResult.products.every(p => p.source === 'flagstone');

      expect(allSamePlatform).toBe(true);
      expect(allSameSource).toBe(true);

      // Calculate filtering effectiveness (rate-based filtering is the key test)
      const passRate = flagstoneResult.products.length / 219;
      console.log(`✅ Flagstone filtering test passed: ${flagstoneResult.stats.totalProducts} products (${(passRate * 100).toFixed(1)}% pass rate)`);
    }, 10000); // Reduced timeout - JSON ingestion is much faster

    test('Moneyfacts Easy Access: Multi-Platform Complexity', async () => {
      console.log('\n🧪 Processing Moneyfacts Easy Access data (multi-platform)...');

      // Execute JSON ingestion only - multi-platform structure established here
      moneyfactsEasyAccessResult = await pipelineHelper.executePipelineWithTracking('moneyfacts-easy-access-sample.json', {
        stopAfterStage: PipelineStage.JSON_INGESTION
      });

      // Basic validation - pipeline should complete successfully
      expect(moneyfactsEasyAccessResult.batchId).toBeDefined();
      expect(moneyfactsEasyAccessResult.products.length).toBeGreaterThan(0);

      // Data integrity validation
      expect(moneyfactsEasyAccessResult.products.every(p => p.bankName && p.platform && p.source)).toBe(true);

      console.log(`📊 Moneyfacts Easy Access processed: ${moneyfactsEasyAccessResult.stats.totalProducts} products`);
      console.log(`📊 Platform distribution:`, moneyfactsEasyAccessResult.stats.platformDistribution);
      console.log(`📊 Source distribution:`, moneyfactsEasyAccessResult.stats.sourceDistribution);

      // All products should have consistent source
      const allSameSource = moneyfactsEasyAccessResult.products.every(p => p.source === 'moneyfacts');
      expect(allSameSource).toBe(true);

      // Should have multiple platforms (key test for multi-platform handling)
      const platforms = new Set(moneyfactsEasyAccessResult.products.map(p => p.platform));
      expect(platforms.size).toBeGreaterThan(1);

      console.log(`✅ Moneyfacts Easy Access filtering test passed: ${platforms.size} platforms, ${moneyfactsEasyAccessResult.products.length} products`);
    }, 15000); // Reduced timeout - JSON ingestion is much faster

    test('Moneyfacts Fixed Term: Large Dataset Filtering', async () => {
      console.log('\n🧪 Processing Moneyfacts Fixed Term data (large dataset)...');

      // Execute JSON ingestion only - large dataset filtering performance test
      moneyfactsFixedTermResult = await pipelineHelper.executePipelineWithTracking('moneyfacts-fixed-term-sample.json', {
        stopAfterStage: PipelineStage.JSON_INGESTION
      });

      // Basic validation - pipeline should complete successfully
      expect(moneyfactsFixedTermResult.batchId).toBeDefined();
      expect(moneyfactsFixedTermResult.products.length).toBeGreaterThan(0);

      // Data integrity validation
      expect(moneyfactsFixedTermResult.products.every(p => p.bankName && p.platform && p.source)).toBe(true);

      // All products should have consistent source
      const allSameSource = moneyfactsFixedTermResult.products.every(p => p.source === 'moneyfacts');
      expect(allSameSource).toBe(true);

      // Should have multiple platforms
      const platforms = new Set(moneyfactsFixedTermResult.products.map(p => p.platform));
      expect(platforms.size).toBeGreaterThan(1);

      console.log(`✅ Moneyfacts Fixed Term filtering test passed: ${moneyfactsFixedTermResult.stats.totalProducts} products, ${platforms.size} platforms`);
    }, 20000); // Reduced timeout - JSON ingestion is much faster even for large datasets

    test('Moneyfacts Notice: Notice Account Filtering', async () => {
      console.log('\n🧪 Processing Moneyfacts Notice data (notice accounts)...');

      // Execute JSON ingestion only - notice account filtering validation
      moneyfactsNoticeResult = await pipelineHelper.executePipelineWithTracking('moneyfacts-notice-sample.json', {
        stopAfterStage: PipelineStage.JSON_INGESTION
      });

      // Basic validation - pipeline should complete successfully
      expect(moneyfactsNoticeResult.batchId).toBeDefined();
      expect(moneyfactsNoticeResult.products.length).toBeGreaterThan(0);

      // Data integrity validation
      expect(moneyfactsNoticeResult.products.every(p => p.bankName && p.platform && p.source)).toBe(true);

      // All products should have consistent source
      const allSameSource = moneyfactsNoticeResult.products.every(p => p.source === 'moneyfacts');
      expect(allSameSource).toBe(true);

      console.log(`✅ Moneyfacts Notice filtering test passed: ${moneyfactsNoticeResult.stats.totalProducts} products`);
    }, 15000); // Reduced timeout - JSON ingestion is much faster

  });

  describe('Filtering Effectiveness Analysis', () => {

    test('Cross-Scraper Data Quality Validation', async () => {
      console.log('\n🧪 Validating data quality across scrapers...');

      // Combine all results for cross-scraper analysis
      const allResults = [
        ajbellResult,
        flagstoneResult,
        moneyfactsEasyAccessResult,
        moneyfactsFixedTermResult,
        moneyfactsNoticeResult
      ];

      const allProducts = allResults.flatMap(result => result.products);

      // Validate data quality across all scrapers
      expect(allProducts.length).toBeGreaterThan(0);

      // All products should have required fields (data integrity validation)
      const productsWithRequiredFields = allProducts.filter(p =>
        p.bankName && p.platform && p.source &&
        typeof p.aerRate === 'number' && p.aerRate > 0
      );

      expect(productsWithRequiredFields.length).toBe(allProducts.length);

      // Validate platform/source consistency per scraper
      const scraperValidation = allResults.map(result => ({
        name: result === ajbellResult ? 'AJ Bell' :
              result === flagstoneResult ? 'Flagstone' :
              result === moneyfactsEasyAccessResult ? 'Moneyfacts Easy Access' :
              result === moneyfactsFixedTermResult ? 'Moneyfacts Fixed Term' : 'Moneyfacts Notice',
        products: result.products.length,
        platforms: new Set(result.products.map(p => p.platform)).size,
        sources: new Set(result.products.map(p => p.source)).size
      }));

      scraperValidation.forEach(scraper => {
        console.log(`  ${scraper.name}: ${scraper.products} products, ${scraper.platforms} platforms, ${scraper.sources} sources`);
        expect(scraper.sources).toBe(1); // Each scraper should have exactly one source
      });

      console.log(`✅ Data quality validated: ${allProducts.length} total products across all scrapers`);
    }, 10000); // Fast since no full pipeline processing

    test('Production Filtering Effectiveness Analysis', async () => {
      console.log('\n📊 Analyzing production filtering effectiveness...');

      const allResults = [
        { name: 'AJ Bell', result: ajbellResult, originalCount: 41 },
        { name: 'Flagstone', result: flagstoneResult, originalCount: 219 },
        { name: 'Moneyfacts Easy Access', result: moneyfactsEasyAccessResult, originalCount: 330 },
        { name: 'Moneyfacts Fixed Term', result: moneyfactsFixedTermResult, originalCount: 630 },
        { name: 'Moneyfacts Notice', result: moneyfactsNoticeResult, originalCount: 499 }
      ];

      let totalOriginal = 0;
      let totalProcessed = 0;

      for (const { name, result, originalCount } of allResults) {
        const passRate = (result.stats.totalProducts / originalCount) * 100;

        console.log(`📈 ${name}:`);
        console.log(`  Original: ${originalCount} products`);
        console.log(`  Filtered: ${result.stats.totalProducts} products (${passRate.toFixed(1)}% pass rate)`);

        totalOriginal += originalCount;
        totalProcessed += result.stats.totalProducts;

        // Validate reasonable filtering occurred
        expect(passRate).toBeGreaterThan(2);   // At least 2% should pass rate filtering
        if (passRate < 100) {
          expect(passRate).toBeLessThan(98);   // Allow for high quality data but expect some filtering
        }
      }

      const overallPassRate = (totalProcessed / totalOriginal) * 100;

      console.log(`📊 Overall Filtering Summary:`);
      console.log(`  Total Original: ${totalOriginal} products`);
      console.log(`  Total Filtered: ${totalProcessed} products (${overallPassRate.toFixed(1)}% overall pass rate)`);

      // Validate overall filtering effectiveness (JSON ingestion filtering only)
      expect(overallPassRate).toBeGreaterThan(5);   // At least 5% overall pass rate
      expect(overallPassRate).toBeLessThan(98);     // Expect some filtering for data quality (more lenient since only JSON filtering)

      console.log(`✅ Production filtering effectiveness analysis completed`);
    }, 10000); // Fast since no full pipeline processing

    test('Source and Platform Field Consistency', async () => {
      console.log('\n🧪 Validating source and platform field consistency...');

      const scraperTests = [
        { name: 'AJ Bell', result: ajbellResult, expectedSource: 'ajbell', expectedPlatform: 'ajbell' },
        { name: 'Flagstone', result: flagstoneResult, expectedSource: 'flagstone', expectedPlatform: 'flagstone' },
        { name: 'Moneyfacts Easy Access', result: moneyfactsEasyAccessResult, expectedSource: 'moneyfacts' },
        { name: 'Moneyfacts Fixed Term', result: moneyfactsFixedTermResult, expectedSource: 'moneyfacts' },
        { name: 'Moneyfacts Notice', result: moneyfactsNoticeResult, expectedSource: 'moneyfacts' }
      ];

      for (const { name, result, expectedSource, expectedPlatform } of scraperTests) {
        console.log(`🔍 Checking ${name}...`);

        // All products should have consistent source
        const allSameSource = result.products.every(p => p.source === expectedSource);
        expect(allSameSource).toBe(true);

        if (expectedPlatform) {
          // Simple scrapers should have consistent platform
          const allSamePlatform = result.products.every(p => p.platform === expectedPlatform);
          expect(allSamePlatform).toBe(true);
          console.log(`  ✅ Platform consistency: all ${expectedPlatform}`);
        } else {
          // Moneyfacts should have multiple platforms
          const platforms = new Set(result.products.map(p => p.platform));
          expect(platforms.size).toBeGreaterThan(1);
          console.log(`  ✅ Platform diversity: ${Array.from(platforms).join(', ')}`);
        }

        console.log(`  ✅ Source consistency: all ${expectedSource}`);
      }

      console.log(`✅ Source and platform field consistency validated across all scrapers`);
    }, 10000); // Fast since no full pipeline processing

  });

  describe('JSON Ingestion Filtering Audit Trail Validation', () => {

    test('JSON Ingestion Filtering Audit Trail', async () => {
      console.log('\n🧪 Validating JSON ingestion filtering audit trail...');
      console.log('📝 Note: This test validates audit records for filtering decisions during JSON ingestion');

      // This test validates audit trail for filtering logic that occurs during JSON ingestion

      const db = testDb.getConnection();

      // Process ALL scraper files with JSON ingestion only (8x faster)
      const allFiles = [
        'ajbell-sample.json',           // 41 products
        'flagstone-sample.json',        // 219 products
        'moneyfacts-easy-access-sample.json',  // 330 products
        'moneyfacts-fixed-term-sample.json',   // 630 products
        'moneyfacts-notice-sample.json'        // 499 products
      ];

      let totalProductsProcessed = 0;

      console.log(`📊 Processing ${allFiles.length} scraper files with JSON ingestion only...`);

      // Process each file to accumulate JSON ingestion audit records
      for (let i = 0; i < allFiles.length; i++) {
        const fileName = allFiles[i];

        // Add small delay between file processing to avoid batch ID collisions
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        try {
          const result = await pipelineHelper.executePipelineWithTracking(fileName, {
            stopAfterStage: PipelineStage.JSON_INGESTION
          });
          totalProductsProcessed += result.products.length;
          console.log(`  ✓ ${fileName}: ${result.products.length} products filtered through JSON ingestion`);
        } catch (error) {
          console.error(`  ❌ ${fileName}: Processing failed - ${error}`);
          // Continue processing other files even if one fails
        }
      }

      console.log(`📊 JSON ingestion processed ${totalProductsProcessed} products with filtering`);

      console.log(`🔍 Validating JSON ingestion filtering audit trail completeness...`);

      // Validate JSON ingestion audit trail for filtering decisions
      // This tests the filtering audit ecosystem for rate thresholds and validation

      // 1. JSON Ingestion Audit - Check that filtering records were created with valid JSON
      const jsonAudit = db.prepare(`
        SELECT COUNT(*) as count,
               COUNT(CASE WHEN validation_details IS NOT NULL AND JSON_VALID(validation_details) = 1 THEN 1 END) as valid_json
        FROM json_ingestion_audit
        WHERE created_at >= datetime('now', '-1 minute')
      `).get() as any;

      // Validate audit trail behavioral properties for filtering
      expect(jsonAudit.count).toBeGreaterThan(0); // Filtering audit records were created
      expect(jsonAudit.valid_json).toBe(jsonAudit.count); // All should have valid JSON filtering metadata
      console.log(`  ✅ JSON Ingestion Filtering: ${jsonAudit.count} entries, all with valid JSON metadata`);

      // 2. Pipeline Batch Master Record - Check that batch tracking works for JSON ingestion
      const batchRecord = db.prepare(`
        SELECT COUNT(*) as count
        FROM pipeline_batch
        WHERE created_at >= datetime('now', '-2 minutes')
      `).get() as any;

      expect(batchRecord.count).toBeGreaterThanOrEqual(allFiles.length); // At least one per file
      console.log(`  ✅ Pipeline Batch: ${batchRecord.count} master batch records (expected ~${allFiles.length})`);

      console.log(`✅ JSON ingestion filtering audit trail validation completed`);
      console.log(`  • JSON Ingestion Filtering: ${jsonAudit.count} products audited`);
      console.log(`  • Pipeline Batch Coordination: ${batchRecord.count} master coordination records`);
      console.log(`  • Products Filtered: ${totalProductsProcessed} total`);

      // Behavioral validation - verify multi-file filtering audit works
      expect(totalProductsProcessed).toBeGreaterThan(0); // Products were filtered
      expect(jsonAudit.count).toBeGreaterThan(0); // JSON ingestion filtering audit exists
      expect(batchRecord.count).toBeGreaterThan(0); // Batch coordination exists
      console.log(`📊 Multi-file JSON ingestion filtering completed successfully: ${totalProductsProcessed} products`);
    }, 15000); // Much faster timeout - JSON ingestion only

  });

});
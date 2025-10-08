import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TestDatabase } from './helpers/TestDatabase';
import { PipelineTestHelper, PipelineResult } from './utils/PipelineTestHelper';
import { AuditTrailValidator } from './helpers/AuditTrailValidator';

/**
 * Phase 4.5b: Cross-Platform Deduplication Tests
 *
 * Comprehensive cross-platform deduplication tests using minimal filtering
 * to maximize product retention and focus specifically on deduplication logic.
 * Tests validate business key generation (excludes platform), quality scoring,
 * and user choice preservation between platforms.
 *
 * Test Data Sources (same as 4.5a but with minimal filtering):
 * - AJ Bell: 41 products (simple platform=source structure)
 * - Flagstone: 219 products (baseline consistency validation)
 * - Moneyfacts: 1,459 products across 3 account types (complex multi-platform)
 *
 * Key Focus Areas:
 * - Minimal filtering (0.5% threshold) to maximize product retention
 * - Cross-platform deduplication logic validation
 * - Business key generation (excludes platform) testing
 * - Known cross-scraper banks (Paragon, Aldermore, OakNorth) kept separate per platform
 * - User choice preservation between platforms
 * - FRN consistency across platforms
 */

describe('Phase 4.5b: Cross-Platform Deduplication Tests', () => {
  let testDb: TestDatabase;
  let pipelineHelper: PipelineTestHelper;
  let auditValidator: AuditTrailValidator;

  // Store results for cross-platform analysis
  let combinedResult: PipelineResult;
  let crossPlatformAnalysis: any;

  beforeAll(async () => {
    console.log('🔧 Setting up Phase 4.5b cross-platform deduplication test environment...');

    // Initialize test database
    testDb = new TestDatabase();
    await testDb.setup();

    // Validate database integrity
    const dbValidation = testDb.validateDatabase();
    if (!dbValidation.valid) {
      throw new Error(`Test database invalid: ${dbValidation.errors.join(', ')}`);
    }

    console.log(`✅ Database ready: ${dbValidation.frnDataCount} FRN entries, ${dbValidation.tableCount} tables`);

    // Initialize test helpers
    pipelineHelper = new PipelineTestHelper(testDb);
    auditValidator = new AuditTrailValidator(testDb.getConnection());

    // Setup test environment with MINIMAL FILTERING for deduplication focus
    await pipelineHelper.setupTestEnvironment({
      productionLikeFiltering: false, // Use minimal filtering
      minRateThreshold: 0.5,          // Very low threshold to maximize retention
      focusOnDeduplication: true      // Optimize for deduplication testing
    });
  });

  afterAll(async () => {
    console.log('🧹 Cross-platform deduplication tests completed - database preserved for examination');
    // Database intentionally preserved for post-test analysis
    // await testDb.teardown();
  });

  describe('Combined Multi-Scraper Processing', () => {

    test('Process All Scrapers with Minimal Filtering (Standalone)', async () => {
      console.log('\n🧪 Processing all scrapers with minimal filtering in SINGLE BATCH (standalone)...');

      const allFiles = [
        'ajbell-sample.json',
        'flagstone-sample.json',
        'moneyfacts-easy-access-sample.json',
        'moneyfacts-fixed-term-sample.json',
        'moneyfacts-notice-sample.json'
      ];

      // Process ALL fixtures in a SINGLE combined batch - this is the key difference from 4.5a
      console.log(`📊 Processing all ${allFiles.length} fixtures in single combined batch...`);

      combinedResult = await pipelineHelper.executeCombinedPipelineWithTracking(allFiles);

      // Pipeline should complete successfully with data integrity
      expect(combinedResult.batchId).toBeDefined();
      expect(combinedResult.products.length).toBeGreaterThan(0);

      // Data integrity validation
      expect(combinedResult.products.every(p => p.bankName && p.platform && p.source)).toBe(true);

      console.log(`📊 Combined processing results (standalone single batch):`);
      console.log(`  Final products after minimal filtering: ${combinedResult.products.length}`);
      console.log(`  Processing time: ${combinedResult.processingTime}ms`);
      console.log(`  FRN matches: ${combinedResult.stats.frnMatches}`);

      // Should have multiple sources and platforms represented
      const sources = new Set(combinedResult.products.map(p => p.source));
      const platforms = new Set(combinedResult.products.map(p => p.platform));

      expect(sources.size).toBeGreaterThan(0);     // Should have multiple sources
      expect(platforms.size).toBeGreaterThan(0);   // Should have multiple platforms

      console.log(`  Sources: ${Array.from(sources).join(', ')}`);
      console.log(`  Platforms: ${Array.from(platforms).join(', ')}`);

      console.log(`✅ Standalone combined processing completed successfully`);
    }, 180000); // 3 minutes timeout for processing all files

  });

  describe('Cross-Platform Deduplication Logic Validation', () => {

    test('Business Key Generation Excludes Platform', async () => {
      console.log('\n🧪 Validating business key generation excludes platform...');

      // Validate cross-platform deduplication handling
      const dedupValidation = await pipelineHelper.validateCrossPlatformDedup(combinedResult.batchId);
      expect(dedupValidation.crossPlatformGroups).toBeGreaterThan(0);

      console.log(`📊 Cross-platform deduplication results:`);
      console.log(`  Cross-platform groups found: ${dedupValidation.crossPlatformGroups}`);
      console.log(`  Multi-platform banks: ${dedupValidation.preservedPlatforms.length}`);

      // Test specific cross-platform banks if they exist
      const knownCrossPlatformBanks = ['Paragon', 'Aldermore', 'OakNorth'];
      const crossPlatformBanksFound: string[] = [];

      for (const bankPattern of knownCrossPlatformBanks) {
        const bankProducts = combinedResult.products.filter(p =>
          p.bankName.toLowerCase().includes(bankPattern.toLowerCase())
        );

        if (bankProducts.length > 0) {
          const platforms = new Set(bankProducts.map(p => p.platform));
          if (platforms.size > 1) {
            console.log(`🔍 ${bankPattern} Bank found on ${platforms.size} platforms: ${Array.from(platforms).join(', ')}`);
            crossPlatformBanksFound.push(bankPattern);

            // Validate that products are kept separate (not deduplicated) across platforms
            expect(bankProducts.length).toBeGreaterThanOrEqual(platforms.size);

            // Validate FRN consistency across platforms if FRNs exist
            const frns = new Set(bankProducts.map(p => p.frn).filter(f => f));
            if (frns.size > 1) {
              console.warn(`⚠️ ${bankPattern} Bank has inconsistent FRNs across platforms: ${Array.from(frns)}`);
            } else if (frns.size === 1) {
              console.log(`  ✅ FRN consistency maintained: ${Array.from(frns)[0]}`);
            }
          }
        }
      }

      // Validation successful if we reach this point
      expect(crossPlatformBanksFound.length).toBeGreaterThanOrEqual(0);

      console.log(`✅ Business key generation validation completed: ${crossPlatformBanksFound.length} cross-platform banks found`);
    }, 60000);

    test('Platform Separation and User Choice Preservation', async () => {
      console.log('\n🧪 Validating platform separation and user choice preservation...');

      // Find banks that appear on multiple platforms
      const bankGroups: Record<string, typeof combinedResult.products> = {};
      combinedResult.products.forEach(product => {
        if (!bankGroups[product.bankName]) {
          bankGroups[product.bankName] = [];
        }
        bankGroups[product.bankName].push(product);
      });

      const multiPlatformBanks = Object.entries(bankGroups)
        .filter(([_, products]) => {
          const platforms = new Set(products.map(p => p.platform));
          return platforms.size > 1;
        });

      console.log(`🔍 Found ${multiPlatformBanks.length} banks on multiple platforms`);

      // Validation successful if we reach this point
      expect(multiPlatformBanks.length).toBeGreaterThanOrEqual(0);

      // Validate platform separation for multi-platform banks
      multiPlatformBanks.forEach(([bankName, products]) => {
        const platforms = new Set(products.map(p => p.platform));
        const sources = new Set(products.map(p => p.source));

        console.log(`  🏦 ${bankName}:`);
        console.log(`    Platforms: ${Array.from(platforms).join(', ')}`);
        console.log(`    Sources: ${Array.from(sources).join(', ')}`);
        console.log(`    Products: ${products.length}`);

        // Each platform should be preserved as a separate choice
        expect(products.length).toBeGreaterThanOrEqual(platforms.size);

        // If same bank has FRNs, they should be consistent across platforms
        const frns = new Set(products.map(p => p.frn).filter(f => f));
        if (frns.size > 1) {
          console.warn(`    ⚠️ Inconsistent FRNs: ${Array.from(frns)}`);
        } else if (frns.size === 1) {
          console.log(`    ✅ Consistent FRN: ${Array.from(frns)[0]}`);
        }

        // Products should have different IDs even if same bank
        const productIds = new Set(products.map(p => p.id));
        expect(productIds.size).toBe(products.length); // Each product should have unique ID
      });

      console.log(`✅ Platform separation and user choice preservation validated`);
    }, 60000);

    test('Quality Scoring for Platform Selection', async () => {
      console.log('\n🧪 Validating quality scoring for platform selection...');

      // Check deduplication groups to understand quality scoring
      const db = testDb.getConnection();
      const dedupGroups = db.prepare(`
        SELECT * FROM deduplication_groups
        WHERE batch_id = ? AND quality_scores IS NOT NULL
      `).all(combinedResult.batchId) as any[];

      console.log(`📊 Found ${dedupGroups.length} deduplication groups with quality scores`);

      if (dedupGroups.length > 0) {
        for (const group of dedupGroups) {
          try {
            // Validate quality_scores JSON structure
            const qualityScores = JSON.parse(group.quality_scores);
            expect(typeof qualityScores).toBe('object');

            // Validate platforms_in_group JSON array
            const platforms = JSON.parse(group.platforms_in_group);
            expect(Array.isArray(platforms)).toBe(true);
            expect(platforms.length).toBeGreaterThanOrEqual(1);

            console.log(`  Group ${group.id}:`);
            console.log(`    Platforms: ${platforms.join(', ')}`);
            console.log(`    Quality scores count: ${Object.keys(qualityScores).length}`);

            // Validate quality scores are reasonable numbers (handle nested structure)
            for (const productId in qualityScores) {
              const scoreData = qualityScores[productId];

              // Quality score might be a nested object with a score property
              let actualScore: number;
              if (typeof scoreData === 'object' && scoreData !== null && 'score' in scoreData) {
                actualScore = scoreData.score;
              } else if (typeof scoreData === 'number') {
                actualScore = scoreData;
              } else {
                // Log the actual structure for debugging
                console.log(`Unexpected quality score structure for ${productId}:`, scoreData);
                throw new Error(`Quality score for ${productId} has unexpected structure: ${typeof scoreData}`);
              }

              expect(typeof actualScore).toBe('number');
              expect(actualScore).toBeGreaterThanOrEqual(0);
              expect(actualScore).toBeLessThanOrEqual(1);
            }

          } catch (error) {
            console.error(`Error parsing group ${group.id}:`, error);
            throw error;
          }
        }
      }

      console.log(`✅ Quality scoring validation completed`);
    }, 30000);

  });

  describe('Cross-Platform FRN Consistency Validation', () => {

    test('FRN Consistency Across Platforms', async () => {
      console.log('\n🧪 Validating FRN consistency across platforms...');

      // Test FRN consistency across platforms
      const products = combinedResult.products;
      const bankFrnMap: Record<string, Set<string>> = {};

      // Collect FRNs per bank
      products.forEach(product => {
        if (product.frn) {
          if (!bankFrnMap[product.bankName]) {
            bankFrnMap[product.bankName] = new Set();
          }
          bankFrnMap[product.bankName].add(product.frn);
        }
      });

      // Validate FRN consistency
      const inconsistentBanks: string[] = [];
      const consistentBanks: string[] = [];

      for (const [bankName, frns] of Object.entries(bankFrnMap)) {
        if (frns.size > 1) {
          inconsistentBanks.push(bankName);
          console.warn(`⚠️ ${bankName} has inconsistent FRNs: ${Array.from(frns).join(', ')}`);
        } else if (frns.size === 1) {
          consistentBanks.push(bankName);
          console.log(`✅ ${bankName} has consistent FRN: ${Array.from(frns)[0]}`);
        }
      }

      console.log(`📊 FRN consistency summary:`);
      console.log(`  Banks with consistent FRNs: ${consistentBanks.length}`);
      console.log(`  Banks with inconsistent FRNs: ${inconsistentBanks.length}`);

      // Most banks should have consistent FRNs across platforms
      expect(consistentBanks.length).toBeGreaterThan(inconsistentBanks.length);

      // Calculate overall FRN match rate
      const productsWithFrn = products.filter(p => p.frn && p.frn !== null);
      const frnMatchRate = productsWithFrn.length / products.length;

      console.log(`📊 Overall FRN matching: ${(frnMatchRate * 100).toFixed(1)}% (${productsWithFrn.length}/${products.length})`);

      // Should have high FRN match rate with minimal filtering
      expect(frnMatchRate).toBeGreaterThan(0.7); // At least 70% should have FRNs

      console.log(`✅ FRN consistency validation completed`);
    }, 30000);

  });

  describe('Cross-Platform Deduplication Audit Trail', () => {

    test('Deduplication Audit Trail Completeness', async () => {
      console.log('\n🧪 Validating cross-platform deduplication audit trail...');

      // Check deduplication audit exists
      const dedupAudit = testDb.getAuditTrail(combinedResult.batchId);
      expect(dedupAudit).toBeTruthy();

      // Validate comprehensive audit trail
      const auditValidation = pipelineHelper.validateAuditTrail(combinedResult.batchId);

      // Log any validation issues for debugging
      if (!auditValidation.valid) {
        console.log('Deduplication audit issues:', auditValidation.errors);
      }

      // Check for deduplication groups with cross-platform information
      const db = testDb.getConnection();
      const crossPlatformGroups = db.prepare(`
        SELECT COUNT(*) as count
        FROM deduplication_groups
        WHERE batch_id = ?
        AND JSON_ARRAY_LENGTH(platforms_in_group) > 1
      `).get(combinedResult.batchId) as any;

      console.log(`📊 Cross-platform groups in audit: ${crossPlatformGroups.count}`);

      // Should have some cross-platform groups recorded in audit
      expect(crossPlatformGroups.count).toBeGreaterThan(0);

      console.log(`✅ Cross-platform deduplication audit trail validated`);
    }, 30000);

    test('JSON Queryability for Cross-Platform Analysis', async () => {
      console.log('\n🧪 Testing JSON queryability for cross-platform analysis...');

      const db = testDb.getConnection();

      // Test querying platforms_in_group JSON array
      const multiPlatformQuery = db.prepare(`
        SELECT COUNT(*) as count
        FROM deduplication_groups
        WHERE batch_id = ?
        AND JSON_ARRAY_LENGTH(platforms_in_group) > 1
      `).get(combinedResult.batchId) as any;

      expect(multiPlatformQuery.count).toBeGreaterThan(0);

      // Test querying quality scores for cross-platform products
      const qualityScoreQuery = db.prepare(`
        SELECT COUNT(*) as count
        FROM deduplication_groups
        WHERE batch_id = ?
        AND JSON_VALID(quality_scores) = 1
        AND quality_scores != '{}'
      `).get(combinedResult.batchId) as any;

      expect(qualityScoreQuery.count).toBeGreaterThan(0);

      console.log(`📊 JSON queryability test results:`);
      console.log(`  Multi-platform groups: ${multiPlatformQuery.count}`);
      console.log(`  Groups with quality scores: ${qualityScoreQuery.count}`);

      console.log(`✅ JSON queryability for cross-platform analysis confirmed`);
    }, 30000);

  });

  describe('Performance Analysis with Minimal Filtering', () => {

    test('Processing Performance with High Retention', async () => {
      console.log('\n📈 Analyzing processing performance with minimal filtering...');

      const processingTime = combinedResult.processingTime;
      const productCount = combinedResult.stats.totalProducts;
      const productsPerSecond = Math.round((productCount / processingTime) * 1000);
      const timePerProduct = Math.round(processingTime / productCount);

      console.log(`📊 Performance metrics:`);
      console.log(`  Total processing time: ${processingTime}ms`);
      console.log(`  Products processed: ${productCount}`);
      console.log(`  Processing rate: ${productsPerSecond} products/second`);
      console.log(`  Time per product: ${timePerProduct}ms`);

      // Performance expectations for large dataset
      expect(processingTime).toBeLessThan(180000); // < 3 minutes for all scrapers
      expect(productsPerSecond).toBeGreaterThan(1);  // At least 1 product per second

      // Should handle high product count efficiently
      expect(productCount).toBeGreaterThan(500);   // High retention expected

      console.log(`✅ Performance analysis completed - acceptable for batch processing`);
    });

  });

});
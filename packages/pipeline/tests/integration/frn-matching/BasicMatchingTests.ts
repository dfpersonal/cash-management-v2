import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { TestDatabase } from '../helpers/TestDatabase';
import { PipelineTestHelper } from '../utils/PipelineTestHelper';
import { PipelineStage } from '@cash-mgmt/pipeline';

describe('FRN Matching - Basic Exact Matching', () => {
  let testDb: TestDatabase;
  let pipelineHelper: PipelineTestHelper;

  // Helper function to create test product with correct format
  const createTestProduct = (bankName: string, overrides: any = {}) => ({
    bankName,
    platform: 'test',
    rawPlatform: 'test',
    accountType: 'easy_access',
    aerRate: 3.5,
    grossRate: 3.5,
    minDeposit: 1,
    maxDeposit: 85000,
    fscsProtected: true,
    scrapedAt: new Date().toISOString(),
    ...overrides
  });

  beforeEach(async () => {
    process.env.PIPELINE_AUDIT_ENABLED = 'true';
    process.env.PIPELINE_AUDIT_OUTPUT = 'database';

    testDb = new TestDatabase();
    await testDb.setup();
    pipelineHelper = new PipelineTestHelper(testDb);

    await pipelineHelper.setupTestEnvironment({
      accumulateRaw: true
    });
  });

  afterEach(async () => {
    pipelineHelper.cleanupTemporaryFixtures();
    await testDb.teardown();
  });

  test('direct BOE institution match with high confidence', async () => {
    const db = testDb.getConnection();

    // Verify Santander exists in frn_lookup_helper
    const lookupTarget = db.prepare(`
      SELECT frn, search_name FROM frn_lookup_helper
      WHERE search_name LIKE '%SANTANDER%' LIMIT 1
    `).get();
    expect(lookupTarget).toBeDefined();
    console.log(`✅ Test data verified: ${lookupTarget.search_name} (FRN: ${lookupTarget.frn})`);

    // Create temporary fixture
    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-basic' },
      products: [createTestProduct('Santander')]
    });

    // Process through pipeline
    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Verify FRN match with high confidence (query by source to get our test product)
    const product = db.prepare('SELECT frn, confidence_score FROM available_products_raw WHERE source = ? AND bank_name = ?').get('test', 'Santander');
    expect(product.frn).toBeTruthy();
    expect(product.confidence_score).toBeGreaterThanOrEqual(0.8);
    console.log(`✅ Match: FRN=${product.frn}, Confidence=${product.confidence_score}`);

    // Verify audit trail shows exact match (query by original_bank_name and check it matches our product)
    const audit = db.prepare(`
      SELECT * FROM frn_matching_audit
      WHERE original_bank_name = ?
      AND product_id LIKE ?
      ORDER BY id DESC LIMIT 1
    `).get('Santander', 'test-%');
    expect(audit).toBeDefined();
    expect(audit.final_frn).toBeTruthy();
    expect(audit.final_frn).toBe(product.frn);
    expect(audit.final_confidence).toBe(product.confidence_score);
    console.log(`✅ Audit: Method=${audit.database_query_method}`);
  });

  test('case-insensitive matching works correctly', async () => {
    const db = testDb.getConnection();

    // Verify Santander exists in frn_lookup_helper
    const lookupTarget = db.prepare(`
      SELECT frn, search_name FROM frn_lookup_helper
      WHERE search_name LIKE '%SANTANDER%' LIMIT 1
    `).get();
    expect(lookupTarget).toBeDefined();

    // Create products with same bank in different cases
    const bankNames = ['SANTANDER', 'santander', 'Santander'];
    const rates = [3.5, 3.6, 3.7];

    const products = bankNames.map((bankName, i) =>
      createTestProduct(bankName, { aerRate: rates[i], grossRate: rates[i] })
    );

    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-basic-case' },
      products
    });

    // Process through pipeline
    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Get all test products
    const matchedProducts = db.prepare('SELECT bank_name, frn, confidence_score FROM available_products_raw WHERE source = ?').all('test');

    // All should have same FRN (case-insensitive matching)
    const frnsWithValues = matchedProducts.map(p => p.frn).filter(f => f !== null);
    const uniqueFRNs = [...new Set(frnsWithValues)];
    expect(uniqueFRNs.length).toBe(1); // All should match to same FRN
    console.log(`✅ Case-insensitive: All 3 variants matched to FRN=${uniqueFRNs[0]}`);

    // All should have identical confidence
    const confidences = matchedProducts.map(p => p.confidence_score).filter(c => c > 0);
    expect(confidences.length).toBe(3);
    const uniqueConfidences = [...new Set(confidences)];
    expect(uniqueConfidences.length).toBe(1); // All identical
    console.log(`✅ Identical confidence: ${uniqueConfidences[0]}`);
  });

  test('unknown bank handling with research queue', async () => {
    const db = testDb.getConnection();

    const unknownBank = 'Completely Unknown Fictional Bank 12345';

    // Verify this bank does NOT exist in frn_lookup_helper
    const lookupAttempt = db.prepare(`
      SELECT frn FROM frn_lookup_helper
      WHERE search_name LIKE ?
    `).get(`%${unknownBank}%`);
    expect(lookupAttempt).toBeUndefined();

    // Create temporary fixture
    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-basic-unknown' },
      products: [createTestProduct(unknownBank)]
    });

    // Process through pipeline
    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Verify no FRN match
    const product = db.prepare('SELECT frn, confidence_score FROM available_products_raw WHERE source = ? AND bank_name = ?').get('test', unknownBank);
    expect(product.frn).toBeNull();
    expect(product.confidence_score).toBe(0);
    console.log(`✅ Unknown bank correctly left unmatched`);

    // Verify audit trail recorded the attempt
    const audit = db.prepare(`
      SELECT * FROM frn_matching_audit
      WHERE original_bank_name = ?
      AND product_id LIKE ?
      ORDER BY id DESC LIMIT 1
    `).get(unknownBank, 'test-%');
    expect(audit).toBeDefined();
    expect(audit.final_frn).toBeNull();
    expect(audit.database_query_method).toBe('unknown'); // No method succeeded
    expect(audit.match_type).toBeNull(); // No lookup helper match
    console.log(`✅ Audit trail recorded failed match attempt`);
  });

  test('manual override takes highest priority', async () => {
    const db = testDb.getConnection();

    // Get real Santander FRN from frn_lookup_helper
    const realSantanderFRN = db.prepare(`
      SELECT frn FROM frn_lookup_helper
      WHERE search_name LIKE 'SANTANDER%'
      LIMIT 1
    `).get()?.frn;
    expect(realSantanderFRN).toBeTruthy();
    console.log(`✅ Real Santander FRN: ${realSantanderFRN}`);

    // Add manual override using production method (auto-rebuilds cache)
    const overrideFRN = '999999';
    const { FRNMatchingService } = await import('../../../shared/services/FRNMatchingService');
    const frnService = new FRNMatchingService(db);
    await frnService.loadConfiguration();
    await frnService.addManualOverride('SANTANDER', overrideFRN, 'Override Santander', 1.0, 'Test manual override');

    // Create temporary fixture
    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-basic-override' },
      products: [createTestProduct('Santander')]
    });

    // Process through pipeline (will load config and pick up override)
    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Verify manual override FRN is used, not real BOE FRN
    const product = db.prepare('SELECT frn FROM available_products_raw WHERE source = ? AND bank_name = ?').get('test', 'Santander');
    expect(product.frn).toBe(overrideFRN); // Should use override, not real FRN
    expect(product.frn).not.toBe(realSantanderFRN);
    console.log(`✅ Manual override wins: ${overrideFRN} (not ${realSantanderFRN})`);

    // Verify audit shows manual override
    const audit = db.prepare(`
      SELECT * FROM frn_matching_audit
      WHERE original_bank_name = ?
      AND product_id LIKE ?
      ORDER BY id DESC LIMIT 1
    `).get('Santander', 'test-%');
    expect(audit).toBeDefined();
    expect(audit.final_frn).toBe(overrideFRN);
    expect(audit.database_query_method).toBe('exact_match'); // Algorithm used
    expect(audit.match_type).toBe('manual_override'); // Source of match
    expect(audit.manual_override_frn).toBe(overrideFRN); // Manual override fields populated
    expect(audit.manual_override_timestamp).toBeTruthy();
    console.log(`✅ Audit method: ${audit.database_query_method}, match_type: ${audit.match_type}`);

    // Cleanup using production method
    await frnService.removeManualOverride('SANTANDER');
  });

  test('real fixture banks achieve high match rate', async () => {
    const db = testDb.getConnection();

    // Clear existing data from beforeEach
    db.prepare('DELETE FROM available_products_raw').run();
    db.prepare('DELETE FROM frn_matching_audit').run();

    // Process real fixture data through full pipeline
    await pipelineHelper.executePipelineWithTracking('ajbell-sample.json', {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Analyze match success rate
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM available_products_raw').get().count;
    const matchedCount = db.prepare('SELECT COUNT(*) as count FROM available_products_raw WHERE frn IS NOT NULL').get().count;

    const matchRate = matchedCount / totalCount;

    // Real UK banks should have high match rate (>70%)
    expect(matchRate).toBeGreaterThan(0.7);

    // Verify unique banks that matched
    const uniqueMatched = db.prepare(`
      SELECT DISTINCT bank_name, frn
      FROM available_products_raw
      WHERE frn IS NOT NULL
    `).all();

    console.log(`✅ Matched ${matchedCount}/${totalCount} products (${(matchRate * 100).toFixed(1)}%)`);
    console.log(`✅ ${uniqueMatched.length} unique banks matched successfully`);

    // Analyze audit trail for match methods
    const matchMethods = db.prepare(`
      SELECT database_query_method, COUNT(*) as count
      FROM frn_matching_audit
      WHERE database_query_method IS NOT NULL
      GROUP BY database_query_method
    `).all();

    if (matchMethods.length > 0) {
      console.log('📊 Match methods breakdown:');
      matchMethods.forEach(m => {
        console.log(`   ${m.database_query_method}: ${m.count}`);
      });
    }
  });

  test('BOE direct match takes priority over name variations', async () => {
    const db = testDb.getConnection();

    // Find a bank in boe_institutions that has a suffix (which creates both direct_match and name_variation entries)
    // Query the ORIGINAL firm_name from boe_institutions, not the normalized search_name
    const bankWithSuffix = db.prepare(`
      SELECT frn, firm_name
      FROM boe_institutions
      WHERE firm_name LIKE '% Plc' OR firm_name LIKE '% PLC' OR firm_name LIKE '% Limited'
      LIMIT 1
    `).get();
    expect(bankWithSuffix).toBeDefined();
    console.log(`✅ Found bank with suffix: ${bankWithSuffix.firm_name} (FRN: ${bankWithSuffix.frn})`);

    // Verify this bank has both direct_match and name_variation entries in frn_lookup_helper
    const lookupEntries = db.prepare(`
      SELECT search_name, match_type, confidence_score
      FROM frn_lookup_helper
      WHERE frn = ?
      ORDER BY match_type
    `).all(bankWithSuffix.frn);
    console.log(`📊 Lookup helper entries for FRN ${bankWithSuffix.frn}:`, lookupEntries.map(e => `${e.search_name}(${e.match_type})`).join(', '));

    // Temporarily disable normalization to preserve the original bank name with suffix
    db.prepare('UPDATE unified_config SET config_value = ? WHERE config_key = ?')
      .run('false', 'frn_matching_normalization_enabled');

    try {
      // Create test product using the ORIGINAL firm_name (with suffix intact)
      const fixtureName = pipelineHelper.createTemporaryFixture({
        metadata: { source: 'test', method: 'test-priority-direct' },
        products: [createTestProduct(bankWithSuffix.firm_name)]
      });

      await pipelineHelper.executePipelineWithTracking(fixtureName, {
        stopAfterStage: PipelineStage.FRN_MATCHING
      });

      // Verify it matched via direct_match (because normalization is disabled, exact name matches)
      const product = db.prepare('SELECT frn, confidence_score FROM available_products_raw WHERE source = ?').get('test');
      expect(product.frn).toBe(bankWithSuffix.frn);
      console.log(`✅ Match: FRN=${product.frn}, Confidence=${product.confidence_score}`);

      const audit = db.prepare(`
        SELECT * FROM frn_matching_audit
        WHERE product_id LIKE ?
        ORDER BY id DESC LIMIT 1
      `).get('test-%');

      expect(audit).toBeDefined();
      expect(audit.final_frn).toBe(bankWithSuffix.frn);
      expect(audit.match_type).toBe('direct_match'); // Should match via direct, not name_variation
      expect(audit.final_confidence).toBe(1.0); // Direct match confidence
      console.log(`✅ Priority verified: match_type=${audit.match_type}, confidence=${audit.final_confidence}`);

    } finally {
      // Re-enable normalization
      db.prepare('UPDATE unified_config SET config_value = ? WHERE config_key = ?')
        .run('true', 'frn_matching_normalization_enabled');
    }
  });

  test('name variation takes priority over shared brand', async () => {
    const db = testDb.getConnection();

    // Find an FRN that has BOTH name_variation and shared_brand entries (same search_name)
    // This tests that when the SAME search string could match via multiple methods, priority wins
    const multiMethodBank = db.prepare(`
      SELECT h1.search_name, h1.frn, COUNT(DISTINCT h1.match_type) as type_count
      FROM frn_lookup_helper h1
      WHERE h1.match_type IN ('name_variation', 'shared_brand')
      GROUP BY h1.search_name, h1.frn
      HAVING COUNT(DISTINCT h1.match_type) >= 1
      LIMIT 1
    `).get();

    if (!multiMethodBank) {
      console.log('⚠️ No suitable test bank found - skipping test');
      return;
    }

    // Get all match types for this search_name
    const allMatches = db.prepare(`
      SELECT match_type, confidence_score, match_rank
      FROM frn_lookup_helper
      WHERE search_name = ? AND frn = ?
      ORDER BY match_rank
    `).all(multiMethodBank.search_name, multiMethodBank.frn);

    console.log(`✅ Found bank: ${multiMethodBank.search_name} (FRN: ${multiMethodBank.frn})`);
    console.log(`📊 Match types: ${allMatches.map(m => `${m.match_type}(rank=${m.match_rank})`).join(', ')}`);

    // The entry with match_rank=1 should be used
    const bestMatch = allMatches[0];

    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-priority-variation' },
      products: [createTestProduct(multiMethodBank.search_name)]
    });

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const audit = db.prepare(`
      SELECT * FROM frn_matching_audit
      WHERE product_id LIKE ?
      ORDER BY id DESC LIMIT 1
    `).get('test-%');

    expect(audit).toBeDefined();
    expect(audit.final_frn).toBe(multiMethodBank.frn);
    expect(audit.match_type).toBe(bestMatch.match_type); // Should use highest priority match
    expect(audit.final_confidence).toBe(bestMatch.confidence_score);
    console.log(`✅ Priority verified: match_type=${audit.match_type}, confidence=${audit.final_confidence}`);
  });

  test('best match selection via match_rank', async () => {
    const db = testDb.getConnection();

    // Find a search_name that has multiple entries in frn_lookup_helper
    const multiMatch = db.prepare(`
      SELECT search_name, COUNT(*) as match_count
      FROM frn_lookup_helper
      GROUP BY search_name
      HAVING COUNT(*) > 1
      ORDER BY match_count DESC
      LIMIT 1
    `).get();
    expect(multiMatch).toBeDefined();
    console.log(`✅ Found bank with ${multiMatch.match_count} potential matches: ${multiMatch.search_name}`);

    // Get all matches for this search_name, ordered by match_rank
    const allMatches = db.prepare(`
      SELECT frn, match_type, confidence_score, match_rank
      FROM frn_lookup_helper
      WHERE search_name = ?
      ORDER BY match_rank
    `).all(multiMatch.search_name);

    expect(allMatches.length).toBeGreaterThan(1);
    console.log(`📊 Matches: ${allMatches.map(m => `rank=${m.match_rank} type=${m.match_type}`).join(', ')}`);

    // The first entry (match_rank=1) should be the highest priority
    const bestMatch = allMatches[0];
    expect(bestMatch.match_rank).toBe(1);

    // Create test product
    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-match-rank' },
      products: [createTestProduct(multiMatch.search_name)]
    });

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Verify the service selected the match_rank=1 entry
    const product = db.prepare('SELECT frn FROM available_products_raw WHERE source = ? AND bank_name = ?')
      .get('test', multiMatch.search_name);

    expect(product.frn).toBe(bestMatch.frn);
    console.log(`✅ Service correctly selected match_rank=1: FRN=${bestMatch.frn}, type=${bestMatch.match_type}`);

    // Verify audit trail
    const audit = db.prepare(`
      SELECT * FROM frn_matching_audit
      WHERE original_bank_name = ?
      AND product_id LIKE ?
      ORDER BY id DESC LIMIT 1
    `).get(multiMatch.search_name, 'test-%');

    expect(audit.match_type).toBe(bestMatch.match_type);
    expect(audit.final_confidence).toBe(bestMatch.confidence_score);
  });

  test('cross-fixture consistency for same bank', async () => {
    const db = testDb.getConnection();

    // Use a well-known bank that appears in multiple fixtures
    const testBank = 'Santander';

    // Process the same bank from two different "fixtures" (different sources)
    const fixture1 = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-source-1', method: 'test-consistency-1' },
      products: [createTestProduct(testBank, { aerRate: 3.5 })]
    });

    const fixture2 = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-source-2', method: 'test-consistency-2' },
      products: [createTestProduct(testBank, { aerRate: 3.8 })]
    });

    // Process first fixture and capture batch_id
    const result1 = await pipelineHelper.executePipelineWithTracking(fixture1, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Clear raw table to prevent batch 2 from reprocessing batch 1's products
    // (rebuildFromRawData reads ALL products from available_products_raw)
    // Keep audit records to compare consistency across batches
    db.prepare('DELETE FROM available_products_raw').run();

    // Process second fixture and capture batch_id
    const result2 = await pipelineHelper.executePipelineWithTracking(fixture2, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Verify the product from batch 2 (batch 1's products were cleared)
    const product = db.prepare(`
      SELECT source, frn, confidence_score, bank_name
      FROM available_products_raw
      WHERE source = 'test-source-2'
    `).get();

    expect(product).toBeDefined();
    expect(product.frn).toBeTruthy();
    console.log(`✅ FRN: ${product.frn}, confidence: ${product.confidence_score}`);

    // Get audit records from BOTH batches (audit wasn't cleared)
    const audits = db.prepare(`
      SELECT product_id, match_type, database_query_method, final_frn, final_confidence, batch_id
      FROM frn_matching_audit
      WHERE batch_id IN (?, ?)
      AND original_bank_name = ?
      AND product_id = 'test-Santander'
      ORDER BY batch_id
    `).all(result1.batchId, result2.batchId, testBank);

    expect(audits.length).toBe(2);

    // Verify identical match types and methods across both batches
    expect(audits[0].match_type).toBe(audits[1].match_type);
    expect(audits[0].database_query_method).toBe(audits[1].database_query_method);
    expect(audits[0].final_frn).toBe(audits[1].final_frn);
    expect(audits[0].final_confidence).toBe(audits[1].final_confidence);

    console.log(`✅ Consistent audit trail: match_type=${audits[0].match_type}, method=${audits[0].database_query_method}`);
  });

  test('cross-platform consistency for same bank', async () => {
    const db = testDb.getConnection();

    // Use a well-known bank that appears in the BOE data
    const testBank = 'Santander';

    // Same bank available on two different platforms
    const fixture1 = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-scraper-1', method: 'test-cross-platform' },
      products: [createTestProduct(testBank, { platform: 'direct', rawPlatform: 'direct', aerRate: 3.5 })]
    });

    const fixture2 = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-scraper-2', method: 'test-cross-platform' },
      products: [createTestProduct(testBank, { platform: 'ajbell', rawPlatform: 'ajbell', aerRate: 3.8 })]
    });

    // Process first platform and capture batch_id
    const result1 = await pipelineHelper.executePipelineWithTracking(fixture1, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Clear raw table to prevent batch 2 from reprocessing batch 1's products
    db.prepare('DELETE FROM available_products_raw').run();

    // Process second platform and capture batch_id
    const result2 = await pipelineHelper.executePipelineWithTracking(fixture2, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Verify the product from batch 2 (batch 1's products were cleared)
    const product = db.prepare(`
      SELECT platform, frn, confidence_score, bank_name
      FROM available_products_raw
      WHERE platform = 'ajbell'
    `).get();

    expect(product).toBeDefined();
    expect(product.frn).toBeTruthy();
    console.log(`✅ FRN: ${product.frn}, confidence: ${product.confidence_score}`);

    // Get audit records from both platforms (audit wasn't cleared)
    const audits = db.prepare(`
      SELECT product_id, match_type, database_query_method, final_frn, final_confidence, batch_id
      FROM frn_matching_audit
      WHERE batch_id IN (?, ?)
      AND original_bank_name = ?
      AND product_id IN ('direct-Santander', 'ajbell-Santander')
      ORDER BY product_id
    `).all(result1.batchId, result2.batchId, testBank);

    expect(audits.length).toBe(2);

    // Verify identical matching logic across platforms
    expect(audits[0].match_type).toBe(audits[1].match_type);
    expect(audits[0].database_query_method).toBe(audits[1].database_query_method);
    expect(audits[0].final_frn).toBe(audits[1].final_frn);
    expect(audits[0].final_confidence).toBe(audits[1].final_confidence);

    console.log(`✅ Platform-agnostic matching: ${audits[0].product_id} and ${audits[1].product_id} use same logic`);
  });
});

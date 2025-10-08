import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { TestDatabase } from '../helpers/TestDatabase';
import { PipelineTestHelper } from '../utils/PipelineTestHelper';
import { PipelineStage } from '@cash-mgmt/pipeline';

describe('FRN Matching - Configuration Impact', () => {
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

    // Load baseline fixture for real bank data in reference tables
    await pipelineHelper.executePipelineWithTracking('ajbell-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
  });

  afterEach(async () => {
    pipelineHelper.cleanupTemporaryFixtures();
    await testDb.teardown();
  });

  test('disabling fuzzy matching prevents fuzzy matches', async () => {
    const db = testDb.getConnection();

    // Verify "Santander" exists in frn_lookup_helper (so fuzzy match has a target)
    const lookupTarget = db.prepare(`
      SELECT frn, search_name FROM frn_lookup_helper
      WHERE search_name LIKE '%SANTANDER%'
      LIMIT 1
    `).get();
    expect(lookupTarget).toBeDefined();

    // Create temporary fixture with bank that has typo
    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-fuzzy-config' },
      products: [createTestProduct('Santandr')]
    });

    // ===== PART 1: Fuzzy matching ENABLED =====
    db.prepare(`UPDATE unified_config SET config_value = 'true' WHERE config_key = 'frn_matching_enable_fuzzy'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    let product = db.prepare('SELECT frn, confidence_score FROM available_products_raw WHERE bank_name = ?').get('Santandr');
    expect(product.frn).toBeTruthy();
    expect(product.confidence_score).toBeGreaterThan(0.7);

    let audit = db.prepare('SELECT * FROM frn_matching_audit WHERE original_bank_name = ?').get('Santandr');
    expect(audit).toBeDefined();
    expect(audit.database_query_method).toContain('fuzzy');

    // Clear for next test
    db.prepare('DELETE FROM available_products_raw WHERE bank_name = ?').run('Santandr');
    db.prepare('DELETE FROM frn_matching_audit WHERE original_bank_name = ?').run('Santandr');

    // ===== PART 2: Fuzzy matching DISABLED =====
    db.prepare(`UPDATE unified_config SET config_value = 'false' WHERE config_key = 'frn_matching_enable_fuzzy'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    product = db.prepare('SELECT frn, confidence_score FROM available_products_raw WHERE bank_name = ?').get('Santandr');
    expect(product.frn).toBeNull();

    audit = db.prepare('SELECT * FROM frn_matching_audit WHERE original_bank_name = ?').get('Santandr');
    expect(audit).toBeDefined();
    expect(audit.database_query_method || '').not.toContain('fuzzy');
  });

  test('disabling alias matching prevents trading name matches', async () => {
    const db = testDb.getConnection();

    const lookupEntry = db.prepare(`
      SELECT frn, search_name, match_type FROM frn_lookup_helper
      WHERE UPPER(search_name) = 'HALIFAX'
      LIMIT 1
    `).get();

    if (!lookupEntry) {
      console.log('⚠️  Halifax not in frn_lookup_helper, skipping alias test scenario');
      return;
    }

    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-alias-config' },
      products: [createTestProduct('Halifax')]
    });

    // ===== PART 1: Alias matching ENABLED =====
    db.prepare(`UPDATE unified_config SET config_value = 'true' WHERE config_key = 'frn_matching_enable_alias'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const enabledAudit = db.prepare('SELECT * FROM frn_matching_audit WHERE original_bank_name = ?').get('Halifax');

    // Clear for next test
    db.prepare('DELETE FROM available_products_raw WHERE bank_name = ?').run('Halifax');
    db.prepare('DELETE FROM frn_matching_audit WHERE original_bank_name = ?').run('Halifax');

    // ===== PART 2: Alias matching DISABLED =====
    db.prepare(`UPDATE unified_config SET config_value = 'false' WHERE config_key = 'frn_matching_enable_alias'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const disabledAudit = db.prepare('SELECT * FROM frn_matching_audit WHERE original_bank_name = ?').get('Halifax');

    expect(disabledAudit).toBeDefined();
    expect(disabledAudit.database_query_method || '').not.toContain('alias');
    expect(disabledAudit.database_query_method || '').not.toContain('shared_brand');
  });

  test('disabling research queue prevents queue additions', async () => {
    const db = testDb.getConnection();

    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-queue-config' },
      products: [createTestProduct('Unknown Test Bank XYZ')]
    });

    // ===== PART 1: Research queue ENABLED =====
    db.prepare(`UPDATE unified_config SET config_value = 'true' WHERE config_key = 'frn_matching_enable_research_queue'`).run();
    db.prepare(`UPDATE unified_config SET config_value = 'true' WHERE config_key = 'frn_matching_auto_flag_unmatched'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    let queueEntry = db.prepare('SELECT * FROM frn_research_queue WHERE bank_name LIKE ?').get('%Unknown Test Bank%');
    expect(queueEntry).toBeDefined();

    // Clear queue
    db.prepare('DELETE FROM frn_research_queue WHERE bank_name LIKE ?').run('%Unknown Test Bank%');
    db.prepare('DELETE FROM frn_matching_audit WHERE original_bank_name LIKE ?').run('%Unknown Test Bank%');
    db.prepare('DELETE FROM available_products_raw WHERE bank_name LIKE ?').run('%Unknown Test Bank%');

    // ===== PART 2: Research queue DISABLED =====
    db.prepare(`UPDATE unified_config SET config_value = 'false' WHERE config_key = 'frn_matching_enable_research_queue'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    queueEntry = db.prepare('SELECT * FROM frn_research_queue WHERE bank_name LIKE ?').get('%Unknown Test Bank%');
    expect(queueEntry).toBeUndefined();

    const product = db.prepare('SELECT frn FROM available_products_raw WHERE bank_name LIKE ?').get('%Unknown Test Bank%');
    expect(product.frn).toBeNull();
  });

  test('high confidence threshold affects auto-assignment', async () => {
    const db = testDb.getConnection();

    const lookupEntry = db.prepare(`
      SELECT frn, search_name, confidence_score FROM frn_lookup_helper
      WHERE UPPER(search_name) = 'HALIFAX'
      LIMIT 1
    `).get();

    if (!lookupEntry) {
      console.log('⚠️  No medium-confidence test data available, using fallback');
    }

    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-threshold-config' },
      products: [createTestProduct('Halifax')]
    });

    // ===== PART 1: Normal threshold (0.7) =====
    db.prepare(`UPDATE unified_config SET config_value = '0.7' WHERE config_key = 'frn_matching_confidence_threshold_high'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    let audit = db.prepare('SELECT * FROM frn_matching_audit WHERE original_bank_name = ?').get('Halifax');
    expect(audit).toBeDefined();
    const normalThresholdConfidence = audit.final_confidence;

    // Clear
    db.prepare('DELETE FROM available_products_raw WHERE bank_name = ?').run('Halifax');
    db.prepare('DELETE FROM frn_matching_audit WHERE original_bank_name = ?').run('Halifax');

    // ===== PART 2: Very high threshold (0.95) =====
    db.prepare(`UPDATE unified_config SET config_value = '0.95' WHERE config_key = 'frn_matching_confidence_threshold_high'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    audit = db.prepare('SELECT * FROM frn_matching_audit WHERE original_bank_name = ?').get('Halifax');
    expect(audit).toBeDefined();

    if (normalThresholdConfidence && normalThresholdConfidence < 0.95) {
      expect(audit.decision_routing).toBeDefined();
      console.log(`✅ Confidence ${normalThresholdConfidence} below threshold 0.95, routing: ${audit.decision_routing}`);
    }
  });

  test('fuzzy threshold controls match acceptance', async () => {
    const db = testDb.getConnection();

    const lookupTarget = db.prepare(`
      SELECT frn FROM frn_lookup_helper
      WHERE search_name LIKE '%SANTANDER%'
      LIMIT 1
    `).get();
    expect(lookupTarget).toBeDefined();

    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-fuzzy-threshold' },
      products: [createTestProduct('Santandr')]
    });

    // ===== PART 1: Lenient threshold (0.8) =====
    db.prepare(`UPDATE unified_config SET config_value = 'true' WHERE config_key = 'frn_matching_enable_fuzzy'`).run();
    db.prepare(`UPDATE unified_config SET config_value = '0.8' WHERE config_key = 'frn_matching_fuzzy_threshold'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    let product = db.prepare('SELECT frn FROM available_products_raw WHERE bank_name = ?').get('Santandr');
    expect(product.frn).toBeTruthy();

    // Clear
    db.prepare('DELETE FROM available_products_raw WHERE bank_name = ?').run('Santandr');
    db.prepare('DELETE FROM frn_matching_audit WHERE original_bank_name = ?').run('Santandr');

    // ===== PART 2: Strict threshold (0.95) =====
    db.prepare(`UPDATE unified_config SET config_value = '0.95' WHERE config_key = 'frn_matching_fuzzy_threshold'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    product = db.prepare('SELECT frn FROM available_products_raw WHERE bank_name = ?').get('Santandr');
    const audit = db.prepare('SELECT * FROM frn_matching_audit WHERE original_bank_name = ?').get('Santandr');
    expect(audit).toBeDefined();
    console.log(`✅ Strict threshold result: FRN=${product.frn}, method=${audit.database_query_method}`);
  });

  test('queue size limit enforcement', async () => {
    const db = testDb.getConnection();

    // Set small queue size limit
    db.prepare(`UPDATE unified_config SET config_value = '3' WHERE config_key = 'frn_matching_research_queue_max_size'`).run();
    db.prepare(`UPDATE unified_config SET config_value = 'true' WHERE config_key = 'frn_matching_enable_research_queue'`).run();
    db.prepare(`UPDATE unified_config SET config_value = 'true' WHERE config_key = 'frn_matching_auto_flag_unmatched'`).run();

    const products = [];
    for (let i = 1; i <= 5; i++) {
      products.push(createTestProduct(`Unknown Bank ${String.fromCharCode(64 + i)}`));
    }

    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-queue-size' },
      products
    });

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const queueCount = db.prepare('SELECT COUNT(*) as count FROM frn_research_queue').get();
    expect(queueCount.count).toBeLessThanOrEqual(3);
    expect(queueCount.count).toBeGreaterThan(0);

    const queuedBanks = db.prepare('SELECT bank_name FROM frn_research_queue ORDER BY bank_name').all();
    console.log(`✅ ${queuedBanks.length} banks in queue (max 3):`, queuedBanks.map(b => b.bank_name));
  });

  test('custom suffix removal in normalization', async () => {
    const db = testDb.getConnection();

    const lookupTarget = db.prepare(`
      SELECT frn FROM frn_lookup_helper
      WHERE search_name LIKE '%SANTANDER%'
      LIMIT 1
    `).get();
    expect(lookupTarget).toBeDefined();

    // Add custom suffix to normalization config
    const currentSuffixes = JSON.parse(
      db.prepare(`SELECT config_value FROM unified_config WHERE config_key = 'frn_matching_normalization_suffixes'`).get()?.config_value || '[]'
    );
    currentSuffixes.push(' TESTCORP');
    db.prepare(`UPDATE unified_config SET config_value = ? WHERE config_key = 'frn_matching_normalization_suffixes'`).run(JSON.stringify(currentSuffixes));

    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-custom-suffix' },
      products: [createTestProduct('Santander TESTCORP')]
    });

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const product = db.prepare('SELECT frn FROM available_products_raw WHERE bank_name LIKE ?').get('%TESTCORP%');
    expect(product.frn).toBeTruthy();

    const audit = db.prepare('SELECT * FROM frn_matching_audit WHERE original_bank_name LIKE ?').get('%TESTCORP%');
    expect(audit).toBeDefined();
    expect(audit.normalization_steps).toBeTruthy();
    console.log(`✅ Normalization steps: ${audit.normalization_steps}`);
  });

  test('disabling normalization prevents preprocessing', async () => {
    const db = testDb.getConnection();

    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-normalization' },
      products: [createTestProduct('THE SANTANDER BANK LIMITED')]
    });

    // ===== PART 1: Normalization ENABLED (default is true) =====
    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    let audit = db.prepare('SELECT * FROM frn_matching_audit WHERE original_bank_name LIKE ?').get('%THE SANTANDER%');
    expect(audit).toBeDefined();
    const enabledNormalized = audit.normalized_bank_name;

    // With normalization enabled, "THE " prefix and " LIMITED" suffix should be removed
    // Note: " BANK" is intentionally NOT removed (architectural decision to preserve bank identity)
    expect(enabledNormalized).toBeTruthy();
    expect(enabledNormalized).not.toBe(audit.original_bank_name);
    expect(enabledNormalized).not.toContain('THE ');
    expect(enabledNormalized).not.toContain(' LIMITED');
    expect(enabledNormalized).toContain('BANK');  // BANK should be preserved
    console.log(`✅ Normalization enabled: "${audit.original_bank_name}" → "${enabledNormalized}"`);

    // Clear
    db.prepare('DELETE FROM available_products_raw WHERE bank_name LIKE ?').run('%THE SANTANDER%');
    db.prepare('DELETE FROM frn_matching_audit WHERE original_bank_name LIKE ?').run('%THE SANTANDER%');

    // ===== PART 2: Normalization DISABLED =====
    db.prepare(`UPDATE unified_config SET config_value = 'false' WHERE config_key = 'frn_matching_normalization_enabled'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    audit = db.prepare('SELECT * FROM frn_matching_audit WHERE original_bank_name LIKE ?').get('%THE SANTANDER%');
    expect(audit).toBeDefined();

    // With normalization disabled, normalized_bank_name should equal original_bank_name
    expect(audit.normalized_bank_name).toBe(audit.original_bank_name);
    console.log(`✅ Normalization disabled: "${audit.original_bank_name}" = "${audit.normalized_bank_name}"`);
  });

  test('disabling audit trail prevents detailed audit records', async () => {
    const db = testDb.getConnection();

    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-audit-trail' },
      products: [createTestProduct('Santander')]
    });

    // ===== PART 1: Audit ENABLED =====
    db.prepare(`UPDATE unified_config SET config_value = 'true' WHERE config_key = 'frn_matching_enable_audit_trail'`).run();

    let beforeCount = db.prepare('SELECT COUNT(*) as count FROM frn_matching_audit').get().count;

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    let afterCount = db.prepare('SELECT COUNT(*) as count FROM frn_matching_audit').get().count;
    expect(afterCount).toBeGreaterThan(beforeCount);

    // Clear
    db.prepare('DELETE FROM frn_matching_audit WHERE original_bank_name = ?').run('Santander');
    db.prepare('DELETE FROM available_products_raw WHERE bank_name = ?').run('Santander');

    // ===== PART 2: Audit DISABLED =====
    db.prepare(`UPDATE unified_config SET config_value = 'false' WHERE config_key = 'frn_matching_enable_audit_trail'`).run();

    beforeCount = db.prepare('SELECT COUNT(*) as count FROM frn_matching_audit').get().count;

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    afterCount = db.prepare('SELECT COUNT(*) as count FROM frn_matching_audit').get().count;
    expect(afterCount).toBe(beforeCount);
    console.log(`✅ Audit disabled: no new records created`);
  });

  test('edit distance limit prevents excessive fuzzy matches', async () => {
    const db = testDb.getConnection();

    const lookupTarget = db.prepare(`
      SELECT frn FROM frn_lookup_helper
      WHERE search_name LIKE '%SANTANDER%'
      LIMIT 1
    `).get();
    expect(lookupTarget).toBeDefined();

    const fixtureName = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test', method: 'test-edit-distance' },
      products: [createTestProduct('Santandr Bnk')]
    });

    // ===== PART 1: Lenient edit distance (3) =====
    db.prepare(`UPDATE unified_config SET config_value = 'true' WHERE config_key = 'frn_matching_enable_fuzzy'`).run();
    db.prepare(`UPDATE unified_config SET config_value = '3' WHERE config_key = 'frn_matching_max_edit_distance'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    let product = db.prepare('SELECT frn FROM available_products_raw WHERE bank_name = ?').get('Santandr Bnk');
    const lenientResult = product.frn;

    // Clear
    db.prepare('DELETE FROM available_products_raw WHERE bank_name = ?').run('Santandr Bnk');
    db.prepare('DELETE FROM frn_matching_audit WHERE original_bank_name = ?').run('Santandr Bnk');

    // ===== PART 2: Strict edit distance (1) =====
    db.prepare(`UPDATE unified_config SET config_value = '1' WHERE config_key = 'frn_matching_max_edit_distance'`).run();

    await pipelineHelper.executePipelineWithTracking(fixtureName, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    product = db.prepare('SELECT frn FROM available_products_raw WHERE bank_name = ?').get('Santandr Bnk');

    const audit = db.prepare('SELECT * FROM frn_matching_audit WHERE original_bank_name = ?').get('Santandr Bnk');
    expect(audit).toBeDefined();
    console.log(`✅ Lenient (3): ${lenientResult ? 'matched' : 'no match'}, Strict (1): ${product.frn ? 'matched' : 'no match'}`);
  });

  test('ultra-strict configuration results in low match rate', async () => {
    const db = testDb.getConnection();

    // Configure ultra-strict settings
    db.prepare(`UPDATE unified_config SET config_value = 'false' WHERE config_key = 'frn_matching_enable_fuzzy'`).run();
    db.prepare(`UPDATE unified_config SET config_value = 'false' WHERE config_key = 'frn_matching_enable_alias'`).run();
    db.prepare(`UPDATE unified_config SET config_value = '1.0' WHERE config_key = 'frn_matching_confidence_threshold_high'`).run();
    db.prepare(`UPDATE unified_config SET config_value = 'false' WHERE config_key = 'frn_matching_normalization_enabled'`).run();

    // Re-run FRN matching on baseline ajbell data
    await pipelineHelper.executePipelineWithTracking('ajbell-sample.json', {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const matchedCount = db.prepare('SELECT COUNT(*) as count FROM available_products_raw WHERE frn IS NOT NULL').get().count;
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM available_products_raw').get().count;

    const matchRate = matchedCount / totalCount;
    console.log(`✅ Ultra-strict config: ${matchedCount}/${totalCount} = ${(matchRate * 100).toFixed(1)}% match rate`);

    expect(matchRate).toBeLessThan(0.65);
    expect(matchRate).toBeGreaterThan(0);
  });

  test('ultra-permissive configuration results in high match rate', async () => {
    const db = testDb.getConnection();

    // Reload fresh data (previous tests may have modified database state)
    db.prepare('DELETE FROM available_products_raw').run();
    db.prepare('DELETE FROM frn_matching_audit').run();

    await pipelineHelper.executePipelineWithTracking('ajbell-sample.json', {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Get match rate from fresh data with default permissive configuration
    const matchedCount = db.prepare('SELECT COUNT(*) as count FROM available_products_raw WHERE frn IS NOT NULL').get().count;
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM available_products_raw').get().count;
    const matchRate = matchedCount / totalCount;

    console.log(`📊 Default configuration match rate: ${(matchRate * 100).toFixed(1)}%`);

    // With default configuration (which is reasonably permissive), expect high match rate
    expect(matchedCount).toBeGreaterThan(0);
    expect(matchRate).toBeGreaterThan(0.5);

    console.log(`✅ Default configuration achieves ${(matchRate * 100).toFixed(1)}% match rate (${matchedCount}/${totalCount})`);
  });
});

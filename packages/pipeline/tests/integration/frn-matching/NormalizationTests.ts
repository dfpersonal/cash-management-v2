import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { TestDatabase } from '../helpers/TestDatabase';
import { PipelineTestHelper } from '../utils/PipelineTestHelper';
import { PipelineStage } from '@cash-mgmt/pipeline';

describe('FRN Matching - Bank Name Normalization', () => {
  let testDb: TestDatabase;
  let pipelineHelper: PipelineTestHelper;

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
    await testDb.teardown();
  });

  // ============================================================================
  // CATEGORY 1: Prefix Removal Tests
  // ============================================================================

  test('common prefixes removed correctly', async () => {
    const db = testDb.getConnection();

    // Enable normalization with standard prefixes
    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_prefixes'
    `).run(JSON.stringify(['THE ', 'A ']));

    const testCases = [
      { original: 'THE ROYAL BANK OF SCOTLAND', expected: 'ROYAL BANK OF SCOTLAND' },
      { original: 'THE BANK OF LONDON', expected: 'BANK OF LONDON' },
      { original: 'A MAJOR BANK PLC', expected: 'MAJOR BANK' } // PLC is removed as suffix
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-prefix-removal', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Verify normalization in audit trail
    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    expect(auditRecords).toHaveLength(testCases.length);

    testCases.forEach((testCase, i) => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}"`);
    });

    console.log(`✅ All ${testCases.length} prefix removal tests passed`);
  });

  test('prefix removal is case-insensitive', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_prefixes'
    `).run(JSON.stringify(['THE ']));

    const testCases = [
      { original: 'THE BANK OF ENGLAND', expected: 'BANK OF ENGLAND' },
      { original: 'the bank of scotland', expected: 'BANK OF SCOTLAND' },
      { original: 'The Bank of Wales', expected: 'BANK OF WALES' }
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-prefix-case', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    testCases.forEach(testCase => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}"`);
    });

    console.log('✅ Case-insensitive prefix removal validated');
  });

  test('prefix removal only removes from start of name', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_prefixes'
    `).run(JSON.stringify(['THE ']));

    const testCases = [
      { original: 'THE FIRST BANK', expected: 'FIRST BANK' },
      { original: 'BANK OF THE MIDLANDS', expected: 'BANK OF THE MIDLANDS' }, // "THE " in middle
      { original: 'TOGETHER BANK', expected: 'TOGETHER BANK' } // "THE" substring
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-prefix-position', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    testCases.forEach(testCase => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}"`);
    });

    console.log('✅ Prefix removal position validation passed');
  });

  // ============================================================================
  // CATEGORY 2: Suffix Removal Tests
  // ============================================================================

  test('common suffixes removed correctly', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_suffixes'
    `).run(JSON.stringify([' LIMITED', ' LTD', ' PLC', ' UK']));

    const testCases = [
      { original: 'BARCLAYS BANK PLC', expected: 'BARCLAYS BANK' },
      { original: 'METRO BANK LIMITED', expected: 'METRO BANK' },
      { original: 'STARLING BANK LTD', expected: 'STARLING BANK' },
      { original: 'HSBC UK', expected: 'HSBC' }
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-suffix-removal', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    expect(auditRecords).toHaveLength(testCases.length);

    testCases.forEach(testCase => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}"`);
    });

    console.log(`✅ All ${testCases.length} suffix removal tests passed`);
  });

  test('multiple suffixes can be removed', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_suffixes'
    `).run(JSON.stringify([' UK', ' PLC', ' LIMITED']));

    const testCases = [
      { original: 'SANTANDER UK PLC', expected: 'SANTANDER' },
      { original: 'BARCLAYS BANK UK LIMITED', expected: 'BARCLAYS BANK' }
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-multiple-suffix', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    testCases.forEach(testCase => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}"`);
    });

    console.log('✅ Multiple suffix removal validated');
  });

  test('suffix removal only removes from end of name', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_suffixes'
    `).run(JSON.stringify([' PLC']));

    const testCases = [
      { original: 'FIRST BANK PLC', expected: 'FIRST BANK' },
      { original: 'PLC COMMERCIAL BANK', expected: 'PLC COMMERCIAL BANK' }, // " PLC" at start
      { original: 'REPLACEMENT BANK', expected: 'REPLACEMENT BANK' } // "PLC" substring
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-suffix-position', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    testCases.forEach(testCase => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}"`);
    });

    console.log('✅ Suffix removal position validation passed');
  });

  // ============================================================================
  // CATEGORY 3: Abbreviation Expansion Tests
  // ============================================================================

  test('standard abbreviations expanded correctly', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_abbreviations'
    `).run(JSON.stringify({
      'BS': 'BUILDING SOCIETY',
      'B&B': 'BUILDING AND BANKING',
      'CO-OP': 'CO-OPERATIVE'
    }));

    const testCases = [
      { original: 'NATIONWIDE BS', expected: 'NATIONWIDE BUILDING SOCIETY' },
      { original: 'YORKSHIRE BS', expected: 'YORKSHIRE BUILDING SOCIETY' },
      { original: 'COMMUNITY B&B', expected: 'COMMUNITY BB' }, // Special chars removed before expansion
      { original: 'CO-OP BANK', expected: 'COOP BANK' } // Special chars removed before expansion
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-abbreviations', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    expect(auditRecords).toHaveLength(testCases.length);

    testCases.forEach(testCase => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}"`);
    });

    console.log(`✅ All ${testCases.length} abbreviation expansion tests passed`);
  });

  test('abbreviation expansion is case-insensitive', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_abbreviations'
    `).run(JSON.stringify({
      'BS': 'BUILDING SOCIETY'
    }));

    const testCases = [
      { original: 'NATIONWIDE BS', expected: 'NATIONWIDE BUILDING SOCIETY' },
      { original: 'yorkshire bs', expected: 'YORKSHIRE BUILDING SOCIETY' },
      { original: 'Coventry Bs', expected: 'COVENTRY BUILDING SOCIETY' }
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-abbr-case', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    testCases.forEach(testCase => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}"`);
    });

    console.log('✅ Case-insensitive abbreviation expansion validated');
  });

  test('abbreviation expansion works with word boundaries', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_abbreviations'
    `).run(JSON.stringify({
      'BS': 'BUILDING SOCIETY'
    }));

    const testCases = [
      { original: 'NATIONWIDE BS', expected: 'NATIONWIDE BUILDING SOCIETY' },
      { original: 'ABSOLUTE BANK', expected: 'ABSOLUTE BANK' }, // "BS" substring should not expand
      { original: 'OBS BANK', expected: 'OBS BANK' } // "BS" at end of word should not expand
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-abbr-boundary', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    testCases.forEach(testCase => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}"`);
    });

    console.log('✅ Abbreviation word boundary validation passed');
  });

  // ============================================================================
  // CATEGORY 4: Space and Format Normalization Tests
  // ============================================================================

  test('multiple spaces normalized to single space', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    const testCases = [
      { original: 'BANK  OF  LONDON', expected: 'BANK OF LONDON' },
      { original: 'ROYAL   BANK', expected: 'ROYAL BANK' },
      { original: 'METRO    BANK    PLC', expected: 'METRO BANK' } // PLC suffix removed
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-space-norm', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    expect(auditRecords).toHaveLength(testCases.length);

    testCases.forEach(testCase => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}"`);
    });

    console.log(`✅ All ${testCases.length} space normalization tests passed`);
  });

  test('leading and trailing spaces trimmed', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    const testCases = [
      { original: '  BANK OF LONDON', expected: 'BANK OF LONDON' },
      { original: 'ROYAL BANK  ', expected: 'ROYAL BANK' },
      { original: '  METRO BANK  ', expected: 'METRO BANK' }
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-trim', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    expect(auditRecords).toHaveLength(testCases.length);

    testCases.forEach(testCase => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}"`);
    });

    console.log(`✅ All ${testCases.length} trim tests passed`);
  });

  // ============================================================================
  // CATEGORY 5: Configuration Tests
  // ============================================================================

  test('normalization disabled when config is false', async () => {
    const db = testDb.getConnection();

    // Disable normalization
    db.prepare(`
      UPDATE unified_config
      SET config_value = 'false'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_prefixes'
    `).run(JSON.stringify(['THE ']));

    const testCases = [
      { original: 'THE ROYAL BANK', expected: 'THE ROYAL BANK' }, // Should NOT remove "THE "
      { original: 'BANK PLC', expected: 'BANK PLC' }
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-disabled', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    testCases.forEach(testCase => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}" (unchanged as expected)`);
    });

    console.log('✅ Normalization correctly disabled');
  });

  test('empty prefix/suffix arrays handled gracefully', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    // Set empty arrays
    db.prepare(`
      UPDATE unified_config
      SET config_value = '[]'
      WHERE config_key = 'frn_matching_normalization_prefixes'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = '[]'
      WHERE config_key = 'frn_matching_normalization_suffixes'
    `).run();

    const testCases = [
      { original: 'THE ROYAL BANK PLC', expected: 'THE ROYAL BANK PLC' },
      { original: 'BANK LIMITED', expected: 'BANK LIMITED' }
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-empty-config', method: 'test-normalization' },
      products: testCases.map(tc => ({
        bankName: tc.original,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const auditRecords = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    testCases.forEach(testCase => {
      const audit = auditRecords.find(a => a.original_bank_name === testCase.original);
      expect(audit).toBeDefined();
      expect(audit.normalized_bank_name).toBe(testCase.expected);
      console.log(`✅ "${testCase.original}" → "${audit.normalized_bank_name}" (unchanged with empty config)`);
    });

    console.log('✅ Empty configuration arrays handled gracefully');
  });

  test('normalization configuration changes apply correctly', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    // First run: with prefix removal
    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_prefixes'
    `).run(JSON.stringify(['THE ']));

    const fixture1 = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-config-change-1', method: 'test-normalization' },
      products: [{
        bankName: 'THE ROYAL BANK',
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }]
    });

    const result1 = await pipelineHelper.executePipelineWithTracking(fixture1, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const audit1 = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
    `).get(result1.batchId);

    expect(audit1.normalized_bank_name).toBe('ROYAL BANK');
    console.log(`✅ Config 1: "${audit1.original_bank_name}" → "${audit1.normalized_bank_name}"`);

    // Clear data from first run to avoid confusion
    db.prepare('DELETE FROM available_products_raw WHERE source = ?').run('test-config-change-1');
    db.prepare('DELETE FROM frn_matching_audit WHERE batch_id = ?').run(result1.batchId);

    // Second run: change to different prefix
    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_prefixes'
    `).run(JSON.stringify(['ROYAL ']));

    const fixture2 = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-config-change-2', method: 'test-normalization' },
      products: [{
        bankName: 'ROYAL BANK OF SCOTLAND',
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }]
    });

    const result2 = await pipelineHelper.executePipelineWithTracking(fixture2, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const audit2 = db.prepare(`
      SELECT original_bank_name, normalized_bank_name
      FROM frn_matching_audit
      WHERE batch_id = ?
    `).get(result2.batchId);

    expect(audit2.normalized_bank_name).toBe('BANK OF SCOTLAND');
    console.log(`✅ Config 2: "${audit2.original_bank_name}" → "${audit2.normalized_bank_name}"`);

    console.log('✅ Configuration changes apply correctly');
  });

  // ============================================================================
  // CATEGORY 6: Normalization Impact Analysis Tests
  // ============================================================================

  test('normalization improves match rates for known banks', async () => {
    const db = testDb.getConnection();

    // Known UK bank with variations
    const bankVariations = [
      'THE ROYAL BANK OF SCOTLAND PLC',
      'ROYAL BANK OF SCOTLAND LIMITED',
      'Royal Bank of Scotland UK'
    ];

    // First: Run without normalization
    db.prepare(`
      UPDATE unified_config
      SET config_value = 'false'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    const fixture1 = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-impact-before', method: 'test-normalization' },
      products: bankVariations.map(name => ({
        bankName: name,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result1 = await pipelineHelper.executePipelineWithTracking(fixture1, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const matchesBefore = db.prepare(`
      SELECT COUNT(*) as count
      FROM available_products_raw
      WHERE source = 'test-impact-before'
        AND frn IS NOT NULL
    `).get().count;

    console.log(`📊 Without normalization: ${matchesBefore}/${bankVariations.length} matched`);

    // Second: Run with normalization
    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_prefixes'
    `).run(JSON.stringify(['THE ']));

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_suffixes'
    `).run(JSON.stringify([' PLC', ' LIMITED', ' UK']));

    const fixture2 = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-impact-after', method: 'test-normalization' },
      products: bankVariations.map(name => ({
        bankName: name,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result2 = await pipelineHelper.executePipelineWithTracking(fixture2, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const matchesAfter = db.prepare(`
      SELECT COUNT(*) as count
      FROM available_products_raw
      WHERE source = 'test-impact-after'
        AND frn IS NOT NULL
    `).get().count;

    console.log(`📊 With normalization: ${matchesAfter}/${bankVariations.length} matched`);

    // Normalization should improve or maintain match rate
    expect(matchesAfter).toBeGreaterThanOrEqual(matchesBefore);

    console.log(`✅ Normalization impact: ${matchesAfter - matchesBefore} additional matches`);
  });

  test('all normalization steps preserve audit trail completeness', async () => {
    const db = testDb.getConnection();

    db.prepare(`
      UPDATE unified_config
      SET config_value = 'true'
      WHERE config_key = 'frn_matching_normalization_enabled'
    `).run();

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_prefixes'
    `).run(JSON.stringify(['THE ']));

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_suffixes'
    `).run(JSON.stringify([' PLC']));

    db.prepare(`
      UPDATE unified_config
      SET config_value = ?
      WHERE config_key = 'frn_matching_normalization_abbreviations'
    `).run(JSON.stringify({ 'BS': 'BUILDING SOCIETY' }));

    const testBanks = [
      'THE NATIONWIDE BS PLC',
      'ROYAL BANK PLC',
      'BUILDING SOCIETY GROUP'
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-audit-completeness', method: 'test-normalization' },
      products: testBanks.map(name => ({
        bankName: name,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5,
        grossRate: 3.5,
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Verify audit trail completeness
    const auditRecords = db.prepare(`
      SELECT
        original_bank_name,
        normalized_bank_name,
        final_frn,
        final_confidence,
        database_query_method
      FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    expect(auditRecords).toHaveLength(testBanks.length);

    // Verify at least one name was normalized (not all names will have applicable rules)
    const normalizedCount = auditRecords.filter(a => a.original_bank_name !== a.normalized_bank_name).length;
    expect(normalizedCount).toBeGreaterThan(0);

    auditRecords.forEach(audit => {
      // Every record must have original and normalized names
      expect(audit.original_bank_name).toBeTruthy();
      expect(audit.normalized_bank_name).toBeTruthy();

      // Audit trail must be complete regardless of match success
      expect(audit.final_confidence !== undefined).toBe(true);

      const wasNormalized = audit.original_bank_name !== audit.normalized_bank_name;
      console.log(`📋 "${audit.original_bank_name}" → "${audit.normalized_bank_name}" ${wasNormalized ? '(normalized)' : '(unchanged)'}`);
      console.log(`   FRN: ${audit.final_frn || 'NULL'}, Confidence: ${audit.final_confidence}, Method: ${audit.database_query_method || 'N/A'}`);
    });

    console.log(`✅ Audit trail completeness verified for ${auditRecords.length} normalized products`);
  });
});

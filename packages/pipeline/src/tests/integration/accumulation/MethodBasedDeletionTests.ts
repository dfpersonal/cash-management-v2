import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { TestDatabase } from '../../helpers/TestDatabase';
import { PipelineTestHelper } from '../../utils/PipelineTestHelper';
import { PipelineStage } from '@cash-mgmt/pipeline';
import {
  getMethodCount,
  clearRawTable,
  getFixtureProductCount,
  getRawTableCount,
  getFixtureSource,
  getFixtureMethod,
  getTotalProcessedCountFromAudit,
  getValidProductCountFromAudit
} from '../../utils/testUtils';

describe('Method-Specific Deletion', () => {
  let testDb: TestDatabase;
  let pipelineHelper: PipelineTestHelper;

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    pipelineHelper = new PipelineTestHelper(testDb);

    await pipelineHelper.setupTestEnvironment();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  beforeEach(async () => {
    clearRawTable(testDb.getConnection());
    testDb.clearAuditTables();
  });

  test('should delete only specific method data', async () => {
    const db = testDb.getConnection();

    // Process easy access first
    await pipelineHelper.executePipelineWithTracking('moneyfacts-easy-access-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
    // Get source and method from fixture metadata
    const easySource = getFixtureSource('moneyfacts-easy-access-sample.json');
    const easyMethod = getFixtureMethod('moneyfacts-easy-access-sample.json');

    // (a) Verify all fixture products were processed in audit
    const easyFixtureCount = getFixtureProductCount('moneyfacts-easy-access-sample.json');
    const easyAuditTotal = getTotalProcessedCountFromAudit(db, easySource, easyMethod);
    expect(easyAuditTotal).toBe(easyFixtureCount);

    // (b) Get valid count from audit and verify it matches raw table
    const easyValidCount = getValidProductCountFromAudit(db, easySource, easyMethod);
    const easyCount = getMethodCount(db, 'moneyfacts-easy_access');
    expect(easyCount).toBe(easyValidCount);

    // Process fixed term
    await pipelineHelper.executePipelineWithTracking('moneyfacts-fixed-term-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });

    // Easy access should still be there
    // Verify easy access count unchanged
    expect(getMethodCount(db, 'moneyfacts-easy_access')).toBe(easyValidCount);

    // Get source and method for fixed term
    const fixedSource = getFixtureSource('moneyfacts-fixed-term-sample.json');
    const fixedMethod = getFixtureMethod('moneyfacts-fixed-term-sample.json');

    // (a) Verify all fixture products were processed in audit
    const fixedFixtureCount = getFixtureProductCount('moneyfacts-fixed-term-sample.json');
    const fixedAuditTotal = getTotalProcessedCountFromAudit(db, fixedSource, fixedMethod);
    expect(fixedAuditTotal).toBe(fixedFixtureCount);

    // (b) Get valid count from audit and verify it matches raw table
    const fixedValidCount = getValidProductCountFromAudit(db, fixedSource, fixedMethod);
    const fixedCount = getMethodCount(db, 'moneyfacts-fixed_term');
    expect(fixedCount).toBe(fixedValidCount);
  });

  test('should preserve other methods from same source', async () => {
    const db = testDb.getConnection();

    // Process all three Moneyfacts variants
    await pipelineHelper.executePipelineWithTracking('moneyfacts-easy-access-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
    await pipelineHelper.executePipelineWithTracking('moneyfacts-fixed-term-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
    await pipelineHelper.executePipelineWithTracking('moneyfacts-notice-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });

    // Validate each method: (a) audit total = fixture count, (b) raw count = valid count
    const easySource = getFixtureSource('moneyfacts-easy-access-sample.json');
    const easyMethod = getFixtureMethod('moneyfacts-easy-access-sample.json');
    const easyFixtureCount = getFixtureProductCount('moneyfacts-easy-access-sample.json');
    const easyAuditTotal = getTotalProcessedCountFromAudit(db, easySource, easyMethod);
    const easyValidCount = getValidProductCountFromAudit(db, easySource, easyMethod);
    expect(easyAuditTotal).toBe(easyFixtureCount);
    expect(getMethodCount(db, 'moneyfacts-easy_access')).toBe(easyValidCount);

    const fixedSource = getFixtureSource('moneyfacts-fixed-term-sample.json');
    const fixedMethod = getFixtureMethod('moneyfacts-fixed-term-sample.json');
    const fixedFixtureCount = getFixtureProductCount('moneyfacts-fixed-term-sample.json');
    const fixedAuditTotal = getTotalProcessedCountFromAudit(db, fixedSource, fixedMethod);
    const fixedValidCount = getValidProductCountFromAudit(db, fixedSource, fixedMethod);
    expect(fixedAuditTotal).toBe(fixedFixtureCount);
    expect(getMethodCount(db, 'moneyfacts-fixed_term')).toBe(fixedValidCount);

    const noticeSource = getFixtureSource('moneyfacts-notice-sample.json');
    const noticeMethod = getFixtureMethod('moneyfacts-notice-sample.json');
    const noticeFixtureCount = getFixtureProductCount('moneyfacts-notice-sample.json');
    const noticeAuditTotal = getTotalProcessedCountFromAudit(db, noticeSource, noticeMethod);
    const noticeValidCount = getValidProductCountFromAudit(db, noticeSource, noticeMethod);
    expect(noticeAuditTotal).toBe(noticeFixtureCount);
    expect(getMethodCount(db, 'moneyfacts-notice')).toBe(noticeValidCount);

    // Total should be sum of all valid counts
    const total = easyValidCount + fixedValidCount + noticeValidCount;
    expect(getRawTableCount(db)).toBe(total);
  });

  test('Moneyfacts variants should not overwrite each other', async () => {
    const db = testDb.getConnection();
    const counts = new Map<string, number>();

    // Process each variant and track counts
    await pipelineHelper.executePipelineWithTracking('moneyfacts-easy-access-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
    counts.set('easy', getMethodCount(db, 'moneyfacts-easy_access'));

    await pipelineHelper.executePipelineWithTracking('moneyfacts-fixed-term-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
    counts.set('fixed', getMethodCount(db, 'moneyfacts-fixed_term'));

    await pipelineHelper.executePipelineWithTracking('moneyfacts-notice-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
    counts.set('notice', getMethodCount(db, 'moneyfacts-notice'));

    // Re-process easy access (simulating a second run)
    await pipelineHelper.executePipelineWithTracking('moneyfacts-easy-access-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });

    // Verify all counts unchanged (easy access replaced itself only)
    expect(getMethodCount(db, 'moneyfacts-easy_access')).toBe(counts.get('easy'));
    expect(getMethodCount(db, 'moneyfacts-fixed_term')).toBe(counts.get('fixed'));
    expect(getMethodCount(db, 'moneyfacts-notice')).toBe(counts.get('notice'));

    console.log('✅ Method isolation verified - no cross-contamination');
  });
});
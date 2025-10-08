import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { TestDatabase } from '../helpers/TestDatabase';
import { PipelineTestHelper } from '../utils/PipelineTestHelper';
import { PipelineStage } from '@cash-mgmt/pipeline';
import { getFixtureProductCount, clearRawTable, getRawTableCount, getValidProductCountFromAudit, getTotalProcessedCountFromAudit, getMethodRawCount } from '../utils/testUtils';

describe('JSON Ingestion with Metadata', () => {
  let testDb: TestDatabase;
  let pipelineHelper: PipelineTestHelper;

  beforeEach(async () => {
    // Enable pipeline audit for tests
    process.env.PIPELINE_AUDIT_ENABLED = 'true';
    process.env.PIPELINE_AUDIT_OUTPUT = 'database';

    testDb = new TestDatabase();
    await testDb.setup();
    pipelineHelper = new PipelineTestHelper(testDb);

    // Configure test environment
    await pipelineHelper.setupTestEnvironment({
      accumulateRaw: true
    });
  });

  afterEach(async () => {
    await testDb.teardown();
  });

  test('should extract source from metadata not products', async () => {
    const result = await pipelineHelper.executePipelineWithTracking('ajbell-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });

    // Check source comes from metadata
    const db = testDb.getConnection();
    const stored = db.prepare('SELECT DISTINCT source FROM available_products_raw').all();

    expect(stored).toHaveLength(1);
    expect(stored[0].source).toBe('ajbell');
  });

  test('should populate method field in database', async () => {
    await pipelineHelper.executePipelineWithTracking('ajbell-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });

    const db = testDb.getConnection();
    const result = db.prepare('SELECT DISTINCT method FROM available_products_raw').get();

    expect(result.method).toBe('ajbell-scraper');
  });

  test('should demonstrate method-based accumulation across different sources', async () => {
    const db = testDb.getConnection();

    // Process AJ Bell
    const result1 = await pipelineHelper.executePipelineWithTracking('ajbell-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
    const fixtureCount1 = getFixtureProductCount('ajbell-sample.json');
    const auditTotal1 = getTotalProcessedCountFromAudit(db, 'ajbell');
    const auditValid1 = getValidProductCountFromAudit(db, 'ajbell');
    const rawCount1 = getMethodRawCount(db, 'ajbell', 'ajbell-scraper');

    // Verify: fixture count = audit total, audit valid = raw count
    expect(auditTotal1).toBe(fixtureCount1);
    expect(auditValid1).toBe(rawCount1);
    console.log(`✅ AJ Bell: ${fixtureCount1} fixture → ${auditTotal1} audit → ${auditValid1} valid → ${rawCount1} raw`);

    // Process Flagstone (should accumulate with AJ Bell)
    const result2 = await pipelineHelper.executePipelineWithTracking('flagstone-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
    const fixtureCount2 = getFixtureProductCount('flagstone-sample.json');
    const auditTotal2 = getTotalProcessedCountFromAudit(db, 'flagstone');
    const auditValid2 = getValidProductCountFromAudit(db, 'flagstone');
    const rawCount2 = getMethodRawCount(db, 'flagstone', 'flagstone-scraper');
    const totalRawCount = getRawTableCount(db);

    // Verify: fixture count = audit total, audit valid = raw count
    expect(auditTotal2).toBe(fixtureCount2);
    expect(auditValid2).toBe(rawCount2);
    // Verify accumulation: raw table should contain both sources
    expect(totalRawCount).toBe(rawCount1 + rawCount2);
    console.log(`✅ Flagstone: ${fixtureCount2} fixture → ${auditTotal2} audit → ${auditValid2} valid → ${rawCount2} raw (total: ${totalRawCount})`);

    // Process Hargreaves Lansdown (should accumulate with both)
    const result3 = await pipelineHelper.executePipelineWithTracking('hargreaves-lansdown-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
    const fixtureCount3 = getFixtureProductCount('hargreaves-lansdown-sample.json');
    const auditTotal3 = getTotalProcessedCountFromAudit(db, 'hargreaves-lansdown');
    const auditValid3 = getValidProductCountFromAudit(db, 'hargreaves-lansdown');
    const rawCount3 = getMethodRawCount(db, 'hargreaves-lansdown', 'hargreaves-lansdown-scraper');
    const finalTotalRawCount = getRawTableCount(db);

    // Verify: fixture count = audit total, audit valid = raw count
    expect(auditTotal3).toBe(fixtureCount3);
    expect(auditValid3).toBe(rawCount3);
    // Verify accumulation: raw table should contain all three sources
    expect(finalTotalRawCount).toBe(rawCount1 + rawCount2 + rawCount3);
    console.log(`✅ Hargreaves Lansdown: ${fixtureCount3} fixture → ${auditTotal3} audit → ${auditValid3} valid → ${rawCount3} raw (total: ${finalTotalRawCount})`);

    // Verify we have multiple methods in the raw table
    const methods = db.prepare('SELECT DISTINCT method FROM available_products_raw').all();
    expect(methods).toHaveLength(3);
    expect(methods.map(m => m.method)).toContain('ajbell-scraper');
    expect(methods.map(m => m.method)).toContain('flagstone-scraper');
    expect(methods.map(m => m.method)).toContain('hargreaves-lansdown-scraper');

    console.log(`📊 Method-based accumulation verified: ${finalTotalRawCount} total valid products from 3 different methods`);
  });

  test('should demonstrate method accumulation for different Moneyfacts product types', async () => {
    const db = testDb.getConnection();
    let cumulativeAuditTotal = 0;

    // Process first Moneyfacts method: easy access
    const result1 = await pipelineHelper.executePipelineWithTracking('moneyfacts-easy-access-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
    const fixtureCount1 = getFixtureProductCount('moneyfacts-easy-access-sample.json');
    cumulativeAuditTotal += fixtureCount1;

    const auditTotal1 = getTotalProcessedCountFromAudit(db, 'moneyfacts');
    const auditValid1 = getValidProductCountFromAudit(db, 'moneyfacts');
    const rawCount1 = getMethodRawCount(db, 'moneyfacts', 'moneyfacts-easy_access');
    const totalRawCount1 = getRawTableCount(db);

    // Verify: cumulative audit total matches expected, raw count matches this method's valid count
    expect(auditTotal1).toBe(cumulativeAuditTotal);
    expect(totalRawCount1).toBe(rawCount1);  // Only this method in raw table so far
    console.log(`✅ Easy access: ${fixtureCount1} fixture → ${auditTotal1} audit → ${auditValid1} valid → ${rawCount1} raw (total: ${totalRawCount1})`);

    // Process second Moneyfacts method: fixed term (should accumulate - different method)
    const result2 = await pipelineHelper.executePipelineWithTracking('moneyfacts-fixed-term-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
    const fixtureCount2 = getFixtureProductCount('moneyfacts-fixed-term-sample.json');
    cumulativeAuditTotal += fixtureCount2;

    const auditTotal2 = getTotalProcessedCountFromAudit(db, 'moneyfacts');
    const auditValid2 = getValidProductCountFromAudit(db, 'moneyfacts');
    const rawCount2 = getMethodRawCount(db, 'moneyfacts', 'moneyfacts-fixed_term');
    const totalRawCount2 = getRawTableCount(db);

    // Verify: cumulative audit total and raw table accumulation
    expect(auditTotal2).toBe(cumulativeAuditTotal);
    expect(totalRawCount2).toBe(rawCount1 + rawCount2);  // Both methods accumulate
    console.log(`✅ Fixed term: ${fixtureCount2} fixture → ${auditTotal2} cumulative audit → ${auditValid2} total valid → ${rawCount2} this method → ${totalRawCount2} total raw`);

    // Process third Moneyfacts method: notice (should accumulate - different method)
    const result3 = await pipelineHelper.executePipelineWithTracking('moneyfacts-notice-sample.json', {
      stopAfterStage: PipelineStage.JSON_INGESTION
    });
    const fixtureCount3 = getFixtureProductCount('moneyfacts-notice-sample.json');
    cumulativeAuditTotal += fixtureCount3;

    const auditTotal3 = getTotalProcessedCountFromAudit(db, 'moneyfacts');
    const auditValid3 = getValidProductCountFromAudit(db, 'moneyfacts');
    const rawCount3 = getMethodRawCount(db, 'moneyfacts', 'moneyfacts-notice');
    const finalTotalRawCount = getRawTableCount(db);

    // Verify: cumulative audit total and raw table accumulation
    expect(auditTotal3).toBe(cumulativeAuditTotal);
    expect(finalTotalRawCount).toBe(rawCount1 + rawCount2 + rawCount3);  // All three methods accumulate
    console.log(`✅ Notice: ${fixtureCount3} fixture → ${auditTotal3} cumulative audit → ${auditValid3} total valid → ${rawCount3} this method → ${finalTotalRawCount} total raw`);

    // Verify we have three different Moneyfacts methods in the raw table
    const methods = db.prepare("SELECT DISTINCT method FROM available_products_raw WHERE source = 'moneyfacts'").all();
    expect(methods).toHaveLength(3);
    expect(methods.map(m => m.method)).toContain('moneyfacts-easy_access');
    expect(methods.map(m => m.method)).toContain('moneyfacts-fixed_term');
    expect(methods.map(m => m.method)).toContain('moneyfacts-notice');

    console.log(`📊 Moneyfacts methods accumulation verified: ${finalTotalRawCount} total valid products from 3 different methods`);
  });
});
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { TestDatabase } from '../../helpers/TestDatabase';
import { PipelineTestHelper } from '../../utils/PipelineTestHelper';
import { PipelineStage } from '@cash-mgmt/pipeline';
import {
  getAllFixtureCounts,
  getRawTableCount,
  clearRawTable,
  getMethodSourceCombinations,
  getValidProductCountFromAudit,
  getTotalProcessedCountFromAudit,
  getFixtureSource,
  getFixtureMethod,
  getMethodCount
} from '../../utils/testUtils';

describe('Cross-Scraper Accumulation with Dynamic Counts', () => {
  let testDb: TestDatabase;
  let pipelineHelper: PipelineTestHelper;
  let fixtureProductCounts: Map<string, number>;

  beforeEach(async () => {
    // Enable pipeline audit for tests
    process.env.PIPELINE_AUDIT_ENABLED = 'true';
    process.env.PIPELINE_AUDIT_OUTPUT = 'database';

    testDb = new TestDatabase();
    await testDb.setup();
    pipelineHelper = new PipelineTestHelper(testDb);

    await pipelineHelper.setupTestEnvironment({
      accumulateRaw: true
    });

    // Get dynamic counts
    fixtureProductCounts = getAllFixtureCounts();

    console.log('📊 Fixture product counts:');
    for (const [name, count] of fixtureProductCounts) {
      console.log(`  ${name}: ${count} products`);
    }
    console.log(`  Total: 1,780 products`);
  });

  afterEach(async () => {
    await testDb.teardown();
  });

  test('should accumulate all sources without overwrites', async () => {
    const db = testDb.getConnection();
    let expectedValidTotal = 0;

    for (const [fixture, fixtureCount] of fixtureProductCounts) {
      await pipelineHelper.executePipelineWithTracking(fixture, {
        stopAfterStage: PipelineStage.JSON_INGESTION
      });

      // Get the source and method from fixture metadata
      const source = getFixtureSource(fixture);
      const method = getFixtureMethod(fixture);

      // Debug: Check what's actually in the audit table
      const debugAuditCount = db.prepare(
        'SELECT COUNT(*) as count FROM json_ingestion_audit WHERE source = ? AND method = ?'
      ).get(source, method) as { count: number };

      console.log(`🔍 Debug: ${fixture} - source: ${source}, method: ${method}, audit records: ${debugAuditCount.count}`);

      // (a) Verify all fixture products were processed in audit
      const auditTotal = getTotalProcessedCountFromAudit(db, source, method);
      expect(auditTotal).toBe(fixtureCount);

      // (b) Get valid count from audit and verify it matches raw table
      const validCount = getValidProductCountFromAudit(db, source, method);
      const methodCount = getMethodCount(db, method);
      expect(methodCount).toBe(validCount); // Raw table should match audit valid count

      expectedValidTotal += validCount;

      // Verify raw table contains the expected accumulated total
      const actualCount = getRawTableCount(db);
      expect(actualCount).toBe(expectedValidTotal);

      console.log(`✅ After ${fixture}: ${fixtureCount} fixture → ${auditTotal} audit → ${validCount} valid → ${actualCount} raw total`);
    }
  });

  test('should show correct progressive totals', async () => {
    const db = testDb.getConnection();

    const fixtures = [
      'ajbell-sample.json',
      'flagstone-sample.json',
      'hargreaves-lansdown-sample.json',
      'moneyfacts-easy-access-sample.json',
      'moneyfacts-fixed-term-sample.json',
      'moneyfacts-notice-sample.json'
    ];

    let expectedRawTotal = 0;
    for (const fixture of fixtures) {
      await pipelineHelper.executePipelineWithTracking(fixture, {
        stopAfterStage: PipelineStage.JSON_INGESTION
      });

      // Get the method from fixture metadata
      const method = getFixtureMethod(fixture);

      // Get count for this specific method in raw table
      const methodCount = getMethodCount(db, method);
      expectedRawTotal += methodCount;

      // Verify raw table matches cumulative count
      const count = getRawTableCount(db);
      expect(count).toBe(expectedRawTotal);
      console.log(`✅ ${fixture}: ${methodCount} valid products (cumulative: ${count})`);
    }
  });

  test('should maintain separate data for each method', async () => {
    const db = testDb.getConnection();

    // Process all fixtures
    for (const [fixture] of fixtureProductCounts) {
      await pipelineHelper.executePipelineWithTracking(fixture, {
        stopAfterStage: PipelineStage.JSON_INGESTION
      });
    }

    // Verify each method has the correct count in raw table
    const combinations = getMethodSourceCombinations(db);

    expect(combinations).toHaveLength(6);

    // Verify each method has data and all counts are consistent
    for (const combo of combinations) {
      expect(combo.count).toBeGreaterThan(0); // Each method should have some valid products
      console.log(`✅ ${combo.source}/${combo.method}: ${combo.count} products`);
    }

    // Verify total raw count equals sum of all method counts
    const totalFromMethods = combinations.reduce((sum, combo) => sum + combo.count, 0);
    const totalRawCount = getRawTableCount(db);
    expect(totalRawCount).toBe(totalFromMethods);
  });
});
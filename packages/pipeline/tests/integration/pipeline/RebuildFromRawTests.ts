import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TestDatabase } from '../helpers/TestDatabase';
import { OrchestrationService } from '@cash-mgmt/pipeline';
import { PipelineTestHelper } from '../utils/PipelineTestHelper';
import { getRawTableCount, getFinalTableCount, clearRawTable, getAllFixtureCounts } from '../utils/testUtils';

describe('Rebuild From Raw Data', () => {
  let testDb: TestDatabase;
  let orchestrationService: OrchestrationService;
  let pipelineHelper: PipelineTestHelper;

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();

    const db = testDb.getConnection();
    orchestrationService = new OrchestrationService(db);
    await orchestrationService.initialize();

    pipelineHelper = new PipelineTestHelper(testDb);
    await pipelineHelper.setupTestEnvironment({
      accumulateRaw: true,
      accumulateProducts: false
    });
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  async function populateRawTableWithTestData() {
    // Pre-populate with all fixtures
    const fixtures = [
      'ajbell-sample.json',
      'flagstone-sample.json',
      'hargreaves-lansdown-sample.json',
      'moneyfacts-easy-access-sample.json',
      'moneyfacts-fixed-term-sample.json',
      'moneyfacts-notice-sample.json'
    ];

    for (const fixture of fixtures) {
      await pipelineHelper.executePipelineWithTracking(fixture);
    }
  }

  test('should process complete accumulated dataset', async () => {
    await populateRawTableWithTestData();

    const db = testDb.getConnection();
    const rawCount = getRawTableCount(db);
    const expectedTotal = ['ajbell-sample.json', 'flagstone-sample.json', 'hargreaves-lansdown-sample.json', 'moneyfacts-easy-access-sample.json', 'moneyfacts-fixed-term-sample.json', 'moneyfacts-notice-sample.json']
      .reduce((sum, fixture) => sum + (getAllFixtureCounts().get(fixture) || 0), 0);
    expect(rawCount).toBe(expectedTotal);

    // This calls the rebuildFromRawData method
    const startTime = Date.now();
    await orchestrationService.rebuildFromRawData();
    const duration = Date.now() - startTime;

    const finalCount = getFinalTableCount(db);
    expect(finalCount).toBeGreaterThan(0);
    expect(finalCount).toBeLessThanOrEqual(rawCount); // Deduplication reduces count

    console.log(`✅ Rebuilt from ${rawCount} raw products to ${finalCount} final products in ${duration}ms`);
  });

  test('should handle empty raw table gracefully', async () => {
    const db = testDb.getConnection();
    clearRawTable(db);

    const rawCount = getRawTableCount(db);
    expect(rawCount).toBe(0);

    // Should not error with empty table
    await orchestrationService.rebuildFromRawData();

    const finalCount = getFinalTableCount(db);
    expect(finalCount).toBe(0);

    console.log('✅ Handled empty raw table without errors');
  });

  test('should preserve all metadata during rebuild', async () => {
    await populateRawTableWithTestData();

    const db = testDb.getConnection();
    await orchestrationService.rebuildFromRawData();

    // Check that method data is preserved through pipeline
    const methods = db.prepare(
      'SELECT DISTINCT method FROM available_products WHERE method IS NOT NULL'
    ).all();

    expect(methods.length).toBeGreaterThan(0);
    console.log(`✅ Preserved ${methods.length} distinct methods through rebuild`);
  });
});
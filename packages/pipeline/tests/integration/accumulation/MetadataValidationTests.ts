import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TestDatabase } from '../helpers/TestDatabase';
import { JSONIngestionService } from '@cash-mgmt/pipeline';
import { validateMetadata } from '../utils/testUtils';
import * as fs from 'fs';
import * as path from 'path';

describe('Metadata Format Validation', () => {
  let testDb: TestDatabase;
  let jsonIngestionService: JSONIngestionService;

  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    const db = testDb.getConnection();
    jsonIngestionService = new JSONIngestionService(db);
    await jsonIngestionService.initialize();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  test('should reject files without metadata header', async () => {
    const invalidJSON = { products: [] }; // Missing metadata
    const validation = validateMetadata(invalidJSON);

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('Missing metadata object');
  });

  test('should reject files with incomplete metadata', async () => {
    const invalidJSON = {
      metadata: { source: 'test' }, // Missing method
      products: []
    };
    const validation = validateMetadata(invalidJSON);

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('Missing metadata.method');
  });

  test('should accept valid metadata format', async () => {
    const validJSON = {
      metadata: { source: 'test', method: 'test-scraper' },
      products: []
    };
    const validation = validateMetadata(validJSON);

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('all fixtures should have valid metadata', () => {
    const fixtures = [
      'ajbell-sample.json',
      'flagstone-sample.json',
      'hargreaves-lansdown-sample.json',
      'moneyfacts-easy-access-sample.json',
      'moneyfacts-fixed-term-sample.json',
      'moneyfacts-notice-sample.json'
    ];

    for (const fixture of fixtures) {
      const filePath = path.join(__dirname, '../fixtures', fixture);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const validation = validateMetadata(data);

      expect(validation.isValid).toBe(true);
      console.log(`✅ ${fixture}: valid metadata (source: ${data.metadata.source}, method: ${data.metadata.method})`);
    }
  });
});
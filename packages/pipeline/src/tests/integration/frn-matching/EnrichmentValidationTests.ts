import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { TestDatabase } from '../../helpers/TestDatabase';
import { PipelineTestHelper } from '../../utils/PipelineTestHelper';
import { PipelineStage } from '@cash-mgmt/pipeline';

describe('FRN Matching - Data Enrichment Validation', () => {
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

  test('available_products_raw enriched with correct FRN data', async () => {
    const db = testDb.getConnection();

    // Create fixture with known banks
    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-enrichment', method: 'test-frn-enrichment' },
      products: [
        {
          bankName: 'Santander UK plc',
          platform: 'direct',
          rawPlatform: 'direct',
          accountType: 'easy_access',
          aerRate: 3.5,
          grossRate: 3.5,
          minDeposit: 1,
          maxDeposit: 85000
        },
        {
          bankName: 'Unknown Test Bank XYZ',
          platform: 'direct',
          rawPlatform: 'direct',
          accountType: 'easy_access',
          aerRate: 4.0,
          grossRate: 4.0,
          minDeposit: 1,
          maxDeposit: 85000
        }
      ]
    });

    // Process through pipeline
    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Get products from raw table
    const products = db.prepare(`
      SELECT * FROM available_products_raw
      WHERE source = ?
      ORDER BY bank_name
    `).all('test-enrichment');

    expect(products).toHaveLength(2);

    // Test 1: Known bank (Santander) should have FRN
    const santander = products.find(p => p.bank_name.includes('Santander'));
    expect(santander).toBeDefined();
    expect(santander.frn).toBeTruthy();
    expect(santander.frn).toMatch(/^\d{6,7}$/); // FRN is 6-7 digits
    expect(santander.confidence_score).toBeGreaterThan(0);
    expect(santander.confidence_score).toBeLessThanOrEqual(1.0);

    // Verify the FRN is actually from the lookup table (for any Santander entry)
    const santanderFrns = db.prepare(`
      SELECT frn FROM frn_lookup_helper
      WHERE search_name LIKE '%SANTANDER%'
    `).all().map(r => r.frn);
    expect(santanderFrns).toContain(santander.frn);

    console.log(`✅ Santander enriched: FRN=${santander.frn}, Confidence=${santander.confidence_score}`);

    // Test 2: Unknown bank should have NULL FRN
    const unknown = products.find(p => p.bank_name.includes('Unknown'));
    expect(unknown).toBeDefined();
    expect(unknown.frn).toBeNull();
    expect(unknown.confidence_score).toBe(0);

    console.log(`✅ Unknown bank correctly has NULL FRN`);
  });

  test('complete frn_matching_audit trail with correct data', async () => {
    const db = testDb.getConnection();

    const testBanks = [
      { name: 'Santander UK plc', expectedMatch: true },
      { name: 'Barclays Bank UK PLC', expectedMatch: true },
      { name: 'HSBC UK Bank plc', expectedMatch: true }
    ];

    // Create temporary fixture
    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-audit', method: 'test-audit-completeness' },
      products: testBanks.map((bank, i) => ({
        bankName: bank.name,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5 + (i * 0.1),
        grossRate: 3.5 + (i * 0.1),
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    // Process through pipeline
    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Verify audit trail completeness
    const auditRecords = db.prepare(`
      SELECT * FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    // Must have exactly one audit record per product
    expect(auditRecords).toHaveLength(testBanks.length);

    // Verify each audit record has complete required fields
    auditRecords.forEach((audit, i) => {
      // Required fields must be present
      expect(audit.batch_id).toBe(result.batchId);
      expect(audit.product_id).toBeTruthy();
      expect(audit.original_bank_name).toBeTruthy();
      expect(audit.normalized_bank_name).toBeTruthy();

      // Original vs normalized should show actual normalization
      expect(audit.original_bank_name.toUpperCase()).toContain(
        audit.normalized_bank_name.toUpperCase().split(' ')[0]
      );

      // Known banks should have matching results
      if (testBanks[i].expectedMatch) {
        expect(audit.final_frn).toBeTruthy();
        expect(audit.final_frn).toMatch(/^\d{6,7}$/);
        expect(audit.final_confidence).toBeGreaterThan(0);
        expect(audit.final_confidence).toBeLessThanOrEqual(1.0);
        expect(audit.database_query_method).toBeTruthy();
        expect(['exact_match', 'fuzzy_match', 'alias_match']).toContain(audit.database_query_method);

        console.log(`📋 ${audit.original_bank_name}: FRN=${audit.final_frn}, Method=${audit.database_query_method}, Confidence=${audit.final_confidence}`);
      }

      // Processing time should be reasonable (or null if not tracked)
      if (audit.processing_time_ms !== null) {
        expect(audit.processing_time_ms).toBeGreaterThanOrEqual(0);
        expect(audit.processing_time_ms).toBeLessThan(1000); // Should process in under 1 second
      }
    });

    console.log(`✅ All ${auditRecords.length} audit records complete and valid`);
  });

  test('cross-table data consistency enforced', async () => {
    const db = testDb.getConnection();

    // Create fixture with multiple known banks
    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-consistency', method: 'test-cross-table' },
      products: [
        {
          bankName: 'Santander UK plc',
          platform: 'direct',
          rawPlatform: 'direct',
          accountType: 'easy_access',
          aerRate: 3.5,
          grossRate: 3.5,
          minDeposit: 1,
          maxDeposit: 85000
        },
        {
          bankName: 'Barclays Bank UK PLC',
          platform: 'direct',
          rawPlatform: 'direct',
          accountType: 'easy_access',
          aerRate: 3.6,
          grossRate: 3.6,
          minDeposit: 1,
          maxDeposit: 85000
        }
      ]
    });

    // Process through pipeline
    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Get all products from raw table
    const rawProducts = db.prepare(`
      SELECT * FROM available_products_raw
      WHERE source = ?
      ORDER BY bank_name
    `).all('test-consistency');

    // Get audit records for this batch
    const auditRecords = db.prepare(`
      SELECT * FROM frn_matching_audit
      WHERE batch_id = ?
      ORDER BY original_bank_name
    `).all(result.batchId);

    expect(rawProducts).toHaveLength(2);
    expect(auditRecords).toHaveLength(2);

    // Check consistency for each product
    const consistencyCheck = rawProducts.map(product => {
      const audit = auditRecords.find(a => a.original_bank_name === product.bank_name);
      return {
        bank_name: product.bank_name,
        raw_frn: product.frn,
        raw_confidence: product.confidence_score,
        audit_frn: audit?.final_frn,
        audit_confidence: audit?.final_confidence,
        database_query_method: audit?.database_query_method,
        original_bank_name: audit?.original_bank_name,
        normalized_bank_name: audit?.normalized_bank_name
      };
    });

    expect(consistencyCheck).toHaveLength(2);

    // Every product must have a corresponding audit record
    consistencyCheck.forEach(row => {
      expect(row.audit_frn).toBeDefined(); // Audit record must exist

      // FRN consistency: raw table and audit must match
      if (row.raw_frn !== null) {
        expect(row.raw_frn).toBe(row.audit_frn);
        console.log(`✅ FRN consistent for ${row.bank_name}: ${row.raw_frn}`);
      } else {
        expect(row.audit_frn).toBeNull();
      }

      // Confidence consistency: raw table and audit must match
      expect(row.raw_confidence).toBe(row.audit_confidence);

      // Bank name consistency: original should be preserved
      expect(row.original_bank_name).toBeTruthy();
      expect(row.normalized_bank_name).toBeTruthy();

      // Query method must be recorded for successful matches
      if (row.raw_frn !== null) {
        expect(row.database_query_method).toBeTruthy();
      }

      console.log(`✅ Confidence consistent for ${row.bank_name}: ${row.raw_confidence}`);
    });

    console.log(`✅ Cross-table consistency verified for ${consistencyCheck.length} products`);
  });

  test('no data loss during enrichment pipeline', async () => {
    const db = testDb.getConnection();

    // Create fixture with mix of known and unknown banks
    const banks = [
      { name: 'Santander UK plc', expectMatch: true },
      { name: 'Barclays Bank UK PLC', expectMatch: true },
      { name: 'Unknown Bank Alpha', expectMatch: false },
      { name: 'HSBC UK Bank plc', expectMatch: true },
      { name: 'Unknown Bank Beta', expectMatch: false }
    ];

    const fixture = pipelineHelper.createTemporaryFixture({
      metadata: { source: 'test-no-data-loss', method: 'test-completeness' },
      products: banks.map((bank, i) => ({
        bankName: bank.name,
        platform: 'direct',
        rawPlatform: 'direct',
        accountType: 'easy_access',
        aerRate: 3.5 + (i * 0.1),
        grossRate: 3.5 + (i * 0.1),
        minDeposit: 1,
        maxDeposit: 85000
      }))
    });

    // Process through pipeline
    const result = await pipelineHelper.executePipelineWithTracking(fixture, {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    // Verify no products were lost
    const rawProductCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM available_products_raw
      WHERE source = 'test-no-data-loss'
    `).get().count;

    expect(rawProductCount).toBe(banks.length);

    // Verify every product has exactly one audit record
    const auditRecordCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM frn_matching_audit
      WHERE batch_id = ?
    `).get(result.batchId).count;

    expect(auditRecordCount).toBe(banks.length);

    // Verify enrichment status is correct for each product
    const enrichmentResults = db.prepare(`
      SELECT
        apr.bank_name,
        apr.frn,
        apr.confidence_score,
        fma.final_frn,
        fma.final_confidence
      FROM available_products_raw apr
      INNER JOIN frn_matching_audit fma
        ON fma.batch_id = ?
        AND fma.original_bank_name = apr.bank_name
      WHERE apr.source = 'test-no-data-loss'
      ORDER BY apr.bank_name
    `).all(result.batchId);

    expect(enrichmentResults).toHaveLength(banks.length);

    // Verify each bank got the expected enrichment outcome
    banks.forEach((expectedBank, i) => {
      const result = enrichmentResults.find(r => r.bank_name === expectedBank.name);
      expect(result).toBeDefined();

      if (expectedBank.expectMatch) {
        // Known banks must have FRN
        expect(result.frn).toBeTruthy();
        expect(result.frn).toMatch(/^\d{6,7}$/);
        expect(result.confidence_score).toBeGreaterThan(0);
        expect(result.final_frn).toBe(result.frn);
        expect(result.final_confidence).toBe(result.confidence_score);
      } else {
        // Unknown banks must have NULL FRN
        expect(result.frn).toBeNull();
        expect(result.confidence_score).toBe(0);
        expect(result.final_frn).toBeNull();
        // final_confidence may be null or 0 for no matches
        expect(result.final_confidence === null || result.final_confidence === 0).toBe(true);
      }
    });

    console.log(`✅ No data loss verified:`);
    console.log(`   Input products: ${banks.length}`);
    console.log(`   Raw table products: ${rawProductCount}`);
    console.log(`   Audit records: ${auditRecordCount}`);
    console.log(`   All products accounted for: ${rawProductCount === banks.length && auditRecordCount === banks.length}`);
  });

  test('bulk enrichment correctness and performance', async () => {
    const db = testDb.getConnection();

    // Use real fixture with known banks
    const startTime = Date.now();

    const result = await pipelineHelper.executePipelineWithTracking('ajbell-sample.json', {
      stopAfterStage: PipelineStage.FRN_MATCHING
    });

    const duration = Date.now() - startTime;

    // Count products and matches
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_count,
        COUNT(frn) as matched_count,
        AVG(CASE WHEN frn IS NOT NULL THEN confidence_score END) as avg_confidence,
        MIN(CASE WHEN frn IS NOT NULL THEN confidence_score END) as min_confidence,
        MAX(confidence_score) as max_confidence
      FROM available_products_raw
      WHERE source = 'ajbell'
    `).get();

    // Count audit records
    const auditStats = db.prepare(`
      SELECT COUNT(*) as audit_count
      FROM frn_matching_audit
      WHERE batch_id = ?
    `).get(result.batchId);

    // Correctness assertions
    expect(stats.total_count).toBeGreaterThan(0);
    expect(stats.matched_count).toBeGreaterThan(0);

    // Match rate should be reasonable (>70% for real UK bank data)
    const matchRate = (stats.matched_count / stats.total_count) * 100;
    expect(matchRate).toBeGreaterThan(70);

    // Every product must have exactly one audit record
    expect(auditStats.audit_count).toBe(stats.total_count);

    // Confidence scores must be valid
    expect(stats.avg_confidence).toBeGreaterThan(0);
    expect(stats.avg_confidence).toBeLessThanOrEqual(1.0);
    expect(stats.min_confidence).toBeGreaterThan(0);
    expect(stats.max_confidence).toBeLessThanOrEqual(1.0);

    // Performance assertions
    expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    const throughput = (stats.total_count / (duration / 1000));
    expect(throughput).toBeGreaterThan(10); // At least 10 products/sec

    console.log(`📊 Bulk enrichment validation:`);
    console.log(`   Total products: ${stats.total_count}`);
    console.log(`   Matched: ${stats.matched_count} (${matchRate.toFixed(1)}%)`);
    console.log(`   Audit records: ${auditStats.audit_count}`);
    console.log(`   Avg confidence: ${stats.avg_confidence.toFixed(2)}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Throughput: ${throughput.toFixed(0)} products/sec`);
    console.log(`✅ Correctness: ${auditStats.audit_count === stats.total_count ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Performance: ${throughput > 10 ? 'PASS' : 'FAIL'}`);
  });
});

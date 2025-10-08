import * as Database from 'better-sqlite3';
import { AuditTrailValidator, ValidationResult } from '../AuditTrailValidator';

/**
 * Unit Tests for AuditTrailValidator
 *
 * Tests the comprehensive JSON structure validation framework
 * ensuring audit trail data is correctly structured and queryable.
 */

describe('AuditTrailValidator', () => {
  let db: Database.Database;
  let validator: AuditTrailValidator;
  const testBatchId = 'test-batch-001';

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database.default(':memory:');
    validator = new AuditTrailValidator(db);

    // Create test audit tables with proper schema
    db.exec(`
      CREATE TABLE json_ingestion_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL,
        product_id TEXT,
        raw_product_json TEXT,
        validation_status TEXT NOT NULL,
        validation_details TEXT,
        rejection_reasons TEXT,
        normalization_applied TEXT
      );

      CREATE TABLE frn_matching_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL,
        product_id TEXT,
        normalization_steps TEXT,
        candidate_frns TEXT,
        decision_routing TEXT
      );

      CREATE TABLE deduplication_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL,
        input_products_count INTEGER NOT NULL,
        business_key_fields TEXT,
        quality_score_distribution TEXT,
        selection_criteria TEXT,
        fscs_violations TEXT,
        processing_time_ms INTEGER,
        business_key_generation_time_ms INTEGER,
        quality_scoring_time_ms INTEGER,
        selection_time_ms INTEGER
      );

      CREATE TABLE deduplication_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL,
        business_key TEXT NOT NULL,
        platforms_in_group TEXT,
        sources_in_group TEXT,
        quality_scores TEXT,
        rejected_products TEXT
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe('JSON Ingestion Audit Validation', () => {
    it('should validate valid JSON ingestion audit entries', () => {
      // Insert valid test data
      db.prepare(`
        INSERT INTO json_ingestion_audit (
          batch_id, product_id, raw_product_json, validation_status,
          validation_details, normalization_applied
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        testBatchId,
        'prod-001',
        JSON.stringify({ bankName: 'Test Bank', aerRate: 4.5 }),
        'valid',
        JSON.stringify([
          { field: 'bankName', rule: 'required', passed: true },
          { field: 'aerRate', rule: 'numeric', passed: true }
        ]),
        JSON.stringify({
          bankName: {
            original: 'Test Bank PLC',
            normalized: 'TEST BANK PLC'
          }
        })
      );

      const result = validator.validateJSONIngestionAudit(testBatchId);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.details?.auditCount).toBe(1);
    });

    it('should detect invalid JSON structure in audit fields', () => {
      // Insert invalid test data
      db.prepare(`
        INSERT INTO json_ingestion_audit (
          batch_id, product_id, raw_product_json, validation_status,
          validation_details, normalization_applied
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        testBatchId,
        'prod-002',
        'invalid-json',
        'valid',
        'not-an-array',
        'not-an-object'
      );

      const result = validator.validateJSONIngestionAudit(testBatchId);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('Invalid raw_product_json JSON'));
      expect(result.errors).toContain(expect.stringContaining('validation_details must be array'));
      expect(result.errors).toContain(expect.stringContaining('normalization_applied must be object'));
    });

    it('should validate rejection reasons for invalid products', () => {
      // Insert rejected product without rejection reasons
      db.prepare(`
        INSERT INTO json_ingestion_audit (
          batch_id, product_id, raw_product_json, validation_status,
          validation_details, rejection_reasons
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        testBatchId,
        'prod-003',
        JSON.stringify({ bankName: 'Test Bank' }),
        'invalid',
        JSON.stringify([{ field: 'aerRate', rule: 'required', passed: false, message: 'Missing rate' }]),
        null
      );

      const result = validator.validateJSONIngestionAudit(testBatchId);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('Invalid or empty rejection_reasons'));
    });

    it('should handle missing audit entries gracefully', () => {
      const result = validator.validateJSONIngestionAudit('non-existent-batch');

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('No JSON ingestion audit entries found');
    });
  });

  describe('FRN Matching Audit Validation', () => {
    it('should validate valid FRN matching audit entries', () => {
      db.prepare(`
        INSERT INTO frn_matching_audit (
          batch_id, product_id, normalization_steps, candidate_frns, decision_routing
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        testBatchId,
        'prod-001',
        JSON.stringify([
          { action: 'uppercase', before: 'Test Bank', after: 'TEST BANK' },
          { action: 'remove_suffix', before: 'TEST BANK PLC', after: 'TEST BANK' }
        ]),
        JSON.stringify([
          {
            frn: '123456',
            bankName: 'Test Bank PLC',
            confidence: 0.95,
            matchType: 'exact'
          },
          {
            frn: '123457',
            bankName: 'Test Bank Ltd',
            confidence: 0.87,
            matchType: 'fuzzy'
          }
        ]),
        'auto_assigned'
      );

      const result = validator.validateFRNMatchingAudit(testBatchId);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.details?.auditCount).toBe(1);
    });

    it('should detect invalid candidate FRN structures', () => {
      db.prepare(`
        INSERT INTO frn_matching_audit (
          batch_id, product_id, normalization_steps, candidate_frns, decision_routing
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        testBatchId,
        'prod-002',
        JSON.stringify([]),
        JSON.stringify([
          {
            frn: '123456',
            // Missing bankName
            confidence: 1.5, // Invalid confidence > 1
            matchType: 'invalid_type' // Invalid match type
          }
        ]),
        'invalid_routing'
      );

      const result = validator.validateFRNMatchingAudit(testBatchId);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('Missing required candidate fields'));
      expect(result.errors).toContain(expect.stringContaining('Invalid confidence score'));
      expect(result.errors).toContain(expect.stringContaining('Invalid matchType'));
      expect(result.errors).toContain(expect.stringContaining('Invalid decision_routing'));
    });

    it('should validate normalization steps structure', () => {
      db.prepare(`
        INSERT INTO frn_matching_audit (
          batch_id, product_id, normalization_steps, candidate_frns, decision_routing
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        testBatchId,
        'prod-003',
        JSON.stringify([
          { action: 'uppercase' }, // Missing before/after
          'invalid-step' // Not an object
        ]),
        JSON.stringify([]),
        'research_queue'
      );

      const result = validator.validateFRNMatchingAudit(testBatchId);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('Invalid normalization step structure'));
    });
  });

  describe('Deduplication Audit Validation', () => {
    it('should validate valid deduplication audit entry', () => {
      db.prepare(`
        INSERT INTO deduplication_audit (
          batch_id, input_products_count, business_key_fields, quality_score_distribution,
          processing_time_ms, business_key_generation_time_ms, quality_scoring_time_ms, selection_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        testBatchId,
        100,
        JSON.stringify(['bankName', 'accountType', 'aerRate']),
        JSON.stringify({
          mean: 0.85,
          median: 0.87,
          min: 0.45,
          max: 1.0,
          count: 100
        }),
        5000,
        1500,
        2000,
        1500
      );

      const result = validator.validateDeduplicationAudit(testBatchId);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.details).toBeDefined();
    });

    it('should detect missing required fields in quality distribution', () => {
      db.prepare(`
        INSERT INTO deduplication_audit (
          batch_id, input_products_count, business_key_fields, quality_score_distribution,
          processing_time_ms, business_key_generation_time_ms, quality_scoring_time_ms, selection_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        testBatchId,
        0, // Invalid count
        'not-an-array',
        JSON.stringify({ mean: 0.85 }), // Missing required fields
        5000,
        1500,
        2000,
        1500
      );

      const result = validator.validateDeduplicationAudit(testBatchId);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid input_products_count in deduplication audit');
      expect(result.errors).toContain('business_key_fields must be array');
      expect(result.errors).toContain('Missing median in quality_score_distribution');
    });
  });

  describe('Deduplication Groups Validation', () => {
    it('should validate complete rejected products metadata', () => {
      db.prepare(`
        INSERT INTO deduplication_groups (
          batch_id, business_key, platforms_in_group, sources_in_group, quality_scores, rejected_products
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        testBatchId,
        'TEST_BANK_SAVINGS_4.5',
        JSON.stringify(['platform1', 'platform2']),
        JSON.stringify(['source1', 'source2']),
        JSON.stringify({
          'prod-001': 0.95,
          'prod-002': 0.87
        }),
        JSON.stringify([
          {
            productId: 'prod-002',
            platform: 'platform2',
            bankName: 'Test Bank',
            aerRate: 4.3,
            rejectionReason: 'lower_rate',
            qualityScore: 0.87,
            comparedTo: 'prod-001',
            comparisonMetrics: {
              reason: 'Rate difference: 4.5% vs 4.3%',
              rateAdvantage: 0.2
            }
          }
        ])
      );

      const result = validator.validateDeduplicationGroups(testBatchId);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.details?.groupCount).toBe(1);
    });

    it('should detect incomplete rejected products metadata', () => {
      db.prepare(`
        INSERT INTO deduplication_groups (
          batch_id, business_key, platforms_in_group, sources_in_group, quality_scores, rejected_products
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        testBatchId,
        'TEST_BANK_SAVINGS_4.5',
        JSON.stringify(['platform1']),
        JSON.stringify(['source1']),
        JSON.stringify({ 'prod-001': 1.5 }), // Invalid score > 1
        JSON.stringify([
          {
            productId: 'prod-002',
            platform: 'platform2',
            // Missing required fields: bankName, aerRate, rejectionReason, etc.
            comparisonMetrics: 'invalid-structure' // Should be object
          }
        ])
      );

      const result = validator.validateDeduplicationGroups(testBatchId);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('Invalid quality score'));
      expect(result.errors).toContain(expect.stringContaining('Missing bankName'));
      expect(result.errors).toContain(expect.stringContaining('Invalid comparisonMetrics structure'));
    });
  });

  describe('Performance Metrics Validation', () => {
    it('should validate consistent performance metrics', () => {
      db.prepare(`
        INSERT INTO deduplication_audit (
          batch_id, input_products_count,
          processing_time_ms, business_key_generation_time_ms, quality_scoring_time_ms, selection_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(testBatchId, 100, 5000, 1500, 2000, 1500); // Sum = 5000, perfect match

      const result = validator.validatePerformanceMetrics(testBatchId);

      expect(result.valid).toBe(true);
      expect(result.totalProcessingTime).toBe(5000);
      expect(result.sumOfParts).toBe(5000);
      expect(result.difference).toBe(0);
      expect(result.withinTolerance).toBe(true);
    });

    it('should detect inconsistent performance metrics', () => {
      db.prepare(`
        INSERT INTO deduplication_audit (
          batch_id, input_products_count,
          processing_time_ms, business_key_generation_time_ms, quality_scoring_time_ms, selection_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(testBatchId, 100, 3000, 1500, 2000, 1500); // Sum = 5000, diff = 2000

      const result = validator.validatePerformanceMetrics(testBatchId);

      expect(result.valid).toBe(false);
      expect(result.difference).toBe(2000);
      expect(result.withinTolerance).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('Performance metrics inconsistent'));
    });

    it('should handle invalid or missing metrics', () => {
      db.prepare(`
        INSERT INTO deduplication_audit (
          batch_id, input_products_count,
          processing_time_ms, business_key_generation_time_ms, quality_scoring_time_ms, selection_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(testBatchId, 100, 0, -100, null, 'invalid'); // Various invalid values

      const result = validator.validatePerformanceMetrics(testBatchId);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid or missing processing_time_ms');
      expect(result.errors).toContain('Invalid business_key_generation_time_ms');
    });
  });

  describe('JSON Queryability Testing', () => {
    beforeEach(() => {
      // Insert test data for queryability testing
      db.prepare(`
        INSERT INTO frn_matching_audit (batch_id, candidate_frns)
        VALUES (?, ?)
      `).run(testBatchId, JSON.stringify([{ confidence: 0.9 }]));

      db.prepare(`
        INSERT INTO deduplication_groups (batch_id, rejected_products)
        VALUES (?, ?)
      `).run(testBatchId, JSON.stringify([{ rejectionReason: 'platform_priority' }]));
    });

    it('should successfully query JSON fields using SQL functions', () => {
      const result = validator.testJSONQueryability(testBatchId);

      expect(result.valid).toBe(true);
      expect(result.details?.highConfidenceFRNs).toBe(1);
      expect(result.details?.platformPriorityRejections).toBe(1);
    });

    it('should handle missing tables gracefully', () => {
      // Drop the json_ingestion_audit table to test graceful handling
      db.exec('DROP TABLE IF EXISTS json_ingestion_audit');

      const result = validator.testJSONQueryability(testBatchId);

      expect(result.valid).toBe(true); // Should still be valid
      expect(result.warnings).toContain(expect.stringContaining('Could not query validation details'));
    });
  });

  describe('Complete Audit Trail Validation', () => {
    beforeEach(() => {
      // Insert comprehensive test data across all audit tables
      db.prepare(`
        INSERT INTO json_ingestion_audit (batch_id, product_id, raw_product_json, validation_status, validation_details, normalization_applied)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        testBatchId, 'prod-001',
        JSON.stringify({ bankName: 'Test Bank' }),
        'valid',
        JSON.stringify([{ field: 'bankName', rule: 'required', passed: true }]),
        JSON.stringify({ bankName: { original: 'Test Bank', normalized: 'TEST BANK' } })
      );

      db.prepare(`
        INSERT INTO frn_matching_audit (batch_id, product_id, normalization_steps, candidate_frns, decision_routing)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        testBatchId, 'prod-001',
        JSON.stringify([{ action: 'uppercase', before: 'test', after: 'TEST' }]),
        JSON.stringify([{ frn: '123456', bankName: 'Test Bank', confidence: 0.9, matchType: 'exact' }]),
        'auto_assigned'
      );

      db.prepare(`
        INSERT INTO deduplication_audit (batch_id, input_products_count, business_key_fields, quality_score_distribution, processing_time_ms, business_key_generation_time_ms, quality_scoring_time_ms, selection_time_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        testBatchId, 1,
        JSON.stringify(['bankName']),
        JSON.stringify({ mean: 0.9, median: 0.9, min: 0.9, max: 0.9, count: 1 }),
        1000, 300, 400, 300
      );

      db.prepare(`
        INSERT INTO deduplication_groups (batch_id, business_key, platforms_in_group, sources_in_group, quality_scores, rejected_products)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        testBatchId, 'TEST_BANK',
        JSON.stringify(['platform1']),
        JSON.stringify(['source1']),
        JSON.stringify({ 'prod-001': 0.9 }),
        null // No rejected products for this group
      );
    });

    it('should validate complete audit trail successfully', () => {
      const result = validator.validateCompleteAuditTrail(testBatchId);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.details?.jsonIngestionCount).toBe(1);
      expect(result.details?.frnMatchingCount).toBe(1);
      expect(result.details?.deduplicationExists).toBe(true);
      expect(result.details?.deduplicationGroupsCount).toBe(1);
      expect(result.details?.totalRecords).toBe(4);
    });

    it('should generate comprehensive audit trail report', () => {
      const report = validator.generateAuditTrailReport(testBatchId);

      expect(report.batchId).toBe(testBatchId);
      expect(report.summary.overall).toBe(true);
      expect(report.summary.totalErrors).toBe(0);
      expect(report.summary.completeness.totalRecords).toBe(4);
      expect(report.validation.structure.valid).toBe(true);
      expect(report.validation.performance.valid).toBe(true);
      expect(report.validation.queryability.valid).toBe(true);
      expect(report.recommendations).toContain('Audit trail validation passed - ready for production monitoring');
    });
  });

  describe('Recommendations Generation', () => {
    it('should generate appropriate recommendations for failing validation', () => {
      // Insert invalid data to trigger recommendations
      db.prepare(`
        INSERT INTO deduplication_audit (
          batch_id, input_products_count, business_key_fields, quality_score_distribution,
          processing_time_ms, business_key_generation_time_ms, quality_scoring_time_ms, selection_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(testBatchId, 0, 'invalid', 'invalid', 1000, 2000, 3000, 4000); // Inconsistent timing

      const report = validator.generateAuditTrailReport(testBatchId);

      expect(report.summary.overall).toBe(false);
      expect(report.recommendations).toContain('Fix JSON structure validation errors before production deployment');
      expect(report.recommendations).toContain('Review performance metric calculation logic for accuracy');
    });
  });
});
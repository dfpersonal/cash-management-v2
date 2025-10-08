/**
 * FSCS Compliance Engine Integration Tests
 *
 * Tests the FSCSComplianceEngine using real database interactions.
 * Follows pipeline test patterns: setup → inject test data → execute → assert → cleanup
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { FSCSComplianceEngine } from '../fscs';
import { FSCSTestDatabase } from '../../__tests__/helpers/FSCSTestDatabase';

describe('FSCS Compliance Engine', () => {
  let testDb: FSCSTestDatabase;
  let engine: FSCSComplianceEngine;

  beforeEach(async () => {
    testDb = new FSCSTestDatabase();
    await testDb.setup();
    engine = new FSCSComplianceEngine(testDb.getPath());
  });

  afterEach(async () => {
    await testDb.teardown();
  });

  describe('Basic FSCS Compliance', () => {
    test('should identify compliant single institution', async () => {
      // Clear existing data and insert test account
      testDb.clearAllAccounts();
      testDb.insertTestAccount({
        frn: 'TEST123',
        bank: 'Test Bank',
        balance: 50000  // Well under £85k limit
      });

      const report = await engine.generateComplianceReport();

      expect(report.status).toBe('COMPLIANT');
      expect(report.breaches).toHaveLength(0);
      expect(report.summary.totalAccounts).toBe(1);

      const exposure = report.exposures.find(e => e.frn === 'TEST123');
      expect(exposure).toBeDefined();
      expect(exposure!.complianceStatus).toBe('COMPLIANT');
      expect(exposure!.totalExposure).toBe(50000);
      expect(exposure!.effectiveLimit).toBe(85000); // Standard FSCS limit
    });

    test('should detect FSCS breach over £85k standard limit', async () => {
      testDb.clearAllAccounts();
      testDb.insertTestAccount({
        frn: 'TEST456',
        bank: 'Test Bank 2',
        balance: 90000  // Over £85k + £500 tolerance = £85,500
      });

      const report = await engine.generateComplianceReport();

      expect(report.status).toBe('BREACH');
      expect(report.breaches.length).toBeGreaterThan(0);

      const breach = report.breaches.find(b => b.frn === 'TEST456');
      expect(breach).toBeDefined();
      expect(breach!.totalExposure).toBe(90000);
      expect(breach!.effectiveLimit).toBe(85000);
      // excessAmount = effectiveExposure - (effectiveLimit + tolerance)
      // = 90000 - (85000 + 500) = 4500
      expect(breach!.excessAmount).toBeCloseTo(4500, 0);
      expect(breach!.severity).toMatch(/CRITICAL|HIGH|MEDIUM/);
    });

    test('should respect tolerance threshold', async () => {
      testDb.clearAllAccounts();
      testDb.insertTestAccount({
        frn: 'TEST789',
        bank: 'Test Bank 3',
        balance: 85300  // Just within £85k + £500 tolerance
      });

      const report = await engine.generateComplianceReport();

      // Should be WARNING (within tolerance) not BREACH
      expect(report.status).toBe('WARNING');
      expect(report.warnings.length).toBeGreaterThan(0);
      expect(report.breaches).toHaveLength(0);

      const exposure = report.exposures.find(e => e.frn === 'TEST789');
      expect(exposure!.complianceStatus).toBe('TOLERANCE');
    });

    test('should handle multiple accounts at same institution', async () => {
      testDb.clearAllAccounts();
      testDb.insertTestAccount({
        frn: 'TEST_MULTI',
        bank: 'Multi Account Bank',
        balance: 40000
      });
      testDb.insertTestAccount({
        frn: 'TEST_MULTI',
        bank: 'Multi Account Bank',
        balance: 30000
      });

      const report = await engine.generateComplianceReport();

      const exposure = report.exposures.find(e => e.frn === 'TEST_MULTI');
      expect(exposure).toBeDefined();
      expect(exposure!.totalExposure).toBe(70000); // 40k + 30k
      // 70k is 82% of 85k, which is NEAR_LIMIT (80-95% range)
      expect(exposure!.complianceStatus).toBe('NEAR_LIMIT');
    });

    test('should handle multiple institutions correctly', async () => {
      testDb.clearAllAccounts();
      testDb.insertTestAccount({
        frn: 'TEST_BANK_A',
        bank: 'Bank A',
        balance: 50000  // Well below limit
      });
      testDb.insertTestAccount({
        frn: 'TEST_BANK_B',
        bank: 'Bank B',
        balance: 60000  // Also well below limit
      });

      const report = await engine.generateComplianceReport();

      expect(report.summary.institutionCount).toBe(2);
      expect(report.summary.totalValue).toBe(110000);
      expect(report.status).toBe('COMPLIANT');

      const bankA = report.exposures.find(e => e.frn === 'TEST_BANK_A');
      const bankB = report.exposures.find(e => e.frn === 'TEST_BANK_B');
      expect(bankA!.complianceStatus).toBe('COMPLIANT');
      expect(bankB!.complianceStatus).toBe('COMPLIANT');
    });
  });

  describe('Institution Preferences', () => {
    test('should apply NS&I £2M personal limit from institution_preferences', async () => {
      testDb.clearAllAccounts();
      testDb.insertTestAccount({
        frn: '845350',  // NS&I FRN (should exist in institution_preferences)
        bank: 'NS&I',
        balance: 500000  // Half million - would breach £85k but OK for NS&I £2M limit
      });

      const report = await engine.generateComplianceReport();

      const nsiExposure = report.exposures.find(e => e.frn === '845350');
      expect(nsiExposure).toBeDefined();
      expect(nsiExposure!.totalExposure).toBe(500000);
      expect(nsiExposure!.effectiveLimit).toBe(2000000); // NS&I personal limit
      expect(nsiExposure!.complianceStatus).toBe('COMPLIANT');
      expect(nsiExposure!.protectionType).toMatch(/personal_override|government_protected/);
    });

    test('should use standard FSCS limit when no institution preference exists', async () => {
      testDb.clearAllAccounts();
      testDb.insertTestAccount({
        frn: 'TEST_NO_PREF',
        bank: 'No Preference Bank',
        balance: 80000
      });

      const report = await engine.generateComplianceReport();

      const exposure = report.exposures.find(e => e.frn === 'TEST_NO_PREF');
      expect(exposure!.effectiveLimit).toBe(85000); // Standard FSCS
      expect(exposure!.protectionType).toBe('standard_fscs');
    });
  });

  describe('Joint Accounts', () => {
    test('should double FSCS limit for joint accounts', async () => {
      testDb.clearAllAccounts();
      testDb.insertTestAccount({
        frn: 'TEST_JOINT',
        bank: 'Joint Test Bank',
        balance: 120000,  // Would breach individual (£85k) but OK for joint (2 × £85k = £170k)
        isJointAccount: true
      });

      const report = await engine.generateComplianceReport();

      const exposure = report.exposures.find(e => e.frn === 'TEST_JOINT');
      expect(exposure).toBeDefined();
      expect(exposure!.effectiveLimit).toBe(170000); // 2 × £85k
      expect(exposure!.totalExposure).toBe(120000);
      expect(exposure!.complianceStatus).toBe('COMPLIANT'); // 70% of limit
    });

    test('should detect breach on joint account exceeding doubled limit', async () => {
      testDb.clearAllAccounts();
      testDb.insertTestAccount({
        frn: 'TEST_JOINT2',
        bank: 'Joint Test Bank 2',
        balance: 180000,  // Over 2 × £85k = £170k
        isJointAccount: true
      });

      const report = await engine.generateComplianceReport();

      const exposure = report.exposures.find(e => e.frn === 'TEST_JOINT2');
      expect(exposure!.effectiveLimit).toBe(170000);
      expect(['VIOLATION', 'TOLERANCE']).toContain(exposure!.complianceStatus);

      // Should have breach or warning
      expect(report.breaches.length + report.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Easy Access Requirements', () => {
    test('should handle easy access requirement for amounts above FSCS', async () => {
      testDb.clearAllAccounts();

      // Use Goldman Sachs FRN 124659 which should already exist in institution_preferences
      // with easy_access_required_above_fscs = true and personal_limit = 120000

      // Add Easy Access account
      testDb.insertTestAccount({
        frn: '124659',  // Goldman Sachs - has £120k personal limit with easy access requirement
        bank: 'Goldman Sachs International Bank',
        balance: 110000,
        subType: 'Easy Access'
      });

      const report = await engine.generateComplianceReport();

      const exposure = report.exposures.find(e => e.frn === '124659');
      expect(exposure).toBeDefined();
      expect(exposure!.effectiveLimit).toBe(120000); // Personal limit applies
      expect(exposure!.totalExposure).toBe(110000);
      expect(exposure!.complianceStatus).toBe('NEAR_LIMIT'); // 92% of limit (80-95% range)
    });
  });

  describe('Risk Metrics', () => {
    test('should calculate risk metrics correctly', async () => {
      testDb.clearAllAccounts();

      // Create portfolio with known risk profile
      testDb.insertTestAccount({ frn: 'RISK_1', bank: 'Bank 1', balance: 50000 });
      testDb.insertTestAccount({ frn: 'RISK_2', bank: 'Bank 2', balance: 90000 }); // Breach
      testDb.insertTestAccount({ frn: 'RISK_3', bank: 'Bank 3', balance: 60000 });

      const report = await engine.generateComplianceReport();

      expect(report.riskMetrics).toBeDefined();
      expect(report.riskMetrics.numberOfBreaches).toBeGreaterThan(0);
      expect(report.riskMetrics.amountAtRisk).toBeGreaterThan(0);
      expect(report.riskMetrics.averageExposurePerFRN).toBeCloseTo(66666.67, 0);
      expect(report.riskMetrics.statusBreakdown).toBeDefined();
      expect(report.riskMetrics.statusBreakdown.violation).toBeGreaterThan(0);
    });
  });

  describe('Real Database Validation', () => {
    test('should correctly assess existing test data without clearing', async () => {
      // Don't clear - use existing template database data
      const report = await engine.generateComplianceReport();

      // Template DB should have accounts
      expect(report.summary.totalAccounts).toBeGreaterThan(0);
      expect(report.exposures.length).toBeGreaterThan(0);

      // Check if Chase FRN 124579 exists (has £85,863 in template)
      const chaseExposure = report.exposures.find(e => e.frn === '124579');
      if (chaseExposure) {
        expect(chaseExposure.totalExposure).toBeGreaterThan(85000);
        expect(['VIOLATION', 'TOLERANCE', 'WARNING']).toContain(chaseExposure.complianceStatus);
      }

      // NS&I should be compliant even with high balance
      const nsiExposure = report.exposures.find(e => e.frn === '845350');
      if (nsiExposure) {
        expect(nsiExposure.effectiveLimit).toBe(2000000);
        expect(nsiExposure.complianceStatus).toBe('COMPLIANT');
      }
    });
  });

  describe('Configuration Impact', () => {
    test('should respect tolerance threshold changes', async () => {
      testDb.clearAllAccounts();
      testDb.insertTestAccount({
        frn: 'TEST_TOL',
        bank: 'Tolerance Test',
        balance: 85400
      });

      // With default £500 tolerance, £85,400 should be within tolerance
      let report = await engine.generateComplianceReport();
      let exposure = report.exposures.find(e => e.frn === 'TEST_TOL');
      expect(exposure!.complianceStatus).toBe('TOLERANCE');

      // Change tolerance to £100
      testDb.updateConfig('fscs_tolerance_threshold', '100');

      // Now £85,400 should breach (over £85,100)
      // Need to recreate engine to pick up new config
      engine = new FSCSComplianceEngine(testDb.getPath());
      report = await engine.generateComplianceReport();
      exposure = report.exposures.find(e => e.frn === 'TEST_TOL');
      expect(exposure!.complianceStatus).toBe('VIOLATION');
    });
  });
});

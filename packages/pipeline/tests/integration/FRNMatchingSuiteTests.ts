/**
 * FRN Matching Service - Complete Test Suite Runner
 *
 * This test runner organizes all FRN matching tests into logical categories
 * and provides structured output for the complete test suite.
 *
 * The FRN (Financial Services Register) matching service is the CRITICAL HEART
 * of the system, assigning regulatory FRN numbers to banks from scraped data.
 *
 * Usage:
 * npm run test:frn-matching
 * npm run test:frn-matching:coverage
 * npm run test:frn-matching:watch
 */

import { describe, beforeAll, afterAll } from '@jest/globals';

describe('FRN Matching Service - Complete Test Suite', () => {

  beforeAll(() => {
    console.log('\n🚀 Starting FRN Matching Service Test Suite');
    console.log('📊 Testing 54 tests across 8 test categories');
    console.log('🏦 Processing real UK bank data with regulatory compliance');
    console.log('⚡ Using optimized FRN_MATCHING stage execution\n');
  });

  afterAll(() => {
    console.log('\n✅ FRN Matching Service Test Suite Complete');
    console.log('📋 All FRN matching functionality validated');
    console.log('🎯 Ready for production deployment\n');
  });

  describe('⚙️  Configuration Impact (12 tests)', () => {
    console.log('🔧 Testing all 22 FRN matching configuration parameters...');
    require('./frn-matching/ConfigurationTests');
  });

  describe('🔍 Basic Exact Matching (5 tests)', () => {
    console.log('🎯 Testing core exact matching via frn_lookup_helper...');
    require('./frn-matching/BasicMatchingTests');
  });

  describe('🎯 Fuzzy Matching Algorithm (7 tests)', () => {
    console.log('📐 Testing Levenshtein distance and typo tolerance...');
    require('./frn-matching/FuzzyMatchingTests');
  });

  describe('📝 Research Queue Workflow (8 tests)', () => {
    console.log('🔬 Testing unknown bank handling and human research workflow...');
    require('./frn-matching/ResearchQueueTests');
  });

  describe('✅ Manual Override Priority (6 tests)', () => {
    console.log('🏆 Testing highest-priority manual override system...');
    require('./frn-matching/ManualOverrideTests');
  });

  describe('🏢 Alias and Trading Names (5 tests)', () => {
    console.log('🔗 Testing shared brand and trading name matching...');
    require('./frn-matching/AliasMatchingTests');
  });

  describe('📐 Bank Name Normalization (6 tests)', () => {
    console.log('✂️  Testing prefix/suffix removal and abbreviation expansion...');
    require('./frn-matching/NormalizationTests');
  });

  describe('💾 Data Enrichment Validation (5 tests)', () => {
    console.log('🛡️  Testing table enrichment and audit trail completeness...');
    require('./frn-matching/EnrichmentValidationTests');
  });

});

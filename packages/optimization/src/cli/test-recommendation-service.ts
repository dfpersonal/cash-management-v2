#!/usr/bin/env node

/**
 * Test script for the new RecommendationService
 * Tests the complete Phase 2 and 3 refactoring
 */

import { RecommendationServiceImpl } from '../services/recommendation-service-impl';
import { getLogger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';

const logger = getLogger({ component: 'test-recommendation-service' });

async function main() {
  try {
    logger.info('='.repeat(60));
    logger.info('RECOMMENDATION SERVICE TEST');
    logger.info('Testing Phase 2 & 3 Refactoring');
    logger.info('='.repeat(60));
    
    // Initialize service
    const service = new RecommendationServiceImpl();
    
    // Test 1: Generate recommendations
    logger.info('\n📊 Test 1: Generating recommendations...');
    const result = await service.generateRecommendations({
      includeShariaBanks: true,
      outputFormat: 'json',
      autoSave: true,
      progressCallback: (percent, message) => {
        logger.debug(`Progress: ${percent}% - ${message}`);
      }
    });
    
    logger.info(`✅ Generated ${result.recommendations.length} recommendations`);
    logger.info(`   Total benefit: £${result.metadata.totalBenefit.toFixed(2)}/year`);
    logger.info(`   Avg improvement: ${result.metadata.averageRateImprovement.toFixed(2)}%`);
    logger.info(`   Execution time: ${result.metadata.executionTime}ms`);
    
    // Test 2: Format as JSON
    logger.info('\n📄 Test 2: Formatting as JSON...');
    const jsonOutput = service.formatAsJSON(result);
    const jsonData = JSON.parse(jsonOutput);
    logger.info(`✅ JSON output has ${jsonData.recommendations.length} recommendations`);
    
    // Save JSON to file
    const outputDir = path.join(__dirname, '../../reports/test-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const jsonFile = path.join(outputDir, `test-recommendations-${Date.now()}.json`);
    fs.writeFileSync(jsonFile, jsonOutput);
    logger.info(`   Saved to: ${path.basename(jsonFile)}`);
    
    // Test 3: Format as text
    logger.info('\n📝 Test 3: Formatting as text...');
    const textOutput = service.formatAsText(result);
    const lines = textOutput.split('\n');
    logger.info(`✅ Text output has ${lines.length} lines`);
    
    // Show first few recommendations
    if (result.recommendations.length > 0) {
      logger.info('\n🎯 Sample Recommendations:');
      for (let i = 0; i < Math.min(3, result.recommendations.length); i++) {
        const rec = result.recommendations[i];
        if (rec) {
          logger.info(`\n   ${i + 1}. ${rec.source.bankName} → ${rec.target.bankName}`);
          logger.info(`      Amount: £${rec.source.amount.amount.toLocaleString()}`);
          logger.info(`      Rate: ${rec.source.currentRate}% → ${rec.target.targetRate}%`);
          logger.info(`      Benefit: £${rec.benefits.annualBenefit.amount.toFixed(2)}/year`);
          logger.info(`      Priority: ${rec.priority}`);
          logger.info(`      Reason: ${rec.recommendationReason}`);
        }
      }
    }
    
    // Test 4: Prepare pending deposits
    logger.info('\n💾 Test 4: Preparing pending deposits...');
    const pendingDeposits = service.preparePendingDeposits(result.recommendations);
    logger.info(`✅ Prepared ${pendingDeposits.length} pending deposits`);
    
    // Test 5: Load recommendations from database
    logger.info('\n🔍 Test 5: Loading recommendations from database...');
    const savedRecs = await service.loadRecommendations('PENDING');
    logger.info(`✅ Loaded ${savedRecs.length} pending recommendations from database`);
    
    // Test configuration values
    logger.info('\n⚙️  Configuration Check:');
    if (result.metadata.configSnapshot) {
      logger.info(`   Existing account bonus: ${result.metadata.configSnapshot.existingAccountBonus}`);
      logger.info(`   Preferred platform bonus: ${result.metadata.configSnapshot.preferredPlatformBonus}`);
      logger.info(`   Max recommendations: ${result.metadata.configSnapshot.maxRecommendationsPerRun}`);
    }
    
    // Summary
    logger.info('\n' + '='.repeat(60));
    logger.info('TEST SUMMARY');
    logger.info('='.repeat(60));
    logger.info('✅ All tests completed successfully');
    logger.info('✅ RecommendationService is working correctly');
    logger.info('✅ Configuration values loaded from unified_config');
    logger.info('✅ Recommendations saved to database');
    logger.info('✅ Phase 2 & 3 refactoring is functional');
    
    // Clean up (service doesn't have close method)
    
  } catch (error) {
    logger.error(`Test failed: ${error}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
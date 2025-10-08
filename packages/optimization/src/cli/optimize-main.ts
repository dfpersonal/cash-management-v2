#!/usr/bin/env node

/**
 * Main CLI using the new Marginal Benefit Optimizer
 */

import { SQLiteConnection } from '../database/connection';
import { ConfigurationLoader } from '../configuration/loader';
import { ProductLoader } from '../products/loader';
import { PortfolioLoader } from '../portfolio/loader';
import { OptimizationRulesEngine } from '../rules/engine';
import { Optimizer } from '../optimization/optimizer';
import { getLogger } from '../utils/logger';

async function main() {
  const logger = getLogger({ component: 'marginal-benefit-cli' });
  logger.info('Cash Management Recommendation Engine - Marginal Benefit Optimizer');
  logger.info('====================================================================');

  // Allow database path to be specified via environment variable or use default
  const dbPath = process.env.DATABASE_PATH || '/Users/david/Websites/cash-management/data/database/cash_savings.db';
  const db = new SQLiteConnection(dbPath);

  try {
    await db.connect();
    logger.info(`Connected to: ${dbPath}`);

    // Initialize components
    const configLoader = new ConfigurationLoader(db);
    const productLoader = new ProductLoader(db);
    const portfolioLoader = new PortfolioLoader(db);
    const rulesEngine = new OptimizationRulesEngine(configLoader);

    // Initialize rules engine
    await rulesEngine.initialize();
    logger.info('Rules engine initialized\n');

    // Load portfolio
    const portfolio = await portfolioLoader.loadPortfolio();
    logger.info('Portfolio Summary:');
    logger.info(`  Total accounts: ${portfolio.accounts.length}`);
    logger.info(`  Total value: £${portfolio.totalValue.amount.toLocaleString()}`);
    logger.info(`  Average rate: ${portfolio.averageRate.toFixed(2)}%\n`);

    // Show large accounts that need diversification
    const complianceConfig = await configLoader.loadComplianceConfig();
    const fscsLimit = complianceConfig.fscsStandardLimit.amount;
    const largeAccounts = portfolio.accounts
      .filter(acc => acc.balance.amount > fscsLimit)
      .sort((a, b) => b.balance.amount - a.balance.amount);
    
    if (largeAccounts.length > 0) {
      logger.info('Accounts needing FSCS diversification:');
      for (const account of largeAccounts) {
        logger.info(`  ${account.bankName}: £${account.balance.amount.toLocaleString()} @ ${account.rate}%`);
      }
      logger.info("");
    }

    // Create and run optimizer
    const optimizer = new Optimizer(rulesEngine, configLoader, productLoader);
    logger.info('Running optimization...\n');
    
    const startTime = Date.now();
    const recommendations = await optimizer.optimize(portfolio);
    const duration = Date.now() - startTime;

    logger.info(`Optimization completed in ${duration}ms\n`);
    
    if (recommendations.length === 0) {
      logger.info('No recommendations generated - portfolio may already be optimized.\n');
      return;
    }

    logger.info(`Generated ${recommendations.length} recommendations:\n`);

    // Group recommendations by source account
    const recsByAccount = new Map<string, typeof recommendations>();
    for (const rec of recommendations) {
      const key = `${rec.source.bankName}_${rec.source.accountId}`;
      if (!recsByAccount.has(key)) {
        recsByAccount.set(key, []);
      }
      recsByAccount.get(key)!.push(rec);
    }

    // Display recommendations
    let totalBenefit = 0;
    for (const [, recs] of recsByAccount) {
      const firstRec = recs[0];
      if (!firstRec) continue;
      
      const sourceAccount = portfolio.accounts.find(a => a.id === firstRec.source.accountId);
      const accountDisplay = firstRec.source.accountName 
        ? `${firstRec.source.bankName} (${firstRec.source.accountName})`
        : firstRec.source.bankName;
      
      logger.info(`FROM: ${accountDisplay}`);
      logger.info(`  Current balance: £${sourceAccount?.balance.amount.toLocaleString()} @ ${firstRec.source.currentRate}%`);
      
      // Handle large account diversification
      if (recs.length > 1 && firstRec.displayMode === 'AND') {
        logger.info(`  \n  Diversification required - Execute ALL:\n`);
        
        for (const rec of recs) {
          const reason = rec.recommendationReason === 'Topping up existing account - no setup required' 
            ? ' [Existing account]' : '';
          logger.info(`  → ${rec.target.bankName} @ ${rec.target.targetRate}% - £${rec.source.amount.amount.toLocaleString()} (+£${rec.benefits.annualBenefit.amount.toFixed(0)}/year)${reason}`);
        }
        logger.info("");
        
        const totalMoved = recs.reduce((sum, r) => sum + r.source.amount.amount, 0);
        const totalAnnualBenefit = recs.reduce((sum, r) => sum + r.benefits.annualBenefit.amount, 0);
        logger.info(`  Total: £${totalMoved.toLocaleString()} moved, £${totalAnnualBenefit.toFixed(0)}/year benefit\n`);
        
        totalBenefit += totalAnnualBenefit;
      } else {
        // Single recommendation
        const rec = firstRec;
        
        // Show best alternative if different
        if (rec.bestAlternative) {
          logger.info(`  \n  Best available: ${rec.bestAlternative.bankName} @ ${rec.bestAlternative.rate}% (+${rec.bestAlternative.marginalBenefit.toFixed(2)}%)\n`);
        }
        
        logger.info(`  \n  ✓ RECOMMENDED: ${rec.target.bankName} @ ${rec.target.targetRate}% (+${rec.benefits.rateImprovement.value.toFixed(2)}%)`);
        logger.info(`    Platform: ${rec.target.platform}`);
        logger.info(`    Amount: £${rec.source.amount.amount.toLocaleString()}`);
        logger.info(`    Annual benefit: £${rec.benefits.annualBenefit.amount.toFixed(2)}`);
        logger.info(`    Reason: ${rec.recommendationReason || 'Highest available rate'}`);
        logger.info("");
        
        totalBenefit += rec.benefits.annualBenefit.amount;
      }
    }

    // Show summary
    const avgImprovement = recommendations.reduce((sum, rec) => sum + rec.benefits.rateImprovement.value, 0) / recommendations.length;

    logger.info('═══════════════════════════════════════════════════════════════════\n');
    logger.info('Summary:');
    logger.info(`  Total recommendations: ${recommendations.length}`);
    logger.info(`  Total annual benefit: £${totalBenefit.toFixed(2)}`);
    logger.info(`  Average rate improvement: +${avgImprovement.toFixed(2)}%`);

    // Show convenience bonuses applied
    const existingAccountRecs = recommendations.filter(r => 
      r.implementationNotes.some(n => n.includes('existing account'))
    );
    const platformRecs = recommendations.filter(r =>
      r.implementationNotes.some(n => n.includes('preferred platform'))
    );

    if (existingAccountRecs.length > 0 || platformRecs.length > 0) {
      logger.info(`\nConvenience bonuses applied:`);
      if (existingAccountRecs.length > 0) {
        logger.info(`  Existing accounts topped up: ${existingAccountRecs.length}`);
      }
      if (platformRecs.length > 0) {
        logger.info(`  Preferred platforms used: ${platformRecs.length}`);
      }
    }
    
    // Save recommendations to database
    logger.info('\nSaving recommendations to database...');
    let savedCount = 0;
    let failedCount = 0;
    
    for (const rec of recommendations) {
      try {
        // Find source account to get FRN
        const sourceAccount = portfolio.accounts.find(a => a.id === rec.source.accountId);
        
        // Determine bonus type if any
        let bonusType: string | null = null;
        let convenienceBonus = 0;
        if (rec.recommendationReason?.includes('existing account')) {
          bonusType = 'existing';
          convenienceBonus = 0.25; // From config
        } else if (rec.recommendationReason?.includes('preferred platform')) {
          bonusType = 'platform';
          convenienceBonus = 0.10; // From config
        }
        
        // Build metadata JSON
        const metadata = {
          displayMode: rec.displayMode || 'OR',
          displayNotes: rec.displayNotes || [],
          implementationNotes: rec.implementationNotes || [],
          risks: rec.risks || [],
          confidence: rec.confidence || 95,
          bestAlternative: rec.bestAlternative || null,
          compliance: rec.compliance
        };
        
        await db.query(`
          INSERT INTO optimization_recommendations (
            recommendation_id,
            source_account_id,
            source_bank,
            source_frn,
            source_amount,
            source_rate,
            target_bank,
            target_frn,
            target_product_id,
            target_rate,
            target_platform,
            marginal_benefit,
            annual_benefit,
            convenience_bonus,
            bonus_type,
            recommendation_reason,
            priority,
            confidence_score,
            status,
            created_at,
            metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
        `, [
          rec.id,
          rec.source.accountId,
          rec.source.bankName,
          sourceAccount?.institutionFRN || null,
          rec.source.amount.amount,
          rec.source.currentRate,
          rec.target.bankName,
          rec.target.institutionFRN,
          null, // target_product_id - we don't have this yet
          rec.target.targetRate,
          rec.target.platform,
          rec.benefits.rateImprovement.value,
          rec.benefits.annualBenefit.amount,
          convenienceBonus,
          bonusType,
          rec.recommendationReason || 'Highest available rate',
          rec.priority,
          rec.confidence || 95,
          'PENDING',
          JSON.stringify(metadata)
        ]);
        
        savedCount++;
      } catch (error) {
        logger.error(`Failed to save recommendation ${rec.id}: ${error}`);
        failedCount++;
      }
    }
    
    logger.info(`Database save complete: ${savedCount} saved, ${failedCount} failed`);
    logger.info(`\nRecommendations are now available for review in the database.`);

  } catch (error) {
    logger.error('Error: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  } finally {
    await db.close();
    logger.info('\nDatabase connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    const logger = getLogger({ component: 'marginal-benefit-cli' });
    logger.error('Fatal error: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}

export { main };
/**
 * Test script for the new Marginal Benefit Optimizer
 */

import { SQLiteConnection } from '../database/connection';
import { ConfigurationLoader } from '../configuration/loader';
import { ProductLoader } from '../products/loader';
import { PortfolioLoader } from '../portfolio/loader';
import { OptimizationRulesEngine } from '../rules/engine';
import { Optimizer } from '../optimization/optimizer';
import { getLogger } from '../utils/logger';

async function testMarginalBenefitOptimizer() {
  const logger = getLogger({ component: 'test-marginal-benefit' });
  logger.info('Testing Marginal Benefit Optimizer');
  logger.info('===================================');

  const dbPath = '/Users/david/Websites/cash-management/data/database/cash_savings.db';
  const db = new SQLiteConnection(dbPath);

  try {
    await db.connect();
    logger.info(`Connected to: ${dbPath}\n`);

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
    logger.info('Portfolio loaded:');
    logger.info(`  Total accounts: ${portfolio.accounts.length}`);
    logger.info(`  Total value: £${portfolio.totalValue.amount.toLocaleString()}`);
    logger.info(`  Average rate: ${portfolio.averageRate.toFixed(2)}%\n`);

    // Show key accounts
    logger.info('Key accounts:');
    const keyAccounts = portfolio.accounts
      .filter(acc => acc.balance.amount > 50000 || acc.bankName === 'Chase')
      .sort((a, b) => b.balance.amount - a.balance.amount);
    
    for (const account of keyAccounts) {
      logger.info(`  ${account.bankName}: £${account.balance.amount.toLocaleString()} @ ${account.rate}% (FRN: ${account.institutionFRN})`);
    }
    logger.info("");

    // Create and run optimizer
    const optimizer = new Optimizer(rulesEngine, configLoader, productLoader);
    logger.info('Running optimization...\n');
    
    const startTime = Date.now();
    const recommendations = await optimizer.optimize(portfolio);
    const duration = Date.now() - startTime;

    logger.info(`Optimization completed in ${duration}ms\n`);
    logger.info(`Generated ${recommendations.length} recommendations:\n`);

    // Group recommendations by source account
    const recsByAccount = new Map<string, typeof recommendations>();
    for (const rec of recommendations) {
      const key = rec.source.bankName;
      if (!recsByAccount.has(key)) {
        recsByAccount.set(key, []);
      }
      recsByAccount.get(key)!.push(rec);
    }

    // Display recommendations
    for (const [accountName, recs] of recsByAccount) {
      const firstRec = recs[0];
      if (!firstRec) continue;
      const displayMode = firstRec.displayMode || 'OR';
      
      logger.info(`FROM: ${accountName}`);
      logger.info(`${displayMode === 'AND' ? 'Execute ALL' : 'Choose ONE'} of these ${recs.length} ${displayMode === 'AND' ? 'moves' : 'alternatives'}:\n`);

      for (const rec of recs) {
        const notes = rec.implementationNotes.length > 0 ? ` (${rec.implementationNotes[0]})` : '';
        logger.info(`  → ${rec.target.bankName} (${rec.target.targetRate}%)${notes}`);
        logger.info(`    Platform: ${rec.target.platform}`);
        logger.info(`    Amount: £${rec.source.amount.amount.toLocaleString()}`);
        logger.info(`    Rate improvement: ${rec.benefits.rateImprovement.value.toFixed(2)}%`);
        logger.info(`    Annual benefit: £${rec.benefits.annualBenefit.amount.toFixed(2)}`);
        logger.info(`    Priority: ${rec.priority}`);
        logger.info("");
      }
    }

    // Calculate totals
    const totalBenefit = recommendations.reduce((sum, rec) => sum + rec.benefits.annualBenefit.amount, 0);
    const avgImprovement = recommendations.reduce((sum, rec) => sum + rec.benefits.rateImprovement.value, 0) / recommendations.length;

    logger.info('Summary:');
    logger.info(`  Total annual benefit: £${totalBenefit.toFixed(2)}`);
    logger.info(`  Average rate improvement: ${avgImprovement.toFixed(2)}%`);
    logger.info(`  Recommendations: ${recommendations.length}`);

    // Show existing account usage
    const existingAccountRecs = recommendations.filter(r => 
      r.implementationNotes.some(n => n.includes('existing account'))
    );
    const platformRecs = recommendations.filter(r =>
      r.implementationNotes.some(n => n.includes('preferred platform'))
    );

    logger.info(`\nConvenience bonuses applied:`);
    logger.info(`  Existing accounts used: ${existingAccountRecs.length}`);
    logger.info(`  Preferred platforms used: ${platformRecs.length}`);

  } catch (error) {
    logger.error('Error: ' + (error instanceof Error ? error.message : String(error)));
  } finally {
    await db.close();
  }
}

// Run if called directly
if (require.main === module) {
  testMarginalBenefitOptimizer().catch((error) => {
    const logger = getLogger({ component: 'test-marginal-benefit' });
    logger.error('Fatal error: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}

export { testMarginalBenefitOptimizer };
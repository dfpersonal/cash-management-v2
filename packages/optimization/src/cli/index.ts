#!/usr/bin/env node

/**
 * Basic CLI interface for testing the recommendation engine
 */

import { ConfigurationLoader } from '../configuration/loader';
import { SQLiteConnection } from '../database/connection';
import { OptimizationFactory } from '../optimization/factory';
import { PortfolioLoader } from '../portfolio/loader';
import { Money as MoneyImpl } from '../utils/money';
import { getLogger, EnhancedLogger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

// Default output directory configuration
const DEFAULT_OUTPUT_DIR = path.join('/Users/david/Websites/cash-management/recommendation-engine', 'reports', 'recommendations');

// Helper function to generate timestamp-based filename
function generateTimestampFilename(prefix: string = 'recommendations'): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')  // Replace colons and dots
    .replace('T', '_')       // Replace T with underscore
    .replace('Z', '');       // Remove Z
  return `${prefix}-${timestamp}.json`;
}

// Helper function to ensure directory exists
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`Warning: Could not create directory ${dirPath}:`, error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const autoSave = args.includes('--auto-save');
  const command = args.find(arg => !arg.startsWith('--'));
  
  // Parse output option
  const outputIndex = args.indexOf('--output');
  const outputNext = outputIndex !== -1 && args[outputIndex + 1];
  let outputPath: string | null = null;
  
  if (autoSave || outputIndex !== -1) {
    if (outputNext && !outputNext.startsWith('--')) {
      // Specific file path provided
      outputPath = outputNext;
    } else {
      // Auto-save with timestamp
      await ensureDirectoryExists(DEFAULT_OUTPUT_DIR);
      outputPath = path.join(DEFAULT_OUTPUT_DIR, generateTimestampFilename(command || 'output'));
    }
  }
  
  // Initialize logger with appropriate mode
  const logger = getLogger({ 
    outputMode: jsonMode ? 'json' : 'console',
    component: 'cli'
  });
  
  if (!jsonMode) {
    console.log('Cash Management Recommendation Engine CLI');
    console.log('===============================================\n');
  }

  const db = new SQLiteConnection('/Users/david/Websites/cash-management/data/database/cash_savings.db');
  const configLoader = new ConfigurationLoader(db);

  try {
    switch (command) {
      case 'test-config':
        await testConfiguration(configLoader, logger, jsonMode);
        break;
        
      case 'validate-db':
        await validateDatabase(db, logger, jsonMode);
        break;
        
      case 'test-migrations':
        await testMigrations(db, logger, jsonMode);
        break;
        
      case 'test-optimizer':
        await testOptimizer(logger, jsonMode);
        break;
        
      case 'real-recommendations':
        await generateRealRecommendations(logger, jsonMode);
        break;
        
      default:
        showHelp(jsonMode);
        break;
    }
    
    // Handle output
    if (jsonMode) {
      const output = logger.getLogsAsJson();
      
      if (outputPath) {
        // Ensure parent directory exists
        const parentDir = path.dirname(outputPath);
        await ensureDirectoryExists(parentDir);
        
        // Write to file
        await fs.writeFile(outputPath, output, 'utf-8');
        
        // Output success message for subprocess integration
        console.log(JSON.stringify({
          success: true,
          message: `Report saved to ${outputPath}`,
          file: outputPath,
          command: command
        }));
      } else {
        // Output to stdout
        console.log(output);
      }
    }
  } catch (error) {
    if (jsonMode) {
      logger.error(error instanceof Error ? error.message : String(error));
      const errorOutput = JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        logs: JSON.parse(logger.getLogsAsJson())
      }, null, 2);
      
      if (outputPath) {
        await fs.writeFile(outputPath, errorOutput, 'utf-8');
        console.log(JSON.stringify({
          success: false,
          message: `Error report saved to ${outputPath}`,
          file: outputPath
        }));
      } else {
        console.log(errorOutput);
      }
    } else {
      console.error('ERROR:', error instanceof Error ? error.message : error);
    }
    process.exit(1);
  } finally {
    await db.close();
  }
}

async function testConfiguration(configLoader: ConfigurationLoader, logger: EnhancedLogger, jsonMode: boolean) {
  const output: any = {};
  
  if (!jsonMode) {
    console.log('Testing Configuration Loader...\n');
  } else {
    logger.info('Testing Configuration Loader');
  }

  // Test compliance config
  const complianceConfig = await configLoader.loadComplianceConfig();
  
  if (jsonMode) {
    output.complianceConfig = complianceConfig;
    logger.info('Loaded compliance configuration');
  } else {
    console.log('Compliance Configuration:');
    console.log(`   FSCS Standard Limit: ${complianceConfig.fscsStandardLimit}`);
    console.log(`   FSCS Tolerance: ${complianceConfig.fscsToleranceThreshold}`);
    console.log(`   Include Pending Deposits: ${complianceConfig.includePendingDepositsInFSCS}`);
    console.log(`   Allow Sharia Banks: ${complianceConfig.allowShariaBanks}\n`);
  }

  // Test Sharia banks
  const shariaBanks = await configLoader.loadShariaBankRegistry();
  
  if (jsonMode) {
    output.shariaBanks = shariaBanks;
    logger.info(`Loaded ${shariaBanks.length} Sharia bank entries`);
  } else {
    console.log('Sharia Bank Registry:');
    shariaBanks.forEach(bank => {
      console.log(`   ${bank.bankName} (${bank.frn}) - ${bank.isShariaCompliant ? '[OK]' : '[NO]'} Compliant`);
    });
    console.log();
  }

  // Test institution preferences
  const preferences = await configLoader.loadInstitutionPreferences();
  
  if (jsonMode) {
    output.institutionPreferences = preferences;
    logger.info(`Loaded ${preferences.length} institution preferences`);
  } else {
    console.log('Institution Preferences:');
    preferences.forEach(pref => {
      console.log(`   ${pref.bankName} (${pref.frn}): ${pref.personalLimit}, Trust: ${pref.trustLevel}`);
      if (pref.easyAccessRequiredAboveFSCS) {
        console.log(`     WARNING: Requires easy access above FSCS limit`);
      }
    });
    console.log();
  }

  // Test rate outlook
  const rateOutlook = await configLoader.loadRateOutlookConfig();
  
  if (jsonMode) {
    output.rateOutlook = rateOutlook;
    output.success = true;
    logger.info(`Loaded ${rateOutlook.length} rate outlook configurations`);
    logger.progress('Configuration loading test completed successfully');
    return output;
  } else {
    console.log('Rate Outlook Configuration:');
    rateOutlook.forEach(outlook => {
      console.log(`   ${outlook.timeHorizonMonths}m: ${outlook.expectedBaseRate}% (${outlook.confidenceLevel}) - ${outlook.scenario}`);
      if (outlook.notes) {
        console.log(`     📝 ${outlook.notes}`);
      }
    });
    console.log();
    console.log('Configuration loading test completed successfully!');
  }
}

async function validateDatabase(db: SQLiteConnection, logger: EnhancedLogger, jsonMode: boolean) {
  const output: any = { validations: [] };
  
  if (!jsonMode) {
    console.log('Validating Database Migrations...\n');
  } else {
    logger.info('Validating Database Migrations');
  }

  // Check joint account columns
  const depositsSchema = await db.query(`PRAGMA table_info(my_deposits)`);
  const jointColumns = depositsSchema.filter(col => 
    col.name === 'is_joint_account' || col.name === 'num_account_holders'
  );
  
  const jointAccountCheck = {
    name: 'Joint account columns in my_deposits',
    status: jointColumns.length === 2 ? 'OK' : 'ERROR',
    details: jointColumns.length === 2 ? 'Found' : 'Missing'
  };
  
  if (jsonMode) {
    output.validations.push(jointAccountCheck);
  } else {
    console.log('Checking joint account columns:');
    console.log(`   [${jointAccountCheck.status}] ${jointAccountCheck.name}: ${jointAccountCheck.details}`);
  }

  const pendingSchema = await db.query(`PRAGMA table_info(my_pending_deposits)`);
  const pendingJointColumns = pendingSchema.filter(col => 
    col.name === 'is_joint_account' || col.name === 'num_account_holders'
  );
  
  if (pendingJointColumns.length === 2) {
    console.log('   [OK] Joint account columns found in my_pending_deposits');
  } else {
    console.log('   [ERROR] Joint account columns missing in my_pending_deposits');
  }

  // Check Sharia banks table
  console.log('\nChecking Sharia banks table:');
  try {
    const shariaBanks = await db.query(`SELECT COUNT(*) as count FROM sharia_banks`);
    console.log(`   [OK] Sharia banks table found with ${shariaBanks[0].count} entries`);
  } catch (error) {
    console.log('   [ERROR] Sharia banks table missing or inaccessible');
  }

  // Check configuration
  console.log('\nChecking new configuration entries:');
  const configEntries = await db.query(`
    SELECT config_key FROM compliance_config 
    WHERE config_key IN ('include_pending_deposits_in_fscs', 'allow_sharia_banks')
  `);
  
  if (configEntries.length === 2) {
    console.log('   [OK] New configuration entries found');
  } else {
    console.log('   [ERROR] Missing configuration entries');
  }

  if (jsonMode) {
    logger.progress('Database validation completed');
    return output;
  } else {
    console.log('\nDatabase validation completed!');
  }
}

async function testMigrations(db: SQLiteConnection, logger: EnhancedLogger, jsonMode: boolean) {
  if (!jsonMode) {
    console.log('🔄 Testing Migration Results...\n');
  } else {
    logger.info('Testing Migration Results');
  }

  // Test joint account defaults
  console.log('👫 Joint Account Defaults:');
  const jointDefaults = await db.query(`
    SELECT is_joint_account, COUNT(*) as count 
    FROM my_deposits 
    GROUP BY is_joint_account
  `);
  
  jointDefaults.forEach(row => {
    const status = row.is_joint_account ? 'Joint' : 'Individual';
    console.log(`   ${status} accounts: ${row.count}`);
  });

  // Test current exposure with pending deposits
  console.log('\nCurrent Exposure Analysis:');
  const exposureData = await db.query(`
    SELECT 
      'Current Deposits' as type, 
      COUNT(*) as accounts, 
      SUM(balance) as total_value
    FROM my_deposits 
    WHERE is_active = 1 AND balance > 0
    
    UNION ALL
    
    SELECT 
      'Pending Deposits' as type, 
      COUNT(*) as accounts, 
      SUM(balance) as total_value  
    FROM my_pending_deposits
    WHERE is_active = 1 AND status IN ('PENDING', 'APPROVED')
  `);

  exposureData.forEach(row => {
    console.log(`   ${row.type}: ${row.accounts} accounts, £${(row.total_value || 0).toLocaleString()}`);
  });

  // Real-world FSCS exposure with pending deposits
  console.log('\nFSCS Exposure by Institution (Including Pending):');
  const fscsExposure = await db.query(`
    WITH combined_exposure AS (
      SELECT frn, bank, SUM(balance) as total_exposure
      FROM (
        SELECT frn, bank, balance FROM my_deposits WHERE is_active = 1 AND balance > 0
        UNION ALL
        SELECT frn, bank, balance FROM my_pending_deposits WHERE is_active = 1 AND status IN ('PENDING', 'APPROVED')
      )
      WHERE frn IS NOT NULL
      GROUP BY frn, bank
    )
    SELECT 
      bank, 
      frn, 
      total_exposure,
      CASE 
        WHEN total_exposure > 85000 THEN '[WARNING] Over Standard Limit'
        WHEN total_exposure > 80000 THEN '[CAUTION] Near Limit'
        ELSE '[OK] Within Limit'
      END as status
    FROM combined_exposure
    ORDER BY total_exposure DESC
    LIMIT 10
  `);

  fscsExposure.forEach(row => {
    console.log(`   ${row.bank}: £${row.total_exposure.toLocaleString()} ${row.status}`);
  });

  console.log('\nMigration testing completed!');
}

async function testOptimizer(logger: EnhancedLogger, jsonMode: boolean) {
  if (!jsonMode) {
    console.log('Testing EasyAccessOptimizer with Rules Engine...\n');
  } else {
    logger.info('Testing EasyAccessOptimizer with Rules Engine');
  }

  // Create optimization factory
  const factory = new OptimizationFactory('/Users/david/Websites/cash-management/data/database/cash_savings.db');
  await factory.initialize();

  const optimizer = factory.createEasyAccessOptimizer();
  const rulesEngine = factory.getRulesEngine();

  console.log('Rules Engine Metrics:');
  const metrics = rulesEngine.getMetrics();
  console.log(`   Rules loaded: ${metrics.rulesLoaded}`);
  console.log(`   Rules count: ${metrics.rulesCount}`);

  console.log('\n🧪 Testing Rules Engine with sample data...');
  
  // Test rule validation with sample facts
  const testFacts = {
    rateImprovement: 0.75, // 0.75%
    transferAmount: 25000, // £25,000
    annualBenefit: 187.50, // £187.50
    institutionConcentration: 30, // 30%
    currentRate: 4.5,
    targetRate: 5.25
  };

  const ruleResult = await rulesEngine.executeRules(testFacts);
  console.log(`   Rules triggered: ${ruleResult.events.length}`);
  ruleResult.events.forEach(event => {
    console.log(`   ✓ ${event.type}: ${JSON.stringify(event.params || {})}`);
  });

  console.log('\nCreating test portfolio...');
  
  // Create a simple test portfolio with easy access accounts
  const testPortfolio = {
    accounts: [
      {
        id: 'test-1',
        institutionFRN: '124659', // Goldman Sachs
        bankName: 'Goldman Sachs International Bank',
        accountType: 'Savings' as const,
        accountSubType: 'Easy Access' as const,
        balance: new MoneyImpl(45000),
        rate: 4.5,
        liquidityTier: 'easy_access' as const,
        canWithdrawImmediately: true,
        isJointAccount: false,
        numAccountHolders: 1,
        isActive: true,
        isISA: false,
        lastUpdated: new Date()
      },
      {
        id: 'test-2', 
        institutionFRN: '845350', // NS&I
        bankName: 'NS&I',
        accountType: 'Savings' as const,
        accountSubType: 'Easy Access' as const,
        balance: new MoneyImpl(15000),
        rate: 3.8,
        liquidityTier: 'easy_access' as const,
        canWithdrawImmediately: true,
        isJointAccount: false,
        numAccountHolders: 1,
        isActive: true,
        isISA: false,
        lastUpdated: new Date()
      }
    ],
    pendingDeposits: [], // Required by Portfolio interface
    totalValue: new MoneyImpl(60000),
    institutionCount: 2, // Required by Portfolio interface
    liquidityBreakdown: { // Required by Portfolio interface
      easy_access: new MoneyImpl(60000),
      notice_1_30: new MoneyImpl(0),
      notice_31_60: new MoneyImpl(0),
      notice_61_90: new MoneyImpl(0),
      'notice_90+': new MoneyImpl(0),
      fixed_9m: new MoneyImpl(0),
      fixed_12m: new MoneyImpl(0),
      fixed_24m: new MoneyImpl(0),
      fixed_36m: new MoneyImpl(0),
      fixed_60m: new MoneyImpl(0)
    },
    averageRate: 4.25, // Required by Portfolio interface
    lastUpdated: new Date()
  };

  console.log('Running optimization...');
  const {recommendations, missingFRNAlerts} = await optimizer.optimizeEasyAccess(testPortfolio);
  
  console.log(`   Found ${recommendations.length} recommendations`);
  console.log(`   Found ${missingFRNAlerts.length} missing FRN alerts`);
  
  recommendations.forEach((rec, index) => {
    console.log(`\n   Recommendation ${index + 1}:`);
    console.log(`   From: ${rec.source.bankName} (${rec.source.currentRate}%)`);
    console.log(`   To: ${rec.target.bankName} (${rec.target.targetRate}%)`);
    console.log(`   Amount: £${rec.source.amount.amount.toLocaleString()}`);
    console.log(`   Rate improvement: ${rec.benefits.rateImprovement.value.toFixed(2)}%`);
    console.log(`   Annual benefit: £${rec.benefits.annualBenefit.amount.toFixed(0)}`);
    console.log(`   Priority: ${rec.priority}`);
    console.log(`   Confidence: ${rec.confidence}%`);
  });

  if (recommendations.length > 0) {
    console.log('\nCalculating benefit analysis...');
    const benefitAnalysis = await optimizer.calculateBenefits(recommendations);
    console.log(`   Total annual benefit: £${benefitAnalysis.totalAnnualBenefit.amount.toFixed(0)}`);
    console.log(`   Average rate improvement: ${benefitAnalysis.averageRateImprovement.value.toFixed(2)}%`);
    console.log(`   Risk assessment:`);
    console.log(`     FSCS risk: ${benefitAnalysis.riskAssessment.fscsRisk}`);
    console.log(`     Concentration risk: ${benefitAnalysis.riskAssessment.institutionConcentrationRisk}`);
    console.log(`     Liquidity risk: ${benefitAnalysis.riskAssessment.liquidityRisk}`);
  }

  console.log('\nOptimizer testing completed!');
}

async function generateRealRecommendations(logger: EnhancedLogger, jsonMode: boolean) {
  if (!jsonMode) {
    console.log('Generating Real Recommendations from Portfolio Data...\n');
  } else {
    logger.info('Generating Real Recommendations from Portfolio Data');
  }

  // Create optimization factory and portfolio loader
  const factory = new OptimizationFactory('/Users/david/Websites/cash-management/data/database/cash_savings.db');
  await factory.initialize();

  const db = factory.getDatabaseConnection();
  const portfolioLoader = new PortfolioLoader(db);
  const optimizer = factory.createEasyAccessOptimizer();

  console.log('Loading real portfolio data...');
  const portfolio = await portfolioLoader.loadPortfolio();
  
  console.log(`   Total accounts: ${portfolio.accounts.length}`);
  console.log(`   Portfolio value: £${portfolio.totalValue.amount.toLocaleString()}`);
  console.log(`   Average rate: ${portfolio.averageRate.toFixed(2)}%`);
  console.log(`   Institutions: ${portfolio.institutionCount}`);
  
  // Show easy access breakdown
  const easyAccessAccounts = portfolio.accounts.filter(acc => acc.liquidityTier === 'easy_access');
  console.log(`   Easy access accounts: ${easyAccessAccounts.length}`);
  console.log(`   Easy access value: £${portfolio.liquidityBreakdown.easy_access.amount.toLocaleString()}`);
  
  if (easyAccessAccounts.length === 0) {
    console.log('\nWARNING: No easy access accounts found for optimization.');
    return;
  }

  console.log('\nFinding rate optimization opportunities...');
  
  // Generate real recommendations
  const {recommendations, missingFRNAlerts} = await optimizer.optimizeEasyAccess(portfolio, {
    includePendingDeposits: true,
    allowShariaBanks: true
  });
  
  console.log(`\nFound ${recommendations.length} recommendations:\n`);
  
  if (recommendations.length === 0) {
    console.log('   No optimization opportunities found with current market rates.');
    console.log('   This could mean your current rates are already competitive!');
  } else {
  
  // Group recommendations by display mode and source account for better presentation
  const recommendationsByMode = new Map<string, Map<string, any[]>>();
  
  for (const rec of recommendations) {
    const mode = rec.displayMode || 'OR';
    const accountKey = `${rec.source.bankName} (${rec.source.accountId})`;
    
    if (!recommendationsByMode.has(mode)) {
      recommendationsByMode.set(mode, new Map());
    }
    
    if (!recommendationsByMode.get(mode)!.has(accountKey)) {
      recommendationsByMode.get(mode)!.set(accountKey, []);
    }
    
    recommendationsByMode.get(mode)!.get(accountKey)!.push(rec);
  }

  // Display recommendations grouped by mode
  for (const [mode, accountGroups] of recommendationsByMode) {
    if (mode === 'OR') {
      console.log('   📝 ALTERNATIVES - Choose ONE option per account:');
    } else if (mode === 'AND') {
      console.log('   📝 DIVERSIFICATION MOVES - Execute ALL for accounts above FSCS limit:');
    }
    
    for (const [accountKey, accountRecs] of accountGroups) {
      console.log(`\n   FROM: ${accountKey}`);
      
      if (mode === 'OR') {
        console.log(`   Choose ONE of these ${accountRecs.length} alternatives:`);
      } else {
        console.log(`   Execute ALL of these ${accountRecs.length} moves:`);
      }
      
      accountRecs.forEach((rec: any, index: number) => {
        const modeSymbol = mode === 'OR' ? '⚬' : '▸';
        const frnWarning = rec.missingFRN ? ' [WARNING] NO FRN' : '';
        
        console.log(`\n   ${modeSymbol} Option ${index + 1}:`);
        console.log(`     To: ${rec.target.bankName} (${rec.target.targetRate.toFixed(2)}%)${frnWarning}`);
        console.log(`     Platform: ${rec.target.platform || 'Direct'}`);
        console.log(`     Amount: £${rec.source.amount.amount.toLocaleString()}`);
        console.log(`     Rate improvement: ${rec.benefits.rateImprovement.value.toFixed(2)}%`);
        console.log(`     Annual benefit: £${rec.benefits.annualBenefit.amount.toFixed(0)}`);
        console.log(`     Priority: ${rec.priority}`);
        console.log(`     FSCS Impact: ${rec.compliance.fscsImpact}`);
        
        // Add specific warning for missing FRN
        if (rec.missingFRN) {
          console.log(`     🚨 WARNING: This bank has no FRN - FSCS protection uncertain`);
        }
        
        if (rec.displayNotes && rec.displayNotes.length > 0) {
          console.log(`     INFO: ${rec.displayNotes.join(', ')}`);
        }
        
        if (rec.risks.length > 0) {
          console.log(`     WARNING: Risks: ${rec.risks.join(', ')}`);
        }
      });
    }
    
    console.log('');
  }

  // Calculate and show benefit analysis
  if (recommendations.length > 0) {
    console.log('Portfolio Optimization Summary:');
    const benefitAnalysis = await optimizer.calculateBenefits(recommendations);
    console.log(`   Total annual benefit: £${benefitAnalysis.totalAnnualBenefit.amount.toFixed(0)}`);
    console.log(`   Average rate improvement: ${benefitAnalysis.averageRateImprovement.value.toFixed(2)}%`);
    console.log(`   Recommendations: ${benefitAnalysis.recommendationCount}`);
    console.log(`   Average benefit per recommendation: £${benefitAnalysis.averageBenefit.amount.toFixed(0)}`);
    console.log('\n   Risk Assessment:');
    console.log(`     FSCS risk: ${benefitAnalysis.riskAssessment.fscsRisk}`);
    console.log(`     Concentration risk: ${benefitAnalysis.riskAssessment.institutionConcentrationRisk}`);
    console.log(`     Liquidity risk: ${benefitAnalysis.riskAssessment.liquidityRisk}`);
  }
  
  // Close the else block
  }

  // Display missing FRN alerts if any
  if (missingFRNAlerts.length > 0) {
    console.log('\nWARNING: HIGH-RATE PRODUCTS MISSING FRN');
    console.log('   These products cannot be recommended without FRN data:\n');
    
    missingFRNAlerts.forEach((alert, index) => {
      console.log(`   ${index + 1}. ${alert.bankName} - ${alert.aerRate.toFixed(2)}%`);
      console.log(`      Platform: ${alert.platform}`);
      console.log(`      Potential benefit: £${alert.potentialBenefit.amount.toFixed(0)}/year`);
      console.log(`      Accounts that could benefit: ${alert.affectedAccounts.join(', ')}`);
      console.log(`      Action required: ${alert.actionRequired}`);
      console.log(`      SQL Command:`);
      console.log(`      ${alert.sqlCommand}`);
      console.log(`      Then: Rerun scrapers and recommendation engine\n`);
    });
  }

  console.log('\nReal recommendations generation completed!');
}

function showHelp(jsonMode: boolean) {
  if (jsonMode) {
    const help = {
      commands: {
        'test-config': 'Test configuration loading',
        'validate-db': 'Validate database migrations',
        'test-migrations': 'Test migration results with real data',
        'test-optimizer': 'Test EasyAccessOptimizer with rules engine',
        'real-recommendations': 'Generate recommendations from real portfolio data'
      },
      usage: 'npm run dev <command> [options]',
      options: {
        '--json': 'Output results in JSON format for subprocess integration',
        '--output [file]': 'Save output to file (auto-generates filename if not specified)',
        '--auto-save': 'Automatically save to default directory with timestamp'
      },
      examples: [
        'npm run dev real-recommendations --json',
        'npm run dev real-recommendations --json --auto-save',
        'npm run dev real-recommendations --json --output recommendations.json',
        'npm run dev test-config --json --output'
      ]
    };
    console.log(JSON.stringify(help, null, 2));
  } else {
    console.log('Available commands:');
    console.log('  test-config          - Test configuration loading');
    console.log('  validate-db          - Validate database migrations');
    console.log('  test-migrations      - Test migration results with real data');
    console.log('  test-optimizer       - Test EasyAccessOptimizer with rules engine');
    console.log('  real-recommendations - Generate recommendations from real portfolio data');
    console.log('\nOptions:');
    console.log('  --json               - Output results in JSON format');
    console.log('  --output [file]      - Save output to file (auto-generates filename if not specified)');
    console.log('  --auto-save          - Automatically save to default directory with timestamp');
    console.log('\nExamples:');
    console.log('  npm run dev real-recommendations --json');
    console.log('  npm run dev real-recommendations --json --auto-save');
    console.log('  npm run dev real-recommendations --json --output recommendations.json');
    console.log('\nUsage: npm run dev <command> [options]');
  }
}

if (require.main === module) {
  main().catch(console.error);
}
#!/usr/bin/env node

/**
 * Rate Optimizer CLI - Implements Unified Integration Specification
 * Generates recommendations with calendar events and action items
 */

import { SQLiteConnection } from '../database/connection';
import { ConfigurationLoader } from '../configuration/loader';
import { ProductLoader } from '../products/loader';
import { PortfolioLoader } from '../portfolio/loader';
import { OptimizationRulesEngine } from '../rules/engine';
import { Optimizer } from '../optimization/optimizer';
import { getLogger } from '../utils/logger';
import { 
  ModuleResult, 
  ResultSummary, 
  CalendarEvent, 
  ActionItem 
} from '../types/integration';
import { Recommendation } from '../types';

// Parse command line arguments
function parseArgs(args: string[]): {
  format: 'json' | 'text';
  includeCalendarEvents: boolean;
  includeActionItems: boolean;
  outputFile?: string;
  silent: boolean;
  progress: boolean;
  debug: boolean;
  database?: string;
} {
  const options: {
    format: 'json' | 'text';
    includeCalendarEvents: boolean;
    includeActionItems: boolean;
    outputFile?: string;
    silent: boolean;
    progress: boolean;
    debug: boolean;
    database?: string;
  } = {
    format: 'text',
    includeCalendarEvents: false,
    includeActionItems: false,
    silent: false,
    progress: false,
    debug: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--format':
        if (nextArg === 'json' || nextArg === 'text') {
          options.format = nextArg;
          i++;
        }
        break;
      case '--json':
        options.format = 'json';
        break;
      case '--include-calendar-events':
        options.includeCalendarEvents = true;
        break;
      case '--include-action-items':
        options.includeActionItems = true;
        break;
      case '--output':
        if (nextArg) {
          options.outputFile = nextArg;
          i++;
        }
        break;
      case '--silent':
        options.silent = true;
        break;
      case '--progress':
        options.progress = true;
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--database':
        if (nextArg) {
          options.database = nextArg;
          i++;
        }
        break;
    }
  }

  return options;
}

// Report progress to stderr
function reportProgress(percent: number, message: string, options: ReturnType<typeof parseArgs>) {
  if (options.progress) {
    process.stderr.write(`PROGRESS:${percent}:${message}\n`);
  }
}

// Generate calendar events from recommendations
function generateCalendarEvents(recommendations: Recommendation[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  
  for (const rec of recommendations) {
    const event: CalendarEvent = {
      event_id: `opt-event-${rec.id}`,
      module: 'rate-optimizer' as const,
      action_type: 'rate_optimization' as const,
      deposit_id: null,
      bank: rec.source.bankName,
      amount: rec.source.amount.amount,
      event_date: new Date().toISOString().split('T')[0] || '',
      title: `Rate improvement: ${rec.source.bankName} → ${rec.target.bankName}`,
      description: `Move £${rec.source.amount.amount.toLocaleString()} for ${rec.benefits.rateImprovement.value.toFixed(2)}% better rate (£${rec.benefits.annualBenefit.amount.toFixed(0)}/year)`,
      priority: rec.priority.toLowerCase() as 'urgent' | 'high' | 'medium' | 'low',
      category: 'OPTIMIZATION' as const,
      current_rate: rec.source.currentRate,
      new_rate: rec.target.targetRate,
      metadata: {
        recommendationId: rec.id,
        platform: rec.target.platform,
        displayMode: rec.displayMode
      }
    };
    events.push(event);
  }
  
  return events;
}

// Generate action items from recommendations
function generateActionItems(recommendations: Recommendation[]): ActionItem[] {
  const items: ActionItem[] = [];
  
  // Group by source account for better action items
  const byAccount = new Map<string, Recommendation[]>();
  for (const rec of recommendations) {
    const key = rec.source.accountId;
    if (!byAccount.has(key)) {
      byAccount.set(key, []);
    }
    byAccount.get(key)!.push(rec);
  }
  
  for (const [accountId, recs] of byAccount) {
    const firstRec = recs[0];
    if (!firstRec) continue;
    
    // Calculate timeline based on priority
    let timeline = 'This month';
    if (firstRec.priority === 'URGENT') timeline = 'Immediate';
    else if (firstRec.priority === 'HIGH') timeline = 'This week';
    else if (firstRec.priority === 'MEDIUM') timeline = 'This month';
    else timeline = 'When convenient';
    
    const totalAmount = recs.reduce((sum, r) => sum + r.source.amount.amount, 0);
    const totalBenefit = recs.reduce((sum, r) => sum + r.benefits.annualBenefit.amount, 0);
    
    const item: ActionItem = {
      action_id: `opt-action-${accountId}-${Date.now()}`,
      module: 'rate-optimizer' as const,
      title: recs.length > 1 
        ? `Diversify ${firstRec.source.bankName} funds (${recs.length} transfers)`
        : `Move ${firstRec.source.bankName} funds`,
      description: recs.length > 1
        ? `Transfer £${totalAmount.toLocaleString()} across ${recs.length} institutions for £${totalBenefit.toFixed(0)}/year benefit`
        : `Transfer £${totalAmount.toLocaleString()} to ${firstRec.target.bankName} for £${totalBenefit.toFixed(0)}/year benefit`,
      priority: firstRec.priority,
      category: 'OPTIMIZATION',
      timeline,
      bank: firstRec.source.bankName,
      amount_affected: totalAmount,
      expected_benefit: totalBenefit,
      source_data: {
        accountId,
        recommendationCount: recs.length,
        recommendationIds: recs.map(r => r.id),
        recommendations: recs.map(r => ({
          id: r.id,
          sourceBank: r.source.bankName,
          targetBank: r.target.bankName,
          amount: r.source.amount.amount,
          currentRate: r.source.currentRate,
          targetRate: r.target.targetRate,
          rateImprovement: r.benefits.rateImprovement.value,
          annualBenefit: r.benefits.annualBenefit.amount,
          platform: r.target.platform,
          institutionFRN: r.target.institutionFRN,
          reason: r.recommendationReason,
          confidence: r.confidence,
          compliance: r.compliance,
          implementationNotes: r.implementationNotes,
          displayMode: r.displayMode
        }))
      },
      status: 'pending',
      created_at: new Date().toISOString()
    };
    items.push(item);
  }
  
  return items;
}

async function main() {
  const args = process.argv.slice(2);
  
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Rate Optimizer CLI - Unified Integration Format
    
Options:
  --format json|text       Output format (default: text)
  --include-calendar-events Generate calendar events
  --include-action-items   Generate action items  
  --progress              Show progress updates
  --silent                Suppress console output
  --output <file>         Save output to file
  --database <path>       Database path
  --help                  Show this help message

Example:
  npx ts-node src/cli/optimize-cli.ts --format json --include-calendar-events --include-action-items
`);
    process.exit(0);
  }
  
  const options = parseArgs(args);
  
  // Set up logger
  const logger = getLogger({ 
    component: 'optimize-cli',
    silent: options.silent 
  });

  const startTime = Date.now();
  let exitCode = 0;

  try {
    // Database connection
    const dbPath = options.database || process.env.DATABASE_PATH || '/Users/david/Websites/cash-management/data/database/cash_savings.db';
    const db = new SQLiteConnection(dbPath);
    
    reportProgress(10, 'Connecting to database', options);
    await db.connect();
    
    // Clear previous optimizer data to avoid accumulation
    if (options.includeCalendarEvents) {
      await db.query(`DELETE FROM calendar_events WHERE module = 'rate-optimizer'`);
    }
    if (options.includeActionItems) {
      await db.query(`DELETE FROM action_items WHERE module = 'rate-optimizer'`);
    }
    
    if (!options.silent && options.format === 'text') {
      logger.info('Cash Management Rate Optimizer');
      logger.info('================================\n');
    }

    // Initialize components
    reportProgress(20, 'Loading configuration', options);
    const configLoader = new ConfigurationLoader(db);
    const productLoader = new ProductLoader(db);
    const portfolioLoader = new PortfolioLoader(db);
    const rulesEngine = new OptimizationRulesEngine(configLoader);

    reportProgress(30, 'Initializing rules engine', options);
    await rulesEngine.initialize();

    // Load portfolio
    reportProgress(40, 'Loading portfolio', options);
    const portfolio = await portfolioLoader.loadPortfolio();

    // Create and run optimizer
    reportProgress(50, 'Analyzing opportunities', options);
    const optimizer = new Optimizer(rulesEngine, configLoader, productLoader);
    
    reportProgress(70, 'Generating recommendations', options);
    const recommendations = await optimizer.optimize(portfolio);

    // Generate calendar events if requested
    let calendarEvents: CalendarEvent[] = [];
    if (options.includeCalendarEvents) {
      reportProgress(80, 'Generating calendar events', options);
      calendarEvents = generateCalendarEvents(recommendations);
      
      // Save to database
      for (const event of calendarEvents) {
        await db.query(`
          INSERT INTO calendar_events (
            event_source, event_type, module, event_date, bank, amount, 
            title, description, priority, category,
            current_rate, new_rate, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'report',  // event_source for optimizer recommendations
          'report_action',  // event_type for optimizer actions
          event.module,
          event.event_date,
          event.bank,
          event.amount,
          event.title,
          event.description,
          event.priority,
          event.category,
          event.current_rate,
          event.new_rate,
          JSON.stringify(event.metadata)
        ]);
      }
    }

    // Generate action items if requested
    let actionItems: ActionItem[] = [];
    if (options.includeActionItems) {
      reportProgress(85, 'Generating action items', options);
      actionItems = generateActionItems(recommendations);
      
      // Save to database
      for (const item of actionItems) {
        await db.query(`
          INSERT INTO action_items (
            action_id, module, title, description,
            priority, category, timeline, bank,
            amount_affected, expected_benefit, source_data, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.action_id,
          item.module,
          item.title,
          item.description,
          item.priority,
          item.category,
          item.timeline,
          item.bank,
          item.amount_affected,
          item.expected_benefit,
          JSON.stringify(item.source_data),
          item.status
        ]);
      }
    }

    // Save recommendations to database
    reportProgress(90, 'Saving recommendations', options);
    for (const rec of recommendations) {
      const sourceAccount = portfolio.accounts.find(a => a.id === rec.source.accountId);
      
      await db.query(`
        INSERT INTO optimization_recommendations (
          recommendation_id, source_account_id, source_bank, source_frn,
          source_amount, source_rate, target_bank, target_frn,
          target_rate, target_platform, marginal_benefit, annual_benefit,
          recommendation_reason, priority, confidence_score, status,
          created_at, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `, [
        rec.id,
        rec.source.accountId,
        rec.source.bankName,
        sourceAccount?.institutionFRN || null,
        rec.source.amount.amount,
        rec.source.currentRate,
        rec.target.bankName,
        rec.target.institutionFRN,
        rec.target.targetRate,
        rec.target.platform,
        rec.benefits.rateImprovement.value,
        rec.benefits.annualBenefit.amount,
        rec.recommendationReason || 'Highest available rate',
        rec.priority,
        rec.confidence || 95,
        'PENDING',
        JSON.stringify({
          displayMode: rec.displayMode,
          compliance: rec.compliance,
          implementationNotes: rec.implementationNotes
        })
      ]);
    }

    reportProgress(95, 'Preparing output', options);

    // Calculate summary
    const totalBenefit = recommendations.reduce((sum, r) => sum + r.benefits.annualBenefit.amount, 0);
    const avgImprovement = recommendations.length > 0 
      ? recommendations.reduce((sum, r) => sum + r.benefits.rateImprovement.value, 0) / recommendations.length
      : 0;
    const urgentCount = recommendations.filter(r => r.priority === 'URGENT').length;

    const summary: ResultSummary = {
      totalAccounts: portfolio.accounts.length,
      totalValue: portfolio.totalValue.amount,
      recommendationCount: recommendations.length,
      urgentActions: urgentCount,
      totalBenefit,
      averageRateImprovement: avgImprovement
    };

    // Prepare result
    const result: ModuleResult = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      status: recommendations.length > 0 ? 'SUCCESS' : 'WARNING',
      module: 'rate-optimizer',
      summary,
      recommendations,
      calendarEvents,
      actionItems,
      metadata: {
        executionTime: Date.now() - startTime,
        configVersion: '1.0.0',
        accountsProcessed: portfolio.accounts.length,
        productsEvaluated: await productLoader.getProductCount()
      }
    };

    // Output based on format
    if (options.format === 'json') {
      const output = JSON.stringify(result, null, 2);
      
      if (options.outputFile) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.outputFile, output);
        if (!options.silent) {
          logger.info(`Output saved to ${options.outputFile}`);
        }
      } else {
        console.log(output);
      }
    } else {
      // Text format output
      if (!options.silent) {
        logger.info(`\nGenerated ${recommendations.length} recommendations`);
        logger.info(`Total annual benefit: £${totalBenefit.toFixed(2)}`);
        logger.info(`Average rate improvement: ${avgImprovement.toFixed(2)}%`);
        
        if (options.includeCalendarEvents) {
          logger.info(`Created ${calendarEvents.length} calendar events`);
        }
        if (options.includeActionItems) {
          logger.info(`Created ${actionItems.length} action items`);
        }
      }
    }

    reportProgress(100, 'Complete', options);
    
    // Set exit code based on results
    if (recommendations.length === 0) {
      exitCode = 1; // Warning - no recommendations
    }

    await db.close();

  } catch (error) {
    if (!options.silent) {
      logger.error('Error: ' + (error instanceof Error ? error.message : String(error)));
    }
    
    if (options.format === 'json') {
      const errorResult: ModuleResult = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        status: 'ERROR',
        module: 'rate-optimizer',
        summary: {
          totalAccounts: 0,
          totalValue: 0,
          recommendationCount: 0,
          urgentActions: 0
        },
        recommendations: [],
        calendarEvents: [],
        actionItems: [],
        metadata: {
          executionTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error)
        }
      };
      console.log(JSON.stringify(errorResult, null, 2));
    }
    
    exitCode = 2; // Error
  }

  process.exit(exitCode);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(2);
  });
}

export { main };
#!/usr/bin/env node

/**
 * FSCS Compliance CLI Tool
 * 
 * Command-line interface for FSCS compliance checking and diversification recommendations.
 * Designed for subprocess integration with Electron app.
 * Outputs JSON only for machine consumption.
 */

import { Command } from 'commander';
import { FSCSComplianceEngine, ComplianceReport, ComplianceBreach } from '../compliance/fscs';
import { DiversificationEngine, DiversificationRecommendation } from '../compliance/diversification';
import { CalendarEvent, ActionItem } from '../types/shared';
import { SQLiteConnection } from '../database/connection';
import * as fs from 'fs/promises';
import * as path from 'path';

interface CLIOptions {
  database?: string;
  includePending?: boolean;
  maxRateLoss?: string;
  diversify?: boolean;
  output?: string | boolean;  // Can be a path, true for auto-naming, or undefined
  autoSave?: boolean;  // Force save to default directory with timestamp
  warningThreshold?: string;
  excludeFrns?: string;
  accountType?: 'easy_access' | 'notice' | 'fixed_term';
  // New integration flags
  includeCalendarEvents?: boolean;
  includeActionItems?: boolean;
  silent?: boolean;
  progress?: boolean;
  format?: 'json' | 'text';
}

interface FullComplianceReport extends ComplianceReport {
  diversificationRecommendations?: DiversificationRecommendation[];
}

// Default output directory configuration
const DEFAULT_OUTPUT_DIR = path.join('/Users/david/Websites/cash-management/recommendation-engine', 'reports', 'compliance');

// Helper function to generate timestamp-based filename
function generateTimestampFilename(): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')  // Replace colons and dots
    .replace('T', '_')       // Replace T with underscore
    .replace('Z', '');       // Remove Z
  return `fscs-compliance-${timestamp}.json`;
}

// Helper function to ensure directory exists
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`Warning: Could not create directory ${dirPath}:`, error);
  }
}

// Generate calendar events from breaches
function generateCalendarEvents(breaches: ComplianceBreach[]): CalendarEvent[] {
  return breaches.map(breach => ({
    event_id: `fscs-event-${breach.frn}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    module: 'fscs-compliance' as const,
    action_type: 'fscs_breach',
    bank: breach.institutions[0] || 'Unknown',
    amount: breach.excessAmount,
    action_date: new Date().toISOString().split('T')[0] || '2025-01-01',
    title: `FSCS Breach: ${breach.institutions[0] || 'Unknown'}`,
    description: `£${breach.excessAmount.toFixed(2)} exceeds FSCS protection limit`,
    priority: 'urgent' as const,
    category: 'COMPLIANCE' as const,
    current_rate: null,
    new_rate: null,
    metadata: {
      breachType: 'over_limit',
      exposureAmount: breach.totalExposure,
      protectedAmount: breach.effectiveLimit,
      frn: breach.frn,
      accountIds: breach.accountIds
    }
  }));
}

// Generate action items from breaches
function generateActionItems(breaches: ComplianceBreach[]): ActionItem[] {
  return breaches.map(breach => ({
    action_id: `fscs-action-${breach.frn}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    module: 'fscs-compliance' as const,
    title: `Urgent: FSCS Breach at ${breach.institutions[0] || 'Unknown'}`,
    description: `Move £${breach.excessAmount.toFixed(2)} to achieve FSCS compliance`,
    priority: 'URGENT' as const,
    category: 'COMPLIANCE' as const,
    timeline: 'Immediate',
    bank: breach.institutions[0] || 'Unknown',
    amount_affected: breach.excessAmount,
    expected_benefit: null,
    source_data: {
      breachAmount: breach.excessAmount,
      currentExposure: breach.totalExposure,
      fscsLimit: breach.effectiveLimit,
      frn: breach.frn,
      accountIds: breach.accountIds
    },
    status: 'pending' as const
  }));
}

const program = new Command();

program
  .name('fscs-compliance')
  .description('FSCS compliance analysis and diversification recommendations')
  .version('2.0.0')
  .option('-d, --database <path>', 'path to SQLite database', process.env.DATABASE_PATH)
  .option('--include-pending', 'include pending deposits in analysis', false)
  .option('--max-rate-loss <percent>', 'maximum acceptable rate loss for diversification', '0.5')
  .option('--diversify', 'generate diversification recommendations for breaches', false)
  .option('--warning-threshold <percent>', 'warning threshold as percentage of limit', '0.9')
  .option('--exclude-frns <frns>', 'comma-separated FRNs to exclude from diversification targets')
  .option('--account-type <type>', 'account type for diversification', 'easy_access')
  .option('-o, --output [file]', 'output to file (if no file specified, uses timestamp in default directory)')
  .option('--auto-save', 'automatically save to default directory with timestamp', false)
  .option('--include-calendar-events', 'generate calendar events for breaches', false)
  .option('--include-action-items', 'generate action items for required actions', false)
  .option('--silent', 'suppress non-JSON output', false)
  .option('--progress', 'emit progress updates to stderr', false)
  .option('--format <type>', 'output format (json|text)', 'json')
  .action(async (options: CLIOptions) => {
    let complianceEngine: FSCSComplianceEngine | null = null;
    let diversificationEngine: DiversificationEngine | null = null;
    let db: SQLiteConnection | null = null;
    
    const startTime = Date.now();
    
    try {
      // Progress: Starting
      if (options.progress) {
        process.stderr.write('PROGRESS:10:Loading portfolio\n');
      }
      
      // Validate database path
      const dbPath = options.database!;
      try {
        await fs.access(dbPath);
      } catch {
        throw new Error(`Database not found: ${dbPath}`);
      }
      
      // Initialize engines
      complianceEngine = new FSCSComplianceEngine(dbPath);
      
      // Progress: Analyzing compliance
      if (options.progress) {
        process.stderr.write('PROGRESS:25:Analyzing compliance\n');
      }
      
      // Generate compliance report
      const report = await complianceEngine.generateComplianceReport({
        includePendingDeposits: options.includePending || false,
        warningThreshold: parseFloat(options.warningThreshold || '0.9')
      });
      
      // Progress: Checking breaches
      if (options.progress) {
        process.stderr.write('PROGRESS:50:Checking breaches\n');
      }
      
      // Cast to full report type
      const fullReport: FullComplianceReport = report;
      
      // Add diversification recommendations if requested and needed
      let diversifications: DiversificationRecommendation[] = [];
      if (options.diversify && report.breaches.length > 0) {
        if (options.progress) {
          process.stderr.write('PROGRESS:75:Generating recommendations\n');
        }
        
        diversificationEngine = new DiversificationEngine(dbPath);
        
        const excludeFRNs = options.excludeFrns ? options.excludeFrns.split(',').map(f => f.trim()) : [];
        
        diversifications = await diversificationEngine.generateDiversificationPlan(
          report.breaches,
          {
            maxAcceptableRateLoss: parseFloat(options.maxRateLoss || '0.5'),
            excludeFRNs,
            accountType: options.accountType || 'easy_access'
          }
        );
        fullReport.diversificationRecommendations = diversifications;
      }
      
      // Progress: Complete
      if (options.progress) {
        process.stderr.write('PROGRESS:100:Complete\n');
      }
      
      // Initialize database connection for saving events and actions
      if (options.includeCalendarEvents || options.includeActionItems) {
        db = new SQLiteConnection(dbPath);
        
        // Clear previous FSCS data to avoid accumulation
        if (options.includeCalendarEvents) {
          await db.query(`DELETE FROM calendar_events WHERE module = 'fscs-compliance'`);
        }
        if (options.includeActionItems) {
          await db.query(`DELETE FROM action_items WHERE module = 'fscs-compliance'`);
        }
      }
      
      // Generate calendar events if requested
      let calendarEvents: CalendarEvent[] | undefined;
      if (options.includeCalendarEvents) {
        if (options.progress) {
          process.stderr.write('PROGRESS:80:Generating calendar events\n');
        }
        calendarEvents = generateCalendarEvents(report.breaches);
        
        // Save to database
        if (db) {
          for (const event of calendarEvents) {
            await db.query(`
              INSERT INTO calendar_events (
                event_source, event_type, module, event_date, bank, amount, 
                title, description, priority, category,
                current_rate, new_rate, metadata
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              'report',  // event_source for FSCS compliance reports
              'report_action',  // event_type for FSCS actions
              event.module,
              event.action_date,  // Map action_date from CalendarEvent to event_date in database
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
      }
      
      // Generate action items if requested
      let actionItems: ActionItem[] | undefined;
      if (options.includeActionItems) {
        if (options.progress) {
          process.stderr.write('PROGRESS:85:Generating action items\n');
        }
        actionItems = generateActionItems(report.breaches);
        
        // Save to database
        if (db) {
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
      }
      
      // Build output based on format
      let output: string;
      
      if (options.format === 'json' || !options.format) {
        // Build ModuleResult structure
        const moduleResult: any = {
          version: report.version,
          timestamp: report.timestamp,
          status: report.status === 'BREACH' ? 'WARNING' : 'SUCCESS',
          module: 'fscs-compliance',
          summary: {
            totalAccounts: report.summary.totalAccounts,
            totalValue: report.summary.totalValue,
            recommendationCount: diversifications.length,
            urgentActions: report.breaches.length,
            breachCount: report.summary.breachCount,
            totalAtRisk: report.summary.totalAtRisk
          },
          recommendations: diversifications,
          metadata: {
            executionTime: Date.now() - startTime,
            configVersion: '2.0.0',
            institutionCount: report.summary.institutionCount,
            warningCount: report.warnings.length
          }
        };
        
        // Add optional fields only if defined
        if (calendarEvents) {
          moduleResult.calendarEvents = calendarEvents;
        }
        if (actionItems) {
          moduleResult.actionItems = actionItems;
        }
        
        // Include full report details in metadata if not generating events
        if (!options.includeCalendarEvents && !options.includeActionItems) {
          (moduleResult.metadata as any).fullReport = fullReport;
        }
        
        output = JSON.stringify(moduleResult, null, 2);
      } else {
        // Text format - use original report
        output = JSON.stringify(fullReport, null, 2);
      }
      
      // Determine output location
      let outputPath: string | null = null;
      
      // Handle different output scenarios
      if (options.autoSave || options.output === true) {
        // Auto-save with timestamp or --output without filename
        await ensureDirectoryExists(DEFAULT_OUTPUT_DIR);
        outputPath = path.join(DEFAULT_OUTPUT_DIR, generateTimestampFilename());
      } else if (typeof options.output === 'string') {
        // Specific file path provided
        outputPath = options.output;
        // Ensure parent directory exists
        const parentDir = path.dirname(outputPath);
        await ensureDirectoryExists(parentDir);
      }
      
      // Write to file if output path determined
      if (outputPath) {
        await fs.writeFile(outputPath, output, 'utf-8');
        // For subprocess integration, output success message to stdout
        if (!options.silent) {
          console.log(JSON.stringify({ 
            success: true, 
            message: `Report saved to ${outputPath}`,
            file: outputPath,
            status: report.status,
            summary: report.summary
          }));
        }
      } else {
        // Output to stdout for subprocess consumption
        console.log(output);
      }
      
      // Exit with appropriate code
      // 0 = compliant, 1 = has breaches, 2 = error
      process.exit(report.status === 'BREACH' ? 1 : 0);
      
    } catch (error: any) {
      // Output error as JSON for subprocess consumption
      console.error(JSON.stringify({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }));
      process.exit(2);
    } finally {
      // Clean up
      if (complianceEngine) {
        complianceEngine.close();
      }
      if (diversificationEngine) {
        diversificationEngine.close();
      }
      if (db) {
        db.close();
      }
    }
  });

// Parse command line arguments
program.parse(process.argv);

// If no arguments provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
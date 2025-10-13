#!/usr/bin/env node

/**
 * Pipeline CLI Debug Tool
 *
 * Standalone CLI for debugging and testing the pipeline package without
 * rebuilding the Electron app. Connects directly to the production database
 * and supports all pipeline operations.
 *
 * Usage:
 *   npm run cli                                    # Run full pipeline
 *   npm run cli -- --stop-after json_ingestion     # Stop after specific stage
 *   npm run cli -- --rebuild-only                  # Rebuild from raw data only
 *   npm run cli -- --help                          # Show help
 *
 * Environment Variables:
 *   PIPELINE_VERBOSE=true    # Show stage progress and summaries
 *   PIPELINE_DEBUG=true      # Show detailed file-by-file progress
 *   PIPELINE_ATOMIC=false    # Use incremental mode (default: true)
 *   DATABASE_PATH=<path>     # Override database path
 */

import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { OrchestrationService, PipelineStage } from './services/OrchestrationService';
import { logger } from './utils/PipelineLogger';

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

interface CLIOptions {
  stopAfter?: PipelineStage;
  rebuildOnly?: boolean;
  files?: string[];
  help?: boolean;
  version?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;

      case '--version':
      case '-v':
        options.version = true;
        break;

      case '--stop-after':
        const stage = args[++i];
        if (!stage) {
          console.error(`${colors.red}Error: --stop-after requires a stage name${colors.reset}`);
          process.exit(1);
        }
        // Validate stage
        const validStages = ['json_ingestion', 'frn_matching', 'deduplication', 'data_quality'];
        if (!validStages.includes(stage)) {
          console.error(`${colors.red}Error: Invalid stage '${stage}'. Valid stages: ${validStages.join(', ')}${colors.reset}`);
          process.exit(1);
        }
        options.stopAfter = stage as PipelineStage;
        break;

      case '--rebuild-only':
        options.rebuildOnly = true;
        break;

      case '--files':
        // Collect all file paths until next flag
        options.files = [];
        while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          options.files.push(args[++i]);
        }
        break;

      default:
        if (arg.startsWith('--')) {
          console.error(`${colors.red}Error: Unknown option '${arg}'${colors.reset}`);
          console.error(`Run with --help for usage information`);
          process.exit(1);
        }
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
${colors.bright}${colors.cyan}Pipeline CLI Debug Tool${colors.reset}

${colors.bright}USAGE:${colors.reset}
  npm run cli [options]

${colors.bright}OPTIONS:${colors.reset}
  ${colors.green}--help, -h${colors.reset}              Show this help message
  ${colors.green}--version, -v${colors.reset}           Show version information
  ${colors.green}--stop-after <stage>${colors.reset}    Stop pipeline after specified stage
                            Stages: json_ingestion, frn_matching, deduplication, data_quality
  ${colors.green}--rebuild-only${colors.reset}          Only rebuild from raw data (skip ingestion)
  ${colors.green}--files <paths...>${colors.reset}      Process specific JSON files

${colors.bright}ENVIRONMENT VARIABLES:${colors.reset}
  ${colors.yellow}PIPELINE_VERBOSE=true${colors.reset}     Show stage progress and summaries
  ${colors.yellow}PIPELINE_DEBUG=true${colors.reset}       Show detailed file-by-file progress
  ${colors.yellow}PIPELINE_ATOMIC=false${colors.reset}     Use incremental mode (default: true)
  ${colors.yellow}DATABASE_PATH=<path>${colors.reset}      Override database path

${colors.bright}EXAMPLES:${colors.reset}
  # Run full pipeline with verbose logging
  ${colors.dim}PIPELINE_VERBOSE=true npm run cli${colors.reset}

  # Stop after JSON ingestion to debug validation
  ${colors.dim}npm run cli -- --stop-after json_ingestion${colors.reset}

  # Debug deduplication by rebuilding from raw data
  ${colors.dim}npm run cli -- --rebuild-only${colors.reset}

  # Process specific JSON files with debug logging
  ${colors.dim}PIPELINE_DEBUG=true npm run cli -- --files ../scrapers/data/moneyfacts/*.json${colors.reset}

  # Run in incremental mode (useful for testing)
  ${colors.dim}PIPELINE_ATOMIC=false npm run cli${colors.reset}

${colors.bright}DOCUMENTATION:${colors.reset}
  See CLI-DEBUG-GUIDE.md for comprehensive debugging workflows
`);
}

/**
 * Show version information
 */
function showVersion(): void {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
  );
  console.log(`${colors.cyan}Pipeline CLI${colors.reset} v${packageJson.version}`);
}

/**
 * Get database path (production or test)
 */
function getDatabasePath(): string {
  // Allow override via environment variable
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }

  // Default: production database
  const defaultPath = path.resolve(__dirname, '../../../data/database/cash_savings.db');

  if (!fs.existsSync(defaultPath)) {
    console.error(`${colors.red}Error: Database not found at ${defaultPath}${colors.reset}`);
    console.error(`Set DATABASE_PATH environment variable to specify a different location`);
    process.exit(1);
  }

  return defaultPath;
}

/**
 * Find JSON files to process
 */
function findJSONFiles(patterns?: string[]): string[] {
  if (patterns && patterns.length > 0) {
    // Use specified files/patterns
    const files: string[] = [];
    for (const pattern of patterns) {
      // Simple glob support
      if (pattern.includes('*')) {
        const dir = path.dirname(pattern);
        const filePattern = path.basename(pattern);
        const regex = new RegExp('^' + filePattern.replace(/\*/g, '.*') + '$');

        if (fs.existsSync(dir)) {
          const dirFiles = fs.readdirSync(dir)
            .filter(f => regex.test(f))
            .map(f => path.join(dir, f));
          files.push(...dirFiles);
        }
      } else if (fs.existsSync(pattern)) {
        files.push(pattern);
      } else {
        console.warn(`${colors.yellow}Warning: File not found: ${pattern}${colors.reset}`);
      }
    }
    return files;
  }

  // Default: find all normalized JSON files in scrapers/data
  const dataDir = path.resolve(__dirname, '../../scrapers/data');
  const platforms = ['ajbell', 'flagstone', 'hargreaves-lansdown', 'moneyfacts'];
  const files: string[] = [];

  for (const platform of platforms) {
    const platformDir = path.join(dataDir, platform);
    if (fs.existsSync(platformDir)) {
      const platformFiles = fs.readdirSync(platformDir)
        .filter(f => f.includes('-normalized-') && f.endsWith('.json'))
        .map(f => path.join(platformDir, f));
      files.push(...platformFiles);
    }
  }

  return files;
}

/**
 * Print pipeline summary
 */
function printSummary(result: any, duration: number): void {
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}           PIPELINE EXECUTION SUMMARY${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`);

  // Status
  const statusIcon = result.success ? '✅' : '❌';
  const statusColor = result.success ? colors.green : colors.red;
  const statusText = result.success ? 'SUCCESS' : 'FAILED';
  console.log(`${colors.bright}Status:${colors.reset} ${statusColor}${statusIcon} ${statusText}${colors.reset}`);

  // Stages completed
  console.log(`${colors.bright}Stages Completed:${colors.reset} ${result.stagesCompleted.length}/4`);
  if (result.stagesCompleted.length > 0) {
    result.stagesCompleted.forEach((stage: string) => {
      console.log(`  ${colors.green}✓${colors.reset} ${stage}`);
    });
  }

  // Products processed
  if (result.totalProductsProcessed > 0) {
    console.log(`\n${colors.bright}Products:${colors.reset}`);
    console.log(`  Input:  ${colors.cyan}${result.totalProductsProcessed}${colors.reset}`);
    console.log(`  Final:  ${colors.cyan}${result.finalProductCount}${colors.reset}`);

    if (result.ingestionResult) {
      const rejectionRate = result.totalProductsProcessed > 0
        ? ((result.ingestionResult.rejected.length / result.totalProductsProcessed) * 100).toFixed(1)
        : '0';
      console.log(`  Rejected: ${colors.yellow}${result.ingestionResult.rejected.length}${colors.reset} (${rejectionRate}%)`);
    }
  }

  // Data quality score
  if (result.dataQualityReport) {
    const score = result.dataQualityReport.overallScore;
    const scoreColor = score >= 80 ? colors.green : score >= 60 ? colors.yellow : colors.red;
    console.log(`\n${colors.bright}Data Quality Score:${colors.reset} ${scoreColor}${score}/100${colors.reset}`);

    if (result.dataQualityReport.anomalies.length > 0) {
      console.log(`  Anomalies: ${colors.yellow}${result.dataQualityReport.anomalies.length}${colors.reset}`);
    }
  }

  // Performance
  console.log(`\n${colors.bright}Performance:${colors.reset}`);
  console.log(`  Duration: ${colors.cyan}${(duration / 1000).toFixed(2)}s${colors.reset}`);
  if (result.performanceMetrics.throughputPerSecond > 0) {
    console.log(`  Throughput: ${colors.cyan}${result.performanceMetrics.throughputPerSecond.toFixed(1)}${colors.reset} products/sec`);
  }

  // Errors
  if (result.errors.length > 0) {
    console.log(`\n${colors.bright}${colors.red}Errors:${colors.reset}`);
    result.errors.forEach((error: any) => {
      console.log(`  ${colors.red}•${colors.reset} [${error.stage}] ${error.message}`);
    });
  }

  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`);
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const options = parseArgs();

  // Handle help and version
  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.version) {
    showVersion();
    process.exit(0);
  }

  // Banner
  console.log(`${colors.bright}${colors.cyan}Pipeline CLI Debug Tool${colors.reset}`);
  console.log(`${colors.dim}────────────────────────────────────────────────────${colors.reset}\n`);

  // Configuration summary
  console.log(`${colors.bright}Configuration:${colors.reset}`);
  console.log(`  Verbose:  ${process.env.PIPELINE_VERBOSE === 'true' ? colors.green + 'enabled' : colors.dim + 'disabled'}${colors.reset}`);
  console.log(`  Debug:    ${process.env.PIPELINE_DEBUG === 'true' ? colors.green + 'enabled' : colors.dim + 'disabled'}${colors.reset}`);
  console.log(`  Atomic:   ${process.env.PIPELINE_ATOMIC !== 'false' ? colors.green + 'enabled' : colors.yellow + 'disabled'}${colors.reset}`);

  if (options.stopAfter) {
    console.log(`  Stop After: ${colors.cyan}${options.stopAfter}${colors.reset}`);
  }

  if (options.rebuildOnly) {
    console.log(`  Mode:     ${colors.cyan}rebuild-only${colors.reset}`);
  }

  console.log();

  // Initialize database
  const dbPath = getDatabasePath();
  console.log(`${colors.dim}Database: ${dbPath}${colors.reset}\n`);

  let db: Database.Database | null = null;
  let orchestrator: OrchestrationService | null = null;

  try {
    // Connect to database
    db = new Database(dbPath);
    console.log(`${colors.green}✓${colors.reset} Database connection established\n`);

    // Initialize orchestrator
    orchestrator = new OrchestrationService(db, dbPath);
    await orchestrator.initialize();

    const startTime = Date.now();

    // Execute pipeline based on options
    if (options.rebuildOnly) {
      // Rebuild from raw data only
      logger.info('🔄 Rebuilding from raw data...');
      await orchestrator.rebuildFromRawData({ stopAfterStage: options.stopAfter });

      // Create a result summary for rebuild
      const duration = Date.now() - startTime;
      const finalCount = db.prepare('SELECT COUNT(*) as count FROM available_products').get() as { count: number };

      console.log(`\n${colors.green}✓${colors.reset} Rebuild complete: ${finalCount.count} products`);
      console.log(`  Duration: ${colors.cyan}${(duration / 1000).toFixed(2)}s${colors.reset}\n`);

    } else {
      // Full pipeline execution
      const inputFiles = findJSONFiles(options.files);

      if (inputFiles.length === 0) {
        console.warn(`${colors.yellow}Warning: No JSON files found to process${colors.reset}`);
        console.log(`Run scrapers first or specify files with --files option\n`);
        process.exit(0);
      }

      console.log(`${colors.dim}Processing ${inputFiles.length} file(s)...${colors.reset}\n`);

      const result = await orchestrator.executePipelineWithUI(
        inputFiles,
        undefined,
        { stopAfterStage: options.stopAfter }
      );

      const duration = Date.now() - startTime;

      // Print summary
      printSummary(result, duration);

      // Exit with appropriate code
      process.exit(result.success ? 0 : 1);
    }

  } catch (error) {
    console.error(`\n${colors.red}${colors.bright}Pipeline Execution Failed${colors.reset}`);
    console.error(`${colors.red}${error instanceof Error ? error.message : String(error)}${colors.reset}\n`);

    if (error instanceof Error && error.stack) {
      console.error(`${colors.dim}${error.stack}${colors.reset}\n`);
    }

    process.exit(1);

  } finally {
    // Cleanup
    if (orchestrator) {
      orchestrator.reset();
    }
    if (db) {
      db.close();
      console.log(`${colors.dim}Database connection closed${colors.reset}`);
    }
  }
}

// Run CLI
main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});

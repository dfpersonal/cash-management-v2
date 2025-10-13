# Pipeline Package

Professional cash management pipeline for processing and analyzing deposit product data.

## Overview

The pipeline package provides services for ingesting, deduplicating, matching, and analyzing cash deposit product data from various sources. It implements FSCS-compliant deduplication logic and comprehensive data quality analysis.

## Logging System

The pipeline uses a three-tier logging system that allows you to control output verbosity through environment variables.

### Log Levels

- **ERROR**: Critical errors only (always shown)
- **WARN**: Important warnings (always shown)
- **INFO**: Stage summaries, initialization, high-level progress
- **DEBUG**: Detailed operations, file-by-file progress, verbose details

### Environment Variables

Control logging verbosity with these environment variables:

| Environment Variable | Output Level | When to Use |
|---------------------|--------------|-------------|
| (none) | ERROR + WARN | Default - quiet operation, only show issues |
| `PIPELINE_VERBOSE=true` | INFO + WARN + ERROR | Show pipeline stage progress and summaries |
| `PIPELINE_DEBUG=true` | DEBUG + INFO + WARN + ERROR | Full visibility for troubleshooting |

### Usage Examples

#### From Pipeline Package

```bash
# Default mode - quiet operation
npm start

# Verbose mode - show stage progress
PIPELINE_VERBOSE=true npm start

# Debug mode - full detail
PIPELINE_DEBUG=true npm start
```

#### From Electron App

The electron-app package provides convenient npm scripts:

```bash
# Default mode - quiet operation
npm start

# Verbose mode - show pipeline stage progress
npm run start:verbose

# Debug mode - detailed file-by-file progress
npm run start:pipeline-debug

# Development mode with verbose logging
npm run dev:verbose

# Development mode with debug logging
npm run dev:pipeline-debug
```

### What Gets Logged at Each Level

#### ERROR (Always Shown)
- Database connection failures
- Critical pipeline errors
- Transaction rollbacks
- Service initialization failures

#### WARN (Always Shown)
- Configuration issues
- Missing or invalid data
- Audit trail persistence failures (non-critical)
- Deprecated functionality usage

#### INFO (PIPELINE_VERBOSE=true)
- Service initialization completion
- Pipeline stage start/completion
- Stage summaries with counts and metrics
- Configuration loading confirmations
- High-level progress updates
- Data quality analysis reports

#### DEBUG (PIPELINE_DEBUG=true)
- File-by-file processing details
- Detailed operation traces
- Internal state information
- Audit trail details
- SQL query execution
- Deduplication group details

## CLI Usage

### Quick Start

The pipeline package includes a standalone CLI tool for debugging and testing without rebuilding the Electron app.

**Note:** The CLI runs via Electron (not plain Node.js) due to better-sqlite3 native bindings, but it's still **much faster** than rebuilding the full Electron app (~1-2 seconds vs ~30+ seconds).

```bash
# Run the full pipeline
npm run cli

# Run with verbose logging
PIPELINE_VERBOSE=true npm run cli

# Run with debug logging
PIPELINE_DEBUG=true npm run cli
```

### Common Commands

```bash
# Stop after a specific stage
npm run cli -- --stop-after json_ingestion
npm run cli -- --stop-after frn_matching
npm run cli -- --stop-after deduplication

# Rebuild from raw data only (skip ingestion)
npm run cli -- --rebuild-only

# Process specific JSON files
npm run cli -- --files ../scrapers/data/moneyfacts/*.json

# Show help
npm run cli -- --help
```

### Why Use the CLI?

The CLI tool is ideal for:

- **Rapid iteration** - No need to rebuild the Electron app
- **Debugging** - Stop at specific stages to inspect data
- **Testing** - Test configuration changes quickly
- **Development** - Faster feedback loop during development
- **CI/CD** - Automated testing in continuous integration

### Environment Variables

All logging and execution mode variables work with the CLI:

| Variable | Effect | Example |
|----------|--------|---------|
| `PIPELINE_VERBOSE=true` | Show stage progress | `PIPELINE_VERBOSE=true npm run cli` |
| `PIPELINE_DEBUG=true` | Show detailed logs | `PIPELINE_DEBUG=true npm run cli` |
| `PIPELINE_ATOMIC=false` | Incremental mode | `PIPELINE_ATOMIC=false npm run cli` |
| `DATABASE_PATH=<path>` | Override database | `DATABASE_PATH=/tmp/test.db npm run cli` |
| `PIPELINE_DATA_QUALITY=true` | Enable quality analysis | `PIPELINE_DATA_QUALITY=true npm run cli` |

### Comprehensive Guide

For detailed debugging workflows, troubleshooting, and advanced usage, see [CLI-DEBUG-GUIDE.md](./CLI-DEBUG-GUIDE.md).

## Services

### JSONIngestionService
Ingests JSON files from scrapers and loads them into the database.

**Key features:**
- Batch processing with configurable batch sizes
- Transaction support for atomic operations
- Duplicate detection and handling
- Comprehensive audit trail

### OrchestrationService
Coordinates the entire pipeline execution across all stages.

**Key features:**
- Atomic vs incremental execution modes
- Transaction management
- Stage orchestration (ingestion → FRN matching → deduplication → quality analysis)
- Cleanup of processed files

### FRNMatchingService
Matches products with FRN (Financial Register Number) data.

**Key features:**
- Exact and fuzzy matching algorithms
- Provider name normalization
- Match confidence scoring

### DeduplicationService
FSCS-compliant deduplication of products across platforms.

**Key features:**
- Business key generation
- Cross-platform grouping
- Selection strategy enforcement
- Comprehensive audit trail

### DataQualityAnalyzer
Analyzes data quality and detects anomalies.

**Key features:**
- Configurable quality rules
- Anomaly detection
- Quality scoring
- Detailed reporting

## Development

### Building

```bash
# Build pipeline package only
npm run build

# Build from monorepo root
npx turbo build --filter=@cash-mgmt/pipeline
```

### Project Structure

```
src/
├── services/          # Core pipeline services
│   ├── JSONIngestionService.ts
│   ├── OrchestrationService.ts
│   ├── FRNMatchingService.ts
│   ├── DeduplicationService.ts
│   └── DataQualityAnalyzer.ts
├── utils/            # Utility modules
│   └── PipelineLogger.ts
├── types/            # TypeScript type definitions
└── index.ts          # Package exports
```

### Testing

```bash
# Run tests
npm test

# Test with different log levels
PIPELINE_VERBOSE=true npm test
PIPELINE_DEBUG=true npm test
```

## Configuration

Pipeline services are configured through the unified configuration system. See the configuration documentation in the shared package for details.

## Integration

The pipeline is integrated into the electron-app and can be run:
- On-demand through the UI
- Scheduled for automatic execution
- Via CLI commands

## Dependencies

- `@cash-mgmt/shared` - Shared types and utilities
- `better-sqlite3` - SQLite database operations
- `json-rules-engine` - Data quality rule evaluation

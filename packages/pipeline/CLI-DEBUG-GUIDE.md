# Pipeline CLI Debug Guide

Complete guide for debugging and testing the cash management pipeline using the CLI tool.

## Table of Contents

- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Command Reference](#command-reference)
- [Common Debugging Workflows](#common-debugging-workflows)
- [Troubleshooting](#troubleshooting)
- [Development Tips](#development-tips)

---

## Requirements

### Why Electron?

The CLI tool runs via **Electron** (not plain Node.js) due to the `better-sqlite3` native bindings requirement:

- **better-sqlite3** uses native C++ bindings compiled for specific Node.js versions
- The Electron app already has these bindings compiled for Electron's Node.js version
- Using plain Node.js would require separate bindings and risk breaking the Electron app

### Performance Impact

**Don't worry** - The CLI is still **much faster** than rebuilding the entire Electron app:

- **CLI startup time:** ~1-2 seconds (Electron overhead)
- **Full Electron app rebuild:** ~30+ seconds (TypeScript + webpack + Electron)
- **Benefit:** Still provides rapid iteration for debugging pipeline issues

### Setup

No special setup required! The CLI uses the existing Electron installation from the monorepo root. Just ensure you've run `npm install` at the root level.

---

## Quick Start

### Basic Usage

Run the full pipeline with default settings:
```bash
cd packages/pipeline
npm run cli
```

Or from the monorepo root:
```bash
cd packages/pipeline && npm run cli
```

### First Time Setup

1. Ensure you have scraped data:
   ```bash
   # Run a scraper first to generate JSON files
   cd packages/electron-app
   npm start
   # Use the UI to trigger scrapers
   ```

2. Verify database exists:
   ```bash
   ls -la ../../data/database/cash_savings.db
   ```

3. Run the CLI:
   ```bash
   npm run cli
   ```

---

## Environment Variables

Control pipeline behavior with these environment variables:

### Log Levels

| Variable | Effect | When to Use |
|----------|--------|-------------|
| `PIPELINE_VERBOSE=true` | Show stage progress, summaries, and high-level operations | General debugging, understanding pipeline flow |
| `PIPELINE_DEBUG=true` | Show detailed file-by-file progress, SQL queries, internal state | Deep debugging, investigating specific issues |
| (none) | Show only errors and warnings | Production mode, automated runs |

**Examples:**
```bash
# Verbose mode - see what's happening
PIPELINE_VERBOSE=true npm run cli

# Debug mode - see everything
PIPELINE_DEBUG=true npm run cli

# Quiet mode - only errors
npm run cli
```

### Execution Mode

| Variable | Default | Effect |
|----------|---------|--------|
| `PIPELINE_ATOMIC` | `true` | All-or-nothing transaction: commit only on success |
| `PIPELINE_ATOMIC=false` | - | Incremental commits: data visible after each stage |

**When to use each mode:**

**Atomic Mode (default):**
- ✅ Production runs
- ✅ Testing complete pipeline
- ✅ Ensuring data consistency
- ❌ Debugging intermediate stages (can't inspect data)

**Incremental Mode:**
- ✅ Debugging specific stages
- ✅ Inspecting data after each step
- ✅ Recovering from partial failures
- ❌ Production (risk of inconsistent state)

**Examples:**
```bash
# Atomic mode (safe, default)
npm run cli

# Incremental mode (for debugging)
PIPELINE_ATOMIC=false npm run cli
```

### Database Override

| Variable | Default | Effect |
|----------|---------|--------|
| `DATABASE_PATH` | `../../data/database/cash_savings.db` | Override database location |

**Example:**
```bash
# Use test database
DATABASE_PATH=/path/to/test.db npm run cli
```

### Data Quality Analysis

| Variable | Default | Effect |
|----------|---------|--------|
| `PIPELINE_DATA_QUALITY` | `false` | Enable data quality analysis stage |
| `DATA_QUALITY_VERBOSE` | `false` | Show detailed quality reports |

**Examples:**
```bash
# Enable data quality analysis
PIPELINE_DATA_QUALITY=true npm run cli

# Enable with verbose output
PIPELINE_DATA_QUALITY=true DATA_QUALITY_VERBOSE=true npm run cli
```

---

## Command Reference

### Basic Commands

#### Run Full Pipeline
```bash
npm run cli
```
Processes all available JSON files through the complete pipeline.

#### Stop After Specific Stage
```bash
npm run cli -- --stop-after <stage>
```

**Available stages:**
- `json_ingestion` - Validate and load JSON files
- `frn_matching` - Match products with FRN data
- `deduplication` - Deduplicate products across platforms
- `data_quality` - Analyze data quality (if enabled)

**Examples:**
```bash
# Stop after JSON ingestion to debug validation
npm run cli -- --stop-after json_ingestion

# Stop after FRN matching to verify FRNs
npm run cli -- --stop-after frn_matching

# Stop after deduplication to check business keys
npm run cli -- --stop-after deduplication
```

#### Rebuild from Raw Data
```bash
npm run cli -- --rebuild-only
```
Skips JSON ingestion and rebuilds `available_products` from `available_products_raw`.

Useful for:
- Testing FRN matching changes
- Debugging deduplication logic
- Testing configuration changes
- Iterating on pipeline stages without re-scraping

#### Process Specific Files
```bash
npm run cli -- --files <path1> [path2] [...]
```

**Examples:**
```bash
# Process single file
npm run cli -- --files ../scrapers/data/moneyfacts/moneyfacts-normalized-20250113.json

# Process multiple files
npm run cli -- --files ../scrapers/data/moneyfacts/*.json

# Process all flagstone files
npm run cli -- --files ../scrapers/data/flagstone/flagstone-normalized-*.json
```

#### Help and Version
```bash
# Show help
npm run cli -- --help

# Show version
npm run cli -- --version
```

---

## Common Debugging Workflows

### Workflow 1: Debugging Validation Errors

**Problem:** Products are being rejected during JSON ingestion.

**Steps:**
1. Run with verbose logging and stop after ingestion:
   ```bash
   PIPELINE_VERBOSE=true npm run cli -- --stop-after json_ingestion
   ```

2. Check the output for validation errors:
   - Look for "Rejected:" count in summary
   - Review validation error messages

3. Query the database for rejected products:
   ```bash
   sqlite3 ../../data/database/cash_savings.db
   ```
   ```sql
   -- View recent rejections
   SELECT product_id, validation_status, rejection_reasons
   FROM json_ingestion_audit
   WHERE validation_status = 'invalid'
   ORDER BY created_at DESC
   LIMIT 20;
   ```

4. If rate filtering is the issue, adjust thresholds:
   ```sql
   -- Check current thresholds
   SELECT config_key, config_value
   FROM unified_config
   WHERE config_key LIKE '%min_rate%';

   -- Adjust if needed (example)
   UPDATE unified_config
   SET config_value = '3.0'
   WHERE config_key = 'json_ingestion_easy_access_min_rate';
   ```

5. Re-run pipeline:
   ```bash
   npm run cli
   ```

### Workflow 2: Debugging FRN Matching

**Problem:** Banks not getting matched with FRNs.

**Steps:**
1. Stop after FRN matching to see statistics:
   ```bash
   PIPELINE_VERBOSE=true npm run cli -- --stop-after frn_matching
   ```

2. Check match statistics in output:
   - Exact matches
   - Fuzzy matches
   - Alias matches
   - No matches

3. Query unmatched banks:
   ```sql
   -- Products without FRNs
   SELECT DISTINCT bank_name, COUNT(*) as count
   FROM available_products_raw
   WHERE frn IS NULL
   GROUP BY bank_name
   ORDER BY count DESC;
   ```

4. Check FRN lookup helper for matches:
   ```sql
   -- See what's in the lookup table
   SELECT normalized_name, frn, match_method
   FROM frn_lookup_helper
   WHERE normalized_name LIKE '%yourbank%';
   ```

5. Add manual override if needed:
   ```sql
   INSERT INTO frn_manual_overrides (bank_name_variant, frn, firm_name, source, notes)
   VALUES ('Your Bank Name', '123456', 'Official Firm Name', 'manual', 'Added for testing');
   ```

6. Rebuild and test:
   ```bash
   npm run cli -- --rebuild-only
   ```

### Workflow 3: Debugging Deduplication

**Problem:** Products are being incorrectly deduplicated.

**Steps:**
1. Enable debug logging and rebuild:
   ```bash
   PIPELINE_DEBUG=true npm run cli -- --rebuild-only
   ```

2. Look for deduplication groups in the output:
   - Business key generation
   - Products in each group
   - Selection reasons

3. Query deduplication results:
   ```sql
   -- View deduplication groups
   SELECT business_key, products_in_group, platforms_in_group, selected_platform
   FROM deduplication_groups
   WHERE products_in_group > 1
   ORDER BY products_in_group DESC
   LIMIT 20;

   -- Products in a specific group
   SELECT platform, bank_name, account_type, aer_rate, business_key
   FROM available_products_raw
   WHERE business_key = 'your-business-key'
   ORDER BY platform;
   ```

4. Check selection logic:
   ```sql
   -- See why products were selected
   SELECT platform, bank_name, selection_reason, COUNT(*) as count
   FROM available_products
   GROUP BY selection_reason
   ORDER BY count DESC;
   ```

5. Adjust platform priorities if needed:
   ```sql
   -- View current priorities
   SELECT platform_variant, canonical_name, priority
   FROM known_platforms
   WHERE is_active = 1
   ORDER BY priority;

   -- Adjust priority (lower = higher priority)
   UPDATE known_platforms
   SET priority = 1
   WHERE canonical_name = 'hargreaves lansdown';
   ```

6. Rebuild with new priorities:
   ```bash
   npm run cli -- --rebuild-only
   ```

### Workflow 4: Testing a New Scraper

**Problem:** Need to test a new scraper's output.

**Steps:**
1. Run the scraper in the Electron app or generate test JSON files

2. Process only the new scraper's files:
   ```bash
   PIPELINE_DEBUG=true npm run cli -- --files ../scrapers/data/newscraper/*.json
   ```

3. Check raw table for new data:
   ```sql
   SELECT source, COUNT(*) as count
   FROM available_products_raw
   WHERE source = 'newscraper'
   GROUP BY source;
   ```

4. If validation fails, check audit trail:
   ```sql
   SELECT product_id, validation_status, validation_details
   FROM json_ingestion_audit
   WHERE source = 'newscraper'
   AND validation_status = 'invalid'
   LIMIT 10;
   ```

5. Fix issues and re-run:
   ```bash
   npm run cli -- --files ../scrapers/data/newscraper/*.json
   ```

### Workflow 5: Performance Testing

**Problem:** Pipeline is running slowly.

**Steps:**
1. Run with verbose logging to see stage timings:
   ```bash
   PIPELINE_VERBOSE=true npm run cli
   ```

2. Check the performance metrics in the summary:
   - Duration per stage
   - Throughput (products/sec)
   - Total execution time

3. Query pipeline audit for detailed timing:
   ```sql
   SELECT stage, input_count, output_count, processing_time
   FROM pipeline_audit
   ORDER BY created_at DESC
   LIMIT 10;
   ```

4. Identify bottleneck and optimize:
   - JSON Ingestion: Adjust batch size
   - FRN Matching: Check cache rebuild
   - Deduplication: Review business key complexity

5. Test configuration changes:
   ```bash
   time npm run cli
   ```

### Workflow 6: Data Quality Analysis

**Problem:** Need to assess overall data quality.

**Steps:**
1. Enable data quality analysis:
   ```bash
   PIPELINE_DATA_QUALITY=true DATA_QUALITY_VERBOSE=true npm run cli
   ```

2. Review the quality report output:
   - Overall quality score
   - Pipeline flow analysis
   - Data integrity score
   - Deduplication effectiveness
   - Anomalies detected

3. Query quality reports history:
   ```sql
   SELECT batch_id, overall_quality_score,
          total_products_raw, total_products_final,
          frn_match_rate, created_at
   FROM data_quality_reports
   ORDER BY created_at DESC
   LIMIT 10;
   ```

4. Investigate specific anomalies:
   ```sql
   -- View anomalies from latest run
   SELECT batch_id, anomalies
   FROM data_quality_reports
   ORDER BY created_at DESC
   LIMIT 1;
   ```

5. Address issues and re-run:
   ```bash
   PIPELINE_DATA_QUALITY=true npm run cli
   ```

---

## Troubleshooting

### Error: Database not found

**Symptoms:**
```
Error: Database not found at /path/to/cash_savings.db
```

**Solution:**
1. Check if database exists:
   ```bash
   ls -la ../../data/database/cash_savings.db
   ```

2. If missing, create it (or run migrations):
   ```bash
   cd ../electron-app
   npm start  # Database will be created on first run
   ```

3. Or specify a different database:
   ```bash
   DATABASE_PATH=/path/to/your/db npm run cli
   ```

### Error: No JSON files found

**Symptoms:**
```
Warning: No JSON files found to process
```

**Solution:**
1. Run scrapers first to generate JSON files:
   ```bash
   cd ../electron-app
   npm start
   # Use UI to trigger scrapers
   ```

2. Or specify files manually:
   ```bash
   npm run cli -- --files /path/to/your/*.json
   ```

3. Check data directory:
   ```bash
   ls -la ../scrapers/data/*/
   ```

### Error: Configuration not loaded

**Symptoms:**
```
Failed to load orchestration configuration: No configuration found
```

**Solution:**
1. Check if unified_config has orchestrator entries:
   ```sql
   SELECT COUNT(*) FROM unified_config WHERE category = 'orchestrator';
   ```

2. Run database migrations if needed:
   ```bash
   cd ../../data/database
   # Run migration scripts
   ```

### Error: Pipeline failed with DATA_CORRUPTION

**Symptoms:**
```
Pipeline failed: DATA_CORRUPTION - Systematic data corruption detected: 55.2% validation failures
```

**Solution:**
1. This is a safety feature that halts the pipeline when too many products fail validation

2. Review validation thresholds:
   ```sql
   SELECT config_key, config_value
   FROM unified_config
   WHERE config_key LIKE '%corruption_threshold%';
   ```

3. Check recent scraper run for issues:
   - Was the website structure changed?
   - Are scrapers producing invalid data?

4. Review corruption audit:
   ```sql
   SELECT * FROM json_ingestion_corruption_audit
   ORDER BY detected_at DESC LIMIT 5;
   ```

5. Fix scraper or adjust threshold temporarily:
   ```sql
   UPDATE unified_config
   SET config_value = '0.8'  -- Allow 80% failure rate (use with caution!)
   WHERE config_key = 'json_ingestion_data_corruption_threshold';
   ```

### Error: better-sqlite3 binding issues

**Symptoms:**
```
Error: Cannot find module 'better-sqlite3'
```

**Solution:**
1. Rebuild better-sqlite3 for your Node version:
   ```bash
   cd ../..
   npx electron-rebuild -f -w better-sqlite3
   ```

2. Or reinstall dependencies:
   ```bash
   npm install
   ```

### Pipeline hangs or runs very slowly

**Symptoms:**
- CLI doesn't produce output for several minutes
- CPU usage very high

**Solution:**
1. Check if you're in atomic mode (default):
   - Atomic mode holds everything in transaction
   - Can be slow for large datasets

2. Try incremental mode:
   ```bash
   PIPELINE_ATOMIC=false npm run cli
   ```

3. Enable debug logging to see where it's stuck:
   ```bash
   PIPELINE_DEBUG=true npm run cli
   ```

4. Check database size and indexes:
   ```bash
   sqlite3 ../../data/database/cash_savings.db ".dbinfo"
   ```

---

## Development Tips

### Rapid Iteration

**Best workflow for development:**

1. Make code changes to pipeline services
2. Rebuild TypeScript:
   ```bash
   npm run build
   ```
3. Test immediately:
   ```bash
   npm run cli -- --rebuild-only
   ```

**Even faster with watch mode:**
```bash
# Terminal 1: Watch TypeScript compilation
npm run build -- --watch

# Terminal 2: Run CLI after each change
npm run cli -- --rebuild-only
```

### Comparing Configurations

Test different configurations without modifying the database:

```bash
# Baseline run
PIPELINE_VERBOSE=true npm run cli > baseline.log 2>&1

# Change configuration in database
sqlite3 ../../data/database/cash_savings.db "UPDATE unified_config SET config_value = '2.5' WHERE config_key = 'json_ingestion_easy_access_min_rate';"

# Test run
PIPELINE_VERBOSE=true npm run cli > test.log 2>&1

# Compare results
diff baseline.log test.log
```

### Testing with Fixtures

Create test fixtures for consistent testing:

```bash
# Create test directory
mkdir -p test-fixtures

# Copy sample files
cp ../scrapers/data/moneyfacts/moneyfacts-normalized-*.json test-fixtures/

# Run CLI with fixtures
npm run cli -- --files test-fixtures/*.json
```

### Debugging with SQL

Keep useful SQL queries handy:

```sql
-- Recent pipeline runs
SELECT batch_id, created_at, stage, input_count, output_count
FROM pipeline_audit
ORDER BY created_at DESC;

-- Product counts by stage
SELECT 'raw' as stage, COUNT(*) FROM available_products_raw
UNION ALL
SELECT 'final' as stage, COUNT(*) FROM available_products;

-- Top banks by product count
SELECT bank_name, COUNT(*) as count
FROM available_products
GROUP BY bank_name
ORDER BY count DESC
LIMIT 10;

-- FRN match statistics
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN frn IS NOT NULL THEN 1 ELSE 0 END) as matched,
  ROUND(100.0 * SUM(CASE WHEN frn IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 2) as match_rate
FROM available_products;
```

### Performance Profiling

Profile pipeline execution:

```bash
# Time each stage
time PIPELINE_VERBOSE=true npm run cli

# With Node profiling
node --prof dist/cli.js
node --prof-process isolate-*.log > profile.txt
```

### Continuous Testing

Set up continuous testing during development:

```bash
# watch.sh
#!/bin/bash
while true; do
  npm run build
  npm run cli -- --rebuild-only
  echo "Waiting for changes..."
  sleep 5
done
```

### Using with CI/CD

The CLI is designed for automated testing:

```bash
#!/bin/bash
# ci-test.sh

set -e  # Exit on error

# Build
npm run build

# Run pipeline
PIPELINE_VERBOSE=true npm run cli

# Check exit code
if [ $? -eq 0 ]; then
  echo "Pipeline succeeded"
  exit 0
else
  echo "Pipeline failed"
  exit 1
fi
```

Exit codes:
- `0` - Success
- `1` - Pipeline failed or error occurred

---

## Additional Resources

- [README.md](./README.md) - Package overview and logging documentation
- [OrchestrationService.ts](./src/services/OrchestrationService.ts) - Pipeline orchestration implementation
- [JSONIngestionService.ts](./src/services/JSONIngestionService.ts) - JSON validation and ingestion
- [DeduplicationService.ts](./src/services/DeduplicationService.ts) - Deduplication logic
- [DataQualityAnalyzer.ts](./src/services/DataQualityAnalyzer.ts) - Quality analysis implementation

## Need Help?

If you encounter issues not covered in this guide:

1. Check the full error message and stack trace
2. Review recent changes in git history
3. Query the database for diagnostic information
4. Enable debug logging to see internal state
5. Check the Electron app logs for comparison

Happy debugging! 🐛

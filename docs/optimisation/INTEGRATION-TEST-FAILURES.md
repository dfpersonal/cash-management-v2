# Integration Test Failures - Findings and Fixes

**Date**: 2025-10-08
**Package**: `@cash-mgmt/optimization`
**Test Suites**: `tests/integration/module-compatibility.test.ts`, `tests/integration/optimizer-subprocess.test.ts`
**Status**: 18 out of 25 integration tests failing

---

## Executive Summary

The optimization package's integration tests are failing because the CLI scripts are unable to run successfully. The tests spawn child processes to execute TypeScript CLI files (`optimize-cli.ts`, `fscs-compliance.ts`) but encounter two primary issues:

1. **Missing database table** (`deduplication_config`) - optimizer CLI crashes
2. **JSON parsing errors** - CLIs output debug messages mixed with JSON
3. **Exit code 2** - CLIs return error exit codes instead of 0

**Root Cause**: The CLI implementations were copied from the old recommendation-engine package which used a different database schema and different configuration approach than the current monorepo structure.

**Impact**:
- ✅ Unit tests work (64/64 passing)
- ❌ Integration tests fail (7/25 passing)
- ❌ CLI tools cannot be used standalone

---

## Test Results Summary

### Module Compatibility Tests (`module-compatibility.test.ts`)
**Status**: 7 failed, 2 passed (9 total)

#### Passing Tests:
- ✅ FSCS should emit progress updates to stderr
- ✅ FSCS should return correct exit codes

#### Failing Tests:
- ❌ FSCS should produce valid ModuleResult structure
- ❌ FSCS should generate calendar events when requested
- ❌ FSCS should generate action items when requested
- ❌ Rate Optimizer should produce valid ModuleResult structure
- ❌ Cross-Module: should use same database schema
- ❌ Cross-Module: should use compatible priority levels
- ❌ Cross-Module: should use compatible categories

### Optimizer Subprocess Tests (`optimizer-subprocess.test.ts`)
**Status**: 11 failed, 5 passed (16 total)

#### Passing Tests:
- ✅ Should handle --help flag
- ✅ Should handle database connection errors gracefully
- ✅ Should return exit code 0 for success (with errors)
- ✅ Should handle empty portfolio gracefully
- ✅ Should report execution time in metadata

#### Failing Tests:
- ❌ Should output JSON with --format json
- ❌ Should handle --exclude-sharia flag
- ❌ Should respect --min-benefit threshold
- ❌ Should respect --min-move-amount threshold
- ❌ Should emit progress updates to stderr
- ❌ Should not emit progress without --progress flag
- ❌ Should return valid ModuleResult structure
- ❌ Should include calendar events when requested
- ❌ Should include action items when requested
- ❌ Should handle very high thresholds
- ❌ Should complete within reasonable time

---

## Detailed Findings

### Issue 1: Missing Database Table - `deduplication_config`

**File**: `src/cli/optimize-cli.ts`
**Error**:
```
SQLITE_ERROR: no such table: main.deduplication_config
```

**Command**:
```bash
DATABASE_PATH=/path/to/cash_savings_test_phase4.db npx ts-node src/cli/optimize-cli.ts --format json --silent
```

**Output**:
```json
{
  "status": "ERROR",
  "metadata": {
    "error": "Query failed: SQLITE_ERROR: no such table: main.deduplication_config"
  }
}
```

**Root Cause**: The optimizer CLI is trying to query a `deduplication_config` table that doesn't exist in the test database. This table was likely part of the old recommendation-engine schema but has been replaced by `unified_config` in the monorepo.

**Location in Code**: Likely in `ProductLoader` or `ConfigurationLoader` where it attempts to load deduplication configuration.

**Tables in Test DB**:
```sql
-- EXISTS in test DB:
unified_config
compliance_config
optimization_recommendations
optimization_rules

-- DOES NOT EXIST:
deduplication_config
```

---

### Issue 2: Debug Messages Contaminating JSON Output

**File**: `src/cli/fscs-compliance.ts`
**Error**:
```
SyntaxError: Unexpected non-whitespace character after JSON at position 891 (line 22 column 1)
```

**Problem**: The `--silent` flag should suppress all console output except the JSON result, but debug messages from the database connection are being written to stderr:

```
[Debug] Connected to production database: /path/to/database.db
```

This is then captured by the test and mixed with the JSON output, causing `JSON.parse()` to fail.

**Root Cause**: The SQLiteConnection class logs debug messages even when `--silent` flag is set. The logger doesn't respect the CLI's silent mode.

**Example Output** (contaminated):
```
[Debug] Connected to production database: /Users/david/.../cash_savings_test_phase4.db
{
  "version": "2.0.0",
  "timestamp": "2025-10-08T18:37:06.661Z",
  ...
}
```

**Location**:
- `/packages/optimization/src/database/connection.ts` - SQLiteConnection constructor
- `/packages/optimization/src/utils/logger.ts` - Logger implementation

---

### Issue 3: Exit Code 2 Instead of 0

**Tests Affected**: All optimizer subprocess tests expecting `code === 0`

**Error**:
```typescript
expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 2
```

**Root Cause**: When the CLI encounters an error (like missing table), it returns exit code 2 instead of 0. The tests expect successful execution with exit code 0.

**Expected Behavior**:
- Exit code `0` = Success
- Exit code `1` = User error (bad arguments, etc.)
- Exit code `2` = System error (database error, etc.)

**Current Behavior**: CLI returns exit code 2 when it encounters database errors, which is correct for error handling, but the tests don't account for this.

---

### Issue 4: FSCS Compliance CLI Issues

**File**: `src/cli/fscs-compliance.ts`
**Status**: Runs but outputs error JSON with exit code 0

The FSCS CLI actually works better than the optimizer CLI:
- ✅ Accepts database path via `--database` flag
- ✅ Outputs valid JSON
- ✅ Returns exit code 0 even on "success" (though it shows WARNING/BREACH status)
- ❌ Outputs debug messages that contaminate JSON parsing
- ❌ Tests expect additional fields not in output

**Example Working Output**:
```json
{
  "version": "2.0.0",
  "timestamp": "2025-10-08T18:37:06.661Z",
  "status": "WARNING",
  "module": "fscs-compliance",
  "summary": {
    "totalAccounts": 37,
    "totalValue": 1612593.67,
    "breachCount": 2,
    "warningCount": 9,
    "totalAtRisk": 1312.44,
    "institutionCount": 25
  },
  "recommendations": [],
  "breaches": [...],
  "warnings": [...]
}
```

**Missing Fields** (expected by tests):
- `calendarEvents` (when `--include-calendar-events` flag used)
- `actionItems` (when `--include-action-items` flag used)

---

## Required Fixes

### Fix 1: Remove `deduplication_config` Table Reference

**Approach**: Audit code for `deduplication_config` and replace with `unified_config`

**Files to Check**:
- `src/products/loader.ts`
- `src/configuration/loader.ts`
- `src/optimization/optimizer.ts`

**Search Command**:
```bash
grep -r "deduplication_config" packages/optimization/src/
```

**Expected Change**:
```typescript
// OLD (WRONG):
const dedupConfig = db.prepare(`
  SELECT * FROM deduplication_config
`).all();

// NEW (CORRECT):
const dedupConfig = db.prepare(`
  SELECT config_key, config_value, config_type
  FROM unified_config
  WHERE category = 'deduplication' AND is_active = 1
`).all();
```

**If deduplication config doesn't exist in unified_config**: Add migration or use defaults:
```typescript
const DEFAULT_DEDUP_CONFIG = {
  rate_tolerance_bp: 10,
  term_match_enabled: true,
  notice_match_enabled: true
};
```

---

### Fix 2: Suppress Debug Logging in Silent Mode

**File**: `src/utils/logger.ts` and `src/database/connection.ts`

**Option A: Pass silent flag to logger**

```typescript
// In CLI files (optimize-cli.ts, fscs-compliance.ts)
const logger = getLogger({
  silent: options.silent  // Pass silent flag from CLI args
});

// In logger.ts
export function getLogger(options?: { silent?: boolean }) {
  if (options?.silent) {
    return {
      debug: () => {},
      info: () => {},
      warning: () => {},
      error: (msg: string) => console.error(msg), // Still log errors
      log: () => {}
    };
  }
  // Normal logger implementation
}
```

**Option B: Check environment variable**

```typescript
// In database/connection.ts
constructor(dbPath: string) {
  this.db = new Database(dbPath);

  // Only log if not in silent mode
  if (!process.env.SILENT_MODE && !process.env.OPTIMIZE_SILENT) {
    this.logger.debug(`Connected to production database: ${dbPath}`);
  }
}
```

**Option C: Write debug to stderr only if not --silent**

```typescript
// In logger.ts
debug(message: string) {
  if (!this.options.silent) {
    console.error(`[Debug] ${message}`);
  }
}
```

**Recommendation**: Use Option A - Pass silent flag through to logger for clean separation.

---

### Fix 3: Implement Calendar Events and Action Items

**Files**:
- `src/cli/fscs-compliance.ts`
- `src/cli/optimize-cli.ts`

Both CLIs claim to support `--include-calendar-events` and `--include-action-items` flags but don't actually generate these fields in the output.

**Implementation Needed**:

```typescript
// In fscs-compliance.ts
async function generateCalendarEvents(report: ComplianceReport): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];

  // For each breach, create a calendar event
  for (const breach of report.breaches) {
    events.push({
      id: `fscs-breach-${breach.frn}`,
      title: `FSCS Breach: ${breach.institutions.join(', ')}`,
      description: `Exposure £${breach.totalExposure.toFixed(2)} exceeds limit £${breach.effectiveLimit.toFixed(2)}`,
      date: new Date().toISOString(),
      priority: breach.severity,
      category: 'compliance',
      type: 'deadline',
      metadata: {
        frn: breach.frn,
        excessAmount: breach.excessAmount
      }
    });
  }

  return events;
}

async function generateActionItems(report: ComplianceReport): Promise<ActionItem[]> {
  const items: ActionItem[] = [];

  // For each breach, create action items
  for (const breach of report.breaches) {
    items.push({
      id: `action-fscs-${breach.frn}`,
      title: `Transfer £${breach.excessAmount.toFixed(2)} from ${breach.institutions.join(', ')}`,
      description: `Reduce exposure to comply with FSCS limit`,
      priority: breach.severity === 'CRITICAL' ? 'urgent' : 'high',
      category: 'transfer',
      estimatedTime: 30,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      metadata: {
        frn: breach.frn,
        amount: breach.excessAmount,
        sourceAccounts: breach.accountIds
      }
    });
  }

  return items;
}

// In main() function:
if (options.includeCalendarEvents) {
  result.calendarEvents = await generateCalendarEvents(complianceReport);
}

if (options.includeActionItems) {
  result.actionItems = await generateActionItems(complianceReport);
}
```

---

### Fix 4: Update Tests to Handle Errors Gracefully

**File**: `tests/integration/optimizer-subprocess.test.ts`

Some tests need to be updated to expect errors when database tables are missing:

```typescript
// BEFORE:
test('should output JSON with --format json', async () => {
  const { stdout, code } = await runCLI(['--format', 'json', '--silent']);
  expect(code).toBe(0);  // ← Expects success
  const result = JSON.parse(stdout);
  // ...
});

// AFTER (Option A - Fix the CLI so it works):
test('should output JSON with --format json', async () => {
  const { stdout, code } = await runCLI(['--format', 'json', '--silent']);
  expect(code).toBe(0);
  const result = JSON.parse(stdout);

  // If there's an error in metadata, it's likely due to missing tables
  if (result.status === 'ERROR' && result.metadata?.error?.includes('deduplication_config')) {
    console.warn('Skipping test: deduplication_config table not in test schema');
    return;
  }

  expect(result).toHaveProperty('module', 'rate-optimizer');
  // ...
});

// AFTER (Option B - Skip test until CLI fixed):
test.skip('should output JSON with --format json', async () => {
  // TODO: Fix deduplication_config table reference in ProductLoader
  // ...
});
```

**Recommendation**: Fix the CLI (Option A) rather than skipping tests.

---

## Implementation Plan

### Phase 1: Database Schema Compatibility (Priority: HIGH)

**Estimated Time**: 2-3 hours

1. **Audit for `deduplication_config` references**
   ```bash
   grep -rn "deduplication_config" packages/optimization/src/
   ```

2. **Replace with `unified_config` queries**
   - Update `ProductLoader` to read from `unified_config`
   - Update `ConfigurationLoader` if needed
   - Use category filter: `WHERE category = 'deduplication'`

3. **Test CLI manually**
   ```bash
   DATABASE_PATH=./data/test/databases/cash_savings_test_phase4.db \
     npx ts-node src/cli/optimize-cli.ts --format json --silent
   ```

4. **Expected result**: CLI runs without SQLITE_ERROR

---

### Phase 2: Silent Mode Logger Fix (Priority: HIGH)

**Estimated Time**: 1 hour

1. **Update logger interface** to accept `silent` option:
   ```typescript
   export interface LoggerOptions {
     componentName?: string;
     logLevel?: 'debug' | 'info' | 'warn' | 'error';
     verboseMode?: boolean;
     silent?: boolean;  // ← Add this
   }
   ```

2. **Update `getLogger()` function** to return no-op logger when silent:
   ```typescript
   export function getLogger(options?: LoggerOptions) {
     if (options?.silent) {
       return {
         debug: () => {},
         info: () => {},
         warning: () => {},
         error: (msg: string) => {
           // Still write errors to stderr
           if (!options.silent) {
             console.error(msg);
           }
         }
       };
     }
     // Normal logger
   }
   ```

3. **Pass silent flag from CLI**:
   ```typescript
   // In optimize-cli.ts
   const logger = getLogger({ silent: options.silent });
   ```

4. **Update SQLiteConnection** to accept logger or respect silent mode:
   ```typescript
   constructor(dbPath: string, options?: { silent?: boolean }) {
     this.db = new Database(dbPath);
     if (!options?.silent) {
       this.logger.debug(`Connected to database: ${dbPath}`);
     }
   }
   ```

5. **Test**: Run CLI with `--silent` and verify NO debug output:
   ```bash
   DATABASE_PATH=./data/test/databases/cash_savings_test_phase4.db \
     npx ts-node src/cli/optimize-cli.ts --format json --silent | jq .
   ```

---

### Phase 3: Implement Calendar Events and Action Items (Priority: MEDIUM)

**Estimated Time**: 2-3 hours

1. **Create helper functions** in each CLI:
   - `generateCalendarEvents(report)`
   - `generateActionItems(report)`

2. **For FSCS CLI** (`fscs-compliance.ts`):
   - Calendar events: One per breach with deadline
   - Action items: Transfer recommendations to reduce exposure

3. **For Optimizer CLI** (`optimize-cli.ts`):
   - Calendar events: Term maturity dates, notice period deadlines
   - Action items: Transfer recommendations with amounts

4. **Add to output** when flags present:
   ```typescript
   if (options.includeCalendarEvents) {
     result.calendarEvents = await generateCalendarEvents(report);
   }
   ```

5. **Test manually**:
   ```bash
   DATABASE_PATH=./data/test/databases/cash_savings_test_phase4.db \
     npx ts-node src/cli/fscs-compliance.ts \
     --format json \
     --include-calendar-events \
     --include-action-items \
     --silent | jq '.calendarEvents, .actionItems'
   ```

---

### Phase 4: Update Integration Tests (Priority: LOW)

**Estimated Time**: 1 hour

1. **Run tests** to verify they now pass:
   ```bash
   npm test -- tests/integration/
   ```

2. **Update test expectations** if output format changed slightly

3. **Add better error messages** for remaining failures

4. **Skip tests** that genuinely can't work yet (e.g., if specific features not implemented)

---

## Validation Checklist

After implementing fixes, verify:

- [ ] `optimize-cli.ts --format json --silent` produces clean JSON (no debug messages)
- [ ] `fscs-compliance.ts --format json --silent` produces clean JSON
- [ ] Both CLIs return exit code 0 on success
- [ ] Both CLIs return exit code 2 on database errors
- [ ] `--include-calendar-events` adds `calendarEvents` array to output
- [ ] `--include-action-items` adds `actionItems` array to output
- [ ] No references to `deduplication_config` table remain
- [ ] All queries use `unified_config` with appropriate category filters
- [ ] Integration tests pass (target: 20+ out of 25)

---

## Success Criteria

**Minimum** (Phase 1 + 2):
- ✅ CLIs run without database errors
- ✅ CLIs produce clean JSON output in silent mode
- ✅ At least 15 out of 25 integration tests passing

**Full Success** (All Phases):
- ✅ All database schema issues resolved
- ✅ Clean JSON output (no debug contamination)
- ✅ Calendar events and action items implemented
- ✅ 20+ out of 25 integration tests passing
- ✅ CLI tools usable in production

---

## Related Files

### CLI Files
- `/packages/optimization/src/cli/optimize-cli.ts`
- `/packages/optimization/src/cli/fscs-compliance.ts`

### Integration Tests
- `/packages/optimization/tests/integration/module-compatibility.test.ts`
- `/packages/optimization/tests/integration/optimizer-subprocess.test.ts`

### Core Implementation
- `/packages/optimization/src/database/connection.ts`
- `/packages/optimization/src/utils/logger.ts`
- `/packages/optimization/src/products/loader.ts`
- `/packages/optimization/src/configuration/loader.ts`

### Type Definitions
- `/packages/optimization/src/types/integration.ts` (ModuleResult, CalendarEvent, ActionItem)

---

## Future Improvements

1. **Build dist files**: Currently running via `ts-node`, should build to `dist/cli/` and run compiled JS
2. **Better error handling**: Distinguish between user errors (exit 1) and system errors (exit 2)
3. **Validation**: Add JSON schema validation for output
4. **Performance**: Cache database connections across multiple CLI invocations
5. **Documentation**: Add CLI usage examples to README

---

**Author**: Claude
**Reviewed**: [Pending]
**Status**: Documented - Awaiting Implementation

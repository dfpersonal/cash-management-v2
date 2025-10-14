# SQLite Library Consolidation Plan

**Version**: 1.0
**Date**: 2025-01-14
**Status**: Active - Technical Debt Cleanup
**Priority**: Low (No production issues, working system)

---

## Executive Summary

This document provides a consolidated plan to migrate the Cash Management V2 monorepo from a dual-library SQLite setup (sqlite3 + better-sqlite3) to a unified better-sqlite3 architecture. This is **technical debt cleanup**, not an emergency fix—the current system is working correctly with no database lock errors.

**Key Facts**:
- ✅ System is currently **working fine** (sequential operations prevent conflicts)
- ⚠️ Technical debt from dual-library setup (sqlite3 callback-based + better-sqlite3 synchronous)
- 🎯 Goal: Unified architecture, simplified codebase, better maintainability
- 📅 Timeline: **No rush** - migrate gradually over 1-2 months

**This document supersedes**:
- `better-sqlite3-electron-compatibility.md` (partially - electron rebuild info is still valid)
- `DB_DEPENDENCY_ISSUES.md` (fully - analysis was outdated)
- `sqlite-library-migration-plan.md` (fully - discovered legacy system was already removed)

---

## Table of Contents

1. [Background & Investigation](#background--investigation)
2. [Current State Analysis](#current-state-analysis)
3. [Architecture Overview](#architecture-overview)
4. [Why This Migration Matters](#why-this-migration-matters)
5. [Migration Strategy](#migration-strategy)
6. [Phase 1: Centralize Dependencies](#phase-1-centralize-dependencies)
7. [Phase 2: Migrate Portfolio Services](#phase-2-migrate-portfolio-services)
8. [Phase 3: Final Cleanup](#phase-3-final-cleanup)
9. [Git Workflow & Safety](#git-workflow--safety)
10. [Risk Assessment](#risk-assessment)
11. [Timeline & Expectations](#timeline--expectations)

---

## Background & Investigation

### The Three Original Documents

Over several days, three separate documents were created to address SQLite-related issues:

1. **better-sqlite3-electron-compatibility.md** (Oct 12, 2025)
   - **Issue**: Electron native module version mismatch (MODULE_VERSION 136 vs 137)
   - **Solution**: Automated postinstall script with electron-rebuild
   - **Status**: ✅ **Correctly solved and working**
   - **Verdict**: Keep this document - the electron rebuild mechanism is correct

2. **DB_DEPENDENCY_ISSUES.md** (Oct 9, 2025)
   - **Issue**: Claimed multiple packages had direct DB dependencies violating architecture
   - **Problem**: Analysis was **incorrect** - scrapers don't have direct DB deps
   - **Verdict**: Deprecate this document

3. **sqlite-library-migration-plan.md** (Oct 13, 2025)
   - **Issue**: Dual library problem (sqlite3 + better-sqlite3)
   - **Problem**: Claimed legacy `DeduplicationOrchestrator` needed removal
   - **Reality**: Legacy system was **already removed** - only TypeScript `.d.ts` artifacts remained
   - **Verdict**: Deprecate this document - plan was based on outdated information

### What We Actually Discovered

Through systematic investigation of all packages, we found:

1. **Pipeline Package**
   - Already uses better-sqlite3 exclusively ✅
   - Runs via Electron (not standalone Node.js)
   - CLI command: `electron dist/cli.js`
   - Uses the electron-rebuilt better-sqlite3 binary

2. **Portfolio Services** (in @cash-mgmt/shared)
   - Still use sqlite3 (callback-based) ⚠️
   - 11 service files using old API
   - Access same database as pipeline
   - No conflicts because operations are **sequential**

3. **Electron App**
   - Contains both better-sqlite3 (for pipeline) and sqlite3 (for portfolio)
   - Has working postinstall script for electron-rebuild
   - Duplicate better-sqlite3 dependency (needs consolidation)

4. **Optimization Package**
   - Uses sqlite3 (4 files)
   - FSCS compliance services
   - Relatively isolated from main portfolio logic

5. **Scrapers Package**
   - ✅ **No direct DB dependencies** (Document 2 was wrong)
   - Only uses @cash-mgmt/shared
   - Clean architecture

### The Critical Electron Discovery

The pipeline CLI doesn't run with system Node.js—it runs via Electron:

```json
// packages/pipeline/package.json
{
  "scripts": {
    "cli": "npm run build && electron dist/cli.js"
  }
}
```

**Why This Matters**:
- System Node.js: v24.9.0 (MODULE_VERSION 137)
- Electron: v37.2.6 with embedded Node.js v22 (MODULE_VERSION 136)
- Native modules must be compiled for Electron's Node version
- The postinstall script handles this: `npx electron-rebuild -f -w better-sqlite3`

---

## Current State Analysis

### Package Dependencies (Actual)

| Package | better-sqlite3 | sqlite3 | Actual Usage |
|---------|----------------|---------|--------------|
| **@cash-mgmt/shared** | ✅ ^12.4.1 | ✅ ^5.1.6 | sqlite3 (11 service files) |
| **@cash-mgmt/electron-app** | ✅ ^12.2.0 (duplicate!) | via shared | BOTH: 2 files use better-sqlite3, 10+ files use sqlite3 |
| **@cash-mgmt/scrapers** | ❌ None | ❌ None | Clean ✅ |
| **@cash-mgmt/optimization** | ❌ None | ✅ ^5.1.6 | sqlite3 (4 files) |
| **@cash-mgmt/pipeline** | via shared | via shared | better-sqlite3 (entire package) ✅ |

### Files Using sqlite3 (Need Migration)

**@cash-mgmt/shared** (11 files - portfolio management core):
1. `DatabaseService.ts` - Main database interface
2. `TransactionService.ts` - Transaction management
3. `AuditService.ts` - Audit logging
4. `BalanceUpdateService.ts` - Balance updates
5. `ReconciliationService.ts` - Account reconciliation
6. `InterestPaymentService.ts` - Interest tracking
7. `InterestEventService.ts` - Interest events
8. `DocumentService.ts` - Document management
9. `ConfigurationService.ts` - Configuration
10. `AuditLogMonitorService.ts` - Audit monitoring
11. `DatabaseValidator.ts` - Database validation

**@cash-mgmt/electron-app** (13 instances across 7 files):
1. `DocumentCleanupService.ts` - Document cleanup
2. `transaction-handlers.ts` - Transaction IPC handlers
3. `document-handlers.ts` - Document IPC handlers
4. `main.ts` - Main process (3 instances)
5. `ScraperProcessManager.ts` - Scraper management (3 instances)
6. `optimization-handlers.ts` - Optimization IPC (4 instances)

**@cash-mgmt/optimization** (4 files):
1. `connection.ts` - Database connection
2. `fscs.ts` - FSCS compliance
3. `diversification.ts` - Diversification analysis
4. `FSCSTestDatabase.ts` - Test utilities

**Total**: 28 files need migration from sqlite3 to better-sqlite3

### Files Using better-sqlite3 (Already Migrated)

**@cash-mgmt/electron-app** (2 files):
- `main.ts` - Pipeline initialization
- `exportPlatforms.ts` - Platform export utility

**@cash-mgmt/pipeline** (entire package):
- `OrchestrationService.ts`
- `JSONIngestionService.ts`
- `FRNMatchingService.ts`
- `DeduplicationService.ts`
- All test files

---

## Architecture Overview

### Current Dual-Library Setup

```
Electron App (v37.2.6 with Node.js v22)
├── better-sqlite3 (MODULE_VERSION 136) - Rebuilt for Electron
│   ├── Pipeline Services ✅
│   │   ├── OrchestrationService
│   │   ├── JSONIngestionService
│   │   ├── FRNMatchingService
│   │   └── DeduplicationService
│   └── Pipeline CLI (runs via electron)
│
└── sqlite3 (callback-based) - Not rebuilt
    ├── Portfolio Services ⚠️
    │   ├── DatabaseService
    │   ├── TransactionService
    │   ├── AuditService
    │   └── 8 more services...
    └── Optimization Services ⚠️
        ├── FSCS Compliance
        └── Diversification
```

### Database Access Pattern

Both libraries access the **same database file**: `data/database/cash_savings.db`

**Why no conflicts?**
- Operations are **sequential** (never simultaneous)
- Pipeline runs, completes, then portfolio operations run
- Or vice versa
- No concurrent access = no database locks

### The Electron Rebuild Mechanism

Located in `packages/electron-app/package.json`:

```json
{
  "scripts": {
    "postinstall": "cd ../.. && npx electron-rebuild -f -w better-sqlite3 && mkdir -p node_modules/better-sqlite3/lib/binding/node-v136-darwin-arm64 && ln -sf ../../../../../bin/darwin-arm64-136/better-sqlite3.node node_modules/better-sqlite3/lib/binding/node-v136-darwin-arm64/better_sqlite3.node"
  }
}
```

**What it does**:
1. Navigates to monorepo root
2. Runs electron-rebuild for better-sqlite3
3. Creates binding directory expected by bindings module
4. Symlinks rebuilt binary to expected location

**Result**: better-sqlite3 works in Electron with correct NODE_MODULE_VERSION

---

## Why This Migration Matters

### Technical Debt (Not Emergency)

The dual-library setup creates technical debt:

1. **Maintenance Complexity**
   - Two different APIs to remember (callbacks vs sync)
   - Two different error handling patterns
   - Two different transaction mechanisms

2. **Cognitive Load**
   - Developers need to know which library each file uses
   - Easy to accidentally use wrong import
   - Inconsistent code patterns across codebase

3. **Dependency Management**
   - Multiple versions (12.2.0, 12.4.1, 5.1.6)
   - Duplicate better-sqlite3 in electron-app
   - More dependencies = more security updates

4. **Future Risk**
   - If concurrent access is ever added, lock conflicts will occur
   - Harder to reason about database access patterns
   - More difficult for future developers

### Why Not an Emergency

- ✅ No production issues
- ✅ No database lock errors
- ✅ All features working correctly
- ✅ Sequential access prevents conflicts
- ✅ Only one user (you)

**Conclusion**: This is technical debt cleanup, not a critical fix. Take your time.

---

## Migration Strategy

### Guiding Principles

1. **Safety First**: Git branches for everything, easy rollback
2. **Incremental**: Migrate one service at a time
3. **Test-Driven**: Manual testing after each change (no automated tests)
4. **No Pressure**: Do at your own pace over 1-2 months
5. **Backup Always**: Database backup before each phase

### Three-Phase Approach

**Phase 1**: Quick win (2 hours)
- Centralize better-sqlite3 to root
- Remove duplicate from electron-app
- Verify postinstall script still works

**Phase 2**: Gradual migration (over weeks)
- Migrate one service at a time
- Test thoroughly between migrations
- No rush - pause anytime

**Phase 3**: Final cleanup (30 minutes)
- Remove sqlite3 completely
- Update documentation
- Archive old docs

---

## Phase 1: Centralize Dependencies

**Goal**: Single better-sqlite3 version in root, eliminate duplicate

**Duration**: 1-2 hours
**Risk**: LOW 🟢
**Impact**: Cleaner dependencies, foundation for Phase 2

### Current Problem

```
root/package.json
  └── better-sqlite3: ^12.4.1 ✅

packages/electron-app/package.json
  └── better-sqlite3: ^12.2.0 ❌ DUPLICATE

packages/shared/package.json
  ├── better-sqlite3: ^12.4.1
  └── sqlite3: ^5.1.6
```

### Target State

```
root/package.json
  └── better-sqlite3: ^12.4.1 ✅ SINGLE SOURCE

packages/shared/package.json
  ├── better-sqlite3: ^12.4.1 (hoisted)
  └── sqlite3: ^5.1.6 (still needed for now)

packages/electron-app/package.json
  └── (no direct better-sqlite3 dependency)
```

### Steps

1. **Create Git Branch**
   ```bash
   git checkout -b phase1-centralize-deps
   ```

2. **Backup Database**
   ```bash
   cp data/database/cash_savings.db data/database/cash_savings.db.backup-$(date +%Y%m%d)
   ```

3. **Remove Duplicate Dependency**
   Edit `packages/electron-app/package.json`:
   - Remove line 79: `"better-sqlite3": "^12.2.0",`

4. **Update Postinstall Script** (if needed)
   Verify it uses hoisted dependency (should already work)

5. **Install Dependencies**
   ```bash
   npm install
   ```

6. **Test Electron App**
   ```bash
   cd packages/electron-app
   npm start
   ```
   - Verify app starts without MODULE_VERSION errors
   - Check database loads correctly

7. **Test Pipeline CLI**
   ```bash
   cd packages/pipeline
   npm run cli -- --help
   ```
   - Verify CLI runs without errors

8. **Commit and Merge**
   ```bash
   git add -A
   git commit -m "chore: centralize better-sqlite3 to root, remove duplicate

- Remove better-sqlite3 ^12.2.0 from @cash-mgmt/electron-app
- Use hoisted better-sqlite3 ^12.4.1 from root
- Verify electron-rebuild postinstall still works
- All tests passing (manual verification)
"
   git checkout main
   git merge phase1-centralize-deps
   ```

### Success Criteria

- ✅ Only one better-sqlite3 version across entire monorepo
- ✅ Electron app starts successfully
- ✅ Pipeline CLI works
- ✅ Database operations work correctly
- ✅ No MODULE_VERSION errors

### Rollback Plan

If something breaks:
```bash
git checkout main
git branch -D phase1-centralize-deps
```

Your working code is preserved in `main`.

---

## Phase 2: Migrate Portfolio Services

**Goal**: Convert all sqlite3 usage to better-sqlite3

**Duration**: 1-2 months (one service per session)
**Risk**: MEDIUM 🟡 (handles real money data)
**Impact**: Unified codebase, eliminated technical debt

### Strategy: One Service at a Time

**DO NOT migrate everything at once.** Migrate one service, test thoroughly, commit, then move to next.

### Service Migration Order

**Recommended order** (least to most critical):

1. **Week 1**: Foundation Services
   - ConfigurationService (simple, low risk)
   - AuditLogMonitorService (monitoring only)
   - DatabaseValidator (validation only)

2. **Week 2**: Read-Heavy Services
   - AuditService (mostly reads)
   - InterestEventService (reads, simple writes)

3. **Week 3**: Core Services
   - TransactionService (critical, test thoroughly)
   - BalanceUpdateService (updates balances)

4. **Week 4**: Advanced Services
   - ReconciliationService (complex logic)
   - InterestPaymentService (calculations)
   - DocumentService (file operations)

5. **Week 5**: Foundation Migration
   - DatabaseService (most critical, do last)
   - Update all services to use new DatabaseService

6. **Week 6**: IPC Handlers & Optimization
   - electron-app IPC handlers
   - optimization package services

### Migration Pattern for Each Service

#### 1. Create Branch
```bash
git checkout -b phase2-migrate-[service-name]
```

#### 2. Backup Database
```bash
cp data/database/cash_savings.db data/database/cash_savings.db.backup-[service-name]
```

#### 3. Convert Callback to Sync

**Before (sqlite3 callback-based)**:
```typescript
async query(sql: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    this.db.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}
```

**After (better-sqlite3 synchronous)**:
```typescript
query(sql: string): any[] {
  return this.db.prepare(sql).all();
}
```

#### 4. Update Error Handling

**Before**:
```typescript
db.run(sql, params, (err) => {
  if (err) {
    // callback error handling
  }
});
```

**After**:
```typescript
try {
  db.prepare(sql).run(params);
} catch (error) {
  // exception-based error handling
}
```

#### 5. Update Transactions

**Before**:
```typescript
db.serialize(() => {
  db.run("BEGIN TRANSACTION");
  db.run(sql1);
  db.run(sql2);
  db.run("COMMIT");
});
```

**After**:
```typescript
const transaction = db.transaction(() => {
  db.prepare(sql1).run();
  db.prepare(sql2).run();
});
transaction();
```

#### 6. Test Thoroughly

For each migrated service, test:
- All features that use that service
- Error handling (try to cause failures)
- Transaction rollback (if applicable)
- Database integrity (check data after operations)

#### 7. Commit
```bash
git add -A
git commit -m "refactor: migrate [ServiceName] from sqlite3 to better-sqlite3

- Convert callback-based methods to synchronous
- Update error handling from callbacks to try/catch
- Update transaction handling to use db.transaction()
- Manual testing: [list features tested]
"
git checkout main
git merge phase2-migrate-[service-name]
```

### Detailed Service Notes

#### DatabaseService (Most Critical)

**Why last**: All other services depend on it

**Special considerations**:
- Used by every feature
- Handles connections, transactions, queries
- Test every portfolio feature after migration
- Consider keeping both versions temporarily (old + new)

**Testing checklist**:
- [ ] View all accounts
- [ ] Create new transaction
- [ ] Update balance
- [ ] Run reconciliation
- [ ] Generate report
- [ ] Create interest payment
- [ ] Upload document
- [ ] View audit trail

#### TransactionService

**Risk**: High (handles real money)

**Testing**:
- [ ] Create transaction
- [ ] Edit transaction
- [ ] Delete transaction
- [ ] Verify balances updated correctly
- [ ] Test rollback on error

#### ReconciliationService

**Risk**: Medium (complex logic)

**Testing**:
- [ ] Run reconciliation
- [ ] Verify differences calculated correctly
- [ ] Test with missing transactions
- [ ] Test with duplicate transactions

### Success Criteria (Per Service)

- ✅ All callbacks removed
- ✅ Synchronous API working
- ✅ Error handling updated
- ✅ Transactions working (if applicable)
- ✅ Manual testing passed
- ✅ No regressions in portfolio features

---

## Phase 3: Final Cleanup

**Goal**: Remove sqlite3 completely, update documentation

**Duration**: 30 minutes
**Risk**: LOW 🟢
**Impact**: Clean codebase, up-to-date docs

### Steps

1. **Create Branch**
   ```bash
   git checkout -b phase3-final-cleanup
   ```

2. **Remove sqlite3 Dependencies**

   Edit `packages/shared/package.json`:
   ```json
   // Remove these lines:
   "sqlite3": "^5.1.6"
   "@types/sqlite3": "^3.1.8"
   ```

   Edit `packages/optimization/package.json`:
   ```json
   // Remove:
   "sqlite3": "^5.1.6"
   ```

3. **Verify No Remaining Imports**
   ```bash
   grep -r "require('sqlite3')" packages/
   grep -r "from 'sqlite3'" packages/
   ```
   Should return no results.

4. **Install Dependencies**
   ```bash
   npm install
   ```

5. **Test Everything**
   - Start Electron app
   - Run pipeline CLI
   - Test a few portfolio features
   - Verify no "Cannot find module 'sqlite3'" errors

6. **Update Documentation**
   - Add deprecation notices to old docs
   - Update README if needed
   - Update architecture diagrams

7. **Commit**
   ```bash
   git add -A
   git commit -m "chore: remove sqlite3 dependencies

- Remove sqlite3 and @types/sqlite3 from all packages
- All services now use better-sqlite3
- Migration complete
"
   git checkout main
   git merge phase3-final-cleanup
   ```

### Success Criteria

- ✅ No sqlite3 in any package.json
- ✅ No imports of sqlite3 in code
- ✅ All features still working
- ✅ Documentation updated

---

## Git Workflow & Safety

### Branching Strategy

**One branch per service migration**:

```
main (always working)
  ├── phase1-centralize-deps → merge → main
  ├── phase2-migrate-config-service → merge → main
  ├── phase2-migrate-audit-service → merge → main
  ├── phase2-migrate-transaction-service → merge → main
  └── ... (one branch per service)
```

### Safety Rules

1. **Never commit directly to main** during migration
2. **Always create a branch** before changes
3. **Take database backup** before testing
4. **Test on branch** before merging
5. **Merge only when working** 100%
6. **Keep main deployable** at all times

### Rollback Commands

**If branch has issues**:
```bash
# Abandon branch, go back to main
git checkout main
git branch -D phase2-migrate-[service]
```

**If you merged and need to undo**:
```bash
# Undo last commit (if not pushed)
git reset --hard HEAD~1

# Undo last commit (if pushed - use carefully)
git revert HEAD
```

**If database got corrupted**:
```bash
# Restore from backup
cp data/database/cash_savings.db.backup-[date] data/database/cash_savings.db
```

### Testing Checklist (After Each Merge)

After merging any service migration:

- [ ] Electron app starts without errors
- [ ] Pipeline CLI runs without errors
- [ ] Database opens correctly
- [ ] Basic portfolio operations work:
  - [ ] View accounts
  - [ ] View transactions
  - [ ] Create test transaction
  - [ ] View audit log
- [ ] Pipeline operations work:
  - [ ] Run pipeline on test data
  - [ ] Verify products in database

---

## Risk Assessment

### Phase 1 Risks

**Risk**: Electron postinstall script breaks
**Probability**: Low
**Impact**: Medium (app won't start)
**Mitigation**: Postinstall script uses `cd ../..` which works with hoisted deps
**Rollback**: Easy (git checkout main)

**Risk**: Different behavior between v12.2.0 and v12.4.1
**Probability**: Very Low
**Impact**: Low
**Mitigation**: Both are patch releases of v12
**Rollback**: Easy

### Phase 2 Risks

**Risk**: Breaking portfolio features
**Probability**: Medium
**Impact**: High (can't manage cash)
**Mitigation**: One service at a time, test thoroughly, database backups
**Rollback**: Medium (need to revert code and possibly restore DB)

**Risk**: Transaction integrity issues
**Probability**: Low
**Impact**: High (data corruption)
**Mitigation**: Careful transaction conversion, test rollback scenarios
**Rollback**: Medium

**Risk**: Subtle behavior differences
**Probability**: Medium
**Impact**: Medium
**Mitigation**: Thorough manual testing, understand both APIs
**Rollback**: Medium

### Phase 3 Risks

**Risk**: Missed sqlite3 imports
**Probability**: Low
**Impact**: High (app crashes)
**Mitigation**: grep search before removal
**Rollback**: Easy (npm install sqlite3)

### Overall Risk Level

**Phase 1**: LOW 🟢
**Phase 2**: MEDIUM 🟡
**Phase 3**: LOW 🟢

**Critical Success Factor**: Testing after each service migration

---

## Timeline & Expectations

### Realistic Timeline

**Phase 1**: This week (whenever you have 2 hours)

**Phase 2**: Over next 1-2 months
- Migrate 1-2 services per week
- Take breaks between migrations
- No deadline pressure
- Skip weeks if busy

**Phase 3**: After Phase 2 complete (30 minutes)

### Total Time Investment

- **Phase 1**: 2 hours
- **Phase 2**: 20-30 hours (spread over weeks)
- **Phase 3**: 30 minutes
- **Total**: ~25-35 hours over 1-2 months

### No Pressure Points

- ❌ No production deadline
- ❌ No breaking changes forcing migration
- ❌ No security vulnerabilities
- ❌ No user complaints

✅ **Do at your own pace**

### When to Pause

Pause migration if:
- You need to use portfolio features heavily
- You're working on other features
- You need a break
- You're not confident about a change

**Main branch always works** - you can pause anytime.

---

## Appendix: API Comparison

### sqlite3 (callback-based) vs better-sqlite3 (synchronous)

#### Query

**sqlite3**:
```typescript
db.all("SELECT * FROM accounts", (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log(rows);
  }
});
```

**better-sqlite3**:
```typescript
try {
  const rows = db.prepare("SELECT * FROM accounts").all();
  console.log(rows);
} catch (error) {
  console.error(error);
}
```

#### Insert

**sqlite3**:
```typescript
db.run("INSERT INTO accounts (name) VALUES (?)", ["Savings"], (err) => {
  if (err) {
    console.error(err);
  }
});
```

**better-sqlite3**:
```typescript
try {
  db.prepare("INSERT INTO accounts (name) VALUES (?)").run("Savings");
} catch (error) {
  console.error(error);
}
```

#### Transaction

**sqlite3**:
```typescript
db.serialize(() => {
  db.run("BEGIN TRANSACTION");
  db.run("INSERT INTO accounts (name) VALUES (?)", ["Account1"]);
  db.run("INSERT INTO accounts (name) VALUES (?)", ["Account2"]);
  db.run("COMMIT", (err) => {
    if (err) {
      db.run("ROLLBACK");
    }
  });
});
```

**better-sqlite3**:
```typescript
const insertMany = db.transaction((accounts) => {
  for (const account of accounts) {
    db.prepare("INSERT INTO accounts (name) VALUES (?)").run(account);
  }
});

try {
  insertMany(["Account1", "Account2"]);
} catch (error) {
  // Automatic rollback on error
  console.error(error);
}
```

---

## Questions or Issues?

If you encounter issues during migration:

1. **Check this document** for guidance
2. **Review Git workflow** for rollback options
3. **Take a backup** before troubleshooting
4. **Test on branch** before merging
5. **Ask for help** if stuck (that's me!)

**Remember**: This is technical debt cleanup, not an emergency. Take your time, test thoroughly, and keep main working.

Good luck! 🚀

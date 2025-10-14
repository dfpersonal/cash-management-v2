# SQLite Migration Checklist

**Version**: 1.0
**Date**: 2025-01-14
**Reference**: See SQLITE-CONSOLIDATION-PLAN.md for detailed explanations

---

## Overview

This checklist guides you through the three-phase migration from dual-library (sqlite3 + better-sqlite3) to unified better-sqlite3 architecture.

**Progress Tracking**:
- Phase 1: ✅ **COMPLETE** (October 14, 2025)
- Phase 2: ⬜ Not Started
- Phase 3: ⬜ Not Started

**Current Phase**: Phase 2 - Ready to begin service migrations

---

## Phase 1: Centralize Dependencies

**Goal**: Single better-sqlite3 version in root
**Duration**: 1-2 hours
**Risk**: LOW 🟢

### Pre-Flight Checks

- [x] Read Phase 1 in SQLITE-CONSOLIDATION-PLAN.md
- [x] Confirm no uncommitted changes: `git status`
- [x] Verify current branch is `main`: `git branch`

### Steps

#### 1. Create Branch

```bash
git checkout -b phase1-centralize-deps
```

- [x] Branch created successfully
- [x] Verify branch: `git branch` shows `* phase1-centralize-deps`

#### 2. Backup Database

```bash
cd /Users/david/Websites/cash-management-v2
cp data/database/cash_savings.db data/database/cash_savings.db.backup-$(date +%Y%m%d)
ls -lh data/database/cash_savings.db*
```

- [x] Backup created
- [x] Backup file size matches original
- [x] Record backup filename: `cash_savings.db.backup-20251014`

#### 3. Remove Duplicate Dependency

Edit `packages/electron-app/package.json`:

- [x] Open file in editor
- [x] Find line ~79: `"better-sqlite3": "^12.2.0",`
- [x] Delete entire line (including comma)
- [x] Save file
- [x] Verify with: `grep "better-sqlite3" packages/electron-app/package.json`
  - Only shows postinstall script reference ✅

#### 4. Verify Postinstall Script

Check `packages/electron-app/package.json` line 10:

```json
"postinstall": "cd ../.. && npx electron-rebuild -f -w better-sqlite3 && mkdir -p node_modules/better-sqlite3/lib/binding/node-v136-darwin-arm64 && ln -sf ../../../../../bin/darwin-arm64-136/better-sqlite3.node node_modules/better-sqlite3/lib/binding/node-v136-darwin-arm64/better_sqlite3.node"
```

- [x] Postinstall script exists
- [x] Contains `cd ../..` (navigates to root for hoisted dep)
- [x] Contains `electron-rebuild -f -w better-sqlite3`
- [x] No changes needed (works with hoisted dependency)

#### 5. Install Dependencies

```bash
cd /Users/david/Websites/cash-management-v2
npm install
```

- [x] Installation completed without errors
- [x] electron-rebuild ran successfully
- [x] No MODULE_VERSION warnings

#### 6. Verify Dependency Tree

```bash
npm ls better-sqlite3
```

Expected output: Single ^12.4.1 hoisted from root

- [x] Only ONE version of better-sqlite3 shown
- [x] Version is ^12.4.1
- [x] electron-app shows dependency from root (deduped)

#### 7. Test Electron App

```bash
cd packages/electron-app
npm start
```

- [x] App starts without errors
- [x] No MODULE_VERSION_MISMATCH errors
- [x] Database loads (database files accessed)
- [x] No console errors related to better-sqlite3

**Test these features**:
- [x] App startup successful
- [x] Database connection working

**Close app cleanly**

#### 8. Test Pipeline CLI

```bash
cd /Users/david/Websites/cash-management-v2/packages/pipeline
npm run cli -- --help
```

- [x] Help message displays correctly
- [x] No "Cannot find module" errors
- [x] CLI recognizes electron command

#### 9. Commit Changes

```bash
cd /Users/david/Websites/cash-management-v2
git status
```

- [x] Shows changes to `packages/electron-app/package.json`

```bash
git add packages/electron-app/package.json
git commit -m "chore: centralize better-sqlite3 to root, remove duplicate

- Remove better-sqlite3 ^12.2.0 from @cash-mgmt/electron-app
- Use hoisted better-sqlite3 ^12.4.1 from root
- Verify electron-rebuild postinstall still works
- Manual testing: electron app starts, pipeline CLI works
- All features tested and working
- Database backup: cash_savings.db.backup-20251014"
```

- [x] Commit created successfully (commit a424b5f)
- [x] Verify: `git log -1` shows commit message

#### 10. Merge to Main

```bash
git checkout master
git merge phase1-centralize-deps
```

- [x] Merged successfully (fast-forward)
- [x] No conflicts
- [x] Verify: `git log -1` shows merge

#### 11. Final Verification

```bash
npm ls better-sqlite3
```

- [x] Single version 12.4.1 confirmed on master branch
- [x] All dependencies hoisted correctly

#### 12. Cleanup Branch (Optional)

```bash
git branch -d phase1-centralize-deps
```

- [ ] Branch deleted (optional - kept for reference)

### Phase 1 Complete! ✅

Date completed: `October 14, 2025`

**Commit**: `a424b5f` - "chore: centralize better-sqlite3 to root, remove duplicate"
**Result**: Single better-sqlite3 version (12.4.1) hoisted from root
**Status**: All tests passing, Electron app working, Pipeline CLI working

**Before Phase 2**: Take a break! Phase 1 was the foundation. Phase 2 is gradual—no rush.

---

## Phase 2: Migrate Portfolio Services

**Goal**: Convert all sqlite3 services to better-sqlite3
**Duration**: 1-2 months (one service per session)
**Risk**: MEDIUM 🟡

### Migration Strategy

**IMPORTANT**: Migrate ONE service at a time. After each service:
1. Test thoroughly
2. Commit
3. Take a break
4. Move to next service

**Do NOT try to migrate everything at once.**

### Using the /migrate-service Slash Command

**NEW**: Use the `/migrate-service` slash command to get a detailed, service-specific migration plan!

**Usage**:
```
/migrate-service ConfigurationService
```

**The command will**:
- ✅ Locate and analyze the service file
- ✅ Identify all sqlite3 callback methods
- ✅ Generate exact before/after code for each method
- ✅ Provide service-specific test checklist
- ✅ Show risk assessment
- ✅ Give you step-by-step implementation guide

**After reviewing the plan, you can**:
- Say **"execute"** → I'll make the changes automatically
- Say **"manual"** → Follow the guide step-by-step yourself
- Ask questions or request clarifications

---

### Service Migration Progress

Track your progress here:

#### Week 1: Foundation Services

- [ ] ConfigurationService → Run: `/migrate-service ConfigurationService`
- [ ] AuditLogMonitorService → Run: `/migrate-service AuditLogMonitorService`
- [ ] DatabaseValidator → Run: `/migrate-service DatabaseValidator`

#### Week 2: Read-Heavy Services

- [ ] AuditService → Run: `/migrate-service AuditService`
- [ ] InterestEventService → Run: `/migrate-service InterestEventService`

#### Week 3: Core Services

- [ ] TransactionService → Run: `/migrate-service TransactionService`
- [ ] BalanceUpdateService → Run: `/migrate-service BalanceUpdateService`

#### Week 4: Advanced Services

- [ ] ReconciliationService → Run: `/migrate-service ReconciliationService`
- [ ] InterestPaymentService → Run: `/migrate-service InterestPaymentService`
- [ ] DocumentService → Run: `/migrate-service DocumentService`

#### Week 5: Foundation Migration

- [ ] DatabaseService (most critical - do last) → Run: `/migrate-service DatabaseService`

#### Week 6: IPC Handlers & Optimization

**Note**: For IPC handlers and other files, the slash command works if you provide the exact service name. Otherwise, use the manual template below.

- [ ] electron-app IPC handlers
  - [ ] transaction-handlers.ts
  - [ ] document-handlers.ts
  - [ ] optimization-handlers.ts
  - [ ] DocumentCleanupService.ts
  - [ ] ScraperProcessManager.ts
  - [ ] main.ts (3 instances)
- [ ] optimization package
  - [ ] connection.ts
  - [ ] fscs.ts
  - [ ] diversification.ts
  - [ ] FSCSTestDatabase.ts

---

### Quick Migration Workflow (with slash command)

For each service:

1. **Generate migration plan**:
   ```
   /migrate-service [ServiceName]
   ```

2. **Review the plan** - Check:
   - Risk level
   - Methods to convert
   - Test checklist

3. **Execute or manual**:
   - Say "execute" for automatic migration
   - Say "manual" to do it yourself

4. **Test thoroughly** using the generated checklist

5. **Commit and merge** using the provided commands

6. **Move to next service**

---

### Manual Migration Template (Fallback)

**Use this if slash command doesn't work for a specific file**

#### Service Name: `_______________________`

**File Location**: `_______________________`

##### 1. Pre-Migration

- [ ] Read service code to understand what it does
- [ ] Identify all database operations
- [ ] Create branch: `git checkout -b phase2-migrate-[service-name]`
- [ ] Backup database:
  ```bash
  cp data/database/cash_savings.db data/database/cash_savings.db.backup-[service-name]
  ```

##### 2. Code Changes

- [ ] Open service file in editor
- [ ] Change import from `sqlite3` to `better-sqlite3`:
  ```typescript
  // Before:
  import { Database } from 'sqlite3';

  // After:
  import Database from 'better-sqlite3';
  ```

- [ ] Convert callback methods to synchronous:

  **Pattern**:
  ```typescript
  // Before:
  db.all(sql, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });

  // After:
  const rows = db.prepare(sql).all();
  ```

- [ ] Update error handling from callbacks to try/catch:
  ```typescript
  // Before:
  db.run(sql, (err) => {
    if (err) { /* handle */ }
  });

  // After:
  try {
    db.prepare(sql).run();
  } catch (error) {
    // handle
  }
  ```

- [ ] Update transactions:
  ```typescript
  // Before:
  db.serialize(() => {
    db.run("BEGIN");
    db.run(sql1);
    db.run(sql2);
    db.run("COMMIT");
  });

  // After:
  const transaction = db.transaction(() => {
    db.prepare(sql1).run();
    db.prepare(sql2).run();
  });
  transaction();
  ```

- [ ] Remove any `db.serialize()` calls
- [ ] Remove any `db.parallelize()` calls
- [ ] Save file

##### 3. Build & Verify

```bash
cd /Users/david/Websites/cash-management-v2
npm run build --workspace=@cash-mgmt/shared
```

- [ ] Build succeeds
- [ ] No TypeScript errors

##### 4. Testing

**Start Electron app**:
```bash
cd packages/electron-app
npm start
```

**Test service-specific features**:

For **ConfigurationService**:
- [ ] View settings page
- [ ] Load configuration
- [ ] Update configuration

For **TransactionService**:
- [ ] View transactions page
- [ ] Create new transaction
- [ ] Edit existing transaction
- [ ] Delete transaction
- [ ] Verify balance updates

For **ReconciliationService**:
- [ ] Run reconciliation
- [ ] View reconciliation results
- [ ] Test with missing transactions

For **DatabaseService** (most critical):
- [ ] View all pages (accounts, transactions, documents)
- [ ] Create transaction
- [ ] Update balance
- [ ] Upload document
- [ ] Run reconciliation
- [ ] Generate report
- [ ] View audit log
- [ ] **Test EVERY portfolio feature**

**Test error handling**:
- [ ] Try invalid operations (if possible)
- [ ] Verify errors caught correctly

- [ ] Close app cleanly

##### 5. Check Database Integrity

```bash
sqlite3 data/database/cash_savings.db "PRAGMA integrity_check;"
```

- [ ] Result: `ok`
- [ ] No corruption detected

##### 6. Commit

```bash
git status
git add [modified-files]
git commit -m "refactor: migrate [ServiceName] from sqlite3 to better-sqlite3

- Convert callback-based methods to synchronous API
- Update error handling from callbacks to try/catch
- Update transaction handling to use db.transaction()
- All TypeScript compilation successful
- Manual testing passed:
  - [List features tested]
  - [Any specific edge cases]
"
```

- [ ] Commit created
- [ ] Commit message is descriptive

##### 7. Merge

```bash
git checkout main
git merge phase2-migrate-[service-name]
```

- [ ] Merged successfully
- [ ] Quick smoke test on main branch

##### 8. Take a Break!

- [ ] Service migrated ✅
- [ ] Take a break before next service
- [ ] Update progress tracking above

**Service completed**: `[Date]`

---

## Phase 3: Final Cleanup

**Goal**: Remove sqlite3 completely
**Duration**: 30 minutes
**Risk**: LOW 🟢

### Pre-Flight Checks

- [ ] All Phase 2 services migrated and working
- [ ] No outstanding migration branches
- [ ] Current branch is `main`

### Steps

#### 1. Create Branch

```bash
git checkout -b phase3-final-cleanup
```

- [ ] Branch created

#### 2. Search for Remaining sqlite3 Usage

```bash
cd /Users/david/Websites/cash-management-v2
grep -r "require('sqlite3')" packages/
grep -r "from 'sqlite3'" packages/
grep -r "import.*sqlite3" packages/
```

- [ ] **All commands return NO results**
- [ ] If results found: migrate those files first (return to Phase 2)

#### 3. Remove sqlite3 from shared Package

Edit `packages/shared/package.json`:

- [ ] Open file
- [ ] Remove line: `"sqlite3": "^5.1.6",`
- [ ] Remove line: `"@types/sqlite3": "^3.1.8",` (if exists in devDependencies)
- [ ] Save file

#### 4. Remove sqlite3 from optimization Package

Edit `packages/optimization/package.json`:

- [ ] Open file
- [ ] Remove line: `"sqlite3": "^5.1.6",`
- [ ] Save file

#### 5. Install Dependencies

```bash
npm install
```

- [ ] Installation successful
- [ ] No errors

#### 6. Verify No sqlite3 Remaining

```bash
npm ls sqlite3
```

Expected: "ENOENT" or "No matching version found"

- [ ] sqlite3 not found in dependency tree ✅

#### 7. Test Everything

**Electron App**:
```bash
cd packages/electron-app
npm start
```

- [ ] App starts without errors
- [ ] No "Cannot find module 'sqlite3'" errors
- [ ] Database loads correctly

**Test Portfolio Features**:
- [ ] View accounts
- [ ] View transactions
- [ ] Create test transaction
- [ ] View documents
- [ ] View audit log
- [ ] Run quick reconciliation

- [ ] All features working ✅

**Pipeline CLI**:
```bash
cd /Users/david/Websites/cash-management-v2/packages/pipeline
npm run cli -- --help
```

- [ ] CLI works
- [ ] No errors

#### 8. Update Documentation

- [ ] Add deprecation notice to `better-sqlite3-electron-compatibility.md`
- [ ] Add deprecation notice to `DB_DEPENDENCY_ISSUES.md`
- [ ] Add deprecation notice to `sqlite-library-migration-plan.md`

#### 9. Commit

```bash
cd /Users/david/Websites/cash-management-v2
git add -A
git commit -m "chore: remove sqlite3 dependencies - migration complete

- Remove sqlite3 and @types/sqlite3 from all packages
- All services now use better-sqlite3 exclusively
- Unified codebase with single SQLite library
- Manual testing: all features working correctly
"
```

- [ ] Commit created

#### 10. Merge to Main

```bash
git checkout main
git merge phase3-final-cleanup
```

- [ ] Merged successfully

#### 11. Final Verification on Main

```bash
cd packages/electron-app
npm start
```

- [ ] App works on main
- [ ] Quick feature test
- [ ] Close app

#### 12. Cleanup Branch

```bash
git branch -d phase3-final-cleanup
```

- [ ] Branch deleted

### Phase 3 Complete! ✅

Date completed: `_______________________`

---

## Migration Complete! 🎉

Congratulations! You've successfully migrated from dual-library setup to unified better-sqlite3 architecture.

### Final Checklist

- [ ] Phase 1: Centralized dependencies ✅
- [ ] Phase 2: All services migrated ✅
- [ ] Phase 3: sqlite3 removed ✅
- [ ] All documentation updated ✅
- [ ] All tests passing ✅

### What You've Achieved

✅ **Cleaner Architecture**: Single SQLite library
✅ **Simpler Codebase**: One API to remember
✅ **Better Maintainability**: Consistent patterns throughout
✅ **No Technical Debt**: Future developers will thank you
✅ **Zero Regressions**: Everything still works

### Rollback Instructions (Just in Case)

If you ever need to rollback (unlikely):

```bash
# Go back to last working state
git log --oneline
git checkout [commit-hash-before-migration]

# Restore database from backup
cp data/database/cash_savings.db.backup-[date] data/database/cash_savings.db
```

### Maintenance Notes

**Going Forward**:
- All new database code uses better-sqlite3
- Use synchronous API (no callbacks)
- Use `db.prepare(sql).run/get/all()` pattern
- Use `db.transaction()` for multi-statement operations
- Handle errors with try/catch (not callbacks)

**Resources**:
- better-sqlite3 docs: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
- Electron rebuild: See `better-sqlite3-electron-compatibility.md`

---

## Notes & Observations

Use this space to track any issues, observations, or learnings during migration:

```
[Date] - [Note]
_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________
```

---

**Well done!** The migration is complete. Your codebase is now cleaner, more maintainable, and ready for the future.

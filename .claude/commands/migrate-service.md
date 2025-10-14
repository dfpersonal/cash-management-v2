---
description: Analyze a service and create a detailed sqlite3 to better-sqlite3 migration plan
---

You are analyzing a service file for migration from sqlite3 (callback-based) to better-sqlite3 (synchronous).

# Service to Migrate

The user will specify a service name as an argument. Common services include:
- DatabaseService
- TransactionService
- AuditService
- BalanceUpdateService
- ReconciliationService
- InterestPaymentService
- InterestEventService
- DocumentService
- ConfigurationService
- AuditLogMonitorService
- DatabaseValidator

Service name: {{arg1}}

# Your Task

1. **Locate the service file** in the codebase:
   - Check `packages/shared/src/services/{{arg1}}.ts`
   - Check `packages/electron-app/src/main/services/{{arg1}}.ts`
   - If not found, search the codebase

2. **Read and analyze the service file**:
   - Identify all sqlite3 imports
   - Find all callback-based database methods
   - Identify transaction handling
   - Note error handling patterns
   - Find any `db.serialize()` or `db.parallelize()` calls

3. **Generate a detailed migration plan** with:
   - Summary of what the service does
   - List of all methods that need conversion (with line numbers)
   - Exact code changes for each method (before/after)
   - Transaction handling updates
   - Error handling updates
   - Import statement changes

4. **Create a service-specific test checklist**:
   - List all features this service supports
   - Specific test steps for each feature
   - Edge cases to test
   - Expected behaviors

5. **Provide implementation steps**:
   - Git branch name to use
   - Exact edits to make
   - Build commands to run
   - Test instructions

# Output Format

Provide your analysis in this format:

```markdown
# Migration Plan: {{arg1}}

## Service Analysis

**File Location**: `[path]`
**Lines of Code**: [count]
**Risk Level**: [LOW/MEDIUM/HIGH]

**What this service does**:
[1-2 sentence description]

**Current sqlite3 usage**:
- [Number] callback-based methods
- [Number] transaction blocks
- [Number] serialize/parallelize calls

## Methods to Convert

### 1. [methodName] (line [X])

**Current implementation** (sqlite3):
```typescript
[exact current code]
```

**New implementation** (better-sqlite3):
```typescript
[exact new code]
```

**Changes**:
- [List specific changes]

[Repeat for each method]

## Import Changes

**Remove**:
```typescript
import { Database } from 'sqlite3';
```

**Add**:
```typescript
import Database from 'better-sqlite3';
```

## Transaction Handling Updates

[Show before/after for any transaction code]

## Error Handling Updates

[Show before/after for error handling patterns]

## Implementation Steps

### 1. Create Branch
```bash
git checkout -b phase2-migrate-{{arg1}}
```

### 2. Backup Database
```bash
cp data/database/cash_savings.db data/database/cash_savings.db.backup-{{arg1}}
```

### 3. Make Code Changes

[Provide exact Edit tool commands or code blocks to modify]

### 4. Build
```bash
cd /Users/david/Websites/cash-management-v2
npm run build --workspace=@cash-mgmt/shared
```

### 5. Test

**Start Electron app**:
```bash
cd packages/electron-app
npm start
```

**Test Checklist**:
- [ ] [Specific test 1]
- [ ] [Specific test 2]
- [ ] [Specific test 3]
...

### 6. Commit
```bash
git add [files]
git commit -m "refactor: migrate {{arg1}} from sqlite3 to better-sqlite3

- Convert callback-based methods to synchronous API
- Update error handling from callbacks to try/catch
- Update transaction handling to use db.transaction()
- Testing: [list what was tested]
"
```

### 7. Merge
```bash
git checkout main
git merge phase2-migrate-{{arg1}}
```

## Risk Assessment

**Why this is [RISK LEVEL]**:
[Explain the risk factors for this specific service]

**Critical areas to test**:
- [Area 1]
- [Area 2]

**Rollback plan**:
```bash
git checkout main
git branch -D phase2-migrate-{{arg1}}
# Restore database if needed
cp data/database/cash_savings.db.backup-{{arg1}} data/database/cash_savings.db
```

## Questions for You

- [ ] Have you reviewed the proposed changes?
- [ ] Are you ready to proceed with the migration?
- [ ] Do you want me to execute these changes, or will you do it manually?

---

**Ready to proceed?** Say "execute" and I'll make the changes, or "manual" and I'll guide you through each step.
```

# Additional Instructions

- Be thorough and precise with line numbers and code snippets
- Use the Read tool to get actual current code (don't guess)
- Provide exact, copy-pasteable code
- Highlight any tricky conversions
- Note if any method has complex logic that needs extra care
- Reference the SQLITE-CONSOLIDATION-PLAN.md for conversion patterns
- If the service doesn't exist or doesn't use sqlite3, say so clearly

# Context

You have access to:
- SQLITE-CONSOLIDATION-PLAN.md (comprehensive migration guide)
- SQLITE-MIGRATION-CHECKLIST.md (general checklist)
- All service source files

This service migration is part of Phase 2 of the consolidation plan. The user is migrating one service at a time for safety.

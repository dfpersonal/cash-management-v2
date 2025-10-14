# SQLite Library Migration Plan: sqlite3 to better-sqlite3

---

> **⚠️ DEPRECATED DOCUMENT**
>
> This document has been **superseded** by the consolidated migration plan.
>
> **SEE INSTEAD**: [SQLITE-CONSOLIDATION-PLAN.md](./SQLITE-CONSOLIDATION-PLAN.md)
>
> **Why deprecated**:
> - Phase 1 assumption was wrong: Legacy deduplication system was **already removed** (only .d.ts artifacts remain)
> - `available_products_raw` is NOT legacy - it's a **critical staging table** used by the current pipeline
> - Missing information about Electron rebuild dependency
> - Did not account for sequential operations preventing lock conflicts
> - Plan was based on incorrect understanding of current architecture
>
> **For accurate migration guidance**: Use SQLITE-CONSOLIDATION-PLAN.md and SQLITE-MIGRATION-CHECKLIST.md
>
> **Deprecated**: January 14, 2025

---

## ⚠️ Original Document Below (For Reference Only)

## Executive Summary

The application currently uses both `sqlite3` (callback-based) and `better-sqlite3` (synchronous) libraries simultaneously, which creates significant risks for database lock conflicts, transaction integrity issues, and maintenance complexity. This document outlines a comprehensive migration plan to standardize on `better-sqlite3`.

**Important Update**: During analysis, we discovered that the legacy deduplication system (DeduplicationOrchestrator + ProductDeduplicationService) has been completely superseded by the modern JSON pipeline (OrchestrationService + StandaloneDeduplicationService). Rather than migrating this legacy system, it should be removed entirely to prevent data conflicts and reduce complexity.

## Current State Analysis

### Services Using sqlite3 (Callback-based)
- **Core Services (NEED MIGRATION):**
  - `DatabaseService` - Main portfolio management database interface
  - `AuditService` - Audit logging functionality
  - `TransactionService` - Transaction management
  - `BalanceUpdateService` - Balance update operations
  - `ReconciliationService` - Account reconciliation
  - `InterestPaymentService` - Interest payment tracking
  - `DocumentService` - Document management
  - `ConfigurationService` - Configuration management

- **Legacy Deduplication (TO BE DELETED - NOT MIGRATED):**
  - `DeduplicationOrchestrator` - Superseded by OrchestrationService
  - `ProductDeduplicationService` - Superseded by StandaloneDeduplicationService

- **IPC Handlers (NEED MIGRATION):**
  - `transaction-handlers.ts` - Transaction IPC handlers
  - `document-handlers.ts` - Document IPC handlers

### Services Using better-sqlite3 (Synchronous)
- **Modern Pipeline Services (ALREADY MIGRATED):**
  - `OrchestrationService` - JSON pipeline orchestrator
  - `JSONIngestionService` - JSON data ingestion
  - `FRNMatchingService` - FRN matching and enrichment
  - `StandaloneDeduplicationService` - Modern deduplication service

- **Test Infrastructure (ALREADY MIGRATED):**
  - `TestDatabase` - Test database utilities
  - `TestDataGenerator` - Test data generation
  - `AuditTrailValidator` - Audit trail validation

## Critical Discovery: Duplicate Deduplication Systems

### The Problem We Discovered

During our analysis, we identified that the application has **two completely parallel deduplication systems**:

1. **Legacy System** (uses sqlite3):
   - Triggered by `scraper:completed` events
   - Reads from `available_products_raw` table
   - Writes to `available_products` table
   - Complex event-driven architecture
   - ~3000 lines of code

2. **Modern System** (uses better-sqlite3):
   - Triggered manually via IPC handlers
   - Reads from JSON files in `scrapers/output/`
   - Also writes to `available_products` table (CONFLICT!)
   - Clean pipeline architecture
   - Already fully implemented and tested

### Why This Is Critical

Both systems write to the **same `available_products` table**, which would cause:
- Data overwrites and conflicts
- Inconsistent product information
- Race conditions between systems
- Confused business logic
- Maintenance nightmare

### The Solution: Delete Legacy, Keep Modern

The modern JSON pipeline has completely superseded the legacy system with:
- Better architecture (pure functions, clear data flow)
- Better technology (better-sqlite3, TypeScript)
- Better features (FRN matching, FSCS compliance, comprehensive audit trails)
- Better testing (full test suite already implemented)

Therefore, **we will DELETE the legacy deduplication system entirely** rather than migrate it.

## Revised Implementation Plan

### Phase 1: Remove Legacy Deduplication System (1 day)
**Goal**: Eliminate the superseded legacy system to prevent conflicts

1. **Delete Legacy Service Files**
   ```bash
   # Files to delete:
   src/shared/services/DeduplicationOrchestrator.ts
   src/shared/services/ProductDeduplicationService.ts
   ```

2. **Remove Legacy Integration from ScraperProcessManager**
   - Remove `initializeDeduplicationOrchestrator` import and calls
   - Remove `getDeduplicationOrchestrator` import and usage
   - Remove `scraper:completed` event emission to orchestrator
   - Keep scrapers focused on just producing JSON files

3. **Clean Up Database Schema**
   ```sql
   -- Archive or remove legacy tables
   DROP TABLE IF EXISTS available_products_raw;
   DROP TABLE IF EXISTS deduplication_history;
   -- Ensure available_products is only written by new pipeline
   ```

4. **Update Documentation**
   - Remove references to legacy deduplication
   - Document that scrapers only produce JSON
   - Update architecture diagrams

### Phase 2: Scraper-Pipeline Integration Strategy (1 day)
**Goal**: Establish clear separation between data collection and processing

#### Chosen Approach: Manual Pipeline Triggering (Option B)

After careful consideration, we've chosen to keep scrapers and the pipeline **separate and independent**. This decision is based on several factors:

1. **Scraper Independence**: Scrapers often run individually (e.g., user runs just Flagstone), and each can fail independently. Trying to automatically coordinate when to trigger the pipeline would require complex logic to handle partial data, timeouts, and failure scenarios.

2. **Data Completeness Control**: Users need control over when to process data. They might want to wait for all scrapers to complete, or process partial data for urgent updates.

3. **Architectural Simplicity**: Scrapers have one job (scrape and save JSON), the pipeline has one job (process JSON files). No complex event coordination needed.

4. **Future Flexibility**: We can always add automation later (scheduled batch processing, smart triggers) but starting simple ensures a working system.

#### Implementation Steps:

1. **Keep Scrapers As-Is**
   - Scrapers continue to produce JSON files in `scrapers/output/`
   - Remove any database writes to `available_products_raw`
   - No knowledge of pipeline needed

2. **Add UI Controls for Pipeline**
   ```typescript
   // Add to renderer process
   const processScrapedData = async () => {
     const jsonFiles = await window.api.getAvailableJsonFiles();
     const result = await window.api.executePipeline(jsonFiles);
     // Show results to user
   };
   ```

3. **Add IPC Handlers**
   ```typescript
   // Add to main process
   ipcMain.handle('get-available-json-files', async () => {
     // Return list of unprocessed JSON files from scrapers/output/
   });
   ```

4. **User Workflow**
   - User triggers scrapers (individually or batch)
   - Scrapers complete and produce JSON files
   - User sees "Process Scraped Data" button becomes active
   - User clicks button to trigger pipeline
   - Pipeline processes all available JSON files
   - Results shown to user

### Phase 3: Migrate Core DatabaseService (2-3 days)
**Goal**: Convert the main database interface to better-sqlite3

1. **Update DatabaseService**
   ```typescript
   // Before (sqlite3)
   async query(sql: string): Promise<any[]> {
     return new Promise((resolve, reject) => {
       this.db.all(sql, (err, rows) => {
         if (err) reject(err);
         else resolve(rows);
       });
     });
   }

   // After (better-sqlite3)
   query(sql: string): any[] {
     return this.db.prepare(sql).all();
   }
   ```

2. **Update All DatabaseService Methods**
   - Convert portfolio methods
   - Convert deposit methods
   - Convert calendar methods
   - Update transaction handling

3. **Update IPC Handler Integration**
   - Remove sqlite3 database creation in main.ts
   - Update handler registration to use DatabaseService

### Phase 4: Migrate Supporting Services (3-4 days)
**Goal**: Convert all auxiliary services to better-sqlite3

1. **AuditService Migration**
   - Convert audit logging methods
   - Update audit queries
   - Maintain backward compatibility

2. **TransactionService Migration**
   - Convert transaction methods
   - Update rollback handling
   - Ensure ACID compliance

3. **Business Services Migration**
   - BalanceUpdateService
   - ReconciliationService
   - InterestPaymentService
   - DocumentService
   - ConfigurationService

### Phase 5: Update IPC Handlers (1 day)
**Goal**: Remove all direct sqlite3 usage

1. **Update transaction-handlers.ts**
   - Remove sqlite3 imports
   - Use DatabaseService methods
   - Update error handling

2. **Update document-handlers.ts**
   - Remove sqlite3 imports
   - Use DatabaseService methods
   - Update async patterns

3. **Clean up main.ts**
   - Remove sqlite3 database creation in setupIpcHandlers
   - Simplify handler registration

### Phase 6: Final Cleanup (1 day)
**Goal**: Remove all sqlite3 dependencies

1. **Update package.json**
   ```json
   // Remove these lines
   "sqlite3": "^5.1.6"
   "@types/sqlite3": "^3.1.8"
   ```

2. **Run Dependency Audit**
   - `npm uninstall sqlite3 @types/sqlite3`
   - `npm audit fix`
   - Verify no breaking changes

3. **Update Documentation**
   - Update setup instructions
   - Update development guides
   - Archive migration notes

## Benefits of Revised Approach

### Immediate Benefits (Phase 1-2)
1. **Eliminate Data Conflicts**: Remove dual writers to `available_products`
2. **Reduce Complexity**: ~3000 lines of legacy code removed
3. **Clear Architecture**: One deduplication system, one data flow
4. **Prevent Bugs**: No more race conditions between systems

### Long-term Benefits (Phase 3-6)
1. **Consistent Database Access**: Single library for all database operations
2. **Better Performance**: Synchronous API eliminates callback overhead
3. **Improved Maintainability**: One pattern for all database code
4. **Better Error Handling**: Synchronous code is easier to debug

## Testing Strategy

### Unit Tests
- Test DatabaseService methods after migration
- Ensure functional parity with sqlite3 version
- Test error handling scenarios

### Integration Tests
- Test scraper → JSON file production
- Test pipeline processing of JSON files
- Test database lock scenarios with single library
- Verify transaction integrity

### End-to-End Tests
- Complete workflow: scrape → save JSON → process pipeline → view results
- Test with multiple scrapers running
- Test with partial data scenarios

## Rollback Plan

### Phase-by-Phase Rollback
- Phase 1: Can restore legacy deduplication from git if needed
- Each subsequent phase can be rolled back independently
- Keep sqlite3 in package.json until Phase 6
- Maintain compatibility layer until fully migrated

## Success Criteria

### Phase 1-2 Success (Immediate)
- Legacy deduplication removed without breaking scrapers
- Scrapers continue to produce JSON files
- Manual pipeline triggering works from UI
- No data conflicts in `available_products`

### Phase 3-6 Success (Migration)
- Zero database lock errors
- All services using better-sqlite3
- Consistent coding patterns
- Improved query performance (target: 20% faster)
- Reduced memory usage (target: 30% reduction)

## Timeline and Priority

### Immediate (This Week)
1. **Day 1**: Phase 1 - Remove legacy deduplication
2. **Day 2**: Phase 2 - Set up manual pipeline triggering
3. **Day 3-5**: Phase 3 - Migrate DatabaseService

### Next Sprint
4. **Week 2**: Phase 4-5 - Migrate supporting services and IPC handlers
5. **Week 2**: Phase 6 - Final cleanup

## Risks and Mitigation

### Risk 1: Breaking Existing Workflows
- **Mitigation**: Test scraper functionality after removing deduplication
- **Mitigation**: Ensure JSON files are still produced correctly
- **Mitigation**: Add clear UI feedback for pipeline processing

### Risk 2: Data Loss During Migration
- **Mitigation**: Backup database before each phase
- **Mitigation**: Test on staging environment first
- **Mitigation**: Keep audit trail of all changes

### Risk 3: User Confusion
- **Mitigation**: Clear UI for manual pipeline triggering
- **Mitigation**: Documentation for new workflow
- **Mitigation**: Consider adding automation in future release

## Future Enhancements (Post-Migration)

Once the migration is complete and stable, consider:

1. **Smart Pipeline Triggering**: Add business rules for when to auto-process
2. **Scheduled Batch Processing**: Nightly processing of all accumulated data
3. **Incremental Processing**: Process new files as they arrive
4. **Pipeline Status Dashboard**: Show processing history and metrics

## Conclusion

The discovery of duplicate deduplication systems changes our migration strategy significantly. By **deleting the legacy system entirely** rather than migrating it, we:

1. **Reduce Migration Scope**: Less code to migrate (skip ~3000 lines)
2. **Eliminate Conflicts**: Single writer to `available_products`
3. **Simplify Architecture**: One clear data flow path
4. **Improve Maintainability**: Modern codebase only

The separation of scrapers and pipeline (Option B) provides:
1. **Flexibility**: Process data when ready
2. **Control**: User decides when to process
3. **Simplicity**: No complex event coordination
4. **Reliability**: Easier to debug and test

This revised approach addresses the immediate critical issue (duplicate systems) while setting up a clean path for the complete sqlite3 to better-sqlite3 migration.
# Monorepo Migration File Audit

**Total Files Analyzed:** 413 files total
- 385 source files (code, configs, scripts)
- 28 database & data files (databases, migrations, dashboards)

**Files Deprecated:** 34 additional files (SchemaCrawler & MCP - not counted above, excluded from original scan)

**Migration Date:** 2025-10-07

---

## Table of Contents
1. [Configuration & Root Files](#configuration--root-files)
2. [Database & Data Files](#database--data-files)
3. [Electron App Files](#electron-app-files)
4. [Scrapers Package Files](#scrapers-package-files)
5. [Pipeline Package Files](#pipeline-package-files)
6. [Optimization Package Files](#optimization-package-files)
7. [Shared Package Files](#shared-package-files)
8. [Test Files](#test-files)
9. [E2E Test Files](#e2e-test-files)
10. [Scripts](#scripts)
11. [Files Not Being Migrated](#files-not-being-migrated)
12. [Claude Configuration Files](#claude-configuration-files)
13. [Migration Summary Statistics](#migration-summary-statistics)

---

## Configuration & Root Files

These files stay at the monorepo root level or get updated for monorepo structure.

| Current Path | Destination | Action | Notes |
|-------------|-------------|--------|-------|
| `/.gitignore` | `/` | **Update** | Add package-specific patterns |
| `/.gitattributes` | `/` | **Keep** | No changes needed |
| `/.eslintrc.js` | **DELETE** | **Replace** | Replace with `eslint.config.js` |
| `/eslint.config.js` | `/` | **Update** | Configure for monorepo with package overrides |
| `/jest.config.js` | `/` | **Update** | Configure for monorepo with package overrides |
| `/package.json` | `/` | **Replace** | New root package.json with workspace definitions |
| `/package-lock.json` | **REGENERATE** | **Delete** | Will be regenerated after migration |
| `/playwright.config.ts` | `/` | **Update** | Update paths for monorepo structure |
| `/README.md` | `/` | **Update** | Update for monorepo structure |
| `/.safeqlrc.json` | `/packages/shared/` | **Move** | Move to shared package |
| `/tsconfig.json` | `/` | **Update** | Configure project references for all packages |
| `/webpack.config.js` | `/packages/electron-app/` | **Move** | Electron-specific webpack config |

**Count:** 12 files

---

## Database & Data Files

**IMPORTANT:** These files contain critical production data and should be handled carefully during migration.

### Production Databases

| Current Path | Destination | Action | Notes |
|-------------|-------------|--------|-------|
| `/data/cash_management.db` | **DELETE** | **DELETE** | Empty database - can be deleted |
| `/data/database/cash_savings.db` | `/data/databases/` | **MOVE** | Production database |
| `/data/database/cash_savings_test.db` | `/data/databases/test/` | **MOVE** | Test database |

### Database Backups (Archive)

| Current Path | Action | Notes |
|-------------|--------|-------|
| `/data/database/cash_savings_backup_*.db` | **ARCHIVE** | Old backups - move to `/data/archives/` or external storage |

### Database Migrations

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/data/database/migrations/002_fix_audit_trail_foreign_keys.sql` | `/data/database/migrations/` | Keep at root |
| `/data/database/migrations/003_cross_platform_deduplication_view.sql` | `/data/database/migrations/` | Keep at root |
| `/data/database/migrations/004_data_quality_configuration.sql` | `/data/database/migrations/` | Keep at root |
| `/data/database/migrations/20250116_configuration_consolidation.sql` | `/data/database/migrations/` | Keep at root |
| `/data/database/migrations/create_pipeline_audit_tables.sql` | `/data/database/migrations/` | Keep at root |
| `/data/database/migrations/fix_available_products_raw_id_schema.sql` | `/data/database/migrations/` | Keep at root |
| `/data/database/migrations/frn_research_queue_migration.sql` | `/data/database/migrations/` | Keep at root |

### Database Exports & Metadata

| Current Path | Action | Notes |
|-------------|--------|-------|
| `/data/database/clear_products.sql` | **KEEP** | Utility script |
| `/data/database/metadata_export.sql` | **DELETE** | Old export, regenerate if needed |
| `/data/database/metadata_export.json` | **DELETE** | Old export, regenerate if needed |
| `/data/database/metadata_export_complete.json` | **DELETE** | Old export, regenerate if needed |
| `/data/database/metadata_export_tables_only.sql` | **DELETE** | Old export, regenerate if needed |
| `/data/database/schema_export.sql` | **KEEP** | Current schema export |

### Dashboard Configurations

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/data/dashboards/current/data_quality_dashboard.json` | `/data/dashboards/current/` | Active dashboard config |
| `/data/dashboards/current/fscs_compliance_dashboard.json` | `/data/dashboards/current/` | Active dashboard config |
| `/data/dashboards/current/platform_data_dashboard.json` | `/data/dashboards/current/` | Active dashboard config |
| `/data/dashboards/current/portfolio_overview_dashboard.json` | `/data/dashboards/current/` | Active dashboard config |
| `/data/dashboards/current/rate_optimization_dashboard.json` | `/data/dashboards/current/` | Active dashboard config |

### Legacy Dashboard Configurations

| Current Path | Action | Notes |
|-------------|--------|-------|
| `/data/dashboards/legacy/cash_management_dashboard_final.json` | **ARCHIVE** | Legacy - move to archives |
| `/data/dashboards/legacy/cash_management_dashboard_phase2.json` | **ARCHIVE** | Legacy - move to archives |
| `/data/dashboards/legacy/cash_management_dashboard_phase3.json` | **ARCHIVE** | Legacy - move to archives |

### Reference Data

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/data/reference/boe-bank-list-2506.csv` | `/data/reference/` | Keep - BOE bank reference |
| `/data/reference/boe-list-of-banking-brands.md` | `/data/reference/` | Keep |
| `/data/reference/boe-list-of-banking-brands.pdf` | `/data/reference/` | Keep |
| `/data/reference/fps-participants-list-june-2024.pdf` | `/data/reference/` | Keep |
| `/data/reference/list-of-building-society-brands.pdf` | `/data/reference/` | Keep |

### Account Documents

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/data/account-summary-documents/*.pdf` | `/data/documents/` | User account documents |

### Data Directory Settings

| Current Path | Action |
|-------------|--------|
| `/data/.claude/settings.local.json` | **DELETE** - Not needed in data directory |

**Database & Data Count:**
- Production databases to migrate: 2 (cash_savings.db, cash_savings_test.db)
- Migrations: 7
- Dashboard configs: 5 current + 3 legacy
- Reference data: 5 files
- Account documents: 4 PDFs
- Files to delete: 8 (1 empty db + 4 metadata exports + 3 backup dbs)
- Files to keep: 2 (clear_products.sql, schema_export.sql)
- **Total analyzed: 28 data files**

**Migration Strategy:**
1. **DO NOT** commit databases to git
2. Keep `/data/` directory at monorepo root
3. Update `.gitignore` to exclude `*.db` files
4. Document database setup in README
5. Provide sample/seed database for development
6. Archive old backups externally

---

## Electron App Files

All Electron-specific files go to `/packages/electron-app/`.

### Main Process Files

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/src/main/main.ts` | `/packages/electron-app/src/main/` | Entry point |
| `/src/main/menu.ts` | `/packages/electron-app/src/main/` | Application menu |
| `/src/main/preload.ts` | `/packages/electron-app/src/main/` | Preload script |

### Main Process Services

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/src/main/services/BackupService.ts` | `/packages/electron-app/src/main/services/` | Database backups |
| `/src/main/services/DocumentCleanupService.ts` | `/packages/electron-app/src/main/services/` | Document cleanup |
| `/src/main/services/DocumentFileManager.ts` | `/packages/electron-app/src/main/services/` | File management |
| `/src/main/services/FSCSComplianceService.ts` | `/packages/electron-app/src/main/services/` | FSCS compliance checks |
| `/src/main/services/RateOptimizerService.ts` | `/packages/electron-app/src/main/services/` | Rate optimization |
| `/src/main/services/ScraperProcessManager.ts` | `/packages/electron-app/src/main/services/` | Scraper process management |
| `/src/main/services/SubprocessService.ts` | `/packages/electron-app/src/main/services/` | Subprocess spawning |

### IPC Handlers

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/src/main/ipc-handlers/document-handlers.ts` | `/packages/electron-app/src/main/ipc-handlers/` | Document IPC |
| `/src/main/ipc-handlers/optimization-handlers.ts` | `/packages/electron-app/src/main/ipc-handlers/` | Optimization IPC |
| `/src/main/ipc-handlers/orchestrator-handlers.ts` | `/packages/electron-app/src/main/ipc-handlers/` | Pipeline IPC |
| `/src/main/ipc-handlers/scraper-config-handlers.ts` | `/packages/electron-app/src/main/ipc-handlers/` | Scraper config IPC |
| `/src/main/ipc-handlers/transaction-handlers.ts` | `/packages/electron-app/src/main/ipc-handlers/` | Transaction IPC |

### Renderer Process

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/src/renderer/index.html` | `/packages/electron-app/src/renderer/` | HTML entry |
| `/src/renderer/index.tsx` | `/packages/electron-app/src/renderer/` | React entry |
| `/src/renderer/App.tsx` | `/packages/electron-app/src/renderer/` | Root component |

### Renderer Pages

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/src/renderer/pages/Audit.tsx` | `/packages/electron-app/src/renderer/pages/` | Audit page |
| `/src/renderer/pages/BalanceChecker.tsx` | `/packages/electron-app/src/renderer/pages/` | Balance checker |
| `/src/renderer/pages/Calendar.tsx` | `/packages/electron-app/src/renderer/pages/` | Calendar page |
| `/src/renderer/pages/Configuration.tsx` | `/packages/electron-app/src/renderer/pages/` | Configuration |
| `/src/renderer/pages/Dashboard.tsx` | `/packages/electron-app/src/renderer/pages/` | Dashboard |
| `/src/renderer/pages/DataCollection.tsx` | `/packages/electron-app/src/renderer/pages/` | Data processing (rename) |
| `/src/renderer/pages/FRNManagement.tsx` | `/packages/electron-app/src/renderer/pages/` | FRN management |
| `/src/renderer/pages/Holdings.tsx` | `/packages/electron-app/src/renderer/pages/` | Holdings page |
| `/src/renderer/pages/OptimizationDashboard.tsx` | `/packages/electron-app/src/renderer/pages/` | Optimization |
| `/src/renderer/pages/PortfolioManagement.tsx` | `/packages/electron-app/src/renderer/pages/` | Portfolio mgmt |

### Renderer Components

| Current Path | Destination | Category |
|-------------|-------------|----------|
| `/src/renderer/components/Layout.tsx` | `/packages/electron-app/src/renderer/components/` | Layout |
| `/src/renderer/components/ErrorBoundary.tsx` | `/packages/electron-app/src/renderer/components/` | Error handling |
| `/src/renderer/components/AuditSettingsDialog.tsx` | `/packages/electron-app/src/renderer/components/` | Dialogs |
| `/src/renderer/components/AuditTrailViewer.tsx` | `/packages/electron-app/src/renderer/components/` | Audit |
| `/src/renderer/components/AuditViewer.tsx` | `/packages/electron-app/src/renderer/components/` | Audit |
| `/src/renderer/components/DuplicateDetectionDialog.tsx` | `/packages/electron-app/src/renderer/components/` | Dialogs |
| `/src/renderer/components/ExecutePendingMoveDialog.tsx` | `/packages/electron-app/src/renderer/components/` | Dialogs |
| `/src/renderer/components/IncomeHistoryChart.tsx` | `/packages/electron-app/src/renderer/components/` | Charts |
| `/src/renderer/components/PendingMoveForm.tsx` | `/packages/electron-app/src/renderer/components/` | Forms |
| `/src/renderer/components/SmartCheckbox.tsx` | `/packages/electron-app/src/renderer/components/` | Form controls |
| `/src/renderer/components/SmartSelect.tsx` | `/packages/electron-app/src/renderer/components/` | Form controls |
| `/src/renderer/components/SmartTextField.tsx` | `/packages/electron-app/src/renderer/components/` | Form controls |
| `/src/renderer/components/ViewModeContext.tsx` | `/packages/electron-app/src/renderer/components/` | Context |

### Renderer Components - Dashboard

| Current Path | Destination |
|-------------|-------------|
| `/src/renderer/components/dashboard/ActionSummaryCards.tsx` | `/packages/electron-app/src/renderer/components/dashboard/` |
| `/src/renderer/components/dashboard/NotificationCards.tsx` | `/packages/electron-app/src/renderer/components/dashboard/` |

### Renderer Components - Dialogs

| Current Path | Destination |
|-------------|-------------|
| `/src/renderer/components/dialogs/EventDialogs.tsx` | `/packages/electron-app/src/renderer/components/dialogs/` |
| `/src/renderer/components/dialogs/SnoozeDialog.tsx` | `/packages/electron-app/src/renderer/components/dialogs/` |

### Renderer Components - Documents

| Current Path | Destination |
|-------------|-------------|
| `/src/renderer/components/documents/DocumentEdit.tsx` | `/packages/electron-app/src/renderer/components/documents/` |
| `/src/renderer/components/documents/DocumentList.tsx` | `/packages/electron-app/src/renderer/components/documents/` |
| `/src/renderer/components/documents/DocumentManager.tsx` | `/packages/electron-app/src/renderer/components/documents/` |
| `/src/renderer/components/documents/DocumentTypeManager.tsx` | `/packages/electron-app/src/renderer/components/documents/` |
| `/src/renderer/components/documents/DocumentUpload.tsx` | `/packages/electron-app/src/renderer/components/documents/` |
| `/src/renderer/components/documents/DocumentViewer.tsx` | `/packages/electron-app/src/renderer/components/documents/` |
| `/src/renderer/components/documents/StorageInfo.tsx` | `/packages/electron-app/src/renderer/components/documents/` |
| `/src/renderer/components/documents/TrashList.tsx` | `/packages/electron-app/src/renderer/components/documents/` |
| `/src/renderer/components/documents/types.ts` | `/packages/electron-app/src/renderer/components/documents/` |

### Renderer Components - FRN Management

| Current Path | Destination |
|-------------|-------------|
| `/src/renderer/components/frn/FRNBOERegistryTab.tsx` | `/packages/electron-app/src/renderer/components/frn/` |
| `/src/renderer/components/frn/FRNDashboardTab.tsx` | `/packages/electron-app/src/renderer/components/frn/` |
| `/src/renderer/components/frn/FRNLookupHelperTab.tsx` | `/packages/electron-app/src/renderer/components/frn/` |
| `/src/renderer/components/frn/FRNManualOverridesTab.tsx` | `/packages/electron-app/src/renderer/components/frn/` |
| `/src/renderer/components/frn/FRNResearchQueueTab.tsx` | `/packages/electron-app/src/renderer/components/frn/` |

### Renderer Components - Notifications

| Current Path | Destination |
|-------------|-------------|
| `/src/renderer/components/notifications/NotificationCenter.tsx` | `/packages/electron-app/src/renderer/components/notifications/` |

### Renderer Components - Optimization

| Current Path | Destination |
|-------------|-------------|
| `/src/renderer/components/optimization/ActionItemDetailModal.tsx` | `/packages/electron-app/src/renderer/components/optimization/` |
| `/src/renderer/components/optimization/ActionItemsList.tsx` | `/packages/electron-app/src/renderer/components/optimization/` |
| `/src/renderer/components/optimization/OptimizationConflictDialog.tsx` | `/packages/electron-app/src/renderer/components/optimization/` |
| `/src/renderer/components/optimization/OptimizationDashboard.tsx` | `/packages/electron-app/src/renderer/components/optimization/` |
| `/src/renderer/components/optimization/ProgressBar.tsx` | `/packages/electron-app/src/renderer/components/optimization/` |
| `/src/renderer/components/optimization/ResultsDisplay.tsx` | `/packages/electron-app/src/renderer/components/optimization/` |

### Renderer Components - Reconciliation

| Current Path | Destination |
|-------------|-------------|
| `/src/renderer/components/reconciliation/ReconciliationWizard.tsx` | `/packages/electron-app/src/renderer/components/reconciliation/` |
| `/src/renderer/components/reconciliation/StatementEntry.tsx` | `/packages/electron-app/src/renderer/components/reconciliation/` |
| `/src/renderer/components/reconciliation/TransactionMatching.tsx` | `/packages/electron-app/src/renderer/components/reconciliation/` |

### Renderer Components - Scraper

| Current Path | Destination |
|-------------|-------------|
| `/src/renderer/components/scraper/ScraperDashboard.tsx` | `/packages/electron-app/src/renderer/components/scraper/` |

### Renderer Components - Configuration

| Current Path | Destination |
|-------------|-------------|
| `/src/renderer/components/configuration/ScraperConfigSettings.tsx` | `/packages/electron-app/src/renderer/components/configuration/` |

### Renderer Components - Transactions

| Current Path | Destination |
|-------------|-------------|
| `/src/renderer/components/transactions/InterestConfiguration.tsx` | `/packages/electron-app/src/renderer/components/transactions/` |
| `/src/renderer/components/transactions/TransactionEntry.tsx` | `/packages/electron-app/src/renderer/components/transactions/` |
| `/src/renderer/components/transactions/TransactionList.tsx` | `/packages/electron-app/src/renderer/components/transactions/` |
| `/src/renderer/components/transactions/TransactionRow.tsx` | `/packages/electron-app/src/renderer/components/transactions/` |

### Renderer Services & Contexts

| Current Path | Destination |
|-------------|-------------|
| `/src/renderer/services/optimizationConflictService.ts` | `/packages/electron-app/src/renderer/services/` |
| `/src/renderer/services/pendingDepositService.ts` | `/packages/electron-app/src/renderer/services/` |
| `/src/renderer/contexts/OptimizationContext.tsx` | `/packages/electron-app/src/renderer/contexts/` |

### Renderer Types

| Current Path | Destination |
|-------------|-------------|
| `/src/renderer/types/actionItem.ts` | `/packages/electron-app/src/renderer/types/` |

**Electron App Count:** ~100 files

---

## Scrapers Package Files

**IMPORTANT:** All scrapers are written in **native JavaScript** (not TypeScript). This is intentional for simpler Playwright integration.

All files in `/scrapers/` directory → `/packages/scrapers/`

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/scrapers/package.json` | `/packages/scrapers/` | Update dependencies |
| `/scrapers/package-lock.json` | **REGENERATE** | Delete & regenerate |
| `/scrapers/README.md` | `/packages/scrapers/` | Keep |
| `/scrapers/.gitignore` | `/packages/scrapers/` | Keep |

### Scraper Source Files (Native JavaScript)

| Current Path | Destination |
|-------------|-------------|
| `/scrapers/config/environments.js` | `/packages/scrapers/config/` |
| `/scrapers/debug-hl.js` | `/packages/scrapers/` |
| `/scrapers/flagstone-scraper.js` | `/packages/scrapers/` |
| `/scrapers/src/core/browser-manager.js` | `/packages/scrapers/src/core/` |
| `/scrapers/src/core/enhanced-logger.js` | `/packages/scrapers/src/core/` |
| `/scrapers/src/core/scraper-base.js` | `/packages/scrapers/src/core/` |
| `/scrapers/src/parsers/ajbell-parser.js` | `/packages/scrapers/src/parsers/` |
| `/scrapers/src/parsers/common-parser.js` | `/packages/scrapers/src/parsers/` |
| `/scrapers/src/parsers/hl-parser.js` | `/packages/scrapers/src/parsers/` |
| `/scrapers/src/runners/batch-runner.js` | `/packages/scrapers/src/runners/` |
| `/scrapers/src/runners/cli-runner.js` | `/packages/scrapers/src/runners/` |
| `/scrapers/src/scrapers/ajbell.js` | `/packages/scrapers/src/scrapers/` |
| `/scrapers/src/scrapers/flagstone.js` | `/packages/scrapers/src/scrapers/` |
| `/scrapers/src/scrapers/hargreaves-lansdown.js` | `/packages/scrapers/src/scrapers/` |
| `/scrapers/src/scrapers/moneyfacts.js` | `/packages/scrapers/src/scrapers/` |
| `/scrapers/src/utils/data-normalizer.js` | `/packages/scrapers/src/utils/` |
| `/scrapers/src/utils/file-utils.js` | `/packages/scrapers/src/utils/` |
| `/scrapers/src/utils/frn-resolver.js` | `/packages/scrapers/src/utils/` |
| `/scrapers/src/utils/platform-normalizer.js` | `/packages/scrapers/src/utils/` |
| `/scrapers/src/utils/readonly-database.js` | `/packages/scrapers/src/utils/` |

### FRN Management SQL Files

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/scrapers/frn-management/cleanup-research-data.sql` | `/packages/scrapers/frn-management/` | Keep for reference |
| `/scrapers/frn-management/create-research-completion-trigger.sql` | `/packages/scrapers/frn-management/` | Keep |
| `/scrapers/frn-management/create-research-views.sql` | `/packages/scrapers/frn-management/` | Keep |
| `/scrapers/frn-management/deploy-research.sql` | `/packages/scrapers/frn-management/` | Keep |
| `/scrapers/frn-management/frn-research-helper.sql` | `/packages/scrapers/frn-management/` | Keep |
| `/scrapers/frn-management/frn-research-update-script.sql` | `/packages/scrapers/frn-management/` | Keep |
| `/scrapers/frn-management/QUICK_REFERENCE.md` | `/packages/scrapers/frn-management/` | Keep |
| `/scrapers/frn-management/README.md` | `/packages/scrapers/frn-management/` | Keep |
| `/scrapers/frn-management/refresh-research-temp.sql` | `/packages/scrapers/frn-management/` | Keep |
| `/scrapers/frn-management/research-status.sql` | `/packages/scrapers/frn-management/` | Keep |
| `/scrapers/frn-management/USER_GUIDE.md` | `/packages/scrapers/frn-management/` | Keep |

**Scrapers Package Count:** ~31 files

---

## Pipeline Package Files

Pipeline services and related components → `/packages/pipeline/`

### Core Pipeline Services

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/src/shared/services/OrchestrationService.ts` | `/packages/pipeline/src/services/` | Main orchestrator |
| `/src/shared/services/JSONIngestionService.ts` | `/packages/pipeline/src/services/` | Stage 1: Ingestion |
| `/src/shared/services/FRNMatchingService.ts` | `/packages/pipeline/src/services/` | Stage 2: FRN matching |
| `/src/shared/services/DeduplicationOrchestrator.ts` | `/packages/pipeline/src/services/` | Stage 3: Deduplication |
| `/src/shared/services/ProductDeduplicationService.ts` | `/packages/pipeline/src/services/` | Dedup implementation |
| `/src/shared/services/StandaloneDeduplicationService.ts` | `/packages/pipeline/src/services/` | Standalone dedup |
| `/src/shared/services/DataQualityAnalyzer.ts` | `/packages/pipeline/src/services/` | Stage 4: Quality |
| `/src/shared/services/PipelineAudit.ts` | `/packages/pipeline/src/services/` | Audit trail |

### Pipeline-Related Types

| Current Path | Destination |
|-------------|-------------|
| `/src/shared/types/FRNMatchingConfig.ts` | `/packages/pipeline/src/types/` |

**Pipeline Package Count:** ~9 files

---

## Optimization Package Files

All files in `/recommendation-engine/` → `/packages/optimization/`

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/recommendation-engine/package.json` | `/packages/optimization/` | Update dependencies |
| `/recommendation-engine/package-lock.json` | **REGENERATE** | Delete & regenerate |
| `/recommendation-engine/jest.config.js` | `/packages/optimization/` | Keep |
| `/recommendation-engine/tsconfig.json` | `/packages/optimization/` | Update paths |

### Optimization Source Files

| Current Path | Destination |
|-------------|-------------|
| `/recommendation-engine/src/cli/fscs-compliance.ts` | `/packages/optimization/src/cli/` |
| `/recommendation-engine/src/cli/index.ts` | `/packages/optimization/src/cli/` |
| `/recommendation-engine/src/cli/optimize-cli.ts` | `/packages/optimization/src/cli/` |
| `/recommendation-engine/src/cli/optimize-main.ts` | `/packages/optimization/src/cli/` |
| `/recommendation-engine/src/cli/optimize-test.ts` | `/packages/optimization/src/cli/` |
| `/recommendation-engine/src/cli/test-recommendation-service.ts` | `/packages/optimization/src/cli/` |
| `/recommendation-engine/src/compliance/diversification.ts` | `/packages/optimization/src/compliance/` |
| `/recommendation-engine/src/compliance/fscs.ts` | `/packages/optimization/src/compliance/` |
| `/recommendation-engine/src/configuration/loader.ts` | `/packages/optimization/src/configuration/` |
| `/recommendation-engine/src/configuration/unified-loader.ts` | `/packages/optimization/src/configuration/` |
| `/recommendation-engine/src/database/connection.ts` | `/packages/optimization/src/database/` |
| `/recommendation-engine/src/optimization/dynamic-allocator.ts` | `/packages/optimization/src/optimization/` |
| `/recommendation-engine/src/optimization/easy-access.ts` | `/packages/optimization/src/optimization/` |
| `/recommendation-engine/src/optimization/factory.ts` | `/packages/optimization/src/optimization/` |
| `/recommendation-engine/src/optimization/frn-headroom-manager.ts` | `/packages/optimization/src/optimization/` |
| `/recommendation-engine/src/optimization/fscs-tracker.ts` | `/packages/optimization/src/optimization/` |
| `/recommendation-engine/src/optimization/optimizer.ts` | `/packages/optimization/src/optimization/` |
| `/recommendation-engine/src/portfolio/loader.ts` | `/packages/optimization/src/portfolio/` |
| `/recommendation-engine/src/products/loader.ts` | `/packages/optimization/src/products/` |
| `/recommendation-engine/src/rules/engine.ts` | `/packages/optimization/src/rules/` |
| `/recommendation-engine/src/services/recommendation-service-impl.ts` | `/packages/optimization/src/services/` |
| `/recommendation-engine/src/services/recommendation-service.ts` | `/packages/optimization/src/services/` |
| `/recommendation-engine/src/types/index.ts` | `/packages/optimization/src/types/` |
| `/recommendation-engine/src/types/integration.ts` | `/packages/optimization/src/types/` |
| `/recommendation-engine/src/types/shared.ts` | `/packages/optimization/src/types/` |
| `/recommendation-engine/src/utils/logger.ts` | `/packages/optimization/src/utils/` |
| `/recommendation-engine/src/utils/money.ts` | `/packages/optimization/src/utils/` |

### Optimization Tests

| Current Path | Destination |
|-------------|-------------|
| `/recommendation-engine/src/__tests__/configuration.test.ts` | `/packages/optimization/src/__tests__/` |
| `/recommendation-engine/src/compliance/__tests__/fscs.test.ts` | `/packages/optimization/src/compliance/__tests__/` |
| `/recommendation-engine/src/utils/__tests__/money.test.ts` | `/packages/optimization/src/utils/__tests__/` |
| `/recommendation-engine/tests/integration/module-compatibility.test.ts` | `/packages/optimization/tests/integration/` |
| `/recommendation-engine/tests/integration/optimizer-subprocess.test.ts` | `/packages/optimization/tests/integration/` |
| `/recommendation-engine/tests/setup.ts` | `/packages/optimization/tests/` |

### Optimization Scripts

| Current Path | Destination |
|-------------|-------------|
| `/recommendation-engine/scripts/create_dev_database.sh` | `/packages/optimization/scripts/` |
| `/recommendation-engine/scripts/validate_migration.sh` | `/packages/optimization/scripts/` |
| `/recommendation-engine/scripts/validate-integration-readiness.sh` | `/packages/optimization/scripts/` |

### Optimization Migrations & Reports (Archive)

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/recommendation-engine/migrations-archive/*` | `/packages/optimization/migrations-archive/` | Keep for reference |
| `/recommendation-engine/reports/*` | **DELETE** | Generated reports, not needed |

**Optimization Package Count:** ~40 files (excluding reports)

---

## Shared Package Files

Common services, types, and utilities used across packages → `/packages/shared/`

### Shared Services

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/src/shared/services/AuditLogMonitorService.ts` | `/packages/shared/src/services/` | Audit monitoring |
| `/src/shared/services/AuditService.ts` | `/packages/shared/src/services/` | Audit service |
| `/src/shared/services/BalanceUpdateService.ts` | `/packages/shared/src/services/` | Balance updates |
| `/src/shared/services/ConfigurationService.ts` | `/packages/shared/src/services/` | Configuration |
| `/src/shared/services/DatabaseService.ts` | `/packages/shared/src/services/` | **CRITICAL** - DB access |
| `/src/shared/services/DocumentService.ts` | `/packages/shared/src/services/` | Document service |
| `/src/shared/services/EnhancedLogger.ts` | `/packages/shared/src/services/` | Logging |
| `/src/shared/services/InterestEventService.ts` | `/packages/shared/src/services/` | Interest events |
| `/src/shared/services/InterestPaymentService.ts` | `/packages/shared/src/services/` | Interest payments |
| `/src/shared/services/ReconciliationService.ts` | `/packages/shared/src/services/` | Reconciliation |
| `/src/shared/services/TransactionService.ts` | `/packages/shared/src/services/` | Transactions |

### Shared Types

| Current Path | Destination |
|-------------|-------------|
| `/src/shared/types/ActionItemTypes.ts` | `/packages/shared/src/types/` |
| `/src/shared/types/ConfigurationTypes.ts` | `/packages/shared/src/types/` |
| `/src/shared/types/DocumentTypes.ts` | `/packages/shared/src/types/` |
| `/src/shared/types/LoggingTypes.d.ts` | `/packages/shared/src/types/` |
| `/src/shared/types/LoggingTypes.d.ts.map` | **DELETE** | Generated file |
| `/src/shared/types/LoggingTypes.js` | **DELETE** | Generated file |
| `/src/shared/types/LoggingTypes.js.map` | **DELETE** | Generated file |
| `/src/shared/types/LoggingTypes.ts` | `/packages/shared/src/types/` |
| `/src/shared/types/OptimizationTypes.ts` | `/packages/shared/src/types/` |
| `/src/shared/types/PendingMoveTypes.ts` | `/packages/shared/src/types/` |
| `/src/shared/types/PortfolioTypes.ts` | `/packages/shared/src/types/` |
| `/src/shared/types/ScraperTypes.ts` | `/packages/shared/src/types/` |
| `/src/shared/types/TransactionTypes.ts` | `/packages/shared/src/types/` |

### Shared Utilities

| Current Path | Destination |
|-------------|-------------|
| `/src/shared/utils/DatabaseValidator.ts` | `/packages/shared/src/utils/` |
| `/src/shared/utils/formatters.ts` | `/packages/shared/src/utils/` |
| `/src/shared/utils/RetryHelper.ts` | `/packages/shared/src/utils/` |
| `/src/shared/utils/__tests__/DatabaseValidator.test.ts` | `/packages/shared/src/utils/__tests__/` |

**Shared Package Count:** ~27 files (excluding generated .js/.map files)

---

## Test Files

Integration tests for pipeline → Move to appropriate packages

### Pipeline Integration Tests

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/src/tests/integration/CrossPlatformTests.ts` | `/packages/pipeline/tests/integration/` | Cross-platform tests |
| `/src/tests/integration/FilteringTests.ts` | `/packages/pipeline/tests/integration/` | Filtering tests |
| `/src/tests/integration/FRNMatchingSuiteTests.ts` | `/packages/pipeline/tests/integration/` | FRN suite |
| `/src/tests/integration/JSONIngestionSuiteTests.ts` | `/packages/pipeline/tests/integration/` | Ingestion suite |

### Accumulation Tests

| Current Path | Destination |
|-------------|-------------|
| `/src/tests/integration/accumulation/AccumulationTests.ts` | `/packages/pipeline/tests/integration/accumulation/` |
| `/src/tests/integration/accumulation/JSONIngestionTests.ts` | `/packages/pipeline/tests/integration/accumulation/` |
| `/src/tests/integration/accumulation/MetadataValidationTests.ts` | `/packages/pipeline/tests/integration/accumulation/` |
| `/src/tests/integration/accumulation/MethodBasedDeletionTests.ts` | `/packages/pipeline/tests/integration/accumulation/` |

### FRN Matching Tests

| Current Path | Destination |
|-------------|-------------|
| `/src/tests/integration/frn-matching/BasicMatchingTests.ts` | `/packages/pipeline/tests/integration/frn-matching/` |
| `/src/tests/integration/frn-matching/ConfigurationTests.ts` | `/packages/pipeline/tests/integration/frn-matching/` |
| `/src/tests/integration/frn-matching/EnrichmentValidationTests.ts` | `/packages/pipeline/tests/integration/frn-matching/` |
| `/src/tests/integration/frn-matching/NormalizationTests.ts` | `/packages/pipeline/tests/integration/frn-matching/` |

### Full Integration Tests

| Current Path | Destination |
|-------------|-------------|
| `/src/tests/integration/full-integration/CompleteFlowTests.ts` | `/packages/pipeline/tests/integration/full-integration/` |

### Pipeline Tests

| Current Path | Destination |
|-------------|-------------|
| `/src/tests/integration/pipeline/RebuildFromRawTests.ts` | `/packages/pipeline/tests/integration/pipeline/` |

### Test Helpers

| Current Path | Destination |
|-------------|-------------|
| `/src/tests/integration/helpers/AuditTrailValidator.ts` | `/packages/pipeline/tests/helpers/` |
| `/src/tests/integration/helpers/TestDatabase.ts` | `/packages/pipeline/tests/helpers/` |
| `/src/tests/integration/helpers/TestDataGenerator.ts` | `/packages/pipeline/tests/helpers/` |
| `/src/tests/integration/helpers/__tests__/AuditTrailValidator.test.ts` | `/packages/pipeline/tests/helpers/__tests__/` |
| `/src/tests/integration/helpers/__tests__/TestDataGenerator.test.ts` | `/packages/pipeline/tests/helpers/__tests__/` |

### Test Utils

| Current Path | Destination |
|-------------|-------------|
| `/src/tests/integration/utils/PipelineTestHelper.ts` | `/packages/pipeline/tests/utils/` |
| `/src/tests/integration/utils/testUtils.ts` | `/packages/pipeline/tests/utils/` |

**Test Files Count:** ~22 files

---

## E2E Test Files

End-to-end Playwright tests → `/packages/electron-app/e2e/` or root `/e2e/`

**Recommendation:** Keep at root level as they test the entire system

| Current Path | Destination | Notes |
|-------------|-------------|-------|
| `/e2e/fixtures/README.md` | `/e2e/fixtures/` | Keep |
| `/e2e/fixtures/fixtures/base_test_data.sql` | `/e2e/fixtures/fixtures/` | Keep |
| `/e2e/fixtures/migrations/001_transaction_tracking_system.sql` | `/e2e/fixtures/migrations/` | Keep |
| `/e2e/fixtures/migrations/002_document_management.sql` | `/e2e/fixtures/migrations/` | Keep |
| `/e2e/fixtures/schemas/dev_schema.sql` | `/e2e/fixtures/schemas/` | Keep |
| `/e2e/fixtures/schemas/full_schema.sql` | `/e2e/fixtures/schemas/` | Keep |
| `/e2e/fixtures/schemas/minimal_schema.sql` | `/e2e/fixtures/schemas/` | Keep |
| `/e2e/fixtures/schemas/prod_schema.sql` | `/e2e/fixtures/schemas/` | Keep |
| `/e2e/helpers/electron-app.ts` | `/e2e/helpers/` | Keep |
| `/e2e/helpers/global-setup.ts` | `/e2e/helpers/` | Keep |
| `/e2e/helpers/global-teardown.ts` | `/e2e/helpers/` | Keep |
| `/e2e/helpers/test-ids.ts` | `/e2e/helpers/` | Keep |
| `/e2e/helpers/transaction-helper.ts` | `/e2e/helpers/` | Keep |
| `/e2e/tests/transactions/basic-operations.spec.ts` | `/e2e/tests/transactions/` | Keep |

**E2E Test Count:** 14 files

---

## Scripts

Utility scripts → `/scripts/` at monorepo root

| Current Path | Destination | Action |
|-------------|-------------|--------|
| `/scripts/advanced-schema-analysis.sh` | **DELETE** | **DEPRECATED** - SchemaCrawler tool (replaced by DbSchema) |
| `/scripts/apply-drop-historical-products.sh` | `/scripts/database/` | Move |
| `/scripts/apply-phase0-cleanup.sh` | `/scripts/database/` | Move |
| `/scripts/cleanup-wal.sh` | `/scripts/database/` | Move |
| `/scripts/comprehensive-database-verification.py` | `/scripts/database/` | Move |
| `/scripts/database-streamlining-analysis.py` | `/scripts/database/` | Move |
| `/scripts/database-usage-analysis.py` | `/scripts/database/` | Move |
| `/scripts/drop-historical-products.sql` | `/scripts/database/` | Move |
| `/scripts/focused-database-analysis.py` | `/scripts/database/` | Move |
| `/scripts/frn-config-consolidation-migration.sql` | `/scripts/database/` | Move |
| `/scripts/generate-test-db.sh` | `/scripts/database/` | Move |
| `/scripts/phase0-config-cleanup.sql` | `/scripts/database/` | Move |
| `/scripts/schema-diff-sync.sh` | **DELETE** | **DEPRECATED** - SchemaCrawler tool (replaced by DbSchema) |
| `/scripts/schema-watch.sh` | `/scripts/database/` | Move |
| `/scripts/view-dependencies-analysis.py` | `/scripts/database/` | Move |
| `/scripts/schemacrawler-mcp-stdio-wrapper.js` | **DELETE** | **DEPRECATED** - SchemaCrawler MCP integration |
| `/scripts/setup-claude-desktop-mcp.sh` | **DELETE** | **DEPRECATED** - Claude Desktop MCP setup (not using) |
| `/scripts/start-schemacrawler-ai.sh` | **DELETE** | **DEPRECATED** - SchemaCrawler MCP server |
| `/scripts/update-script-registry.sh` | `/scripts/tools/` | Move |
| `/scripts/verify-claude-desktop-setup.sh` | **DELETE** | **DEPRECATED** - Claude Desktop MCP verification |
| `/run-tests.sh` | `/scripts/testing/` | Move |

### Script Backup Files (Delete)

| Current Path | Action |
|-------------|--------|
| `/scripts/config_backup_*.sql` | **DELETE** - Old backups |
| `/scripts/database_usage_report_summary.txt` | **DELETE** - Generated report |
| `/scripts/database_usage_report.json` | **DELETE** - Generated report |

**Scripts Count:** 16 files to migrate (5 deprecated SchemaCrawler/MCP scripts marked for deletion)

---

## Files Not Being Migrated

These files will not be migrated to the new repository:

### Python Reporter (Being Replaced)

| Current Path | Reason |
|-------------|--------|
| `/portfolio-reporter/**/*` | **DO NOT MIGRATE** - Replaced by native React/MUI implementation in Phase 11 |

**Important Notes:**
- This includes ~60+ Python files, templates, and venv files
- **DO NOT DELETE from old repo** - Keep accessible as reference during Phase 11 implementation
- Python reporter contains valuable business logic:
  - 8 report sections with calculations
  - Table structures and layouts
  - Strategic allocation algorithms
  - Risk assessment formulas
  - Optimization recommendation logic
- Old repo (`cash-management/`) remains accessible for reference while implementing native equivalent
- See MONOREPO-MIGRATION-PLAN.md section "What about the Python reporter?" for details

### SchemaCrawler & Claude Desktop MCP (Deprecated)

**Reason**: Now using **DbSchema** for database documentation. SchemaCrawler and Claude Desktop MCP integration no longer needed.

| Current Path | Type | Count |
|-------------|------|-------|
| `/schema-docs/**/*` | **DELETE** | 26 files - Generated schema documentation |
| `/schemacrawler-ai-setup/schemacrawler-mcpserver-cash-management.yaml` | **DELETE** | 1 file - MCP server config |
| `/scripts/advanced-schema-analysis.sh` | **DELETE** | SchemaCrawler analysis script |
| `/scripts/schema-diff-sync.sh` | **DELETE** | SchemaCrawler diff script |
| `/scripts/schemacrawler-mcp-stdio-wrapper.js` | **DELETE** | MCP wrapper script |
| `/scripts/start-schemacrawler-ai.sh` | **DELETE** | MCP server start script |
| `/scripts/setup-claude-desktop-mcp.sh` | **DELETE** | Claude Desktop MCP setup |
| `/scripts/verify-claude-desktop-setup.sh` | **DELETE** | Claude Desktop verification |
| `/.vscode/mcp.json` | **DELETE** | Claude Desktop MCP config |

**Total Deprecated:** 34 files
- Schema documentation: 26 files (4MB, generated 2025-09-15)
- MCP configuration: 2 files
- Scripts: 6 files

**What's in `/schema-docs/`:**
- 5 schema snapshot files
- 13 diagram files (.dot, .png, visual diffs)
- 5 schema report files (HTML, txt)
- 3 summary files (complete reports, diagrams)

**Action:** Delete entire directories and files. DbSchema now handles all database documentation needs.

### Temporary/Test Files

| Current Path | Reason |
|-------------|--------|
| `/test-ajbell-only.js` | Temp test file |
| `/test-business-key-final.js` | Temp test file |
| `/test-frn-service.js` | Temp test file |
| `/test-frn-config.js` | Temp test file |
| `/SELECT COUNT(*) FROM pipeline_batch` | Temp SQL file |
| `/config_backup_20250928_185221.sql` | Old backup |

### Generated Files

| Current Path | Reason |
|-------------|--------|
| `/src/shared/types/LoggingTypes.js` | Generated from .ts |
| `/src/shared/types/LoggingTypes.js.map` | Generated sourcemap |
| `/src/shared/types/LoggingTypes.d.ts.map` | Generated sourcemap |
| `**/__pycache__/**` | Python cache |
| `**/package-lock.json` | Will be regenerated |

### VSCode Settings (Optional - Move to gitignore)

| Current Path | Action |
|-------------|--------|
| `/.vscode/settings.json` | Keep but add to .gitignore |

**Files Not Being Migrated:** 109 files
- Python reporter: ~60+ files (preserved in old repo for Phase 11 reference)
- SchemaCrawler & MCP: 34 files (delete - deprecated, using DbSchema now)
- Temporary test files: 6 files (delete - includes empty cash_management.db)
- Generated files: ~5 files (delete)
- Old exports: ~4 files (delete)

---

## Claude Configuration Files

.claude directory → stays at root but may need path updates

| Current Path | Destination | Action |
|-------------|-------------|--------|
| `/.claude/agents/schema-manager.md` | `/.claude/agents/` | **Update** paths |
| `/.claude/claude_config.json` | `/.claude/` | **Update** paths |
| `/.claude/coding_standards.md` | `/.claude/` | Keep |
| `/.claude/current_phase.md` | `/.claude/` | **Update** for V2 |
| `/.claude/database_schema_management.md` | `/.claude/` | Keep |
| `/.claude/database_schema.md` | `/.claude/` | Keep |
| `/.claude/electron-testing-guide.md` | `/.claude/` | **Update** paths |
| `/.claude/implementation_status.md` | `/.claude/` | **Update** for V2 |
| `/.claude/key_references.md` | `/.claude/` | **Update** paths |
| `/.claude/project_context.md` | `/.claude/` | **Update** for monorepo |
| `/.claude/settings.local.json` | `/.claude/` | Keep |
| `/.claude/sqlite-validator.py` | `/.claude/` | Keep |

**Claude Config Count:** 12 files

---

## Migration Summary Statistics

### Total File Count by Destination

| Destination | File Count | Status |
|------------|------------|--------|
| `/packages/electron-app/` | ~100 files | **MOVE** |
| `/packages/scrapers/` | ~31 files | **MOVE** (all native .js) |
| `/packages/pipeline/` | ~31 files | **MOVE** (9 services + 22 tests) |
| `/packages/optimization/` | ~40 files | **MOVE** |
| `/packages/shared/` | ~27 files | **MOVE** |
| `/data/` (root level) | 28 files | **KEEP** at root (DO NOT commit .db files) |
| `/e2e/` (root level) | 14 files | **KEEP** at root |
| `/scripts/` (root level) | 16 files | **REORGANIZE** (5 SchemaCrawler/MCP scripts deprecated) |
| `/.claude/` (root level) | 12 files | **UPDATE** paths |
| Root config files | ~12 files | **UPDATE** for monorepo |
| **Not Migrated** | 109 files | Python reporter (preserved), SchemaCrawler/MCP (deprecated), temp files (deleted) |

### Grand Total

- **Source files to migrate:** ~270 files
- **Test files:** ~36 files
- **Config/Script files:** ~40 files
- **Database & data files:** 28 files (kept at root, .db files in .gitignore)
- **Files not migrated:** 109 files
  - Python reporter: ~60 files (preserved in old repo for Phase 11 reference)
  - SchemaCrawler & MCP: 34 files (deprecated - using DbSchema now)
  - Temp/generated files: ~15 files (deleted - includes empty cash_management.db)
- **Total files analyzed:** 413 files (447 including deprecated SchemaCrawler files)

### Verification Checklist

- [ ] All 100 Electron app files mapped
- [ ] All 31 scraper files mapped (all native .js)
- [ ] All 31 pipeline files mapped (including tests)
- [ ] All 40 optimization files mapped
- [ ] All 27 shared files mapped
- [ ] All 28 database & data files accounted for (empty cash_management.db deleted)
- [ ] All 14 E2E test files accounted for
- [ ] All 16 scripts organized (5 SchemaCrawler/MCP scripts deprecated)
- [ ] Python reporter NOT migrated (~60 files) but preserved in old repo for Phase 11 reference
- [ ] SchemaCrawler & MCP deprecated (34 files) - using DbSchema now
  - [ ] `/schema-docs/` directory deleted (26 files)
  - [ ] `/schemacrawler-ai-setup/` directory deleted (1 file)
  - [ ] 5 SchemaCrawler/MCP scripts deleted
  - [ ] `.vscode/mcp.json` deleted
- [ ] Temporary files deletion confirmed (6 temp files including empty .db)
- [ ] Generated files cleanup confirmed
- [ ] All config files updated for monorepo
- [ ] Database migration strategy documented
- [ ] .gitignore updated to exclude .db files
- [ ] Old repository (`cash-management/`) kept accessible for Python reporter reference

---

## Next Steps

1. **Review this audit** - Ensure all file destinations are correct
2. **Create new repository** - Initialize cash-management-v2 with Turborepo
3. **Execute migration script** - Use automated import migration
4. **Verify completeness** - Check all 391 files are accounted for
5. **Run tests** - Ensure everything works in new structure
6. **Update documentation** - Reflect new monorepo structure

---

**Audit Date:** 2025-10-07 (Updated: 2025-10-08 - deprecated SchemaCrawler/MCP)
**Audit Tool:** Claude Code
**Total Files Analyzed:** 413 files
- 385 source/config/script files
- 28 database & data files
**Files Deprecated (not migrated):** 34 SchemaCrawler & MCP files (using DbSchema now)
**Files Excluded from scan:** docs/, logs/, node_modules/, build artifacts, schema-docs/ (deprecated), portfolio-reporter/ (preserved)
**Migration Plan:** /docs/packaging-and-distribution/MONOREPO-MIGRATION-PLAN.md

---

## Key Findings

1. **All scrapers are native JavaScript** - Intentionally not TypeScript for simpler Playwright integration
2. **Database files stay at root** - `/data/` directory with strict .gitignore rules
3. **No files will be lost** - Every source file has clear destination
4. **Python reporter preserved for reference** - 60+ files NOT migrated but kept in old repo for Phase 11 implementation reference
5. **SchemaCrawler & MCP deprecated** - 34 files (26 in schema-docs/ + 8 scripts/configs) replaced by DbSchema
6. **Clean package separation** - Pipeline, optimization, scrapers are isolated with shared dependencies

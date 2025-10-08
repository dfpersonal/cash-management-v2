# Monorepo Migration Checklist

**Project**: Cash Management V2
**Migration Start Date**: 2025-10-08
**Target Completion**: 16-22 days (3-4 weeks)
**Status**: 🔵 In Progress

---

## Quick Links

- 📋 [File Audit](./MONOREPO-FILE-AUDIT.md) - Where every file goes
- 📖 [Migration Plan](./MONOREPO-MIGRATION-PLAN.md) - Detailed implementation guide
- 🏗️ [V2 Feature Plan](../electron-app/ELECTRON-APP-V2-COMPREHENSIVE-PLAN.md) - Post-migration features

---

## Legend

- ⬜ Not Started
- 🔵 In Progress
- ✅ Complete
- ⚠️ Blocked/Issues
- ⏭️ Skipped (with reason)

---

## Phase 0: Preparation (1 day)

**Goal**: Set up new repository structure and tooling

### 0.1 Repository Setup
- ✅ Create new GitHub repository `cash-management-v2`
- ✅ Clone repository locally
- ✅ Review migration plan and file audit documents
- ✅ Ensure old repository (`cash-management/`) remains accessible for reference

### 0.2 Initialize Monorepo Structure
- ✅ Create folder structure (`packages/`, `apps/`, `scripts/`, `data/`, `e2e/`)
- ✅ Initialize root `package.json` with workspace definitions
- ✅ Install Turborepo (`npm install turbo --save-dev`)
- ✅ Create `turbo.json` configuration
- ✅ Create `tsconfig.base.json` for shared TypeScript config
- ✅ Initial commit and push to GitHub

### 0.3 Database & Data Strategy
- ✅ Copy `/data/database/migrations/` (7 SQL files)
- ✅ Copy `/data/dashboards/current/` (5 JSON configs)
- ✅ Copy `/data/reference/` (5 reference files)
- ✅ Create `.gitignore` rules for `*.db` files
- ✅ Document database setup in root README
- ⬜ Test database path references (will test in Phase 1 with shared package)

**Phase 0 Complete**: ✅
**Notes**:
- Repository created: https://github.com/dfpersonal/cash-management-v2
- Initial commit: af9a158
- All Phase 0 tasks completed successfully
- No blockers encountered
- Database path testing deferred to Phase 1 when DatabaseService is migrated
- Ready to proceed with Phase 1: Foundation

---

## Phase 1: Foundation (2-3 days)

**Goal**: Migrate shared package and set up Electron app skeleton

### 1.1 Migrate `@cash-mgmt/shared` Package
- ✅ Create `packages/shared/` structure
- ✅ Copy 25 shared files (services, types, utilities)
  - ✅ Services: DatabaseService, ConfigurationService, etc. (11 files)
  - ✅ Types: All TypeScript type definitions (10 files including .d.ts)
  - ✅ Utilities: DatabaseValidator, formatters, RetryHelper + test (4 files)
- ✅ Create `package.json` with dependencies (better-sqlite3 v12.4.1, sqlite3 v5.1.6)
- ✅ Create `tsconfig.json` extending base config
- ✅ Create barrel file `src/index.ts` for exports
- ✅ Build package (`npm run build`) - dist/ created successfully
- ⏭️ Run tests (`npm test`) - Deferred to Phase 4
- ✅ Commit: `feat(shared): Migrate shared utilities and types` (6a44a90)

### 1.2 Set Up `@cash-mgmt/electron-app` Skeleton
- ✅ Create `packages/electron-app/` structure
- ✅ Create `package.json` with workspace dependencies
- ✅ Add dependency: `@cash-mgmt/shared: "*"` (npm workspace format)
- ✅ Create basic folder structure (`src/main/`, `src/renderer/`)
- ✅ Create placeholder files (`main.ts`, `index.tsx`)
- ✅ Verify workspace linking works - TypeScript compiles without errors
- ✅ Commit: `feat(electron-app): Initialize Electron app package` (60494fb)

**Phase 1 Complete**: ✅
**Notes**:
- Completed in 1 day (target: 2-3 days)
- Workspace symlinks working: node_modules/@cash-mgmt/shared → ../../packages/shared
- TypeScript project references configured correctly
- No blockers encountered
- Ready for Phase 2: Component Extraction

---

## Phase 2: Component Extraction (5-7 days)

**Goal**: Extract scrapers, pipeline, and optimization into separate packages

### 2.1 Migrate `@cash-mgmt/scrapers` (1-2 days)
- ⬜ Create `packages/scrapers/` structure
- ⬜ Copy 31 scraper files (all native JavaScript)
  - ⬜ Scraper implementations (4 files)
  - ⬜ Parsers (3 files)
  - ⬜ Core modules (3 files)
  - ⬜ Utilities (5 files)
  - ⬜ Runners (2 files)
  - ⬜ FRN management SQL & docs (11 files)
- ⬜ Create `package.json` with Playwright dependency
- ⬜ Add workspace dependency: `@cash-mgmt/shared`
- ⬜ Run test scrapers
- ⬜ Commit: `feat(scrapers): Extract scrapers to dedicated package`

### 2.2 Migrate `@cash-mgmt/pipeline` (2-3 days)
- ⬜ Create `packages/pipeline/` structure
- ⬜ Copy 31 pipeline files (9 services + 22 tests)
  - ⬜ Core services: OrchestrationService, JSONIngestionService, etc. (8 files)
  - ⬜ Pipeline types (1 file)
  - ⬜ Integration tests (22 files including helpers)
- ⬜ Create `package.json` with workspace dependencies
- ⬜ Update imports to use `@cash-mgmt/shared`
- ⬜ Build package (`npm run build`)
- ⬜ Run all integration tests (`npm test`)
- ⬜ Commit: `feat(pipeline): Extract JSON processing pipeline to package`

### 2.3 Migrate `@cash-mgmt/optimization` (1-2 days)
- ⬜ Create `packages/optimization/` structure
- ⬜ Copy entire `/recommendation-engine/` directory (~40 files)
  - ⬜ CLI tools, compliance, configuration
  - ⬜ Optimization logic, portfolio & product loaders
  - ⬜ Rules engine, services, types, utilities
  - ⬜ Tests (unit + integration)
- ⬜ Update `package.json` with workspace dependencies
- ⬜ Update imports to use workspace packages
- ⬜ Build package (`npm run build`)
- ⬜ Run tests (`npm test`)
- ⬜ Commit: `feat(optimization): Extract optimization engine to package`

**Phase 2 Complete**: ⬜
**Notes**: _________________________________________

---

## Phase 3: Electron App Migration (5-7 days)

**Goal**: Migrate main process, renderer, and all UI components

### 3.1 Main Process (2-3 days)
- ⬜ Copy main process files (~20 files)
  - ⬜ Entry points: main.ts, menu.ts, preload.ts
  - ⬜ IPC handlers (5 files)
  - ⬜ Services (7 files)
- ⬜ Update imports to workspace packages
  - ⬜ `@cash-mgmt/shared`
  - ⬜ `@cash-mgmt/pipeline`
  - ⬜ `@cash-mgmt/optimization`
  - ⬜ `@cash-mgmt/scrapers`
- ⬜ Test Electron app launches (`npm run electron`)
- ⬜ Verify IPC communication works
- ⬜ Commit: `feat(electron-app): Migrate main process`

### 3.2 Renderer (3-4 days)
- ⬜ Copy renderer files (~80 files)
  - ⬜ Entry points: index.html, index.tsx, App.tsx, Layout.tsx
  - ⬜ Pages (10 files)
  - ⬜ Components (60+ files across categories)
  - ⬜ Contexts (2 files)
  - ⬜ Services (2 files)
  - ⬜ Types (1 file)
- ⬜ Update imports to workspace packages
- ⬜ Test each major page loads
  - ⬜ Dashboard
  - ⬜ Portfolio Management
  - ⬜ Data Processing (renamed from DataCollection)
  - ⬜ FRN Management
  - ⬜ Configuration
- ⬜ Verify all UI workflows function
- ⬜ Commit: `feat(electron-app): Migrate renderer and UI components`

**Phase 3 Complete**: ⬜
**Notes**: _________________________________________

---

## Phase 4: Testing & Documentation (2-3 days)

**Goal**: Verify everything works and update documentation

### 4.1 Integration Testing
- ⬜ Build all packages (`turbo run build`)
  - ⬜ Verify no TypeScript errors
  - ⬜ Verify all packages build independently
- ⬜ Run all tests (`turbo run test`)
  - ⬜ Shared package tests pass
  - ⬜ Pipeline integration tests pass
  - ⬜ Optimization tests pass
  - ⬜ Scraper tests pass
- ⬜ Test Electron app (`npm run electron`)
  - ⬜ App launches without errors
  - ⬜ All pages accessible
  - ⬜ Database connections work
- ⬜ Verify key workflows end-to-end
  - ⬜ Scraper → Pipeline → Product Catalog
  - ⬜ Optimization → Recommendations
  - ⬜ FRN Research Queue
  - ⬜ Data Quality Analysis

### 4.2 Update Documentation
- ⬜ Update root `README.md`
  - ⬜ Getting started with monorepo
  - ⬜ Workspace structure overview
  - ⬜ Development commands
  - ⬜ Database setup instructions
- ⬜ Create package `README.md` files
  - ⬜ `packages/electron-app/README.md`
  - ⬜ `packages/scrapers/README.md`
  - ⬜ `packages/pipeline/README.md`
  - ⬜ `packages/optimization/README.md`
  - ⬜ `packages/shared/README.md`
- ⬜ Update architecture documentation
- ⬜ Document workspace dependencies

### 4.3 CI/CD Setup
- ⬜ Create `.github/workflows/test.yml`
- ⬜ Configure Turborepo caching
- ⬜ Test CI build passes
- ⬜ Set up automated testing on PR
- ⬜ Configure build artifacts

**Phase 4 Complete**: ⬜
**Notes**: _________________________________________

---

## Phase 5: Cutover (1 day)

**Goal**: Archive old repository and switch to V2

### 5.1 Archive Old Repository
- ⬜ Create final tag in old repo (`v1-final`)
- ⬜ Push tag to GitHub
- ⬜ Create `DEPRECATED.md` in old repo
- ⬜ Update old README with deprecation notice
- ⬜ Commit deprecation notice
- ⬜ Archive repository on GitHub (Settings → Archive)
- ⬜ Verify Python reporter still accessible for Phase 11 reference

### 5.2 Switch to V2
- ⬜ Update local development to use `cash-management-v2`
- ⬜ Update any bookmarks/shortcuts
- ⬜ Update IDE project settings
- ⬜ Verify all team members can access new repo
- ⬜ Final verification: Build, test, run app
- ⬜ 🎉 **Migration Complete!**

**Phase 5 Complete**: ⬜
**Notes**: _________________________________________

---

## Import Statement Migration (Ongoing During Phases 2-3)

**Goal**: Update all imports from relative paths to workspace packages

### Automated Migration Script
- ⬜ Create `scripts/migrate-imports.js` with replacement patterns
- ⬜ Install glob dependency (`npm install --save-dev glob`)
- ⬜ Customize script with project-specific patterns
- ⬜ Test script on single file first
- ⬜ Run script across all packages (`node scripts/migrate-imports.js`)
- ⬜ Verify ~80% of imports updated automatically

### TypeScript Verification
- ⬜ Build each package and identify TypeScript errors
- ⬜ Fix remaining imports TypeScript identifies (~20%)
- ⬜ Resolve any circular dependencies
- ⬜ Verify all type exports work correctly

### Final Cleanup
- ⬜ Use VS Code IntelliSense for final stragglers
- ⬜ Check for unused imports (`npm run lint`)
- ⬜ Verify no stray relative imports to old `shared/`
- ⬜ Test workspace dependencies resolved correctly

**Import Migration Complete**: ⬜
**Estimated Time**: 3-4 hours
**Notes**: _________________________________________

---

## E2E Tests Migration (Part of Phase 4)

**Goal**: Migrate Playwright E2E tests to new structure

- ⬜ Copy `/e2e/` directory to monorepo root
- ⬜ Update `playwright.config.ts` for new paths
- ⬜ Copy test fixtures and helpers (14 files)
- ⬜ Update test database paths
- ⬜ Run E2E tests (`npm run test:e2e`)
- ⬜ Verify all tests pass

**E2E Migration Complete**: ⬜
**Notes**: _________________________________________

---

## Scripts Migration (Part of Phase 1)

**Goal**: Organize and migrate utility scripts

### Database Scripts (Keep 11 scripts)
- ⬜ Copy to `/scripts/database/`
  - ⬜ apply-drop-historical-products.sh
  - ⬜ apply-phase0-cleanup.sh
  - ⬜ cleanup-wal.sh
  - ⬜ Database verification scripts (3 Python files)
  - ⬜ generate-test-db.sh
  - ⬜ schema-watch.sh
  - ⬜ SQL migration scripts (2 files)
  - ⬜ view-dependencies-analysis.py

### Tool Scripts (Keep 1 script)
- ⬜ Copy to `/scripts/tools/`
  - ⬜ update-script-registry.sh

### Testing Scripts (Keep 1 script)
- ⬜ Copy to `/scripts/testing/`
  - ⬜ run-tests.sh

### Deprecated Scripts (DO NOT MIGRATE - 5 scripts)
- ⬜ Confirm deleted from old repo:
  - ⬜ advanced-schema-analysis.sh (SchemaCrawler)
  - ⬜ schema-diff-sync.sh (SchemaCrawler)
  - ⬜ schemacrawler-mcp-stdio-wrapper.js
  - ⬜ setup-claude-desktop-mcp.sh
  - ⬜ verify-claude-desktop-setup.sh

**Scripts Migration Complete**: ⬜
**Total Scripts Migrated**: 16 files
**Notes**: _________________________________________

---

## Claude Configuration Migration (Part of Phase 1)

**Goal**: Update .claude directory for monorepo paths

- ⬜ Copy `/.claude/` directory to monorepo root
- ⬜ Update file paths in configuration files (12 files)
  - ⬜ agents/schema-manager.md
  - ⬜ claude_config.json
  - ⬜ current_phase.md (update to Phase 0 of migration)
  - ⬜ electron-testing-guide.md
  - ⬜ implementation_status.md
  - ⬜ key_references.md
  - ⬜ project_context.md (update for monorepo structure)
- ⬜ Verify Claude Code works in new repo structure

**Claude Config Complete**: ⬜
**Notes**: _________________________________________

---

## File Audit Verification

Use this checklist to ensure all files are accounted for:

### Package Files
- ⬜ All 100 Electron app files migrated
- ⬜ All 31 scraper files migrated (native .js)
- ⬜ All 31 pipeline files migrated (including tests)
- ⬜ All 40 optimization files migrated
- ⬜ All 27 shared files migrated

### Data & Config Files
- ⬜ All 28 database & data files handled (2 .db files in .gitignore)
- ⬜ All 14 E2E test files migrated
- ⬜ All 16 scripts organized
- ⬜ All 12 Claude config files updated
- ⬜ All 12 root config files updated for monorepo

### Files NOT Migrated (Verified)
- ⬜ Python reporter (60+ files) - Kept in old repo for Phase 11 reference
- ⬜ SchemaCrawler & MCP (34 files) - Deprecated, deleted from old repo
- ⬜ Temp files (6 files) - Deleted
- ⬜ Generated files (5 files) - Will regenerate
- ⬜ Old exports (4 files) - Not needed

**Total Files**: 413 analyzed (109 not migrated)

---

## Post-Migration: V2 Feature Implementation

After migration is complete, begin Phase 10 & 11 from ELECTRON-APP-V2-COMPREHENSIVE-PLAN.md:

### Phase 10: Strategic Allocation (3-4 days)
- ⬜ 8-tier liquidity classification
- ⬜ Portfolio health scoring
- ⬜ Rebalancing recommendations

### Phase 11: Native Report System (4-6 days)
- ⬜ Replace Python reporter with React/MUI
- ⬜ Implement 8 report sections
- ⬜ Add Puppeteer PDF export
- ⬜ Reference old Python reporter for business logic

---

## Issues & Blockers

Track any issues encountered during migration:

| Date | Issue | Impact | Resolution | Status |
|------|-------|--------|------------|--------|
| | | | | |
| | | | | |
| | | | | |

---

## Migration Timeline

| Phase | Planned Days | Actual Days | Start Date | End Date | Status |
|-------|--------------|-------------|------------|----------|--------|
| Phase 0: Preparation | 1 | 0.5 | 2025-10-08 | 2025-10-08 | ✅ |
| Phase 1: Foundation | 2-3 | 1 | 2025-10-08 | 2025-10-08 | ✅ |
| Phase 2: Component Extraction | 5-7 | | | | ⬜ |
| Phase 3: Electron App | 5-7 | | | | ⬜ |
| Phase 4: Testing & Docs | 2-3 | | | | ⬜ |
| Phase 5: Cutover | 1 | | | | ⬜ |
| **Total** | **16-22** | **0.5** | **2025-10-08** | | |

---

## Success Criteria

Migration is considered complete when:

- ✅ All packages build independently without errors
- ✅ All tests pass (`turbo run test`)
- ✅ Electron app launches and all workflows function
- ✅ No import errors (all workspace packages resolve)
- ✅ Database connections work from all packages
- ✅ CI/CD pipeline passes
- ✅ Documentation updated
- ✅ Old repository archived
- ✅ Team can develop in new structure

---

**Migration Status**: 🔵 In Progress (Phase 0 Complete, Phase 1 Starting)
**Last Updated**: 2025-10-08
**Updated By**: Claude Code

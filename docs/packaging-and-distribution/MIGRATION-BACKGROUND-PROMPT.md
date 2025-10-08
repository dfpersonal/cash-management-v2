```
I'm beginning the migration of the Cash Management application from a single-structure
repository to a Turborepo-based monorepo. This is a complete rebaseline of the project
into cash-management-v2.

## Project Overview

The Cash Management application is an Electron desktop app for managing cash savings
portfolios with:
- Web scrapers for financial platforms (Playwright-based, native JavaScript)
- JSON processing pipeline (ingestion → FRN matching → deduplication → quality)
- Optimization engine for rate improvement and FSCS compliance
- React/MUI UI with portfolio management features

## Migration Context

**Current Repository**: `/Users/david/Websites/cash-management` (single structure)
**Target Repository**: `cash-management-v2` (Turborepo monorepo)
**Timeline**: 16-22 days (3-4 weeks)

## Key Documentation

Please review these documents in this order:

1. **MONOREPO-MIGRATION-CHECKLIST.md** (Primary tracking document)
   - Location: `/Users/david/Websites/cash-management/docs/packaging-and-distribution/MONOREPO-MIGRATION-CHECKLIST.md`
   - Use: Track progress with checkboxes, update status as you work
   - Contains: 5 phases, file counts, success criteria, issues tracking

2. **MONOREPO-FILE-AUDIT.md** (File mapping reference)
   - Location: `/Users/david/Websites/cash-management/docs/packaging-and-distribution/MONOREPO-FILE-AUDIT.md`
   - Use: Look up where specific files should go
   - Contains: Complete inventory of 413 files with destinations

3. **MONOREPO-MIGRATION-PLAN.md** (Detailed implementation guide)
   - Location: `/Users/david/Websites/cash-management/docs/packaging-and-distribution/MONOREPO-MIGRATION-PLAN.md`
   - Use: Understand architecture decisions and detailed steps
   - Contains: Package structure, Turborepo config, import migration strategy

4. **ELECTRON-APP-V2-COMPREHENSIVE-PLAN.md** (Post-migration features)
   - Location: `/Users/david/Websites/cash-management/docs/electron-app/ELECTRON-APP-V2-COMPREHENSIVE-PLAN.md`
   - Use: Reference for Phase 11 (Native Report System) and Phase 10 (Strategic Allocation)
   - Note: Python reporter preserved in old repo for Phase 11 reference

## Target Monorepo Structure

```
cash-management-v2/
├── packages/
│   ├── electron-app/      # Main Electron app (~100 files)
│   ├── scrapers/          # Web scrapers (~31 files, native JS)
│   ├── pipeline/          # JSON processing (~31 files)
│   ├── optimization/      # Recommendation engine (~40 files)
│   └── shared/            # Common utilities (~27 files)
├── data/                  # Database & migrations (root level, 28 files)
├── e2e/                   # Playwright E2E tests (14 files)
├── scripts/               # Utility scripts (16 files)
├── docs/                  # Documentation
├── .claude/               # Claude configuration (12 files)
├── package.json           # Root workspace config
├── turbo.json             # Turborepo config
└── tsconfig.base.json     # Shared TypeScript config
```

## Important File Decisions Already Made

### Files Being Migrated (413 total)
- ✅ All TypeScript source files (~270 files)
- ✅ All test files (~36 files)
- ✅ All scripts (16 files - 5 deprecated)
- ✅ Database migrations and reference data (28 files)
- ✅ E2E tests (14 files)
- ✅ Configuration files (12 files)

### Files NOT Being Migrated (109 total)
- ❌ **Python reporter** (~60 files) - Preserved in old repo for Phase 11 reference
- ❌ **SchemaCrawler & MCP** (34 files) - Deprecated, already deleted from system
- ❌ **Temporary files** (6 files) - Including empty `cash_management.db`
- ❌ **Generated files** (~5 files) - Will regenerate
- ❌ **Old exports** (~4 files) - Not needed

### Critical Notes
1. **All scrapers are native JavaScript** - Do NOT attempt to convert to TypeScript
2. **Database files stay at root** - `/data/` directory, `*.db` in `.gitignore`
3. **Python reporter is preserved** - Keep `cash-management/` repo accessible for reference
4. **SchemaCrawler removed** - Using DbSchema now, 34 files already deleted

## Current Phase Status

**Phase**: Not started (ready to begin Phase 0)
**Checklist Location**: See MONOREPO-MIGRATION-CHECKLIST.md
**Next Action**: Create new `cash-management-v2` GitHub repository

## Import Statement Migration Strategy

We're using a **3-phase hybrid approach** (total: 3-4 hours):

1. **Phase 1**: Automated Node.js script (80% coverage) - 40 min
2. **Phase 2**: TypeScript compiler verification (20% remaining) - 1.5-2 hours
3. **Phase 3**: VS Code IntelliSense cleanup - 30-60 min

**Script location**: Will create `scripts/migrate-imports.js` during migration
**Key patterns**: `../shared/services/*` → `@cash-mgmt/shared`, etc.

## Workspace Package Names

- `@cash-mgmt/electron-app` - Main Electron application
- `@cash-mgmt/scrapers` - Web scraping modules
- `@cash-mgmt/pipeline` - JSON processing pipeline
- `@cash-mgmt/optimization` - Recommendation engine
- `@cash-mgmt/shared` - Common utilities and types

## Success Criteria

Migration is complete when:
- ✅ All packages build independently (`turbo run build`)
- ✅ All tests pass (`turbo run test`)
- ✅ Electron app launches and all workflows function
- ✅ No import errors (workspace packages resolve correctly)
- ✅ Database connections work from all packages
- ✅ CI/CD pipeline passes
- ✅ Documentation updated
- ✅ Old repository archived with `v1-final` tag

## My Questions/Goals for This Session

[User will specify what they want to accomplish in this session - e.g., "Start Phase 0"
or "Continue Phase 2.1 - Scrapers migration" or "Review checklist and plan next steps"]

## Instructions for Claude

1. **Start by reading the checklist**: Load MONOREPO-MIGRATION-CHECKLIST.md first
2. **Check current status**: See which phases are complete, in progress, or blocked
3. **Reference the file audit**: Use MONOREPO-FILE-AUDIT.md to find exact file locations
4. **Follow the plan**: Use MONOREPO-MIGRATION-PLAN.md for detailed implementation
5. **Update the checklist**: Mark items complete as you work, add notes
6. **Track issues**: Document any blockers in the Issues & Blockers table
7. **Verify completeness**: Check off items in File Audit Verification section

## Key Commands Reference

```bash
# Turborepo commands (in new repo)
turbo run build          # Build all packages
turbo run test           # Test all packages
turbo run dev            # Run dev mode for all packages

# Per-package commands
cd packages/shared && npm run build
cd packages/electron-app && npm run electron

# Workspace commands
npm install              # Install all dependencies
npm ls @cash-mgmt/shared # Verify workspace linking

# Import migration
node scripts/migrate-imports.js

# Verification
grep -r "from '\.\./\.\./shared" packages/  # Check for old imports
```

## Development Environment

- **Node.js**: 20.x
- **npm**: Workspaces enabled
- **Turborepo**: Latest
- **TypeScript**: Strict mode enabled
- **Electron**: 28.x
- **React**: 18.2.x
- **Database**: SQLite (better-sqlite3)
- **Git**: GitHub Desktop / GitKraken compatible

## Important Conventions

- **Commit format**: `feat(package): description` (Conventional Commits)
- **Branch**: Work on `main` branch (or create feature branches as needed)
- **Testing**: Test each package independently before moving to next phase
- **Documentation**: Update package READMEs as you migrate

## Common Pitfalls to Avoid

1. ❌ Don't convert JavaScript scrapers to TypeScript
2. ❌ Don't commit `.db` files (add to .gitignore)
3. ❌ Don't migrate Python reporter (preserve in old repo)
4. ❌ Don't use `../shared/` imports (use workspace packages)
5. ❌ Don't skip tests - verify each phase works before continuing

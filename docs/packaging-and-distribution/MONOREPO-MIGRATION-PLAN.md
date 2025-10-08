# Monorepo Migration Plan: Cash Management V2

**Document Version**: 1.0
**Last Updated**: 2025-10-07
**Status**: Ready for Implementation

---

## Executive Summary

This document outlines the migration from the current single-structure repository to a clean **Turborepo-based monorepo** for Cash Management V2. The restructuring provides clear component boundaries, independent testing, and better maintainability while preserving the familiar git workflow.

### Why Now?

The project has evolved into distinct components:
- **Electron Desktop App** (UI, main process, IPC)
- **Web Scrapers** (data collection from financial platforms)
- **JSON Processing Pipeline** (ingestion, FRN matching, deduplication, quality)
- **Optimization Engine** (rate improvement, FSCS compliance, allocation)

These components are currently tangled together in `src/shared/`, making independent testing difficult and boundaries unclear. V2 implementation is the perfect time to establish clean architecture.

### Goals

✅ **Clear Component Boundaries**: Each component is a separate package with its own dependencies
✅ **Independent Testing**: Test scrapers without loading Electron, test pipeline without scrapers
✅ **Shared Code Management**: Types and utilities shared cleanly via workspace dependencies
✅ **Future Flexibility**: Could extract components as CLI tools or standalone services
✅ **Better Developer Experience**: Intelligent caching, parallel builds, clear folder structure
✅ **Preserve Git Workflow**: GitHub Desktop and GitKraken work exactly as before

---

## File Audit

**📋 Complete file inventory**: See [MONOREPO-FILE-AUDIT.md](./MONOREPO-FILE-AUDIT.md) for:
- ✅ All 413 files analyzed (source, data, configs)
- ✅ 34 files deprecated (SchemaCrawler & MCP - using DbSchema now)
- ✅ Exact source → destination mapping for every file
- ✅ Package assignments (electron-app, scrapers, pipeline, optimization, shared)
- ✅ Files not being migrated (Python reporter preservation strategy)
- ✅ Database & data file handling

**🏗️ This document** (MONOREPO-MIGRATION-PLAN.md) focuses on:
- Architecture & package structure (why and what)
- Migration process & phases (how and when)
- Tools & automation (Turborepo, TypeScript, npm workspaces)
- Testing & verification strategies

**Use both together**: Reference the audit for "which file goes where", use this plan for "how to execute the migration".

---

## Current State Analysis

### Current Repository Structure

```
cash-management/
├── src/
│   ├── main/                    # Electron main process
│   ├── renderer/                # Electron renderer (React UI)
│   ├── shared/                  # Everything mixed together ❌
│   │   ├── services/
│   │   │   ├── DatabaseService.ts
│   │   │   ├── OrchestrationService.ts
│   │   │   ├── ScraperProcessManager.ts
│   │   │   ├── DataQualityAnalyzer.ts
│   │   │   └── [scrapers mixed with other services]
│   │   └── types/
│   └── tests/                   # All tests in one place
├── portfolio-reporter/          # Python (being deprecated)
├── data/
│   ├── database/
│   └── test/
├── docs/
├── scripts/
├── package.json                 # All dependencies together
└── [many config files]
```

### Problems

❌ **Tangled Dependencies**: Everything imports from `src/shared/` with no clear boundaries
❌ **Testing Complexity**: Can't test scrapers without loading entire Electron stack
❌ **Unclear Ownership**: Which service belongs to which component?
❌ **Monolithic Builds**: Change one file, rebuild everything
❌ **Technical Debt**: Accumulated over time, hard to refactor
❌ **Python Reporter Clutter**: Dead code waiting to be removed

---

## Proposed Monorepo Structure

### Overview

```
cash-management-v2/                     # New repo, fresh start
├── packages/                           # Workspace packages
│   ├── electron-app/                   # 🎯 Main application
│   ├── scrapers/                       # 🌐 Data collection
│   ├── pipeline/                       # 🔄 JSON processing
│   ├── optimization/                   # 📈 Recommendations
│   └── shared/                         # 🔧 Common utilities
├── apps/                               # (Optional) Standalone apps
│   └── scraper-cli/                    # CLI scraper runner
├── docs/                               # Documentation
├── scripts/                            # Build utilities
├── data/                               # Database & migrations
├── .github/                            # CI/CD workflows
├── package.json                        # Root workspace config
├── turbo.json                          # Turborepo configuration
├── tsconfig.base.json                  # Shared TypeScript config
└── README.md
```

### Package Details

#### 1. `@cash-mgmt/electron-app`

**Purpose**: Main Electron desktop application

```
packages/electron-app/
├── src/
│   ├── main/
│   │   ├── main.ts                    # Electron main entry
│   │   ├── menu.ts
│   │   ├── preload.ts
│   │   ├── ipc-handlers/              # IPC handler modules
│   │   │   ├── orchestrator-handlers.ts
│   │   │   ├── optimization-handlers.ts
│   │   │   ├── scraper-config-handlers.ts
│   │   │   └── transaction-handlers.ts
│   │   └── services/
│   │       ├── BackupService.ts
│   │       ├── ScraperProcessManager.ts
│   │       ├── DocumentCleanupService.ts
│   │       └── ReportPDFExporter.ts   # Puppeteer integration
│   │
│   └── renderer/
│       ├── index.tsx                  # React entry point
│       ├── App.tsx
│       ├── pages/
│       │   ├── Dashboard.tsx
│       │   ├── DataProcessing.tsx     # Data collection + pipeline
│       │   ├── StrategicAllocation.tsx
│       │   ├── Reports.tsx            # Native report system
│       │   ├── PortfolioManagement.tsx
│       │   ├── ProductCatalog.tsx
│       │   ├── FRNManagement.tsx
│       │   └── Configuration.tsx
│       ├── components/
│       │   ├── allocation/            # Strategic allocation components
│       │   ├── reports/               # Report generation components
│       │   ├── pipeline/              # Pipeline UI components
│       │   ├── scraper/               # Scraper dashboard
│       │   ├── catalog/               # Product catalog
│       │   └── [other UI components]
│       └── contexts/
│           └── OptimizationContext.tsx
│
├── package.json
├── tsconfig.json
├── electron-builder.yml               # Distribution config
└── README.md
```

**Dependencies**:
```json
{
  "name": "@cash-mgmt/electron-app",
  "version": "2.0.0",
  "private": true,
  "dependencies": {
    "@cash-mgmt/scrapers": "workspace:*",
    "@cash-mgmt/pipeline": "workspace:*",
    "@cash-mgmt/optimization": "workspace:*",
    "@cash-mgmt/shared": "workspace:*",
    "electron": "^28.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@mui/material": "^5.15.0",
    "@mui/x-data-grid": "^6.18.0",
    "recharts": "^2.10.0",
    "puppeteer": "^21.0.0"
  }
}
```

#### 2. `@cash-mgmt/scrapers`

**Purpose**: Web scraping modules for financial platforms

```
packages/scrapers/
├── src/
│   ├── ajbell/
│   │   ├── scraper.ts
│   │   ├── types.ts
│   │   ├── selectors.ts
│   │   └── tests/
│   ├── flagstone/
│   │   ├── scraper.ts
│   │   └── [similar structure]
│   ├── hargreaves-lansdown/
│   ├── moneyfacts/
│   ├── core/
│   │   ├── BaseScraper.ts           # Abstract base class
│   │   ├── ScraperConfig.ts
│   │   ├── browser-manager.ts
│   │   └── output-formatter.ts
│   ├── types/
│   │   └── scraper-types.ts         # Shared scraper types
│   └── cli.ts                        # Standalone CLI entry point
│
├── tests/
│   ├── unit/
│   └── integration/
├── package.json
├── tsconfig.json
└── README.md
```

**Dependencies**:
```json
{
  "name": "@cash-mgmt/scrapers",
  "version": "2.0.0",
  "dependencies": {
    "@cash-mgmt/shared": "workspace:*",
    "playwright": "^1.40.0",
    "cheerio": "^1.0.0-rc.12"
  },
  "bin": {
    "scraper": "./dist/cli.js"
  }
}
```

**CLI Usage** (future):
```bash
npx @cash-mgmt/scrapers run ajbell --output ./data/
```

#### 3. `@cash-mgmt/pipeline`

**Purpose**: JSON processing pipeline (ingestion → FRN → dedup → quality)

```
packages/pipeline/
├── src/
│   ├── orchestration/
│   │   ├── OrchestrationService.ts   # Main orchestrator
│   │   └── PipelineStatus.ts
│   ├── stages/
│   │   ├── ingestion/
│   │   │   ├── JSONIngestionStage.ts
│   │   │   ├── BusinessRulesEngine.ts
│   │   │   └── validation/
│   │   ├── frn-matching/
│   │   │   ├── FRNMatchingStage.ts
│   │   │   ├── fuzzy-matcher.ts
│   │   │   ├── alias-matcher.ts
│   │   │   └── research-queue.ts
│   │   ├── deduplication/
│   │   │   ├── DeduplicationStage.ts
│   │   │   ├── business-key-generator.ts
│   │   │   └── selection-logic.ts
│   │   └── quality/
│   │       ├── DataQualityAnalyzer.ts
│   │       └── anomaly-detection.ts
│   ├── types/
│   │   ├── pipeline-types.ts
│   │   └── audit-types.ts
│   └── utils/
│       └── stage-helpers.ts
│
├── tests/
│   ├── unit/
│   └── integration/
├── package.json
├── tsconfig.json
└── README.md
```

**Dependencies**:
```json
{
  "name": "@cash-mgmt/pipeline",
  "version": "2.0.0",
  "dependencies": {
    "@cash-mgmt/shared": "workspace:*",
    "better-sqlite3": "^9.2.0"
  }
}
```

#### 4. `@cash-mgmt/optimization`

**Purpose**: Recommendation engine (rate, FSCS, allocation)

```
packages/optimization/
├── src/
│   ├── rate-optimizer/
│   │   ├── RateOptimizerService.ts
│   │   ├── marginal-benefit.ts
│   │   └── convenience-bonus.ts
│   ├── fscs-optimizer/
│   │   ├── FSCSOptimizerService.ts
│   │   └── compliance-checker.ts
│   ├── allocation/
│   │   ├── AllocationAnalyzer.ts    # Strategic allocation logic
│   │   ├── rebalancing-planner.ts
│   │   ├── health-scorer.ts
│   │   └── tier-mapper.ts
│   ├── engine/
│   │   ├── OptimizationEngine.ts    # Core algorithm
│   │   └── recommendation-builder.ts
│   └── types/
│       └── optimization-types.ts
│
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

**Dependencies**:
```json
{
  "name": "@cash-mgmt/optimization",
  "version": "2.0.0",
  "dependencies": {
    "@cash-mgmt/shared": "workspace:*"
  }
}
```

#### 5. `@cash-mgmt/shared`

**Purpose**: Shared utilities, types, and database service

```
packages/shared/
├── src/
│   ├── types/
│   │   ├── database.ts              # DB schemas & interfaces
│   │   ├── portfolio.ts             # Domain models
│   │   ├── config.ts                # Configuration types
│   │   └── common.ts                # Shared types
│   ├── database/
│   │   ├── DatabaseService.ts       # Main DB service
│   │   ├── migrations/
│   │   │   └── runner.ts
│   │   └── repositories/            # Repository pattern (optional)
│   ├── utils/
│   │   ├── formatting.ts
│   │   ├── validation.ts
│   │   ├── date-utils.ts
│   │   └── currency-utils.ts
│   └── constants/
│       └── app-constants.ts
│
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

**Dependencies**:
```json
{
  "name": "@cash-mgmt/shared",
  "version": "2.0.0",
  "dependencies": {
    "sqlite3": "^5.1.6",
    "better-sqlite3": "^9.2.0"
  }
}
```

---

## Turborepo Configuration

### Root Configuration

**package.json** (root):
```json
{
  "name": "cash-management-v2",
  "version": "2.0.0",
  "private": true,
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "clean": "turbo run clean && rm -rf node_modules",
    "electron": "turbo run dev --filter=@cash-mgmt/electron-app"
  },
  "devDependencies": {
    "turbo": "^1.11.0",
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0"
  },
  "packageManager": "npm@10.2.0"
}
```

**turbo.json**:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": [],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*"]
    },
    "lint": {
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
```

**Key Features**:
- `dependsOn: ["^build"]` - Build dependencies first
- `outputs` - Cache these directories
- `inputs` - Only rebuild if these files change
- `cache: false` - Don't cache dev/clean tasks
- `persistent: true` - Keep dev servers running

### TypeScript Configuration

**tsconfig.base.json** (root):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "composite": true
  }
}
```

**packages/electron-app/tsconfig.json**:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2020", "DOM"],
    "module": "esnext",
    "moduleResolution": "node"
  },
  "references": [
    { "path": "../shared" },
    { "path": "../scrapers" },
    { "path": "../pipeline" },
    { "path": "../optimization" }
  ],
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**TypeScript Project References**:
- Enables faster incremental builds
- Enforces dependency boundaries
- Better IDE performance

---

## Build & Development Workflows

### Installation

```bash
# Clone new repo
git clone https://github.com/yourusername/cash-management-v2.git
cd cash-management-v2

# Install all dependencies (across all packages)
npm install

# Turborepo installs workspace deps automatically
```

### Development

```bash
# Run all packages in dev mode (parallel)
npm run dev

# Or run specific package
turbo run dev --filter=@cash-mgmt/electron-app

# Run electron app (most common)
npm run electron
```

**What happens**:
1. Turborepo builds dependencies first (`shared`, `scrapers`, `pipeline`, `optimization`)
2. Starts electron-app in dev mode
3. Hot reloading works as before

### Building

```bash
# Build all packages
npm run build

# Build specific package
turbo run build --filter=@cash-mgmt/pipeline

# Build only changed packages (incremental)
turbo run build
```

**Turborepo Intelligence**:
- Only rebuilds packages with changed files
- Caches build outputs
- Second build is instant if nothing changed

### Testing

```bash
# Test all packages
npm test

# Test specific package
turbo run test --filter=@cash-mgmt/scrapers

# Test in parallel
turbo run test --parallel

# Test only changed packages
turbo run test --filter=...[origin/main]
```

**Benefits**:
- Each package tests independently
- Parallel execution (faster CI)
- Only test what changed

### Clean Build

```bash
# Clean all build artifacts
npm run clean

# Clean and rebuild
npm run clean && npm run build
```

---

## Git Workflow (Unchanged!)

### Important: Monorepo ≠ Special Git

**A monorepo is just one git repository with organized folders.**

Everything you know about git still applies:

```bash
# All these work exactly the same
git status
git add .
git commit -m "message"
git push
git pull
git branch feature/new-thing
git checkout main
git merge feature/new-thing
```

### GitHub Desktop & GitKraken

**Both work perfectly!** No changes to your workflow.

#### What You'll See in GitHub Desktop

**File Tree**:
```
📁 cash-management-v2
  📁 packages
    📁 electron-app
      📄 package.json       ✓ modified
      📁 src
        📁 renderer
          📄 App.tsx        ✓ modified
    📁 scrapers
      📁 src
        📄 ajbell.ts        ✓ added
  📄 turbo.json
```

Just nested folders - nothing special!

**Staging Changes**:
- Select files from different packages
- Stage all or individually
- Same as always

**Committing**:
```
Commit: "feat: Add strategic allocation feature"

Files changed:
  packages/shared/src/types/allocation.ts           ✓
  packages/optimization/src/allocation/analyzer.ts  ✓
  packages/electron-app/src/renderer/pages/...      ✓
```

One commit can touch multiple packages - this is **good**!

#### What You'll See in GitKraken

**Git Graph**:
- Same visual history
- Branches displayed identically
- Merge/rebase work the same

**File Changes**:
- Grouped by folder (packages/...)
- Diffs look the same
- Just different paths

### Commit Strategies

**Option 1: Monolithic Commits** (Simpler)
```bash
# Make changes across packages
# Stage all related changes
git add .
git commit -m "feat: Add strategic allocation system"
```

**Option 2: Scoped Commits** (More Granular)
```bash
# Commit per package
git add packages/shared/
git commit -m "feat(shared): Add allocation types"

git add packages/optimization/
git commit -m "feat(optimization): Add allocation analyzer"

git add packages/electron-app/
git commit -m "feat(electron-app): Add allocation UI"
```

**Option 3: Conventional Commits** (Recommended)
```bash
git commit -m "feat(allocation): Add strategic allocation system

- Add allocation types to shared package
- Implement analyzer in optimization package
- Create UI in electron-app

Closes #123"
```

**Use whatever style you prefer** - git doesn't care!

---

## Migration Strategy

### Phase 0: Preparation (1 day)

#### 0.1 Create Migration Document ✅ (This document)

#### 0.2 Create New Repository

```bash
# On GitHub
# Create new repo: cash-management-v2
# Clone locally
git clone https://github.com/yourusername/cash-management-v2.git
cd cash-management-v2
```

#### 0.3 Initialize Monorepo Structure

```bash
# Create folder structure
mkdir -p packages/{electron-app,scrapers,pipeline,optimization,shared}
mkdir -p apps docs scripts data e2e

# Initialize root package.json
npm init -y

# Set up workspaces
# Edit package.json to add workspaces array

# Install Turborepo
npm install turbo --save-dev

# Create turbo.json, tsconfig.base.json
# (See configurations above)

# Initial commit
git add .
git commit -m "chore: Initialize monorepo structure"
git push origin main
```

#### 0.4 Database & Data Files Strategy

**Important**: See [MONOREPO-FILE-AUDIT.md](./MONOREPO-FILE-AUDIT.md#database--data-files) for complete database file handling strategy (28 files).

**Key Points**:
- 📁 Keep `/data/` directory at monorepo root (not in packages)
- 🚫 **DO NOT** commit `.db` files to git
- ✅ Commit migrations, reference data, dashboard configs
- 📦 Database files to handle:
  - Production databases (2 files) - .gitignore (1 empty database deleted)
  - Migrations (7 SQL files) - commit
  - Dashboard configs (5 current + 3 legacy) - commit current, archive legacy
  - Reference data (5 files: BOE lists, FPS participants) - commit
  - Account documents (4 PDFs) - user data, handle separately

**Update `.gitignore`**:
```gitignore
# Database files
*.db
*.db-shm
*.db-wal
data/database/*.db
data/test/**/*.db

# Keep migrations and reference data
!data/database/migrations/*.sql
!data/reference/**/*
!data/dashboards/current/*.json
```

### Phase 1: Foundation (2-3 days)

#### 1.1 Migrate `@cash-mgmt/shared` Package

**Why First?**: All other packages depend on this

```bash
cd packages/shared
npm init -y
```

**Files to migrate** (~27 files): See [MONOREPO-FILE-AUDIT.md](./MONOREPO-FILE-AUDIT.md#shared-package-files) for complete list including:
- **Shared services**: DatabaseService, AuditService, ConfigurationService, BalanceUpdateService, DocumentService, EnhancedLogger, InterestEventService, InterestPaymentService, ReconciliationService, TransactionService
- **Shared types**: ActionItemTypes, ConfigurationTypes, DocumentTypes, LoggingTypes, OptimizationTypes, PendingMoveTypes, PortfolioTypes, ScraperTypes, TransactionTypes
- **Shared utilities**: DatabaseValidator, formatters, RetryHelper

**Update imports**:
- Change relative paths to package imports (`@cash-mgmt/shared`)
- Fix any broken references
- See "Import Statement Migration Strategy" section below for automation

**Test**:
```bash
cd packages/shared
npm test
npm run build
```

**Commit**:
```bash
git add packages/shared
git commit -m "feat(shared): Migrate shared utilities and types"
```

#### 1.2 Set Up `@cash-mgmt/electron-app` Skeleton

```bash
cd packages/electron-app
npm init -y
```

**Add dependencies**:
```json
{
  "dependencies": {
    "@cash-mgmt/shared": "workspace:*",
    "electron": "^28.0.0",
    "react": "^18.2.0"
  }
}
```

**Create structure**:
```bash
mkdir -p src/{main,renderer}
touch src/main/main.ts
touch src/renderer/index.tsx
```

**Commit**:
```bash
git add packages/electron-app
git commit -m "feat(electron-app): Initialize Electron app package"
```

### Phase 2: Component Extraction (5-7 days)

#### 2.1 Migrate `@cash-mgmt/scrapers` (1-2 days)

**Files to migrate** (~31 files): See [MONOREPO-FILE-AUDIT.md](./MONOREPO-FILE-AUDIT.md#scrapers-package-files) for complete list.

**Important**: All scrapers are **native JavaScript** (not TypeScript) - this is intentional for simpler Playwright integration. Don't attempt to convert to TypeScript.

**Includes**:
- Scraper implementations (ajbell.js, flagstone.js, hargreaves-lansdown.js, moneyfacts.js)
- Parsers (ajbell-parser.js, hl-parser.js, common-parser.js)
- Core modules (scraper-base.js, browser-manager.js, enhanced-logger.js)
- Utilities (data-normalizer.js, frn-resolver.js, platform-normalizer.js, file-utils.js)
- Runners (cli-runner.js, batch-runner.js)
- FRN management SQL files and documentation

**Update dependencies**:
- Add `@cash-mgmt/shared` workspace dependency for database access

**Create tests**:
```bash
cd packages/scrapers
npm test
```

**Commit**:
```bash
git add packages/scrapers
git commit -m "feat(scrapers): Extract scrapers to dedicated package"
```

#### 2.2 Migrate `@cash-mgmt/pipeline` (2-3 days)

**Files to migrate** (~31 files): See [MONOREPO-FILE-AUDIT.md](./MONOREPO-FILE-AUDIT.md#pipeline-package-files) for complete list including:
- **Core pipeline services**: OrchestrationService, JSONIngestionService, FRNMatchingService, DeduplicationOrchestrator, ProductDeduplicationService, StandaloneDeduplicationService, DataQualityAnalyzer, PipelineAudit
- **Pipeline types**: FRNMatchingConfig
- **Integration tests** (~22 test files): All tests from `src/tests/integration/` including accumulation, FRN matching, cross-platform, filtering, and rebuild tests
- **Test helpers and utilities**: AuditTrailValidator, TestDatabase, TestDataGenerator, PipelineTestHelper

**Update to use `@cash-mgmt/shared`**:
```typescript
// Old
import { DatabaseService } from '../shared/services/DatabaseService';

// New
import { DatabaseService } from '@cash-mgmt/shared';
```

**Test independently**:
```bash
cd packages/pipeline
npm test
```

**Commit**:
```bash
git add packages/pipeline
git commit -m "feat(pipeline): Extract JSON processing pipeline to package"
```

#### 2.3 Migrate `@cash-mgmt/optimization` (1-2 days)

**Files to migrate** (~40 files): See [MONOREPO-FILE-AUDIT.md](./MONOREPO-FILE-AUDIT.md#optimization-package-files) for complete list.

**Note**: This migrates the entire `/recommendation-engine/` directory.

**Includes**:
- **CLI tools**: fscs-compliance.ts, optimize-cli.ts, optimize-main.ts, test-recommendation-service.ts
- **Compliance**: diversification.ts, fscs.ts
- **Configuration**: loader.ts, unified-loader.ts
- **Database**: connection.ts
- **Optimization**: dynamic-allocator.ts, easy-access.ts, factory.ts, frn-headroom-manager.ts, fscs-tracker.ts, optimizer.ts
- **Portfolio & Products**: loader.ts (both)
- **Rules**: engine.ts
- **Services**: recommendation-service-impl.ts, recommendation-service.ts
- **Types**: index.ts, integration.ts, shared.ts
- **Utils**: logger.ts, money.ts
- **Tests**: Unit tests, integration tests, setup

**Test independently**:
```bash
cd packages/optimization
npm test
```

**Commit**:
```bash
git add packages/optimization
git commit -m "feat(optimization): Extract optimization engine to package"
```

### Phase 3: Electron App Migration (5-7 days)

#### 3.1 Main Process (2-3 days)

**Files to migrate**: See [MONOREPO-FILE-AUDIT.md](./MONOREPO-FILE-AUDIT.md#electron-app-files) for complete Electron app file list (~100 files total).

**Main process files** include:
- **Entry points**: main.ts, menu.ts, preload.ts
- **IPC handlers**: orchestrator-handlers.ts, optimization-handlers.ts, scraper-config-handlers.ts, transaction-handlers.ts, document-handlers.ts
- **Services**: BackupService, DocumentCleanupService, DocumentFileManager, FSCSComplianceService, RateOptimizerService, ScraperProcessManager, SubprocessService

**Update imports** to use workspace packages:
```typescript
// Old
import { OrchestrationService } from '../shared/services/OrchestrationService';

// New
import { OrchestrationService } from '@cash-mgmt/pipeline';
```

**Test**:
```bash
npm run electron
```

#### 3.2 Renderer (3-4 days)

**Files to migrate**: See [MONOREPO-FILE-AUDIT.md](./MONOREPO-FILE-AUDIT.md#electron-app-files) for complete list.

**Renderer files** include:
- **Entry points**: index.html, index.tsx, App.tsx, Layout.tsx
- **Pages** (10 files): Dashboard, DataCollection (rename to DataProcessing), FRNManagement, Holdings, PortfolioManagement, OptimizationDashboard, Audit, BalanceChecker, Calendar, Configuration
- **Components** (60+ files): Organized by category (dashboard/, dialogs/, documents/, frn/, notifications/, optimization/, reconciliation/, scraper/, configuration/, transactions/)
- **Contexts**: OptimizationContext, ViewModeContext
- **Services**: optimizationConflictService, pendingDepositService
- **Types**: actionItem.ts

**Update imports**:
```typescript
// Use workspace packages
import { Product } from '@cash-mgmt/shared';
import { ScraperConfig } from '@cash-mgmt/scrapers';
```

**Test each page**:
- Dashboard
- Portfolio Management
- Data Processing
- FRN Management
- etc.

### Phase 4: Testing & Documentation (2-3 days)

#### 4.1 Integration Testing

```bash
# Run all tests
npm test

# Test build
npm run build

# Test electron app
npm run electron
```

**Verify workflows**:
- Scraper → Pipeline → Catalog
- Optimization → Portfolio
- Report Generation

#### 4.2 Update Documentation

**Update files**:
- Root README.md (getting started with monorepo)
- Package READMEs (per-package docs)
- Architecture documentation
- Migration notes

#### 4.3 CI/CD Setup

**GitHub Actions** (`.github/workflows/test.yml`):
```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm install

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
```

**Turborepo optimizations**:
- Remote caching (optional)
- Only test changed packages

### Phase 5: Cutover (1 day)

#### 5.1 Archive Old Repository

```bash
# In old repo
git tag v1-final
git push origin v1-final

# Update README
echo "⚠️ This repository has been superseded by cash-management-v2" > DEPRECATED.md
git add DEPRECATED.md
git commit -m "docs: Mark repository as deprecated"
git push
```

**Archive on GitHub**:
- Go to Settings → Archive this repository

#### 5.2 Switch to V2

- Update local development to use new repo
- Update any CI/CD references
- Celebrate! 🎉

---

## Import Statement Migration Strategy

One of the most tedious aspects of migration is updating import statements from relative paths to workspace packages. We'll use an **automated hybrid approach** that combines scripting with TypeScript's type safety to complete the migration in **3-4 hours**.

### What Changes in Imports

#### Before (Current Structure)
```typescript
// In src/main/main.ts
import { DatabaseService } from '../shared/services/DatabaseService';
import { OrchestrationService } from '../shared/services/OrchestrationService';
import { ScraperProcessManager } from './services/ScraperProcessManager';
import { PortfolioSummary } from '../shared/types/PortfolioTypes';
```

#### After (Monorepo)
```typescript
// In packages/electron-app/src/main/main.ts
import { DatabaseService } from '@cash-mgmt/shared';
import { OrchestrationService } from '@cash-mgmt/pipeline';
import { ScraperProcessManager } from './services/ScraperProcessManager'; // Local imports unchanged!
import { PortfolioSummary } from '@cash-mgmt/shared';
```

**Key Points**:
- ✅ Imports from `shared/` become workspace packages (`@cash-mgmt/*`)
- ✅ Local relative imports (same package) stay unchanged
- ✅ Multiple named exports can be combined from same package

### Recommended Approach: Automated Migration with TypeScript Safety

We'll use a **three-phase hybrid approach** that balances automation with safety:

1. **Phase 1**: Automated Node.js script handles 80% of imports
2. **Phase 2**: TypeScript compiler identifies remaining 20%
3. **Phase 3**: VS Code IntelliSense for final cleanup

**Total Time**: 3-4 hours for entire monorepo

---

#### Phase 1: Automated Node.js Script (80% Coverage)

**Create migration script**:

```javascript
// scripts/migrate-imports.js
const fs = require('fs');
const glob = require('glob');

// Define all import path replacements
const replacements = [
  // Shared package
  {
    from: /from ['"]\.\.\/\.\.?\/shared\/services\/DatabaseService['"]/g,
    to: `from '@cash-mgmt/shared'`
  },
  {
    from: /from ['"]\.\.\/\.\.?\/shared\/types\/PortfolioTypes['"]/g,
    to: `from '@cash-mgmt/shared'`
  },
  {
    from: /from ['"]\.\.\/\.\.?\/shared\/types\/ConfigurationTypes['"]/g,
    to: `from '@cash-mgmt/shared'`
  },

  // Pipeline package
  {
    from: /from ['"]\.\.\/\.\.?\/shared\/services\/OrchestrationService['"]/g,
    to: `from '@cash-mgmt/pipeline'`
  },
  {
    from: /from ['"]\.\.\/\.\.?\/shared\/services\/DataQualityAnalyzer['"]/g,
    to: `from '@cash-mgmt/pipeline'`
  },

  // Scrapers package
  {
    from: /from ['"]\.\.\/\.\.?\/shared\/services\/scrapers\/([^'"]+)['"]/g,
    to: `from '@cash-mgmt/scrapers'`
  },

  // Optimization package
  {
    from: /from ['"]\.\.\/\.\.?\/shared\/services\/RateOptimizerService['"]/g,
    to: `from '@cash-mgmt/optimization'`
  },
  {
    from: /from ['"]\.\.\/\.\.?\/shared\/services\/FSCSOptimizerService['"]/g,
    to: `from '@cash-mgmt/optimization'`
  },

  // Add more patterns as needed
];

function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  let changeCount = 0;

  replacements.forEach(({ from, to }) => {
    const matches = content.match(from);
    if (matches) {
      content = content.replace(from, to);
      changed = true;
      changeCount += matches.length;
    }
  });

  if (changed) {
    fs.writeFileSync(filePath, 'utf8');
    console.log(`✅ Updated ${filePath} (${changeCount} imports)`);
  }
}

// Find all TypeScript files in packages
const files = glob.sync('packages/*/src/**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/dist/**']
});

console.log(`Processing ${files.length} files...\n`);
files.forEach(updateFile);
console.log(`\n✅ Migration complete!`);
```

**Usage**:
```bash
# Install dependencies
npm install --save-dev glob

# Run migration script
node scripts/migrate-imports.js

# Output:
# Processing 247 files...
#
# ✅ Updated packages/electron-app/src/main/main.ts (5 imports)
# ✅ Updated packages/electron-app/src/renderer/App.tsx (3 imports)
# ...
#
# ✅ Migration complete!
```

**Running the script**:
```bash
# Install dependencies
npm install --save-dev glob

# Run migration script
node scripts/migrate-imports.js

# Output:
# Processing 247 files...
#
# ✅ Updated packages/electron-app/src/main/main.ts (5 imports)
# ✅ Updated packages/electron-app/src/renderer/App.tsx (3 imports)
# ...
#
# ✅ Migration complete!
```

**Benefits**:
- ✅ Processes all files automatically
- ✅ Handles 80% of import patterns
- ✅ Shows progress and statistics
- ✅ Can run multiple times safely (idempotent)
- ✅ Takes ~10 minutes total

---

#### Phase 2: TypeScript Compiler Verification (20% Remaining)

After the automated script, TypeScript will identify any missed or incorrect imports:

```bash
# Build each package to find issues
cd packages/shared
npm run build
# ✅ No errors

cd ../scrapers
npm run build
# ✅ No errors

cd ../pipeline
npm run build
# ❌ 3 errors found in OrchestrationService.ts

cd ../optimization
npm run build
# ✅ No errors

cd ../electron-app
npm run build
# ❌ 7 errors found across 4 files
```

**TypeScript tells you exactly what's broken**:
```
src/main/main.ts:15:31 - error TS2307:
Cannot find module '../shared/services/ReportGeneratorService'

src/renderer/components/Dashboard.tsx:8:24 - error TS2307:
Cannot find module '@cash-mgmt/reports'
```

**Why this catches issues**:
- ✅ Imports the script couldn't pattern-match
- ✅ Typos in package names
- ✅ Circular dependencies
- ✅ Missing type exports

---

#### Phase 3: VS Code IntelliSense Cleanup (Final Polish)

For the remaining broken imports, use VS Code's auto-fix:

1. Open file with TypeScript errors (red squiggly lines)
2. Put cursor on broken import
3. Press `Cmd+.` (or `Ctrl+.`) for Quick Fix menu
4. Select "Add import from @cash-mgmt/[package]"
5. VS Code auto-imports from correct workspace package

**Benefits**:
- ✅ Visual feedback
- ✅ IntelliSense suggests correct package
- ✅ Catches type mismatches
- ✅ Fast for final few files

---

### Step-by-Step Migration Process

This is the complete workflow combining all three phases:

#### Step 1: Create Import Mapping Document

Before migrating, create a reference document:

**scripts/import-mappings.md**:
```markdown
# Import Path Mappings

## Shared Package (@cash-mgmt/shared)
- `../shared/services/DatabaseService` → `@cash-mgmt/shared`
- `../shared/types/PortfolioTypes` → `@cash-mgmt/shared`
- `../shared/types/database` → `@cash-mgmt/shared`
- `../shared/utils/formatting` → `@cash-mgmt/shared`

## Pipeline Package (@cash-mgmt/pipeline)
- `../shared/services/OrchestrationService` → `@cash-mgmt/pipeline`
- `../shared/services/DataQualityAnalyzer` → `@cash-mgmt/pipeline`
- `../shared/types/ConfigurationTypes` → `@cash-mgmt/pipeline`

## Scrapers Package (@cash-mgmt/scrapers)
- `../../shared/services/scrapers/ajbell-scraper` → `@cash-mgmt/scrapers`
- `../../shared/services/scrapers/flagstone-scraper` → `@cash-mgmt/scrapers`
- `../../shared/services/ScraperProcessManager` → `@cash-mgmt/scrapers`

## Optimization Package (@cash-mgmt/optimization)
- `../shared/services/RateOptimizerService` → `@cash-mgmt/optimization`
- `../shared/services/FSCSOptimizerService` → `@cash-mgmt/optimization`
```

**Tool to help discover imports**:
```bash
# Find all unique imports from shared/
grep -r "from.*shared" src/ | \
  sed "s/.*from ['\"]//g" | \
  sed "s/['\"].*//g" | \
  sort -u > shared-imports.txt
```

#### Step 2: Copy Files to New Structure

```bash
# Shared package
mkdir -p packages/shared/src/{types,database,utils}
cp -r src/shared/types/* packages/shared/src/types/
cp -r src/shared/services/DatabaseService.ts packages/shared/src/database/

# Scrapers package
mkdir -p packages/scrapers/src
cp -r src/shared/services/scrapers/* packages/scrapers/src/

# Pipeline package
mkdir -p packages/pipeline/src/{orchestration,stages}
cp src/shared/services/OrchestrationService.ts packages/pipeline/src/orchestration/

# Electron app
mkdir -p packages/electron-app/src/{main,renderer}
cp -r src/main/* packages/electron-app/src/main/
cp -r src/renderer/* packages/electron-app/src/renderer/
```

#### Step 3: Run Automated Migration Script

```bash
# Run the Node.js migration script
node scripts/migrate-imports.js

# This will process all ~270 files and update 80% of imports automatically
# Takes ~10 minutes
```

#### Step 4: Fix Remaining Issues with TypeScript

```bash
# Build each package and fix errors
cd packages/shared
npm run build
# Fix any remaining import errors

cd ../scrapers
npm run build
# Fix errors

cd ../pipeline
npm run build
# Fix errors

cd ../optimization
npm run build
# Fix errors

cd ../electron-app
npm run build
# Fix errors
```

**TypeScript will tell you**:
- Missing imports
- Wrong module specifiers
- Type mismatches
- Circular dependencies

#### Step 5: Verify with Tests

```bash
# Run all tests
turbo run test

# If failures, fix imports in test files too
# Test files follow same migration pattern
```

### Import Mapping Quick Reference

| Old Import Path | New Package | Example New Import |
|----------------|-------------|-------------------|
| `../shared/services/DatabaseService` | `@cash-mgmt/shared` | `import { DatabaseService } from '@cash-mgmt/shared'` |
| `../shared/types/PortfolioTypes` | `@cash-mgmt/shared` | `import { Portfolio } from '@cash-mgmt/shared'` |
| `../shared/services/OrchestrationService` | `@cash-mgmt/pipeline` | `import { OrchestrationService } from '@cash-mgmt/pipeline'` |
| `../../shared/services/scrapers/ajbell` | `@cash-mgmt/scrapers` | `import { AJBellScraper } from '@cash-mgmt/scrapers'` |
| `../shared/services/RateOptimizerService` | `@cash-mgmt/optimization` | `import { RateOptimizer } from '@cash-mgmt/optimization'` |
| `./services/BackupService` | **Unchanged** | `import { BackupService } from './services/BackupService'` |

**Named Export Consolidation**:

```typescript
// Before: Multiple imports from different files
import { DatabaseService } from '../shared/services/DatabaseService';
import { PortfolioSummary } from '../shared/types/PortfolioTypes';
import { formatCurrency } from '../shared/utils/formatting';

// After: Single import from package
import { DatabaseService, PortfolioSummary, formatCurrency } from '@cash-mgmt/shared';
```

### Database Path Updates

**File System Paths** (less common, but important):

```typescript
// Before: Relative to __dirname
const dbPath = path.join(__dirname, '../../data/database/cash_savings.db');

// After: Use process.cwd() (current working directory)
const dbPath = path.join(process.cwd(), 'data/database/cash_savings.db');

// Even Better: Environment variable
const dbPath = process.env.DATABASE_PATH ||
  path.join(process.cwd(), 'data/database/cash_savings.db');
```

**Why `process.cwd()`?**
- Works regardless of package location
- Always relative to project root
- More maintainable

**Data folder location**: Keep at repository root (`data/`) so all packages can access it with consistent paths.

### Time Breakdown

| Phase | Activity | Time |
|-------|----------|------|
| **Phase 1** | Write/customize Node.js migration script | 30 min |
| | Run script across all packages | 10 min |
| **Phase 2** | Run TypeScript build on all packages | 15 min |
| | Fix TypeScript errors in ~10-15 files | 1-2 hours |
| **Phase 3** | VS Code quick fix for final stragglers | 30-60 min |
| **Verification** | Run tests, verify app launches | 30 min |

**Total Time: 3-4 hours for entire monorepo**

This is significantly faster than manual approaches (which take 5-15 hours) because:
- ✅ 80% is automated (saves ~4-8 hours)
- ✅ TypeScript catches 100% of issues
- ✅ No guessing or manual pattern matching

### Verification Checklist

After migration, verify everything works:

```bash
# 1. All packages build without errors
turbo run build
# ✅ Expected: No TypeScript errors

# 2. All tests pass
turbo run test
# ✅ Expected: All tests green

# 3. Electron app launches
cd packages/electron-app
npm run dev
# ✅ Expected: App starts without import errors

# 4. Check for stray relative imports to old shared/
grep -r "from '\.\./\.\./shared" packages/
# ✅ Expected: No results (or only legitimate cases)

# 5. Verify workspace dependencies resolved
npm ls @cash-mgmt/shared
npm ls @cash-mgmt/scrapers
npm ls @cash-mgmt/pipeline
npm ls @cash-mgmt/optimization
# ✅ Expected: Shows "link:packages/..." for each

# 6. Check for unused imports
npm run lint
# ✅ Expected: No unused import warnings (if ESLint configured)
```

### Pro Tips

#### 1. Use TypeScript Strict Mode

Enable in all package `tsconfig.json` files:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

This catches:
- Unused imports (after consolidation)
- Missing type exports
- Implicit any types

#### 2. Install ESLint Import Plugin

```bash
npm install --save-dev eslint-plugin-import
```

Configure in `.eslintrc.json`:

```json
{
  "plugins": ["import"],
  "rules": {
    "import/no-unresolved": "error",
    "import/no-duplicates": "error",
    "import/order": ["error", {
      "groups": ["builtin", "external", "internal", "parent", "sibling"],
      "newlines-between": "always"
    }]
  }
}
```

**Benefits**:
- Detects unresolved imports
- Removes duplicate imports
- Enforces consistent import ordering

#### 3. Use Package Export Maps

In each package's `package.json`, define specific exports:

```json
{
  "name": "@cash-mgmt/shared",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./database": {
      "types": "./dist/database/index.d.ts",
      "default": "./dist/database/index.js"
    },
    "./types": {
      "types": "./dist/types/index.d.ts",
      "default": "./dist/types/index.js"
    }
  }
}
```

**Benefits**:
- More specific imports: `import { X } from '@cash-mgmt/shared/database'`
- Better tree-shaking (only bundle what's imported)
- Enforces clean package API boundaries

#### 4. Create Barrel Files

In each package, create `src/index.ts` that re-exports everything:

```typescript
// packages/shared/src/index.ts
export * from './database/DatabaseService';
export * from './types/portfolio';
export * from './types/database';
export * from './utils/formatting';
export * from './utils/validation';
```

**Benefits**:
- Single import point: `import { A, B, C } from '@cash-mgmt/shared'`
- Easier to manage exports
- Better IDE autocomplete

---

## Timeline Summary

| Phase | Description | Days | Cumulative |
|-------|-------------|------|------------|
| 0 | Preparation | 1 | 1 |
| 1 | Foundation (shared, electron skeleton) | 2-3 | 3-4 |
| 2 | Component Extraction | 5-7 | 8-11 |
| 3 | Electron App Migration | 5-7 | 13-18 |
| 4 | Testing & Documentation | 2-3 | 15-21 |
| 5 | Cutover | 1 | 16-22 |

**Total Estimated Time: 16-22 days (3-4 weeks)**

---

## Alternative: Phased Approach

If full migration feels too risky, consider a **phased approach**:

### Approach A: Structure First, Migrate Later

1. **Week 1**: Set up monorepo structure (Phase 0-1)
2. **Week 2-8**: Implement V2 features in new structure
3. **Week 9-10**: Migrate old code as you touch it

**Benefits**:
- Not blocked on migration
- New features start clean
- Old code migrated gradually

### Approach B: Package-by-Package

1. Extract scrapers first (independent)
2. Use in old repo via npm link
3. Extract pipeline (depends on shared)
4. Use in old repo via npm link
5. Continue until complete

**Benefits**:
- Incremental validation
- Can revert if issues
- Old repo still works throughout

---

## Build Performance Comparison

### Before (Current)

```bash
npm run build
# Everything rebuilds, even if one file changed
# Time: ~45 seconds
```

### After (Monorepo + Turborepo)

```bash
# First build
turbo run build
# Time: ~50 seconds (slightly slower due to Turbo overhead)

# Second build (no changes)
turbo run build
# Time: ~0.5 seconds (cached)

# Change one file in @cash-mgmt/shared
turbo run build
# Time: ~8 seconds (only rebuilds shared + dependents)

# Change one file in @cash-mgmt/electron-app
turbo run build
# Time: ~5 seconds (only rebuilds electron-app)
```

**Intelligent caching** = massive time savings during development!

---

## Testing Strategy

### Unit Testing

**Before**: All tests in `src/tests/`

**After**: Tests colocated with packages

```bash
# Test specific package
cd packages/scrapers
npm test

# Test all packages
turbo run test

# Test in parallel
turbo run test --parallel
```

### Integration Testing

**Dedicated integration tests** in `packages/electron-app/tests/integration/`

Test workflows across packages:
- Scraper → Pipeline → Database
- Pipeline → Optimization → Recommendations
- End-to-end UI flows

### E2E Testing

**Playwright tests** in `packages/electron-app/tests/e2e/`

Test complete Electron app workflows.

---

## Package Versioning Strategy

### Option 1: Unified Versioning (Recommended)

All packages share the same version:
- `@cash-mgmt/electron-app@2.0.0`
- `@cash-mgmt/scrapers@2.0.0`
- `@cash-mgmt/pipeline@2.0.0`
- etc.

**Benefits**:
- Simple to understand
- Matches Electron app releases
- Clear version correspondence

**Release Process**:
```bash
# Update all package.json versions
npm version minor --workspaces

# Tag release
git tag v2.1.0
git push origin v2.1.0
```

### Option 2: Independent Versioning

Each package has its own version:
- `@cash-mgmt/electron-app@2.0.0`
- `@cash-mgmt/scrapers@1.3.2`
- `@cash-mgmt/pipeline@1.5.0`

**Benefits**:
- More granular change tracking
- Semantic versioning per component

**Drawbacks**:
- More complex to manage
- Unclear which versions work together

**Recommendation**: Use **unified versioning** for simplicity.

---

## CI/CD Considerations

### GitHub Actions Workflow

**.github/workflows/ci.yml**:
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm install
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm install
      - run: npm test

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm install
      - run: npm run build

  # Electron app build (macOS, Windows, Linux)
  build-electron:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    needs: [build]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm install
      - run: npm run build
      - run: cd packages/electron-app && npm run dist
      - uses: actions/upload-artifact@v3
        with:
          name: electron-${{ matrix.os }}
          path: packages/electron-app/dist/
```

### Turborepo Remote Caching (Optional)

**Vercel Turbo**:
```bash
# Link to Vercel for remote caching
turbo login
turbo link

# CI automatically uses cached builds
```

**Benefits**:
- Share build cache across machines
- Faster CI runs
- Team members share cache

---

## Comparison: Before vs After

| Aspect | Before (Current) | After (Monorepo) |
|--------|-----------------|------------------|
| **Structure** | Single src/ directory | 5 separate packages |
| **Dependencies** | All mixed together | Clear per-package deps |
| **Testing** | All tests together | Independent per package |
| **Build Time** | Always full rebuild | Intelligent caching |
| **Code Organization** | Tangled in shared/ | Clear boundaries |
| **Future Extensibility** | Difficult | Easy (extract as CLI/API) |
| **Git Workflow** | Standard | Unchanged (still standard) |
| **Tooling** | Basic npm scripts | Turborepo orchestration |
| **Developer Experience** | Moderate | Excellent |

---

## FAQ

### Will this break my existing git workflow?

**No.** A monorepo is just one git repository with organized folders. GitHub Desktop and GitKraken work exactly the same. The only difference is file paths (e.g., `packages/scrapers/src/ajbell.ts` instead of `src/shared/services/ajbell.ts`).

### Do I need to learn new git commands?

**No.** All git commands work identically:
- `git add`, `git commit`, `git push`
- Branching, merging, rebasing
- Pull requests, code reviews

Nothing changes!

### Can I still use VS Code?

**Yes!** VS Code has excellent monorepo support:
- Open root folder: sees all packages
- TypeScript project references work automatically
- Extensions (ESLint, Prettier) work across packages
- Search across all packages

### What if I want to go back?

**Easy!** Keep old repo around:
1. Tag old repo as `v1-final`
2. Archive but don't delete
3. Can reference old code anytime
4. Could even merge back (though you won't want to)

### Will builds be slower?

**First build**: Slightly slower (~5 seconds overhead)
**Subsequent builds**: Much faster (intelligent caching)
**Changed 1 file**: Only rebuild affected packages

**Overall**: Better build performance.

### How do package versions work?

**Recommended**: All packages share same version (e.g., 2.0.0)
**Alternative**: Independent versioning per package

Use `workspace:*` in package.json to reference latest.

### Can I extract packages as standalone tools later?

**Yes!** That's the point:
- Scrapers → CLI tool (`npx @cash-mgmt/scrapers`)
- Pipeline → Standalone service
- Optimization → API endpoint

Currently private packages, but could publish later.

### What about the Python reporter?

**Being replaced** by native Electron reporting (Phase 11 of ELECTRON-APP-V2-COMPREHENSIVE-PLAN.md).

**Migration Strategy:**
- ❌ **DO NOT migrate** to new repository
- ✅ **Preserve in old repository** as reference during Phase 11 implementation
- ✅ **Old repo remains accessible** at `cash-management/` for reference
- 📝 **Optional:** Extract key business logic documentation to `docs/electron-app/portfolio-reporter-reference.md` if needed

**Why keep it accessible:**
The Python reporter contains valuable business logic for report generation:
- 8 report sections with specific calculations
- Table structures and column layouts
- Strategic allocation analysis algorithms
- Risk assessment formulas
- Optimization recommendation logic

During Phase 11 implementation, developers will need to reference this code to ensure feature parity in the native React/MUI implementation.

**Access Strategy:**
```bash
# Old repo for reference
cd /Users/david/Websites/cash-management
# Check Python reporter implementation
ls -la portfolio-reporter/src/portfolio_reporter/sections/

# New repo for development
cd /Users/david/Websites/cash-management-v2
# Implement native equivalent in packages/electron-app/
```

---

## Success Criteria

### Migration Complete When:

✅ **All packages build independently**
```bash
cd packages/scrapers && npm run build  # ✅
cd packages/pipeline && npm run build  # ✅
cd packages/optimization && npm run build  # ✅
cd packages/shared && npm run build  # ✅
cd packages/electron-app && npm run build  # ✅
```

✅ **All tests pass**
```bash
npm test  # ✅ All packages
```

✅ **Electron app runs**
```bash
npm run electron  # ✅ App launches
```

✅ **All workflows function**
- Scraper → Pipeline → Catalog: ✅
- Optimization → Recommendations: ✅
- Report generation: ✅
- FRN research: ✅

✅ **Git workflow unchanged**
- GitHub Desktop works: ✅
- GitKraken works: ✅
- CI/CD works: ✅

✅ **Documentation updated**
- Root README: ✅
- Package READMEs: ✅
- Architecture docs: ✅

---

## Next Steps

### 1. Review This Plan
- Confirm approach
- Adjust timeline if needed
- Identify risks

### 2. Create New Repository
- Set up on GitHub: `cash-management-v2`
- Clone locally
- Initialize structure

### 3. Start Migration
- Begin with Phase 0 (Preparation)
- Follow phases sequentially
- Commit frequently

### 4. Parallel V2 Development (Optional)
- Implement V2 features in new structure
- Migrate old code as you go
- Clean architecture from start

---

## Appendix

### Useful Turborepo Commands

```bash
# Build everything
turbo run build

# Build only changed packages
turbo run build --filter=...[origin/main]

# Build specific package + dependencies
turbo run build --filter=@cash-mgmt/electron-app...

# Run in parallel
turbo run test --parallel

# Clear cache
turbo run build --force

# Dry run (see what would run)
turbo run build --dry-run

# See dependency graph
turbo run build --graph
```

### Workspace Package Reference

```json
// Use workspace version
"dependencies": {
  "@cash-mgmt/shared": "workspace:*"
}

// Use specific version (pin)
"dependencies": {
  "@cash-mgmt/shared": "workspace:2.0.0"
}

// Use range
"dependencies": {
  "@cash-mgmt/shared": "workspace:^2.0.0"
}
```

### TypeScript Project References

**packages/electron-app/tsconfig.json**:
```json
{
  "references": [
    { "path": "../shared" },
    { "path": "../scrapers" },
    { "path": "../pipeline" },
    { "path": "../optimization" }
  ]
}
```

**Benefits**:
- Faster incremental builds
- Better IDE performance
- Enforces dependency graph

---

**Document Status**: ✅ Ready for Implementation
**Next Step**: Create cash-management-v2 repository and begin Phase 0
**Estimated Timeline**: 16-22 days (3-4 weeks)
**Point of Contact**: See project maintainers

---

## Related Documents

📋 **[MONOREPO-FILE-AUDIT.md](./MONOREPO-FILE-AUDIT.md)** - Complete file-by-file migration mapping
- Use this for: "Where does X file go?"
- 420 files analyzed with exact destinations

🏗️ **[ELECTRON-APP-V2-COMPREHENSIVE-PLAN.md](../electron-app/ELECTRON-APP-V2-COMPREHENSIVE-PLAN.md)** - V2 feature implementation
- Use this for: Phase 11 (Native Report System) and Phase 10 (Strategic Allocation)
- Reference old Python reporter code for implementation

---

*This document should be updated as the migration progresses. Mark phases complete and document any deviations from the plan.*

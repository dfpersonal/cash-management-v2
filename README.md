# Cash Management V2

Cash Management Desktop Application - Turborepo Monorepo Architecture

## Overview

Cash Management V2 is an Electron desktop application for managing cash savings portfolios with:
- Web scrapers for financial platforms (Playwright-based)
- JSON processing pipeline (ingestion → FRN matching → deduplication → quality)
- Optimization engine for rate improvement and FSCS compliance
- React/MUI UI with portfolio management features

## Monorepo Structure

This repository uses [Turborepo](https://turbo.build) to manage multiple packages:

```
cash-management-v2/
├── packages/
│   ├── electron-app/      # Main Electron application
│   ├── scrapers/          # Web scraping modules (native JS)
│   ├── pipeline/          # JSON processing pipeline
│   ├── optimization/      # Recommendation engine
│   └── shared/            # Common utilities and types
├── data/                  # Database & migrations (root level)
├── e2e/                   # Playwright E2E tests
├── scripts/               # Utility scripts
└── docs/                  # Documentation
```

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- npm 10.x or higher

### Installation

```bash
# Install all dependencies
npm install

# Build all packages
npm run build
```

### Development

```bash
# Run Electron app in development mode
npm run electron

# Build all packages
npm run build

# Run all tests
npm test

# Run linting
npm run lint
```

### Turborepo Commands

```bash
# Build only changed packages
turbo run build

# Run specific package
turbo run dev --filter=@cash-mgmt/electron-app

# Run in parallel
turbo run test --parallel

# Clear cache
turbo run build --force
```

## Workspace Packages

### `@cash-mgmt/electron-app`
Main Electron desktop application with React/MUI UI

### `@cash-mgmt/scrapers`
Web scrapers for financial platforms (native JavaScript with Playwright)

### `@cash-mgmt/pipeline`
JSON processing pipeline with 4 stages:
1. JSON Ingestion
2. FRN Matching
3. Deduplication
4. Data Quality Analysis

### `@cash-mgmt/optimization`
Recommendation engine for:
- Rate optimization
- FSCS compliance
- Strategic allocation

### `@cash-mgmt/shared`
Common utilities, types, and database services

## Database Setup

Database files are stored in `/data/` at the repository root:

- **Migrations**: `/data/database/migrations/`
- **Reference data**: `/data/reference/`
- **Dashboard configs**: `/data/dashboards/current/`

**Note**: `.db` files are excluded from git. See `.gitignore` for details.

## Migration from V1

This repository represents a complete restructuring from the original `cash-management` repository into a monorepo architecture. See `/docs/packaging-and-distribution/` for migration documentation.

## Documentation

- [Monorepo Migration Plan](./docs/packaging-and-distribution/MONOREPO-MIGRATION-PLAN.md)
- [File Audit](./docs/packaging-and-distribution/MONOREPO-FILE-AUDIT.md)
- [Migration Checklist](./docs/packaging-and-distribution/MONOREPO-MIGRATION-CHECKLIST.md)

## License

Private repository - All rights reserved

## Related Repositories

- [cash-management](https://github.com/dfpersonal/cash-management) - V1 (archived)

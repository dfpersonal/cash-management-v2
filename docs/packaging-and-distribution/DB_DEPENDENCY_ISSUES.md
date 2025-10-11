# Monorepo Database Dependency Cleanup Plan

**Document Version**: 1.0
**Date**: 2025-10-09
**Status**: Proposed

---

## 1. Executive Summary

A review of the `cash-management-v2` monorepo has identified a deviation from the established architecture outlined in the `MONOREPO-MIGRATION-PLAN.md`. Several packages have direct dependencies on `sqlite3` and `better-sqlite3`, bypassing the centralized `@cash-mgmt/shared` database service.

This document outlines the identified issues, the associated risks, and a concrete plan to refactor the codebase to align with the intended architecture. The goal is to centralize all database interactions within `@cash-mgmt/shared` to improve maintainability, consistency, and stability.

---

## 2. Identified Issues

The following packages have direct database dependencies, which violates the monorepo architecture:

| Package | Dependency | Version |
| :--- | :--- | :--- |
| `@cash-mgmt/electron-app` | `better-sqlite3` | `^12.2.0` |
| `@cash-mgmt/scrapers` | `better-sqlite3` | `^12.4.1` |
| `@cash-mgmt/scrapers` | `sqlite3` | `^5.1.6` |
| `@cash-mgmt/optimization` | `sqlite3` | `^5.1.6` |

The `@cash-mgmt/shared` package correctly contains the primary database dependencies as intended. However, the other packages should be using the service provided by `@cash-mgmt/shared`, not instantiating their own database connections.

---

## 3. Architectural Violation

The `MONOREPO-MIGRATION-PLAN.md` (Section 5, Package Details) specifies that database access should be consolidated into the `@cash-mgmt/shared` package.

> **`@cash-mgmt/shared` Purpose**: Shared utilities, types, and **database service**.
>
> ```
> packages/shared/
> ├── src/
> │   ├── database/
> │   │   ├── DatabaseService.ts       # Main DB service
> ```

By including direct `sqlite3` or `better-sqlite3` dependencies, the `electron-app`, `scrapers`, and `optimization` packages are bypassing this centralized service.

---

## 4. Potential Risks

The current implementation introduces several risks:

-   **Inconsistent Database Connections**: Different packages might manage database connections differently, leading to potential conflicts, connection leaks, or performance issues.
-   **Dependency Conflicts**: Different packages depend on slightly different versions of `better-sqlite3` (`^12.2.0` vs. `^12.4.1`), which `npm` might handle, but it creates complexity and risk of subtle bugs.
-   **Code Duplication**: Logic for connecting to and querying the database may be duplicated across packages instead of being defined once in the `DatabaseService`.
-   **Increased Maintenance Overhead**: Any changes to the database schema, connection logic, or configuration will require updates in multiple packages instead of just one.
-   **Violates Architectural Integrity**: It undermines the clean separation of concerns that the monorepo was designed to achieve, making the codebase harder to understand and evolve.

---

## 5. Proposed Solution

To resolve these issues and align with the monorepo architecture, the following steps should be taken:

### Step 1: Remove Direct Database Dependencies

The `better-sqlite3` and `sqlite3` dependencies must be removed from the `package.json` files of the affected packages.

-   **File to Edit**: `packages/electron-app/package.json`
    -   **Remove**: `"better-sqlite3": "^12.2.0"`
-   **File to Edit**: `packages/scrapers/package.json`
    -   **Remove**: `"better-sqlite3": "^12.4.1"`
    -   **Remove**: `"sqlite3": "^5.1.6"`
-   **File to Edit**: `packages/optimization/package.json`
    -   **Remove**: `"sqlite3": "^5.1.6"`

After editing the files, run `npm install` from the monorepo root to update the `node_modules` and `package-lock.json` files.

### Step 2: Refactor Code to Use Shared Service

The code within each affected package must be refactored to import and use the `DatabaseService` from `@cash-mgmt/shared`.

**Example Refactoring:**

```typescript
// Before (in @cash-mgmt/electron-app, @cash-mgmt/scrapers, or @cash-mgmt/optimization)
import Database from '''better-sqlite3''';
const db = new Database('path/to/db');
// ... custom db logic

// After
import { DatabaseService } from '''@cash-mgmt/shared''';
const dbService = new DatabaseService(); // Or get a shared instance
const db = dbService.getConnection();
// ... use the shared service
```

This will involve:
1.  Identifying all files that import `sqlite3` or `better-sqlite3`.
2.  Replacing the direct database instantiation with an import of `DatabaseService` from `@cash-mgmt/shared`.
3.  Updating the code to use the methods provided by `DatabaseService`.

### Step 3: Verify and Test

After refactoring, a full test suite run is required to ensure that all functionality remains intact.

```bash
# Run tests for all packages
turbo run test
```

Additionally, perform end-to-end testing of the Electron application to confirm that all features that rely on database access are working correctly.

### Step 4: Final Cleanup

Run `npm install` again from the root to ensure all dependency trees are clean and there are no lingering issues.

---

## 6. Next Steps

1.  Review and approve this plan.
2.  Create a feature branch for the refactoring work (`feat/centralize-db-service`).
3.  Execute the proposed solution steps.
4.  Submit a pull request for review.

# better-sqlite3 Electron Compatibility Management

**Version:** 1.0
**Last Updated:** October 12, 2025
**Status:** Active - Resolved with automated solution

---

> **📋 NOTE**: This document is part of a consolidated migration plan.
>
> **For complete migration strategy, see**: [SQLITE-CONSOLIDATION-PLAN.md](./SQLITE-CONSOLIDATION-PLAN.md)
>
> **This document remains VALID** for:
> - ✅ Electron rebuild mechanism (still in use)
> - ✅ Troubleshooting native module issues
> - ✅ Electron upgrade procedures
>
> **Updated**: January 14, 2025

---

## Table of Contents

- [Overview](#overview)
- [The Problem](#the-problem)
- [Root Cause Analysis](#root-cause-analysis)
- [Solution Implemented](#solution-implemented)
- [How It Works](#how-it-works)
- [Future Maintenance](#future-maintenance)
- [Upgrade Recommendations](#upgrade-recommendations)
- [Troubleshooting](#troubleshooting)

## Overview

This document describes the native module version compatibility issue between better-sqlite3, Electron, and system Node.js, along with the automated solution implemented to prevent future occurrences.

### Summary

Native Node.js modules like better-sqlite3 must be compiled for the specific Node.js version they will run on. When the system Node.js version differs from Electron's embedded Node.js version, this creates a MODULE_VERSION mismatch that causes runtime failures.

## The Problem

### Error Symptom

```
Error: The module '/path/to/better-sqlite3/build/Release/better_sqlite3.node'
was compiled against a different Node.js version using NODE_MODULE_VERSION 137.
This version of Node.js requires NODE_MODULE_VERSION 136.
```

### Environment at Time of Issue

| Component | Version | NODE_MODULE_VERSION |
|-----------|---------|---------------------|
| System Node.js | v24.9.0 | 137 |
| Electron | 37.2.6 | 136 (Node.js v22) |
| better-sqlite3 | 12.2.0 / 12.4.1 | Compiled for 137 |

### Impact

- Application failed to start
- Pipeline services could not initialize
- Database operations completely blocked
- This was a **recurring problem** despite previous fix attempts

## Root Cause Analysis

### Why It Happened

1. **npm Install Behavior**
   - When running `npm install`, npm detected system Node.js v24.9.0
   - better-sqlite3 downloaded/used prebuild binaries for Node.js v24 (MODULE_VERSION 137)
   - These binaries were stored in `build/Release/better_sqlite3.node`

2. **Electron's Different Node Version**
   - Electron 37.2.6 embeds Node.js v22 (MODULE_VERSION 136)
   - At runtime, Electron tried to load the v24-compiled binary
   - Node's native module loader rejected the incompatible binary

3. **Monorepo Complexity**
   - better-sqlite3 is hoisted to root `node_modules/` by npm workspaces
   - All packages share the same binary
   - Binary must be compiled for Electron, not system Node

4. **Bindings Module Search Path**
   - better-sqlite3 uses the `bindings` package to locate the native binary
   - The bindings module searches multiple locations in a specific order
   - Our rebuilt binary was in `bin/darwin-arm64-136/` but bindings expected it in `lib/binding/node-v136-darwin-arm64/`

### Previous Failed Attempts

Before the final solution, these approaches were tried:

1. **electron-rebuild** (partial success)
   - Created binary in `bin/darwin-arm64-136/` but wrong location for bindings

2. **.npmrc configuration**
   - Attempted `build_from_source=true` but npm gave "Unknown project config" warnings

3. **Force build from source**
   - Encountered C++20 compiler errors (Electron 37 requires C++20)

## Solution Implemented

### Automated Postinstall Script

Added to `packages/electron-app/package.json`:

```json
{
  "scripts": {
    "postinstall": "cd ../.. && npx electron-rebuild -f -w better-sqlite3 && mkdir -p node_modules/better-sqlite3/lib/binding/node-v136-darwin-arm64 && ln -sf ../../../../../bin/darwin-arm64-136/better-sqlite3.node node_modules/better-sqlite3/lib/binding/node-v136-darwin-arm64/better_sqlite3.node"
  }
}
```

### Dependencies Added

**Root `package.json`:**
```json
{
  "devDependencies": {
    "@electron/rebuild": "^4.0.1"
  },
  "dependencies": {
    "better-sqlite3": "^12.4.1"
  }
}
```

### Documentation Added

Created `.npmrc` in project root with documentation:
```
# Better-sqlite3 configuration for Electron compatibility
# Run `npx @electron/rebuild` after npm install to rebuild for Electron
```

## How It Works

### Postinstall Process

When you run `npm install` in the electron-app package:

1. **npm installs dependencies**
   - Installs better-sqlite3 with system Node.js prebuild

2. **Postinstall script executes**
   - Changes to project root (`cd ../..`)
   - Runs `@electron/rebuild` to recompile better-sqlite3 for Electron
   - Creates correct binding directory structure
   - Creates symlink from bindings expected location to rebuild output

3. **Result**
   - better-sqlite3 binary is now compatible with Electron's Node.js version
   - Binary is located where the bindings module expects it
   - Application starts successfully

### File Locations

After successful postinstall:

```
node_modules/better-sqlite3/
├── bin/
│   └── darwin-arm64-136/
│       └── better-sqlite3.node          # Rebuilt binary (MODULE_VERSION 136)
└── lib/
    └── binding/
        └── node-v136-darwin-arm64/
            └── better_sqlite3.node       # Symlink to above
```

## Future Maintenance

### Regular npm Operations

The postinstall script runs automatically during:
- `npm install`
- `npm install <package>`
- `npm update`

**No manual intervention required** for routine dependency updates.

### When to Check

Verify the solution is working after:

1. **Node.js System Updates**
   - If you upgrade system Node.js to a new major version
   - Check: Run `npm start` and verify no MODULE_VERSION errors

2. **Electron Upgrades** (see next section)
   - When upgrading Electron to a new version
   - Check: Verify NODE_MODULE_VERSION in error messages or logs

3. **better-sqlite3 Upgrades**
   - When updating better-sqlite3 to a new version
   - Check: Run `npm start` and verify database operations work

### Verification Command

After any upgrade:
```bash
cd packages/electron-app
npm start
```

Look for:
```
✅ Database initialized: cash_savings.db
✅ FRN lookup cache rebuilt: XXX entries
```

## Upgrade Recommendations

### Electron 39 (Expected Release: ~October 2025)

Electron 39 is expected to release in approximately 2 weeks with Node.js v23.

#### Pre-Upgrade Checklist

Before upgrading to Electron 39:

1. **Check Electron 39 Release Notes**
   ```
   https://www.electronjs.org/blog/electron-39-0
   ```
   - Note the embedded Node.js version
   - Note the NODE_MODULE_VERSION
   - Check for breaking changes

2. **Verify better-sqlite3 Compatibility**
   - Check better-sqlite3 GitHub releases
   - Verify support for Electron 39's Node.js version
   - Check for prebuilt binaries availability

3. **Update Postinstall Script if Needed**
   - The current script uses `node-v136-darwin-arm64` (Electron 37)
   - If Electron 39 uses different NODE_MODULE_VERSION, update the directory name
   - Example for Node v23 (MODULE_VERSION 138):
     ```json
     "postinstall": "cd ../.. && npx electron-rebuild -f -w better-sqlite3 && mkdir -p node_modules/better-sqlite3/lib/binding/node-v138-darwin-arm64 && ln -sf ../../../../../bin/darwin-arm64-138/better-sqlite3.node node_modules/better-sqlite3/lib/binding/node-v138-darwin-arm64/better_sqlite3.node"
     ```

#### Upgrade Process

```bash
# 1. Update Electron version
cd packages/electron-app
npm install electron@39 --save-dev

# 2. Test the postinstall script
npm run postinstall

# 3. Verify binary location
ls -lh ../../node_modules/better-sqlite3/bin/
ls -lh ../../node_modules/better-sqlite3/lib/binding/

# 4. Test application
npm start

# 5. Check for errors
# Look for MODULE_VERSION errors or "Could not locate bindings file"

# 6. If successful, commit changes
git add package.json package-lock.json
git commit -m "chore: upgrade Electron to version 39"
```

### Node.js Version Compatibility Matrix

| Electron Version | Node.js Version | NODE_MODULE_VERSION | Status |
|------------------|-----------------|---------------------|--------|
| 37.x | 22.x | 136 | Current ✅ |
| 38.x | 22.x | 136 | Compatible |
| 39.x (upcoming) | 23.x (expected) | 138 (expected) | Requires testing |

### General Upgrade Guidelines

1. **Always upgrade Electron in a separate commit**
   - Easier to revert if issues occur
   - Clear change history

2. **Test native modules first**
   - better-sqlite3 is critical for the application
   - Test database operations thoroughly
   - Verify FRN cache rebuild works

3. **Check for API changes**
   - Review Electron breaking changes
   - Update deprecated API usage
   - Test IPC handlers

4. **Monitor performance**
   - Node.js v23 may have performance improvements
   - Benchmark critical operations if needed

## Troubleshooting

### Common Issues and Solutions

#### Issue: "Could not locate the bindings file"

**Symptoms:**
```
Error: Could not locate the bindings file. Tried:
 → /path/to/better-sqlite3/lib/binding/node-v136-darwin-arm64/better_sqlite3.node
```

**Solutions:**

1. **Run postinstall manually:**
   ```bash
   cd packages/electron-app
   npm run postinstall
   ```

2. **Verify symlink exists:**
   ```bash
   ls -lh ../../node_modules/better-sqlite3/lib/binding/node-v136-darwin-arm64/
   ```

3. **Rebuild from scratch:**
   ```bash
   rm -rf ../../node_modules/better-sqlite3/build
   rm -rf ../../node_modules/better-sqlite3/bin
   rm -rf ../../node_modules/better-sqlite3/lib/binding
   npm run postinstall
   ```

#### Issue: "MODULE_VERSION mismatch"

**Symptoms:**
```
was compiled against a different Node.js version using NODE_MODULE_VERSION 137.
This version of Node.js requires NODE_MODULE_VERSION 136.
```

**Solutions:**

1. **Check Electron version:**
   ```bash
   npm list electron
   ```

2. **Verify system Node version:**
   ```bash
   node --version
   ```

3. **Force rebuild:**
   ```bash
   cd packages/electron-app
   cd ../..
   npx @electron/rebuild -f -w better-sqlite3
   ```

4. **Check postinstall ran:**
   ```bash
   # Should show recent timestamp
   ls -lh node_modules/better-sqlite3/bin/darwin-arm64-136/better-sqlite3.node
   ```

#### Issue: Postinstall script fails silently

**Symptoms:**
- No error during npm install
- App fails to start with bindings error

**Solutions:**

1. **Run with verbose logging:**
   ```bash
   cd packages/electron-app
   npm install --verbose
   ```

2. **Check for @electron/rebuild:**
   ```bash
   cd ../..
   npm list @electron/rebuild
   ```

3. **Run postinstall with debugging:**
   ```bash
   cd packages/electron-app
   npm run postinstall 2>&1 | tee postinstall.log
   ```

#### Issue: Different platforms (Windows/Linux)

**Current solution is macOS-specific.** For cross-platform support:

**Windows:**
```json
"postinstall": "cd ..\\..\\ && npx electron-rebuild -f -w better-sqlite3 && mkdir node_modules\\better-sqlite3\\lib\\binding\\node-v136-win32-x64 2>nul & mklink node_modules\\better-sqlite3\\lib\\binding\\node-v136-win32-x64\\better_sqlite3.node ..\\..\\..\\..\\..\\bin\\win32-x64-136\\better-sqlite3.node"
```

**Linux:**
```json
"postinstall": "cd ../.. && npx electron-rebuild -f -w better-sqlite3 && mkdir -p node_modules/better-sqlite3/lib/binding/node-v136-linux-x64 && ln -sf ../../../../../bin/linux-x64-136/better-sqlite3.node node_modules/better-sqlite3/lib/binding/node-v136-linux-x64/better_sqlite3.node"
```

**Cross-platform script** (recommended for multi-platform projects):

Create `scripts/postinstall.js`:
```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const platform = os.platform();
const arch = os.arch();
const nodeVersion = 'v136'; // Update based on Electron version

let bindingPath, binaryName;
if (platform === 'darwin') {
  bindingPath = `node-${nodeVersion}-darwin-${arch}`;
  binaryName = `darwin-${arch}-136`;
} else if (platform === 'win32') {
  bindingPath = `node-${nodeVersion}-win32-${arch}`;
  binaryName = `win32-${arch}-136`;
} else if (platform === 'linux') {
  bindingPath = `node-${nodeVersion}-linux-${arch}`;
  binaryName = `linux-${arch}-136`;
}

// Run electron-rebuild
execSync('npx electron-rebuild -f -w better-sqlite3', { stdio: 'inherit' });

// Create binding directory
const bindingDir = path.join('node_modules', 'better-sqlite3', 'lib', 'binding', bindingPath);
fs.mkdirSync(bindingDir, { recursive: true });

// Create symlink
const target = path.join('..', '..', '..', '..', '..', 'bin', binaryName, 'better-sqlite3.node');
const link = path.join(bindingDir, 'better_sqlite3.node');
if (fs.existsSync(link)) fs.unlinkSync(link);
fs.symlinkSync(target, link);
```

Then update package.json:
```json
"postinstall": "node ../../scripts/postinstall.js"
```

### Diagnostic Commands

```bash
# Check NODE_MODULE_VERSION for current Electron
cd packages/electron-app
npx electron -e "console.log(process.versions)"

# List all better-sqlite3 binaries
find ../../node_modules/better-sqlite3 -name "*.node" -type f -o -type l

# Check symlink target
readlink ../../node_modules/better-sqlite3/lib/binding/node-v136-darwin-arm64/better_sqlite3.node

# Verify binary architecture
file ../../node_modules/better-sqlite3/bin/darwin-arm64-136/better-sqlite3.node
```

## Related Documentation

- [Electron Native Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3)
- [@electron/rebuild](https://github.com/electron/rebuild)
- [Node.js ABI Version Registry](https://github.com/nodejs/node/blob/main/doc/abi_version_registry.json)

## Commit History

- `b09b49b` - fix: resolve better-sqlite3 Electron compatibility and TypeScript incremental build issues (2025-10-12)

## Questions or Issues?

If you encounter issues not covered in this document:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review Electron release notes for your version
3. Check better-sqlite3 GitHub issues
4. Verify NODE_MODULE_VERSION matches between Electron and compiled binary

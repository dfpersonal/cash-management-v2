# FRN Cache Rebuild Strategy & Normalization UI Implementation

**Document Version:** 1.0
**Date:** 2025-10-12
**Status:** Ready for Implementation
**Estimated Effort:** 4-6 hours

---

## Executive Summary

This document outlines a comprehensive solution to address two critical issues in the FRN (Financial Regulation Number) matching system:

1. **Cache Staleness Problem**: The current FRN lookup cache uses version hash checking that only detects normalization config changes, missing changes to source tables (frn_manual_overrides, boe_institutions, boe_shared_brands). This can lead to stale cache data and incorrect FRN matches.

2. **Missing UI for Normalization Rules**: There is no user interface for managing FRN bank name normalization rules (prefixes, suffixes, abbreviations), requiring direct database manipulation.

### Solution Approach

**Phase 1**: Simplify startup cache rebuild by removing fragile version checking and always rebuilding the cache (50-200ms overhead acceptable for desktop app).

**Phase 2**: Add runtime cache invalidation hooks to IPC handlers so UI changes trigger immediate cache rebuilds.

**Phase 3-5**: Build complete UI for managing normalization rules with automatic cache rebuild on save.

---

## Background

### What is the FRN Lookup Cache?

The FRN lookup cache (`frn_lookup_helper_cache` table) is a performance optimization that pre-computes all possible name variations for banks based on normalization rules. This allows fast exact matches during the pipeline instead of expensive fuzzy matching operations.

**Cache Generation Process:**
1. Read normalization config (prefixes, suffixes, abbreviations)
2. For each source record (manual overrides, BOE institutions, shared brands):
   - Generate all name variations by applying/removing prefixes and suffixes
   - Optionally expand abbreviations
   - Store each variation with priority ranking
3. Rank entries by confidence (manual overrides = highest priority)

**Why Cache Matters:**
- Without cache: ~500-1000ms per pipeline run (fuzzy matching for every bank)
- With cache: ~50-100ms per pipeline run (exact lookups)
- Cache must be accurate or FRN matches will be wrong

### Current Implementation Issues

#### Issue 1: Version Checking Only Detects Config Changes

**Code Location:** `FRNMatchingService.ts:862-874`

```typescript
private hasNormalizationConfigChanged(): boolean {
  try {
    const currentVersion = this.computeConfigVersion();
    const storedVersion = this.db.prepare(
      'SELECT config_value FROM unified_config WHERE config_key = ?'
    ).get('frn_lookup_cache_version') as { config_value: string } | undefined;

    return currentVersion !== storedVersion?.config_value;
  } catch (error) {
    return true;
  }
}
```

**Problem:** This only checks if normalization rules (prefixes, suffixes, abbreviations) changed via SHA-256 hash comparison. It does NOT detect:
- New manual overrides added via UI
- Updated BOE institution data
- New shared brand mappings
- Direct database modifications

**Result:** Cache becomes stale when source data changes, leading to incorrect FRN matches until app restart.

#### Issue 2: Two Code Paths for FRN Overrides

**UI Path (main.ts:929-954):**
```typescript
ipcMain.handle('frn:create-override', async (_, override: any) => {
  try {
    return await this.databaseService?.createFRNOverride(override);
  } catch (error) {
    console.error('Error creating FRN override:', error);
    throw error;
  }
});
```
→ Calls `DatabaseService.createFRNOverride()` → **NO cache rebuild**

**Pipeline Path (FRNMatchingService.ts:1131-1156):**
```typescript
async addManualOverride(
  scrapedName: string,
  frn: string,
  firmName?: string,
  confidenceScore: number = 1.0,
  notes?: string
): Promise<void> {
  // ... insert override ...

  // Rebuild cache to include the new override
  await this.rebuildLookupHelperCache();
}
```
→ **DOES rebuild cache**

**Problem:** UI changes leave cache stale until restart, while programmatic changes rebuild immediately.

#### Issue 3: No UI for Normalization Rules

**Current State:** The Configuration page (`Configuration.tsx`) includes UI for:
- ✅ Strategic allocation targets
- ✅ Risk tolerance settings
- ✅ Report settings
- ✅ Audit configuration
- ✅ Balance checking settings
- ❌ **FRN normalization rules** (missing)

Users cannot edit prefixes, suffixes, or abbreviations without direct database access.

---

## Current State Analysis

### Critical Code Paths

#### 1. Startup Initialization

**File:** `main.ts` (CashManagementApp.initialize())

```typescript
// OrchestrationService initializes FRNMatchingService
this.orchestrationService = new OrchestrationService(this.db);
await this.orchestrationService.initialize();
```

**File:** `OrchestrationService.ts`

```typescript
this.frnMatchingService = new FRNMatchingService(this.db);
await this.frnMatchingService.loadConfiguration();
```

**File:** `FRNMatchingService.ts:151-188`

```typescript
async loadConfiguration(): Promise<void> {
  // Load config from unified_config table
  // ...

  // Rebuild lookup helper cache if normalization config changed
  if (this.hasNormalizationConfigChanged()) {
    this.logger.info('   Normalization config changed, rebuilding FRN lookup cache...');
    await this.rebuildLookupHelperCache();
  } else {
    this.logger.info('   ✅ FRN lookup cache up to date');
  }
}
```

**Current Behavior:**
- Cache only rebuilds if normalization config hash changed
- Cache does NOT rebuild if source tables changed
- No console output when cache is up to date (user can't verify it ran)

#### 2. UI FRN Override Operations

**File:** `main.ts:929-954`

Three IPC handlers:
- `frn:create-override` → `DatabaseService.createFRNOverride()`
- `frn:update-override` → `DatabaseService.updateFRNOverride()`
- `frn:delete-override` → `DatabaseService.deleteFRNOverride()`

**File:** `DatabaseService.ts:3570-3594` (example: createFRNOverride)

```typescript
async createFRNOverride(override: {
  scraped_name: string;
  frn: string;
  firm_name: string;
  confidence_score?: number;
  notes?: string;
}): Promise<number> {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO frn_manual_overrides (scraped_name, frn, firm_name, confidence_score, notes)
      VALUES (?, ?, ?, ?, ?)
    `;

    this.db.run(query, [...], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
}
```

**Current Behavior:**
- Override is written to database
- **NO cache rebuild triggered**
- Cache is stale until next app restart
- Users see incorrect FRN matches until restart

#### 3. Configuration Management

**File:** `main.ts:360-365` (get-configuration handler)

```typescript
ipcMain.handle('get-configuration', async () => {
  try {
    return await this.databaseService?.getConfiguration();
  } catch (error) {
    console.error('Error fetching configuration:', error);
    throw error;
  }
});
```

**File:** `DatabaseService.ts:754-838` (getConfiguration method)

```typescript
async getConfiguration(): Promise<Configuration> {
  // Query unified_config for fscs_limit, concentration_threshold, minimum_liquidity
  // Returns portfolio management config only
  // Does NOT return FRN normalization rules
}
```

**Current Behavior:**
- Only loads portfolio management config
- FRN normalization config not exposed to UI
- No way to edit normalization rules via UI

---

## Proposed Solution

### Design Principles

1. **Simplicity over Complexity**: Always rebuild cache at startup (~50-200ms) rather than maintain fragile version tracking
2. **Immediate Consistency**: UI changes trigger immediate cache rebuild for instant feedback
3. **User Transparency**: Console logging shows cache rebuild activity for admin visibility
4. **Non-Blocking Errors**: Cache rebuild failures logged but don't block user operations
5. **Desktop App Context**: Startup happens once per session, rebuild cost is negligible

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Startup Flow                          │
├─────────────────────────────────────────────────────────────┤
│  main.ts                                                     │
│    └─> Initialize FRNMatchingService                        │
│          └─> loadConfiguration()                            │
│                └─> ALWAYS rebuildLookupHelperCache()        │
│                      (50-200ms, guaranteed fresh)           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Runtime Flow                            │
├─────────────────────────────────────────────────────────────┤
│  UI Action → IPC Handler → DatabaseService → Success        │
│                                                ↓             │
│                              FRNMatchingService.rebuild()    │
│                                    (immediate cache update)  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   New Normalization UI                       │
├─────────────────────────────────────────────────────────────┤
│  Configuration Page                                          │
│    └─> FRNNormalizationSettings Component                  │
│          ├─> Load via getFRNNormalizationConfig()          │
│          ├─> Edit prefixes/suffixes/abbreviations          │
│          └─> Save via updateFRNNormalizationConfig()       │
│                └─> Auto rebuild cache on save              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Simplify Startup Cache Rebuild

**Objective:** Remove version checking and always rebuild cache at startup.

**Files to Modify:**
- `packages/pipeline/src/services/FRNMatchingService.ts`

#### Changes to FRNMatchingService.ts

**1. Remove hasNormalizationConfigChanged() method (lines 862-874)**

DELETE this entire method:
```typescript
private hasNormalizationConfigChanged(): boolean {
  try {
    const currentVersion = this.computeConfigVersion();
    const storedVersion = this.db.prepare(
      'SELECT config_value FROM unified_config WHERE config_key = ?'
    ).get('frn_lookup_cache_version') as { config_value: string } | undefined;

    return currentVersion !== storedVersion?.config_value;
  } catch (error) {
    return true;
  }
}
```

**2. Remove computeConfigVersion() method (lines 879-888)**

DELETE this entire method:
```typescript
private computeConfigVersion(): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256')
    .update(JSON.stringify({
      prefixes: this.config.normalizationPrefixes,
      suffixes: this.config.normalizationSuffixes,
      abbreviations: this.config.normalizationAbbreviations
    }))
    .digest('hex');
}
```

**3. Remove saveCacheConfigVersion() method (lines 893-909)**

DELETE this entire method:
```typescript
private saveCacheConfigVersion(): void {
  const version = this.computeConfigVersion();
  const existing = this.db.prepare(
    'SELECT config_key FROM unified_config WHERE config_key = ?'
  ).get('frn_lookup_cache_version');

  if (existing) {
    this.db.prepare(
      'UPDATE unified_config SET config_value = ? WHERE config_key = ?'
    ).run(version, 'frn_lookup_cache_version');
  } else {
    this.db.prepare(`
      INSERT INTO unified_config (config_key, config_value, config_type, category, is_active)
      VALUES (?, ?, 'string', 'frn_matching', 1)
    `).run('frn_lookup_cache_version', version);
  }
}
```

**4. Update loadConfiguration() method (lines 182-188)**

REPLACE:
```typescript
// Rebuild lookup helper cache if normalization config changed
if (this.hasNormalizationConfigChanged()) {
  this.logger.info('   Normalization config changed, rebuilding FRN lookup cache...');
  await this.rebuildLookupHelperCache();
} else {
  this.logger.info('   ✅ FRN lookup cache up to date');
}
```

WITH:
```typescript
// Always rebuild lookup helper cache at startup to ensure freshness
this.logger.info('   Rebuilding FRN lookup cache...');
await this.rebuildLookupHelperCache();
```

**5. Update rebuildLookupHelperCache() method (lines 915-941)**

REMOVE the call to saveCacheConfigVersion():

REPLACE:
```typescript
// Rank entries by priority
this.rankCacheEntries();

// Store config version
this.saveCacheConfigVersion();

const count = this.db.prepare('SELECT COUNT(*) as count FROM frn_lookup_helper_cache').get() as { count: number };
```

WITH:
```typescript
// Rank entries by priority
this.rankCacheEntries();

const count = this.db.prepare('SELECT COUNT(*) as count FROM frn_lookup_helper_cache').get() as { count: number };
```

**Result:**
- Cache rebuilds unconditionally at every startup
- No version tracking overhead
- Simpler, more maintainable code
- Guaranteed cache freshness

---

### Phase 2: Runtime Cache Invalidation (Backend)

**Objective:** Store FRNMatchingService instance in main process and trigger cache rebuilds when UI modifies FRN data.

**Files to Modify:**
- `packages/electron-app/src/main/main.ts`

#### 2A. Store FRNMatchingService Instance

**File:** `main.ts`

**1. Add import at top of file (after existing imports):**

```typescript
import { FRNMatchingService } from '@cash-mgmt/pipeline/src/services/FRNMatchingService';
```

**2. Add property to CashManagementApp class (around line 40-50 with other properties):**

```typescript
private frnMatchingService: FRNMatchingService | null = null;
```

**3. Initialize in initialize() method (after OrchestrationService init, around line 150-160):**

FIND:
```typescript
// Initialize orchestration service
this.orchestrationService = new OrchestrationService(this.db);
await this.orchestrationService.initialize();
```

ADD AFTER:
```typescript
// Initialize FRN Matching Service for runtime cache management
console.log('   Initializing FRN Matching Service for cache management...');
this.frnMatchingService = new FRNMatchingService(this.db);
await this.frnMatchingService.loadConfiguration();
console.log('   ✅ FRN Matching Service ready');
```

**4. Cleanup in shutdown (in the main cleanup section, around line 250-260):**

FIND cleanup section, ADD:
```typescript
// Cleanup FRN Matching Service
if (this.frnMatchingService) {
  this.frnMatchingService = null;
}
```

#### 2B. Add Cache Rebuild to FRN Override Handlers

**File:** `main.ts` (lines 929-954)

**Update all three handlers:**

**1. frn:create-override handler:**

REPLACE:
```typescript
ipcMain.handle('frn:create-override', async (_, override: any) => {
  try {
    return await this.databaseService?.createFRNOverride(override);
  } catch (error) {
    console.error('Error creating FRN override:', error);
    throw error;
  }
});
```

WITH:
```typescript
ipcMain.handle('frn:create-override', async (_, override: any) => {
  try {
    const result = await this.databaseService?.createFRNOverride(override);

    // Rebuild cache after successful creation
    if (this.frnMatchingService) {
      try {
        console.log('[FRN Cache] Rebuilding due to manual override creation...');
        await this.frnMatchingService.rebuildLookupHelperCache();
      } catch (cacheError) {
        // Log but don't throw - cache will be rebuilt on next startup
        console.error('[FRN Cache] Failed to rebuild cache:', cacheError);
      }
    }

    return result;
  } catch (error) {
    console.error('Error creating FRN override:', error);
    throw error;
  }
});
```

**2. frn:update-override handler:**

REPLACE:
```typescript
ipcMain.handle('frn:update-override', async (_, id: number, updates: any) => {
  try {
    return await this.databaseService?.updateFRNOverride(id, updates);
  } catch (error) {
    console.error('Error updating FRN override:', error);
    throw error;
  }
});
```

WITH:
```typescript
ipcMain.handle('frn:update-override', async (_, id: number, updates: any) => {
  try {
    const result = await this.databaseService?.updateFRNOverride(id, updates);

    // Rebuild cache after successful update
    if (this.frnMatchingService) {
      try {
        console.log('[FRN Cache] Rebuilding due to manual override update...');
        await this.frnMatchingService.rebuildLookupHelperCache();
      } catch (cacheError) {
        console.error('[FRN Cache] Failed to rebuild cache:', cacheError);
      }
    }

    return result;
  } catch (error) {
    console.error('Error updating FRN override:', error);
    throw error;
  }
});
```

**3. frn:delete-override handler:**

REPLACE:
```typescript
ipcMain.handle('frn:delete-override', async (_, id: number) => {
  try {
    return await this.databaseService?.deleteFRNOverride(id);
  } catch (error) {
    console.error('Error deleting FRN override:', error);
    throw error;
  }
});
```

WITH:
```typescript
ipcMain.handle('frn:delete-override', async (_, id: number) => {
  try {
    const result = await this.databaseService?.deleteFRNOverride(id);

    // Rebuild cache after successful deletion
    if (this.frnMatchingService) {
      try {
        console.log('[FRN Cache] Rebuilding due to manual override deletion...');
        await this.frnMatchingService.rebuildLookupHelperCache();
      } catch (cacheError) {
        console.error('[FRN Cache] Failed to rebuild cache:', cacheError);
      }
    }

    return result;
  } catch (error) {
    console.error('Error deleting FRN override:', error);
    throw error;
  }
});
```

**Result:**
- UI changes to FRN overrides trigger immediate cache rebuild
- Console logging shows cache rebuild activity
- Cache errors logged but don't block user operations
- Cache guaranteed fresh after successful UI operations

---

### Phase 3: Database Service Methods

**Objective:** Add methods to DatabaseService for loading and updating FRN normalization configuration.

**Files to Modify:**
- `packages/shared/src/services/DatabaseService.ts`

#### Add Two New Methods

**Location:** Add near other configuration methods (around line 840-900)

**1. getFRNNormalizationConfig() method:**

```typescript
/**
 * Get FRN normalization configuration from unified_config
 */
async getFRNNormalizationConfig(): Promise<{
  prefixes: string[];
  suffixes: string[];
  abbreviations: Record<string, string>;
}> {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT config_key, config_value
      FROM unified_config
      WHERE config_key IN (
        'frn_matching_normalization_prefixes',
        'frn_matching_normalization_suffixes',
        'frn_matching_normalization_abbreviations'
      )
      AND is_active = 1
    `;

    this.db.all(query, (err, rows: any[]) => {
      if (err) {
        console.error('Error fetching FRN normalization config:', err);
        reject(err);
        return;
      }

      // Default values in case database is missing entries
      const config = {
        prefixes: [] as string[],
        suffixes: [] as string[],
        abbreviations: {} as Record<string, string>
      };

      for (const row of rows) {
        try {
          const value = JSON.parse(row.config_value);
          if (row.config_key === 'frn_matching_normalization_prefixes') {
            config.prefixes = value;
          } else if (row.config_key === 'frn_matching_normalization_suffixes') {
            config.suffixes = value;
          } else if (row.config_key === 'frn_matching_normalization_abbreviations') {
            config.abbreviations = value;
          }
        } catch (parseError) {
          console.error(`Failed to parse ${row.config_key}:`, parseError);
          // Continue with defaults for this key
        }
      }

      resolve(config);
    });
  });
}
```

**2. updateFRNNormalizationConfig() method:**

```typescript
/**
 * Update FRN normalization configuration in unified_config
 */
async updateFRNNormalizationConfig(config: {
  prefixes?: string[];
  suffixes?: string[];
  abbreviations?: Record<string, string>;
}): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const updates: { key: string; value: string }[] = [];

    if (config.prefixes !== undefined) {
      updates.push({
        key: 'frn_matching_normalization_prefixes',
        value: JSON.stringify(config.prefixes)
      });
    }

    if (config.suffixes !== undefined) {
      updates.push({
        key: 'frn_matching_normalization_suffixes',
        value: JSON.stringify(config.suffixes)
      });
    }

    if (config.abbreviations !== undefined) {
      updates.push({
        key: 'frn_matching_normalization_abbreviations',
        value: JSON.stringify(config.abbreviations)
      });
    }

    if (updates.length === 0) {
      resolve(true);
      return;
    }

    const db = this.db;

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      let completed = 0;
      let hasError = false;

      updates.forEach(({ key, value }) => {
        db.run(
          `UPDATE unified_config SET config_value = ?, updated_at = datetime('now') WHERE config_key = ?`,
          [value, key],
          (err) => {
            completed++;
            if (err) {
              hasError = true;
              console.error(`Failed to update ${key}:`, err);
            }

            if (completed === updates.length) {
              db.run(hasError ? 'ROLLBACK' : 'COMMIT', (commitErr) => {
                if (commitErr || hasError) {
                  reject(commitErr || new Error('FRN normalization config update failed'));
                } else {
                  console.log(`✅ Updated ${updates.length} FRN normalization config parameter(s)`);
                  resolve(true);
                }
              });
            }
          }
        );
      });
    });
  });
}
```

**Result:**
- DatabaseService can read/write FRN normalization config
- JSON arrays and objects properly serialized/deserialized
- Transaction-based updates for data consistency
- Error handling with rollback on failure

---

### Phase 4: IPC Handlers & Preload API

**Objective:** Expose FRN normalization config to renderer process via IPC.

**Files to Modify:**
- `packages/electron-app/src/main/main.ts`
- `packages/electron-app/src/main/preload.ts`

#### 4A. Add IPC Handlers

**File:** `main.ts`

**Location:** Add near other config handlers (after `update-configuration` handler, around line 420-430)

**1. get-frn-normalization-config handler:**

```typescript
ipcMain.handle('get-frn-normalization-config', async () => {
  try {
    return await this.databaseService?.getFRNNormalizationConfig();
  } catch (error) {
    console.error('Error getting FRN normalization config:', error);
    throw error;
  }
});
```

**2. update-frn-normalization-config handler:**

```typescript
ipcMain.handle('update-frn-normalization-config', async (_, config: any) => {
  try {
    const result = await this.databaseService?.updateFRNNormalizationConfig(config);

    // Rebuild cache after normalization config changes
    if (this.frnMatchingService) {
      try {
        console.log('[FRN Cache] Rebuilding due to normalization config change...');
        await this.frnMatchingService.rebuildLookupHelperCache();
      } catch (cacheError) {
        console.error('[FRN Cache] Failed to rebuild cache:', cacheError);
        // Don't throw - config was saved successfully
      }
    }

    return result;
  } catch (error) {
    console.error('Error updating FRN normalization config:', error);
    throw error;
  }
});
```

#### 4B. Update Preload API

**File:** `preload.ts`

**Location:** Add to electronAPI object (in the contextBridge.exposeInMainWorld call, around line 20-80)

FIND the existing API methods, ADD:

```typescript
getFRNNormalizationConfig: () => ipcRenderer.invoke('get-frn-normalization-config'),
updateFRNNormalizationConfig: (config: any) => ipcRenderer.invoke('update-frn-normalization-config', config),
```

**Full context example:**
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing methods ...
  getConfiguration: () => ipcRenderer.invoke('get-configuration'),
  updateConfiguration: (config: any) => ipcRenderer.invoke('update-configuration', config),

  // ADD THESE TWO LINES:
  getFRNNormalizationConfig: () => ipcRenderer.invoke('get-frn-normalization-config'),
  updateFRNNormalizationConfig: (config: any) => ipcRenderer.invoke('update-frn-normalization-config', config),

  // ... more existing methods ...
});
```

**Result:**
- Renderer process can load FRN normalization config
- Renderer process can update config with auto cache rebuild
- Type-safe API calls via preload bridge

---

### Phase 5: UI Component

**Objective:** Create React component for managing FRN normalization rules in the Configuration page.

**Files to Modify:**
- `packages/electron-app/src/renderer/pages/Configuration.tsx`

**Files to Create:**
- `packages/electron-app/src/renderer/components/configuration/FRNNormalizationSettings.tsx`

#### 5A. Create FRNNormalizationSettings Component

**File:** `packages/electron-app/src/renderer/components/configuration/FRNNormalizationSettings.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Chip,
  Box,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

interface FRNNormalizationConfig {
  prefixes: string[];
  suffixes: string[];
  abbreviations: Record<string, string>;
}

export const FRNNormalizationSettings: React.FC = () => {
  const [config, setConfig] = useState<FRNNormalizationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // State for adding items
  const [newPrefix, setNewPrefix] = useState('');
  const [newSuffix, setNewSuffix] = useState('');
  const [abbrDialogOpen, setAbbrDialogOpen] = useState(false);
  const [newAbbr, setNewAbbr] = useState({ key: '', value: '' });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.getFRNNormalizationConfig();
      setConfig(data);
    } catch (err) {
      setError('Failed to load FRN normalization configuration');
      console.error('Load config error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      await window.electronAPI.updateFRNNormalizationConfig(config);

      setSuccess('Configuration saved and FRN lookup cache rebuilt successfully!');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError('Failed to save configuration');
      console.error('Save config error:', err);
    } finally {
      setSaving(false);
    }
  };

  const addPrefix = () => {
    if (newPrefix.trim() && config && !config.prefixes.includes(newPrefix.trim().toUpperCase())) {
      setConfig({
        ...config,
        prefixes: [...config.prefixes, newPrefix.trim().toUpperCase()]
      });
      setNewPrefix('');
    }
  };

  const removePrefix = (prefix: string) => {
    if (config) {
      setConfig({
        ...config,
        prefixes: config.prefixes.filter(p => p !== prefix)
      });
    }
  };

  const addSuffix = () => {
    if (newSuffix.trim() && config && !config.suffixes.includes(newSuffix.trim().toUpperCase())) {
      setConfig({
        ...config,
        suffixes: [...config.suffixes, newSuffix.trim().toUpperCase()]
      });
      setNewSuffix('');
    }
  };

  const removeSuffix = (suffix: string) => {
    if (config) {
      setConfig({
        ...config,
        suffixes: config.suffixes.filter(s => s !== suffix)
      });
    }
  };

  const addAbbreviation = () => {
    if (newAbbr.key.trim() && newAbbr.value.trim() && config) {
      const key = newAbbr.key.trim().toUpperCase();
      const value = newAbbr.value.trim().toUpperCase();

      setConfig({
        ...config,
        abbreviations: { ...config.abbreviations, [key]: value }
      });
      setNewAbbr({ key: '', value: '' });
      setAbbrDialogOpen(false);
    }
  };

  const removeAbbreviation = (key: string) => {
    if (config) {
      const { [key]: _, ...rest } = config.abbreviations;
      setConfig({ ...config, abbreviations: rest });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" py={4}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">Failed to load FRN normalization configuration</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon />
          FRN Bank Name Normalization Rules
        </Typography>

        <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
          Configure how bank names are normalized for FRN matching. The lookup cache rebuilds automatically when you save changes.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Prefixes */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Prefixes to Remove
            </Typography>
            <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
              These terms will be stripped from the start of bank names (e.g., "THE")
            </Typography>

            <Box display="flex" gap={1} mb={2}>
              <TextField
                size="small"
                fullWidth
                placeholder="e.g., THE"
                value={newPrefix}
                onChange={(e) => setNewPrefix(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPrefix();
                  }
                }}
              />
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addPrefix}
                disabled={!newPrefix.trim()}
              >
                Add
              </Button>
            </Box>

            <Box display="flex" flexWrap="wrap" gap={1}>
              {config.prefixes.length === 0 ? (
                <Typography variant="body2" color="textSecondary" fontStyle="italic">
                  No prefixes configured
                </Typography>
              ) : (
                config.prefixes.map((prefix) => (
                  <Chip
                    key={prefix}
                    label={prefix}
                    onDelete={() => removePrefix(prefix)}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                ))
              )}
            </Box>
          </Grid>

          {/* Suffixes */}
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Suffixes to Remove
            </Typography>
            <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
              These terms will be stripped from the end of bank names (e.g., "LIMITED", "PLC")
            </Typography>

            <Box display="flex" gap={1} mb={2}>
              <TextField
                size="small"
                fullWidth
                placeholder="e.g., LIMITED, PLC"
                value={newSuffix}
                onChange={(e) => setNewSuffix(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSuffix();
                  }
                }}
              />
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addSuffix}
                disabled={!newSuffix.trim()}
              >
                Add
              </Button>
            </Box>

            <Box display="flex" flexWrap="wrap" gap={1}>
              {config.suffixes.length === 0 ? (
                <Typography variant="body2" color="textSecondary" fontStyle="italic">
                  No suffixes configured
                </Typography>
              ) : (
                config.suffixes.map((suffix) => (
                  <Chip
                    key={suffix}
                    label={suffix}
                    onDelete={() => removeSuffix(suffix)}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                ))
              )}
            </Box>
          </Grid>

          {/* Abbreviations */}
          <Grid item xs={12}>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Abbreviation Expansions
            </Typography>
            <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 2 }}>
              Abbreviations will be replaced with their full forms during normalization (e.g., "CO" → "COMPANY")
            </Typography>

            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setAbbrDialogOpen(true)}
              sx={{ mb: 2 }}
            >
              Add Abbreviation
            </Button>

            {Object.keys(config.abbreviations).length === 0 ? (
              <Typography variant="body2" color="textSecondary" fontStyle="italic">
                No abbreviations configured
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Abbreviation</strong></TableCell>
                    <TableCell><strong>Expands To</strong></TableCell>
                    <TableCell align="right"><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(config.abbreviations).map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell><strong>{key}</strong></TableCell>
                      <TableCell>{value}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={() => removeAbbreviation(key)}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Grid>
        </Grid>

        <Box display="flex" justifyContent="flex-end" mt={3}>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving & Rebuilding Cache...' : 'Save Configuration'}
          </Button>
        </Box>
      </CardContent>

      {/* Add Abbreviation Dialog */}
      <Dialog
        open={abbrDialogOpen}
        onClose={() => setAbbrDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Abbreviation Expansion</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Abbreviation"
                placeholder="e.g., CO"
                value={newAbbr.key}
                onChange={(e) => setNewAbbr({ ...newAbbr, key: e.target.value })}
                helperText="The short form to find in bank names"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Expands To"
                placeholder="e.g., COMPANY"
                value={newAbbr.value}
                onChange={(e) => setNewAbbr({ ...newAbbr, value: e.target.value })}
                helperText="The full form to use instead"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setAbbrDialogOpen(false);
            setNewAbbr({ key: '', value: '' });
          }}>
            Cancel
          </Button>
          <Button
            onClick={addAbbreviation}
            variant="contained"
            disabled={!newAbbr.key.trim() || !newAbbr.value.trim()}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};
```

#### 5B. Add Component to Configuration Page

**File:** `packages/electron-app/src/renderer/pages/Configuration.tsx`

**1. Add import at top (around line 25-30):**

```typescript
import { FRNNormalizationSettings } from '../components/configuration/FRNNormalizationSettings';
```

**2. Add component to layout (after Balance Checking Configuration card, around line 657):**

FIND:
```tsx
        {/* Balance Checking Configuration */}
        <Grid item xs={12}>
          <Card>
            {/* ... existing balance checking content ... */}
          </Card>
        </Grid>
      </Grid>
```

CHANGE TO:
```tsx
        {/* Balance Checking Configuration */}
        <Grid item xs={12}>
          <Card>
            {/* ... existing balance checking content ... */}
          </Card>
        </Grid>

        {/* FRN Name Normalization Configuration */}
        <Grid item xs={12}>
          <FRNNormalizationSettings />
        </Grid>
      </Grid>
```

**Result:**
- New card appears in Configuration page
- Users can add/remove prefixes, suffixes, abbreviations
- Changes auto-save and rebuild cache
- Visual feedback during save operation

---

## Implementation Checklist

### Phase 1: Startup Cache Rebuild
- [ ] Remove `hasNormalizationConfigChanged()` from FRNMatchingService.ts
- [ ] Remove `computeConfigVersion()` from FRNMatchingService.ts
- [ ] Remove `saveCacheConfigVersion()` from FRNMatchingService.ts
- [ ] Update `loadConfiguration()` to always rebuild cache
- [ ] Remove `saveCacheConfigVersion()` call from `rebuildLookupHelperCache()`
- [ ] Test startup: Verify cache always rebuilds

### Phase 2: Runtime Cache Invalidation
- [ ] Add import for FRNMatchingService in main.ts
- [ ] Add `frnMatchingService` property to CashManagementApp class
- [ ] Initialize FRNMatchingService in main.ts `initialize()` method
- [ ] Add cleanup for FRNMatchingService in shutdown
- [ ] Update `frn:create-override` handler with cache rebuild
- [ ] Update `frn:update-override` handler with cache rebuild
- [ ] Update `frn:delete-override` handler with cache rebuild
- [ ] Test: Create FRN override via UI, verify cache rebuilds
- [ ] Test: Update FRN override via UI, verify cache rebuilds
- [ ] Test: Delete FRN override via UI, verify cache rebuilds

### Phase 3: Database Service Methods
- [ ] Add `getFRNNormalizationConfig()` method to DatabaseService
- [ ] Add `updateFRNNormalizationConfig()` method to DatabaseService
- [ ] Test: Load normalization config from database
- [ ] Test: Update normalization config, verify transaction rollback on error

### Phase 4: IPC Handlers & Preload
- [ ] Add `get-frn-normalization-config` IPC handler in main.ts
- [ ] Add `update-frn-normalization-config` IPC handler in main.ts
- [ ] Add cache rebuild to `update-frn-normalization-config` handler
- [ ] Add `getFRNNormalizationConfig` to preload.ts
- [ ] Add `updateFRNNormalizationConfig` to preload.ts
- [ ] Test: Renderer can load config
- [ ] Test: Renderer can update config

### Phase 5: UI Component
- [ ] Create FRNNormalizationSettings.tsx component
- [ ] Add import to Configuration.tsx
- [ ] Add component to Configuration page grid
- [ ] Test: UI loads existing config on mount
- [ ] Test: Add/remove prefixes works
- [ ] Test: Add/remove suffixes works
- [ ] Test: Add/remove abbreviations works
- [ ] Test: Save triggers cache rebuild
- [ ] Test: Error handling shows alerts
- [ ] Test: Success message appears after save

### Integration Testing
- [ ] Full flow: Add prefix via UI → Save → Verify cache rebuilt
- [ ] Full flow: Add suffix via UI → Save → Verify cache rebuilt
- [ ] Full flow: Add abbreviation via UI → Save → Verify cache rebuilt
- [ ] Full flow: Create FRN override → Verify cache rebuilt
- [ ] Startup test: Restart app → Verify cache rebuilds
- [ ] Console output: Verify all rebuild messages appear
- [ ] Performance test: Measure cache rebuild time (should be <200ms)

---

## Testing Strategy

### Unit Testing

**Phase 1: Startup Rebuild**
```bash
# Start app and check console output
npm run dev

# Expected output:
# [OrchestrationService] ✅ Orchestration Service initialized
#    Rebuilding FRN lookup cache...
#    ✅ FRN lookup cache rebuilt: 1,234 entries (89ms)
```

**Phase 2: Runtime Invalidation**
```bash
# In UI:
# 1. Go to FRN Research Queue
# 2. Add manual override
# 3. Check console

# Expected output:
# [FRN Cache] Rebuilding due to manual override creation...
# [FRN Cache]    ✅ FRN lookup cache rebuilt: 1,235 entries (91ms)
```

**Phase 3-5: Normalization UI**
```bash
# In UI:
# 1. Go to Configuration page
# 2. Scroll to FRN Name Normalization section
# 3. Add prefix "THE"
# 4. Click Save Configuration
# 5. Check console

# Expected output:
# ✅ Updated 1 FRN normalization config parameter(s)
# [FRN Cache] Rebuilding due to normalization config change...
# [FRN Cache]    ✅ FRN lookup cache rebuilt: 1,234 entries (93ms)
```

### Integration Testing

**Test Scenario 1: Prefix Changes Affect Matching**
1. Add prefix "THE" via UI
2. Run pipeline with bank name "THE EXAMPLE BANK"
3. Verify it matches "EXAMPLE BANK" FRN

**Test Scenario 2: Override Changes Take Effect Immediately**
1. Add manual override: "UNKNOWN BANK" → FRN 123456
2. Run pipeline with "UNKNOWN BANK"
3. Verify it matches FRN 123456 (no restart needed)

**Test Scenario 3: Cache Rebuild on Every Startup**
1. Modify source table directly (e.g., add BOE institution)
2. Restart app
3. Run pipeline
4. Verify new institution is matched correctly

### Performance Testing

**Expected Timings:**
- Cache rebuild at startup: 50-200ms
- Cache rebuild after UI change: 50-200ms
- Full pipeline run with cache: 1-3 seconds
- UI save operation: <500ms total

**Performance Test:**
```bash
# Run with timing:
npm run dev

# Measure:
# 1. Time from "Rebuilding FRN lookup cache..." to "✅ FRN lookup cache rebuilt"
# 2. Should be <200ms for typical database size
```

---

## File Reference Index

### Files to Modify

| File Path | Phase | Changes |
|-----------|-------|---------|
| `packages/pipeline/src/services/FRNMatchingService.ts` | 1 | Remove version checking methods, always rebuild cache |
| `packages/electron-app/src/main/main.ts` | 2, 4 | Store FRNMatchingService, add cache rebuilds, add IPC handlers |
| `packages/shared/src/services/DatabaseService.ts` | 3 | Add getFRNNormalizationConfig() and updateFRNNormalizationConfig() |
| `packages/electron-app/src/main/preload.ts` | 4 | Add API methods for FRN config |
| `packages/electron-app/src/renderer/pages/Configuration.tsx` | 5 | Import and add FRNNormalizationSettings component |

### Files to Create

| File Path | Phase | Purpose |
|-----------|-------|---------|
| `packages/electron-app/src/renderer/components/configuration/FRNNormalizationSettings.tsx` | 5 | React component for editing normalization rules |

### Related Files (Context Only)

| File Path | Relevance |
|-----------|-----------|
| `packages/pipeline/src/services/OrchestrationService.ts` | Initializes FRNMatchingService at startup |
| `packages/shared/src/types/index.ts` | May need type updates for new config structure |
| `packages/electron-app/src/types/electron.d.ts` | TypeScript definitions for window.electronAPI |

---

## Database Schema Reference

### Relevant Tables

**unified_config**
```sql
CREATE TABLE unified_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  config_key TEXT NOT NULL UNIQUE,
  config_value TEXT NOT NULL,
  config_type TEXT NOT NULL CHECK(config_type IN ('string', 'number', 'boolean', 'json')),
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**FRN Normalization Config Keys:**
- `frn_matching_normalization_prefixes` (JSON array)
- `frn_matching_normalization_suffixes` (JSON array)
- `frn_matching_normalization_abbreviations` (JSON object)

**frn_lookup_helper_cache**
```sql
CREATE TABLE frn_lookup_helper_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  frn TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  search_name TEXT NOT NULL,
  match_type TEXT NOT NULL,
  confidence_score REAL NOT NULL,
  priority_rank INTEGER NOT NULL,
  match_rank INTEGER,
  source_table TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**frn_manual_overrides**
```sql
CREATE TABLE frn_manual_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scraped_name TEXT NOT NULL UNIQUE,
  frn TEXT NOT NULL,
  firm_name TEXT,
  confidence_score REAL DEFAULT 1.0,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## Future Enhancements

### Potential Improvements

1. **Cache Rebuild Performance**
   - Add progress reporting for large databases
   - Implement incremental cache updates (only rebuild affected entries)
   - Add cache rebuild scheduling (e.g., nightly)

2. **UI Enhancements**
   - Add "Test Normalization" feature (preview how a bank name will be normalized)
   - Show cache statistics (entry count, last rebuild time)
   - Add import/export for normalization rules
   - Validation for duplicate prefixes/suffixes

3. **Error Handling**
   - Add retry logic for failed cache rebuilds
   - Queue cache rebuilds if multiple changes happen rapidly
   - Show notification to user if cache rebuild fails

4. **Monitoring**
   - Track cache hit rates
   - Log cache rebuild frequency
   - Alert if cache rebuild takes too long

5. **Testing**
   - Add automated tests for cache rebuild logic
   - Add integration tests for UI → cache rebuild flow
   - Add performance regression tests

---

## Troubleshooting Guide

### Issue: Cache rebuild takes too long (>500ms)

**Possible Causes:**
- Large number of source records (>10,000 institutions)
- Complex normalization rules generating many variations
- Database performance issues

**Solutions:**
- Review normalization rules - remove unnecessary prefixes/suffixes
- Add database indexes on frn_lookup_helper_cache.search_name
- Consider incremental cache updates instead of full rebuild

### Issue: Cache rebuild fails silently

**Diagnosis:**
```bash
# Check console for error messages
# Look for: "[FRN Cache] Failed to rebuild cache:"
```

**Solutions:**
- Check database connection
- Verify unified_config has FRN normalization entries
- Check FRNMatchingService initialization completed
- Review DatabaseService.getFRNNormalizationConfig() returns valid data

### Issue: UI changes don't take effect

**Diagnosis:**
```bash
# Check console after save:
# Should see: "[FRN Cache] Rebuilding due to normalization config change..."
```

**Solutions:**
- Verify IPC handler is calling rebuildLookupHelperCache()
- Check FRNMatchingService instance is initialized in main.ts
- Verify updateFRNNormalizationConfig() transaction succeeds
- Check for errors in console

### Issue: Prefixes/suffixes not working as expected

**Diagnosis:**
- Test with known bank name
- Check frn_lookup_helper_cache for expected variations
- Review normalization rules in unified_config table

**Solutions:**
- Ensure prefixes/suffixes are uppercase (normalization is case-insensitive)
- Check for trailing spaces in config
- Verify word boundary matching (suffixes use `\b` regex)
- Test normalization with simple names first

---

## Acceptance Criteria

Implementation is complete when:

- [x] Cache rebuilds unconditionally at every app startup
- [x] Console shows "Rebuilding FRN lookup cache..." at startup
- [x] Cache rebuilds immediately when FRN override created/updated/deleted via UI
- [x] Console shows "[FRN Cache] Rebuilding due to..." messages
- [x] Configuration page has "FRN Name Normalization Rules" section
- [x] Users can add/remove prefixes via UI
- [x] Users can add/remove suffixes via UI
- [x] Users can add/remove abbreviations via UI
- [x] Save button triggers cache rebuild with loading indicator
- [x] Success message appears after successful save + rebuild
- [x] Error messages appear if save or rebuild fails
- [x] Cache rebuild completes in <200ms for typical database
- [x] Changes to normalization rules affect subsequent pipeline runs
- [x] No manual restart required for UI changes to take effect

---

## References

### Related Documentation
- [FRN Matching Service Documentation](./frn-matching-service.md)
- [Pipeline Architecture](../pipeline/architecture.md)
- [Configuration Management](./configuration-management.md)

### Code Locations
- FRN Matching Service: `packages/pipeline/src/services/FRNMatchingService.ts`
- Database Service: `packages/shared/src/services/DatabaseService.ts`
- Main Process: `packages/electron-app/src/main/main.ts`
- Configuration UI: `packages/electron-app/src/renderer/pages/Configuration.tsx`

### Related Issues
- Cache staleness when source tables change (this document addresses)
- Missing UI for normalization rules (this document addresses)

---

**Document End**

For questions or clarifications, review the code references in this document or consult the codebase maintainer.

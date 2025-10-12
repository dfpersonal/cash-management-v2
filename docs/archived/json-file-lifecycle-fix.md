# JSON File Lifecycle Fix - Complete Implementation Plan

## Problem Overview

The Electron app's "Run Pipeline" button shows "No JSON files found. Run scrapers first!" even when JSON files exist in `/packages/scrapers/data/`. This occurs due to multiple issues in the file lifecycle:

1. **Discovery Issue**: UI looks in React state instead of filesystem
2. **Timestamp Issue**: Log, raw, and normalized files have different timestamps
3. **Naming Issue**: Mixed case filenames (MoneyFacts vs moneyfacts)
4. **Cleanup Timing**: Files deleted after scraper run instead of after pipeline success

## Current State

### File Naming Examples
```
# Flagstone
flagstone-2025-10-11T05-22-11-874Z.log
Flagstone-raw-2025-10-11T05-24-33-151Z.json
Flagstone-normalized-2025-10-11T05-24-33-151Z.json

# MoneyFacts
moneyfacts-easy-access-2025-10-11T06-23-39-516Z.log
MoneyFacts-easy_access-raw-2025-10-11T06-25-14-634Z.json
MoneyFacts-easy_access-normalized-2025-10-11T06-25-14-634Z.json
```

### Issues
- Log timestamp ≠ JSON timestamp (start time vs completion time)
- Inconsistent casing (flagstone vs Flagstone, moneyfacts vs MoneyFacts)
- Cleanup happens too early (after scraper, before pipeline can use files)
- UI can't find files (looks in state, not filesystem)

## Solution Design

### Target State
```
# All files from same run share timestamp and use lowercase
flagstone-2025-10-11T05-22-11-874Z.log
flagstone-raw-2025-10-11T05-22-11-874Z.json
flagstone-normalized-2025-10-11T05-22-11-874Z.json

moneyfacts-easy_access-2025-10-11T06-23-39-516Z.log
moneyfacts-easy_access-raw-2025-10-11T06-23-39-516Z.json
moneyfacts-easy_access-normalized-2025-10-11T06-23-39-516Z.json
```

### Cleanup Logic (Simplified)
With consistent naming, cleanup becomes trivial string replacement:
```javascript
// From normalized filename, derive others:
'moneyfacts-easy_access-normalized-2025-10-11T06-23-39-516Z.json'
→ 'moneyfacts-easy_access-raw-2025-10-11T06-23-39-516Z.json'  // replace -normalized- with -raw-
→ 'moneyfacts-easy_access-2025-10-11T06-23-39-516Z.log'      // remove -normalized-, change .json to .log
```

## Implementation Plan

### Phase 1: Unified Timestamps & Lowercase Naming

#### 1.1 ScraperBase Modifications
**File**: `/packages/scrapers/src/core/scraper-base.js`

**Change 1 - Constructor (~line 18):**
```javascript
constructor(platform, options = {}) {
  this.platform = platform;
  this.options = options;
  this.outputDir = options.outputDir || `./data`;

  // NEW: Generate single timestamp for entire scraper run
  this.runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // ... rest of constructor
}
```

**Change 2 - Logger Initialization (~line 30):**
```javascript
this.logger = new EnhancedLogger({
  logLevel: options.logLevel || 'info',
  enableFileLogging: options.enableFileLogging !== false,
  logDir: options.logDir || this.outputDir,
  componentName: platform.toLowerCase(), // ← CHANGE: force lowercase
  platformName: this.getPlatformDisplayName(),
  verboseMode: options.verbose || false,
  timestamp: this.runTimestamp // ← NEW: pass shared timestamp
});
```

**Change 3 - saveRawJSON (~line 269):**
```javascript
async saveRawJSON(rawData) {
  if (!this.saveToFiles) return null;

  // CHANGE: Use lowercase platform name and shared timestamp
  const filename = `${this.platform.toLowerCase()}-raw-${this.runTimestamp}.json`;
  const filepath = path.join(this.outputDir, filename);

  // ... rest of method unchanged
}
```

**Change 4 - saveNormalizedJSON (~line 306):**
```javascript
async saveNormalizedJSON(normalizedData) {
  if (!this.saveToFiles) return null;

  // CHANGE: Use lowercase platform name and shared timestamp
  const filename = `${this.platform.toLowerCase()}-normalized-${this.runTimestamp}.json`;
  const filepath = path.join(this.outputDir, filename);

  // ... rest of method unchanged
}
```

#### 1.2 Flagstone Modifications
**File**: `/packages/scrapers/src/scrapers/flagstone.js`

**Change 1 - Constructor (~line 15):**
```javascript
constructor(options = {}) {
  this.options = options;
  this.headless = options.headless !== false;
  this.outputDir = options.outputDir || './data/flagstone';

  // NEW: Generate single timestamp for entire scraper run
  this.runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

  this.logger = new EnhancedLogger({
    componentName: 'flagstone', // already lowercase
    platformName: 'Flagstone',
    logLevel: options.logLevel || 'info',
    enableFileLogging: true,
    logDir: options.logDir || options.outputDir || './data/flagstone',
    verboseMode: options.verbose || false,
    timestamp: this.runTimestamp // ← NEW: pass shared timestamp
  });

  // ... rest of constructor
}
```

**Change 2 - generatePipelineFiles (~line 957):**
```javascript
async generatePipelineFiles(rawData, normalizedData) {
  try {
    // CHANGE: Use shared timestamp and lowercase
    const rawFilename = `flagstone-raw-${this.runTimestamp}.json`;
    const rawFilepath = path.join(this.outputDir, rawFilename);

    const rawOutput = {
      metadata: {
        source: 'flagstone',
        method: 'flagstone-scraper'
      },
      products: rawData
    };

    await fs.promises.writeFile(rawFilepath, JSON.stringify(rawOutput, null, 2));
    this.logger.info(`Raw JSON saved: ${rawFilename} (${rawData.length} records)`);

    // CHANGE: Use shared timestamp and lowercase
    const normalizedFilename = `flagstone-normalized-${this.runTimestamp}.json`;
    const normalizedFilepath = path.join(this.outputDir, normalizedFilename);

    const normalizedOutput = {
      metadata: {
        source: 'flagstone',
        method: 'flagstone-scraper'
      },
      products: normalizedData
    };

    await fs.promises.writeFile(normalizedFilepath, JSON.stringify(normalizedOutput, null, 2));
    this.logger.info(`Normalized JSON saved: ${normalizedFilename} (${normalizedData.length} records)`);

    // ... rest unchanged
  }
}
```

#### 1.3 Logger Timestamp Support
**File**: `/packages/scrapers/src/core/enhanced-logger.js`

**Change 1 - Constructor (~line 26):**
```javascript
constructor(options = {}) {
  this.logLevel = options.logLevel || 'info';
  this.enableFileLogging = options.enableFileLogging !== false;
  this.logDir = options.logDir || './logs';
  this.logFile = null;
  this.componentName = options.componentName || 'scraper';
  this.platformName = options.platformName || null;
  this.verboseMode = options.verboseMode || false;
  this.timestamp = options.timestamp || null; // ← NEW: accept optional timestamp

  if (this.enableFileLogging) {
    this.initializeLogFile();
  }
}
```

**Change 2 - initializeLogFile (~line 42):**
```javascript
initializeLogFile() {
  try {
    // Ensure logs directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // CHANGE: Use provided timestamp or generate new one
    const timestamp = this.timestamp || new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${this.componentName}-${timestamp}.log`;
    this.logFile = path.join(this.logDir, filename);

    // Initialize log file with header
    const header = `=== ${this.componentName.toUpperCase()} LOG STARTED AT ${new Date().toISOString()} ===\n`;
    fs.writeFileSync(this.logFile, header);

  } catch (error) {
    console.error('Failed to initialize log file:', error);
    this.enableFileLogging = false;
  }
}
```

### Phase 2: File Discovery & UI Integration

#### 2.1 Add IPC Handler
**File**: `/packages/electron-app/src/main/ipc-handlers/scraper-handlers.ts` (or create if doesn't exist)

```typescript
import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Get available normalized JSON files from scrapers/data directory
 * Scans all platform subdirectories for normalized JSON files ready for pipeline processing
 */
export function registerScraperFileHandlers(): void {
  ipcMain.handle('scraper:get-available-json-files', async () => {
    const scraperDataDir = path.join(__dirname, '../../../../../scrapers/data');
    const platforms = ['ajbell', 'flagstone', 'hargreaves-lansdown', 'moneyfacts'];
    const normalizedFiles: string[] = [];

    for (const platform of platforms) {
      const platformDir = path.join(scraperDataDir, platform);

      // Skip if directory doesn't exist
      if (!fs.existsSync(platformDir)) {
        console.log(`⚠️ Platform directory not found: ${platformDir}`);
        continue;
      }

      try {
        const files = fs.readdirSync(platformDir);

        // Filter for normalized JSON files only
        files.forEach(file => {
          if (file.includes('-normalized-') &&
              file.endsWith('.json') &&
              file !== 'known-platforms.json') {
            normalizedFiles.push(path.join(platformDir, file));
          }
        });

        console.log(`📁 Found ${files.filter(f => f.includes('-normalized-')).length} normalized files in ${platform}`);
      } catch (error) {
        console.error(`❌ Error reading ${platformDir}:`, error);
      }
    }

    console.log(`✅ Total normalized JSON files available: ${normalizedFiles.length}`);
    return normalizedFiles;
  });
}
```

**Register handler in main process** (e.g., in `main.ts`):
```typescript
import { registerScraperFileHandlers } from './ipc-handlers/scraper-handlers';

// After app initialization
registerScraperFileHandlers();
```

#### 2.2 Update Preload Script
**File**: `/packages/electron-app/src/main/preload.ts`

Add to `electronAPI` object:
```typescript
const electronAPI = {
  // ... existing methods

  // NEW: Get available JSON files from filesystem
  getAvailableJsonFiles: () => ipcRenderer.invoke('scraper:get-available-json-files'),
};
```

#### 2.3 Update Type Definitions
**File**: `/packages/electron-app/src/renderer/global.d.ts`

Add to `ElectronAPI` interface:
```typescript
interface ElectronAPI {
  // ... existing methods

  // NEW: Get available JSON files from filesystem
  getAvailableJsonFiles: () => Promise<string[]>;
}
```

#### 2.4 Update Dashboard Component
**File**: `/packages/electron-app/src/renderer/components/scraper/ScraperDashboard.tsx`

**Replace the handleRunPipeline method (lines 253-300) with:**
```typescript
// Run pipeline with all available JSON files
const handleRunPipeline = async () => {
  setState(prev => ({ ...prev, pipelineRunning: true, pipelineProgress: 'Starting pipeline...', pipelineError: null }));

  try {
    // NEW: Get files from filesystem instead of state
    const jsonFiles = await window.electronAPI.getAvailableJsonFiles();

    if (jsonFiles.length === 0) {
      setState(prev => ({
        ...prev,
        pipelineRunning: false,
        pipelineProgress: null,
        pipelineError: 'No JSON files found. Run scrapers first!'
      }));
      return;
    }

    console.log(`🚀 Running pipeline with ${jsonFiles.length} files`);
    const result = await window.electronAPI.executePipeline(jsonFiles);

    if (!result.success) {
      setState(prev => ({
        ...prev,
        pipelineRunning: false,
        pipelineProgress: null,
        pipelineError: result.error || 'Failed to start pipeline'
      }));
    }
  } catch (error) {
    console.error('Error starting pipeline:', error);
    setState(prev => ({
      ...prev,
      pipelineRunning: false,
      pipelineProgress: null,
      pipelineError: 'Failed to start pipeline'
    }));
  }
};
```

### Phase 3: Cleanup Lifecycle Management

#### 3.1 Disable Premature Cleanup
**File**: `/packages/electron-app/src/main/services/ScraperProcessManager.ts`

**Comment out lines 623-628:**
```typescript
// Clean up JSON files after successful Electron scraper run
// DISABLED: Cleanup now happens after pipeline completion, not after scraper
// This allows files to persist across app sessions and be processed by pipeline
/*
if (success) {
  this.cleanupJsonFiles(scrapingProcess.platform).catch(error => {
    console.warn(`Failed to cleanup JSON files for ${scrapingProcess.platform}:`, error.message);
  });
}
*/
```

#### 3.2 Add Pipeline Cleanup
**File**: `/packages/pipeline/src/services/OrchestrationService.ts`

**Add cleanup call after line 493 (in executeAtomicPipeline):**
```typescript
// Only commit if pipeline was successful
if (pipelineResult.success) {
  this.db.exec('COMMIT');
  console.log('✅ Atomic transaction committed - all data persisted');

  // NEW: Cleanup processed files after successful commit
  if (inputFiles.length > 0) {
    await this.cleanupProcessedFiles(inputFiles);
  }
} else {
  this.db.exec('ROLLBACK');
  console.log('❌ Atomic transaction rolled back - no data persisted');
}
```

**Add cleanup call after line 518 (in executeIncrementalPipeline):**
```typescript
private async executeIncrementalPipeline(
  inputFiles: string[],
  batchId: string,
  auditBatchId: string,
  result: PipelineResult,
  startTime: number,
  options?: PipelineOptions
): Promise<PipelineResult> {
  const pipelineResult = await this.executePipelineStages(inputFiles, batchId, auditBatchId, result, startTime, options);

  // NEW: Cleanup processed files after successful pipeline
  if (pipelineResult.success && inputFiles.length > 0) {
    await this.cleanupProcessedFiles(inputFiles);
  }

  return pipelineResult;
}
```

**Add new cleanup method around line 1386:**
```typescript
/**
 * Clean up processed files after successful pipeline completion
 * Deletes normalized JSON, raw JSON, and matching log files
 *
 * With consistent naming (shared timestamps + lowercase), cleanup is simple:
 * - Raw file: replace '-normalized-' with '-raw-'
 * - Log file: remove '-normalized-' and change extension to '.log'
 */
private async cleanupProcessedFiles(normalizedFiles: string[]): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  let filesDeleted = 0;
  const errors: string[] = [];

  for (const normalizedFile of normalizedFiles) {
    const dir = path.dirname(normalizedFile);
    const basename = path.basename(normalizedFile);

    try {
      // 1. Delete normalized JSON
      await fs.unlink(normalizedFile);
      filesDeleted++;
      console.log(`🗑️ Deleted: ${basename}`);

      // 2. Delete corresponding raw JSON (simple string replacement)
      const rawFile = path.join(dir, basename.replace('-normalized-', '-raw-'));
      try {
        await fs.access(rawFile);
        await fs.unlink(rawFile);
        filesDeleted++;
        console.log(`🗑️ Deleted: ${path.basename(rawFile)}`);
      } catch (error) {
        // Raw file doesn't exist - this is OK, might have been cleaned up already
        console.log(`⚠️ Raw file not found (already deleted?): ${path.basename(rawFile)}`);
      }

      // 3. Delete matching log file (simple string replacement)
      // Example: "moneyfacts-easy_access-normalized-2025-10-11T06-23-39-516Z.json"
      //       -> "moneyfacts-easy_access-2025-10-11T06-23-39-516Z.log"
      const logFile = path.join(dir, basename
        .replace('-normalized-', '-')
        .replace('.json', '.log'));

      try {
        await fs.access(logFile);
        await fs.unlink(logFile);
        filesDeleted++;
        console.log(`🗑️ Deleted: ${path.basename(logFile)}`);
      } catch (error) {
        // Log file doesn't exist - this is OK
        console.log(`⚠️ Log file not found (already deleted?): ${path.basename(logFile)}`);
      }

    } catch (error) {
      const errorMsg = `Failed to cleanup files for ${basename}: ${error}`;
      errors.push(errorMsg);
      console.warn(`⚠️ ${errorMsg}`);
    }
  }

  console.log(`✅ Pipeline cleanup complete: ${filesDeleted} files deleted from ${normalizedFiles.length} pipeline inputs`);

  if (errors.length > 0) {
    console.warn(`⚠️ ${errors.length} cleanup errors occurred (non-fatal)`);
  }
}
```

## Testing Plan

### Test 1: Verify Unified Timestamps
1. Run any scraper (e.g., Flagstone)
2. Check `/packages/scrapers/data/flagstone/`
3. Verify all three files have same timestamp:
   - `flagstone-2025-XX-XXTXX-XX-XX-XXXZ.log`
   - `flagstone-raw-2025-XX-XXTXX-XX-XX-XXXZ.json`
   - `flagstone-normalized-2025-XX-XXTXX-XX-XX-XXXZ.json`

### Test 2: Verify Lowercase Naming
1. Check all generated files use lowercase platform names
2. Verify MoneyFacts variants use underscores: `moneyfacts-easy_access-`

### Test 3: Verify File Discovery
1. Run scrapers
2. Close and reopen Electron app
3. Click "Run Pipeline"
4. Verify it finds the files (no "No JSON files found" error)

### Test 4: Verify Pipeline Cleanup
1. Run scrapers
2. Note the files created in `/packages/scrapers/data/`
3. Run pipeline successfully
4. Verify all three files (log, raw, normalized) are deleted
5. Verify files are NOT deleted if pipeline fails

### Test 5: Verify Cross-Session Persistence
1. Run scrapers
2. Close Electron app
3. Reopen app
4. Click "Run Pipeline"
5. Verify it processes the files from previous session

## Files Modified

### Scrapers Package (3 files)
1. `/packages/scrapers/src/core/scraper-base.js` - 4 changes
2. `/packages/scrapers/src/scrapers/flagstone.js` - 2 changes
3. `/packages/scrapers/src/core/enhanced-logger.js` - 2 changes

### Electron App Package (5 files)
4. `/packages/electron-app/src/main/ipc-handlers/scraper-handlers.ts` - New handler
5. `/packages/electron-app/src/main/preload.ts` - Register handler
6. `/packages/electron-app/src/renderer/global.d.ts` - Add type
7. `/packages/electron-app/src/renderer/components/scraper/ScraperDashboard.tsx` - Use filesystem scan
8. `/packages/electron-app/src/main/services/ScraperProcessManager.ts` - Disable old cleanup

### Pipeline Package (1 file)
9. `/packages/pipeline/src/services/OrchestrationService.ts` - Add pipeline cleanup

**Total: 9 files modified**

## Benefits

1. **Simplified Cleanup**: Consistent naming enables simple string replacement
2. **Cross-Session Support**: Files persist until processed, not tied to UI session
3. **CLI Compatibility**: Works with scrapers run from command line
4. **Proper Lifecycle**: Cleanup happens after successful pipeline, not after scraper
5. **Better Debugging**: All files from same run clearly identifiable by shared timestamp
6. **Maintainable**: Simple, consistent patterns across all scrapers

## Rollback Plan

If issues arise, rollback steps:
1. Restore commented-out cleanup code in `ScraperProcessManager.ts:623-628`
2. Remove `cleanupProcessedFiles()` calls from `OrchestrationService.ts`
3. Revert scraper filename changes (though new files will accumulate)

The changes are largely additive and isolated, making rollback straightforward.

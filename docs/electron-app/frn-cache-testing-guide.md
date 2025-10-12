# FRN Cache Rebuild & Normalization UI - Testing Guide

**Document Version:** 1.0
**Date:** 2025-10-12
**Implementation Status:** ✅ Complete - Ready for Testing

---

## Testing Overview

This guide provides step-by-step testing procedures for the FRN cache rebuild improvements and new normalization UI. Each test includes:
- **What to do** (exact steps)
- **What to expect** (console output and UI behavior)
- **How to verify** (success criteria)

---

## Prerequisites

Before testing:
1. Ensure app is built: `npm run build` (if not already done)
2. Close any running instances of the app
3. Open Developer Tools (Console) before starting each test
4. Have the Configuration page open to see the FRN Normalization Settings section

---

## Test 1: Startup Cache Rebuild

### Purpose
Verify that the FRN lookup cache rebuilds automatically on every app startup, regardless of whether config changed.

### Steps

1. **Start the application:**
   ```bash
   cd /Users/david/Websites/cash-management-v2/packages/electron-app
   npm start
   ```

2. **Watch the console during startup**

### Expected Console Output

You should see this sequence during app initialization:

```
=== Cash Management System Starting ===

📦 Database
✅ Backup: cash_savings_backup_2025-10-12_XX-XX-XX.db (X.XX MB)
✅ Database validation passed: /Users/david/Websites/cash-management-v2/data/database/cash_savings.db
✅ Database initialized: cash_savings.db

🔧 Pipeline Services
✅ FRN lookup cache rebuilt: 708 entries (30ms)
   Initializing FRN Matching Service for cache management...
✅ FRN lookup cache rebuilt: 708 entries (28ms)
   ✅ FRN Matching Service ready

🛠️ Background Services
✅ Scraper process manager initialized

🔌 IPC Handlers
✅ Orchestrator IPC handlers registered successfully
✅ All handlers registered

✅ Application started
```

### Success Criteria

- ✅ Console shows "FRN lookup cache rebuilt" message **twice** (once for orchestration, once for cache management)
- ✅ Entry count should be ~700-800 entries (depends on your database)
- ✅ Rebuild time should be **< 200ms** (typically 30-50ms)
- ✅ No errors or warnings about cache rebuilding
- ✅ App starts successfully and dashboard loads

### Performance Check

- Time from "Rebuilding FRN lookup cache..." to "✅ FRN lookup cache rebuilt" should be **< 200ms**
- If slower, note the time and entry count for performance investigation

### What If It Fails?

**If you don't see cache rebuild messages:**
- Check that FRNMatchingService is imported in main.ts
- Verify OrchestrationService initializes correctly
- Look for errors earlier in console

**If rebuild is very slow (> 500ms):**
- Note the entry count
- Check database size
- Review normalization rules (may be generating too many variations)

---

## Test 2: Normalization UI - Load Configuration

### Purpose
Verify that the FRN Normalization Settings component loads existing configuration from the database.

### Steps

1. **Navigate to Configuration page**
   - In the app, go to Settings or Configuration
   - Scroll down to find "FRN Bank Name Normalization Rules" section

2. **Check that the component loads**

### Expected UI Behavior

You should see:
- ✅ A card titled "FRN Bank Name Normalization Rules"
- ✅ Two columns: "Prefixes to Remove" and "Suffixes to Remove"
- ✅ A table section: "Abbreviation Expansions"
- ✅ Current configuration displayed as chips (prefixes/suffixes) and table rows (abbreviations)
- ✅ "Save Configuration" button at bottom right

### Expected Console Output

```
(No specific console output expected for loading)
```

### Success Criteria

- ✅ Component loads without errors
- ✅ Existing prefixes displayed as blue chips
- ✅ Existing suffixes displayed as blue chips
- ✅ Existing abbreviations shown in table
- ✅ No error alerts visible
- ✅ No loading spinner stuck

### What If It Fails?

**If component doesn't load:**
- Check console for React errors
- Verify IPC handler `get-frn-normalization-config` is registered
- Check DatabaseService.getFRNNormalizationConfig() method exists

**If config is empty (no prefixes/suffixes/abbreviations):**
- This is OK if it's a fresh database
- You'll add test values in the next tests

---

## Test 3: Add Prefix via UI

### Purpose
Verify that adding a prefix works and triggers cache rebuild.

### Steps

1. **In the "Prefixes to Remove" section:**
   - Type "THE" in the text field
   - Press Enter OR click "Add" button

2. **Watch for UI update**

3. **Click "Save Configuration" button**

4. **Watch the console**

### Expected UI Behavior

**After adding prefix:**
- ✅ "THE" appears as a blue chip
- ✅ Text field clears
- ✅ No duplicate allowed (try adding "THE" again - nothing happens)

**After clicking Save:**
- ✅ Button shows "Saving & Rebuilding Cache..." with spinner
- ✅ Button is disabled during save
- ✅ After ~1-2 seconds, green success alert appears:
  > "Configuration saved and FRN lookup cache rebuilt successfully!"
- ✅ Success alert auto-dismisses after 5 seconds

### Expected Console Output

```
✅ Updated 1 FRN normalization config parameter(s)
[FRN Cache] Rebuilding due to normalization config change...
✅ FRN lookup cache rebuilt: 708 entries (45ms)
```

### Success Criteria

- ✅ Console shows "Updated 1 FRN normalization config parameter(s)"
- ✅ Console shows "[FRN Cache] Rebuilding due to normalization config change..."
- ✅ Console shows cache rebuilt with entry count and time
- ✅ Rebuild time < 200ms
- ✅ Success alert appears
- ✅ Prefix remains visible after save

### What If It Fails?

**If save fails:**
- Check console for error messages
- Verify IPC handler `update-frn-normalization-config` exists
- Check DatabaseService.updateFRNNormalizationConfig() method

**If cache doesn't rebuild:**
- Verify FRNMatchingService is initialized
- Check that IPC handler calls rebuildLookupHelperCache()
- Look for "[FRN Cache] Failed to rebuild cache:" error

---

## Test 4: Add Suffix via UI

### Purpose
Verify that adding a suffix works and triggers cache rebuild.

### Steps

1. **In the "Suffixes to Remove" section:**
   - Type "LIMITED" in the text field
   - Press Enter OR click "Add" button

2. **Click "Save Configuration" button**

3. **Watch the console**

### Expected UI Behavior

**Same as Test 3:**
- ✅ "LIMITED" appears as a blue chip
- ✅ Text field clears
- ✅ Save button shows loading state
- ✅ Green success alert appears

### Expected Console Output

```
✅ Updated 1 FRN normalization config parameter(s)
[FRN Cache] Rebuilding due to normalization config change...
✅ FRN lookup cache rebuilt: 708 entries (43ms)
```

### Success Criteria

- ✅ Same as Test 3
- ✅ Cache rebuilds automatically
- ✅ Suffix persists after save

---

## Test 5: Add Abbreviation via UI

### Purpose
Verify that adding an abbreviation works and triggers cache rebuild.

### Steps

1. **In the "Abbreviation Expansions" section:**
   - Click "Add Abbreviation" button
   - Dialog opens

2. **In the dialog:**
   - Abbreviation field: Type "CO"
   - Expands To field: Type "COMPANY"
   - Click "Add" button

3. **Dialog closes**

4. **Click "Save Configuration" button**

5. **Watch the console**

### Expected UI Behavior

**After opening dialog:**
- ✅ Modal dialog appears with two text fields
- ✅ Dialog title: "Add Abbreviation Expansion"
- ✅ "Add" button disabled until both fields have values

**After adding abbreviation:**
- ✅ Dialog closes
- ✅ New row appears in abbreviations table:
  - Abbreviation: **CO**
  - Expands To: COMPANY
  - Delete icon in Actions column

**After saving:**
- ✅ Same loading/success behavior as Tests 3 & 4

### Expected Console Output

```
✅ Updated 1 FRN normalization config parameter(s)
[FRN Cache] Rebuilding due to normalization config change...
✅ FRN lookup cache rebuilt: 708 entries (47ms)
```

### Success Criteria

- ✅ Dialog works correctly
- ✅ Abbreviation appears in table
- ✅ Cache rebuilds on save
- ✅ Abbreviation persists after save

---

## Test 6: Remove Items

### Purpose
Verify that removing prefixes/suffixes/abbreviations works and triggers cache rebuild.

### Steps

1. **Remove a prefix:**
   - Click the X icon on the "THE" chip
   - Chip disappears immediately

2. **Remove a suffix:**
   - Click the X icon on the "LIMITED" chip

3. **Remove an abbreviation:**
   - Click the trash icon in the Actions column for "CO → COMPANY"

4. **Click "Save Configuration" button**

5. **Watch the console**

### Expected UI Behavior

- ✅ Items disappear immediately when X/trash icon clicked
- ✅ Save triggers normal loading/success flow
- ✅ Items remain removed after save

### Expected Console Output

```
✅ Updated 3 FRN normalization config parameter(s)
[FRN Cache] Rebuilding due to normalization config change...
✅ FRN lookup cache rebuilt: 708 entries (44ms)
```

### Success Criteria

- ✅ Console shows "Updated 3 FRN normalization config parameter(s)" (all 3 changes)
- ✅ Cache rebuilds once (not 3 times)
- ✅ Changes persist after save

---

## Test 7: FRN Override - Create

### Purpose
Verify that creating a manual FRN override via UI triggers cache rebuild.

### Steps

1. **Navigate to FRN Management page**
   - Go to the FRN Research Queue or Manual Overrides tab

2. **Create a new manual override:**
   - Click "Add Override" or similar button
   - Fill in:
     - Scraped Name: "TEST BANK LIMITED"
     - FRN: "123456"
     - Firm Name: "Test Bank"
   - Click Save/Submit

3. **Watch the console**

### Expected Console Output

```
[FRN Cache] Rebuilding due to manual override creation...
✅ FRN lookup cache rebuilt: 709 entries (46ms)
```

### Success Criteria

- ✅ Console shows "[FRN Cache] Rebuilding due to manual override creation..."
- ✅ Entry count increases by at least 1 (now 709 instead of 708)
- ✅ Cache rebuilds immediately (no restart required)
- ✅ Override appears in Manual Overrides list

### What If It Fails?

**If cache doesn't rebuild:**
- Check `frn:create-override` IPC handler in main.ts
- Verify FRNMatchingService instance exists
- Look for "[FRN Cache] Failed to rebuild cache:" error

---

## Test 8: FRN Override - Update

### Purpose
Verify that updating a manual FRN override triggers cache rebuild.

### Steps

1. **In Manual Overrides list:**
   - Find the "TEST BANK LIMITED" override from Test 7
   - Click Edit button
   - Change FRN to "654321"
   - Click Save

2. **Watch the console**

### Expected Console Output

```
[FRN Cache] Rebuilding due to manual override update...
✅ FRN lookup cache rebuilt: 709 entries (44ms)
```

### Success Criteria

- ✅ Console shows "[FRN Cache] Rebuilding due to manual override update..."
- ✅ Cache rebuilds immediately
- ✅ Updated FRN appears in list

---

## Test 9: FRN Override - Delete

### Purpose
Verify that deleting a manual FRN override triggers cache rebuild.

### Steps

1. **In Manual Overrides list:**
   - Find the "TEST BANK LIMITED" override
   - Click Delete button
   - Confirm deletion

2. **Watch the console**

### Expected Console Output

```
[FRN Cache] Rebuilding due to manual override deletion...
✅ FRN lookup cache rebuilt: 708 entries (43ms)
```

### Success Criteria

- ✅ Console shows "[FRN Cache] Rebuilding due to manual override deletion..."
- ✅ Entry count decreases back to 708
- ✅ Cache rebuilds immediately
- ✅ Override removed from list

---

## Test 10: Research Queue Completion

### Purpose
Verify that completing a research queue item (which triggers DB trigger to create override) triggers cache rebuild.

### Steps

1. **Navigate to FRN Research Queue**

2. **If no items in queue, create one:**
   - Add a bank name that doesn't match any FRN
   - Run pipeline to populate research queue

3. **Complete a research queue item:**
   - Select an item
   - Fill in researched FRN
   - Click "Complete" or "Promote to Override"

4. **Watch the console**

### Expected Console Output

```
[FRN Cache] Rebuilding due to research queue completion (auto-override created)...
✅ FRN lookup cache rebuilt: 709 entries (47ms)
```

### Success Criteria

- ✅ Console shows "[FRN Cache] Rebuilding due to research queue completion (auto-override created)..."
- ✅ Item removed from research queue
- ✅ New override appears in Manual Overrides table
- ✅ Cache rebuilds immediately

---

## Test 11: Restart Persistence

### Purpose
Verify that all changes persist after app restart and cache rebuilds correctly.

### Steps

1. **Add a prefix "ROYAL" and save**

2. **Close the app completely**

3. **Restart the app:**
   ```bash
   npm start
   ```

4. **Watch console during startup**

5. **Navigate back to Configuration page**

6. **Check FRN Normalization Settings**

### Expected Console Output on Startup

```
✅ FRN lookup cache rebuilt: 708 entries (31ms)
   Initializing FRN Matching Service for cache management...
✅ FRN lookup cache rebuilt: 708 entries (29ms)
```

### Expected UI Behavior

- ✅ "ROYAL" prefix still appears as a chip
- ✅ All previously added items persist

### Success Criteria

- ✅ Cache rebuilds automatically on startup
- ✅ All configuration changes persisted
- ✅ No errors during startup

---

## Test 12: Error Handling

### Purpose
Verify that errors are handled gracefully.

### Steps

1. **Test with empty values:**
   - Try to add empty prefix (field is empty, click Add)
   - Button should be disabled

2. **Test with duplicate values:**
   - Add "THE" prefix
   - Try to add "THE" again
   - Should not create duplicate

3. **Test cancel dialog:**
   - Open "Add Abbreviation" dialog
   - Fill in fields
   - Click Cancel
   - Dialog should close without adding

### Expected Behavior

- ✅ Add buttons disabled when fields empty
- ✅ Duplicates not created
- ✅ Cancel works correctly
- ✅ No console errors

---

## Performance Benchmarks

### Cache Rebuild Times

Based on typical database sizes:

| Entry Count | Expected Time | Status |
|-------------|---------------|--------|
| < 500 | < 30ms | ✅ Excellent |
| 500-1000 | 30-100ms | ✅ Good |
| 1000-5000 | 100-200ms | ⚠️ Acceptable |
| > 5000 | > 200ms | 🔴 Investigate |

### What to Record

For each test, note:
- Entry count before rebuild
- Entry count after rebuild
- Rebuild time (in ms)
- Any errors or warnings

---

## Integration Testing

### End-to-End Flow Test

**Test adding normalization rule affects pipeline:**

1. **Add prefix "THE" via UI**
2. **Save (cache rebuilds)**
3. **Add test override: "THE TEST BANK" → FRN 999999**
4. **Run pipeline with product named "THE TEST BANK"**
5. **Verify:**
   - ✅ Bank name normalized to "TEST BANK"
   - ✅ Matched to FRN 999999
   - ✅ No manual intervention needed

---

## Troubleshooting

### Cache Not Rebuilding

**Check console for:**
```
[FRN Cache] Failed to rebuild cache: <error message>
```

**Common causes:**
- FRNMatchingService not initialized
- Database connection issue
- Invalid normalization config

**Fix:**
- Restart app
- Check main.ts initialization code
- Verify database file exists

### Save Operation Fails

**Symptoms:**
- Red error alert appears
- Console shows error

**Check console for:**
```
Error updating FRN normalization config: <error message>
```

**Common causes:**
- Database write failure
- Transaction rollback
- Invalid JSON in config

**Fix:**
- Check database file permissions
- Verify unified_config table exists
- Try restarting app

### Slow Cache Rebuild (> 500ms)

**Possible causes:**
- Very large database (> 10,000 entries)
- Complex normalization rules
- Database performance issues

**Investigation steps:**
1. Check entry count in console output
2. Review number of prefixes/suffixes configured
3. Run database integrity check

---

## Test Summary Checklist

After completing all tests, verify:

- [ ] **Test 1**: Startup cache rebuild works ✅
- [ ] **Test 2**: UI loads configuration ✅
- [ ] **Test 3**: Add prefix works ✅
- [ ] **Test 4**: Add suffix works ✅
- [ ] **Test 5**: Add abbreviation works ✅
- [ ] **Test 6**: Remove items works ✅
- [ ] **Test 7**: Create override triggers rebuild ✅
- [ ] **Test 8**: Update override triggers rebuild ✅
- [ ] **Test 9**: Delete override triggers rebuild ✅
- [ ] **Test 10**: Research completion triggers rebuild ✅
- [ ] **Test 11**: Changes persist after restart ✅
- [ ] **Test 12**: Error handling works correctly ✅

**All tests passing?** Implementation is complete and working! ✅

---

## Reporting Issues

If you encounter problems during testing, please record:

1. **Test number** that failed
2. **Expected behavior** (from this guide)
3. **Actual behavior** (what you saw)
4. **Console output** (copy full console output)
5. **Steps to reproduce**
6. **Environment details**:
   - macOS version
   - Node.js version: `node --version`
   - Electron version: Check package.json
   - Database entry count

---

**Document Status**: ✅ Ready for Testing
**Testing Duration**: ~30-45 minutes for complete test suite
**Last Updated**: 2025-10-12

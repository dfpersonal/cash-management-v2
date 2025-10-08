# FRN Lookup Architecture - Findings and Required Fixes

**Date**: 2025-10-08
**Package**: `@cash-mgmt/optimization`
**Issue**: Incorrect FRN lookup patterns - direct references to `boe_institutions`, `boe_shared_brands`, `frn_manual_overrides` instead of using `frn_lookup_helper`

---

## Executive Summary

The optimization package and its tests are directly referencing base FRN tables (`boe_institutions`, `boe_shared_brands`, `frn_manual_overrides`) instead of using the centralized `frn_lookup_helper` view. This violates the FRN lookup architecture established in the pipeline package and can cause:

- **Broken FK constraints** when inserting test data with non-existent FRNs
- **Missing manual overrides** that are applied through frn_lookup_helper
- **Incorrect normalization** that the helper applies automatically
- **Tight coupling** to internal schema structure

---

## Background: How FRN Lookup Should Work

### Correct Architecture (from Pipeline)

All FRN queries should use `frn_lookup_helper` view:

```sql
-- Example: Exact FRN match
SELECT frn, canonical_name, match_type, confidence_score
FROM frn_lookup_helper
WHERE search_name = ? COLLATE NOCASE AND match_rank = 1
LIMIT 1
```

### FRN Lookup Helper Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Application Code (Pipeline, Optimization, etc.)        │
└────────────────────┬────────────────────────────────────┘
                     │ ONLY queries this
                     ▼
┌─────────────────────────────────────────────────────────┐
│  frn_lookup_helper (VIEW)                               │
│  - Provides unified FRN lookup interface                │
│  - Applies normalization rules                          │
│  - Includes manual overrides                            │
└────────────────────┬────────────────────────────────────┘
                     │ Reads from
                     ▼
┌─────────────────────────────────────────────────────────┐
│  frn_lookup_helper_cache (TABLE)                        │
│  - Aggregates data from multiple sources:               │
│    • boe_institutions (base FRN data)                   │
│    • boe_shared_brands (brand/alias relationships)      │
│    • frn_manual_overrides (manual corrections)          │
│  - Rebuilt when normalization config changes            │
└─────────────────────────────────────────────────────────┘
```

**Key Point**: Applications should NEVER query `boe_institutions`, `boe_shared_brands`, or `frn_manual_overrides` directly.

### Schema Details

```sql
-- View that applications use
CREATE VIEW frn_lookup_helper AS
SELECT
    frn,
    canonical_name,
    search_name,
    match_type,
    confidence_score,
    match_rank
FROM frn_lookup_helper_cache;

-- Cache table built from multiple sources
CREATE TABLE frn_lookup_helper_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    frn TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    search_name TEXT NOT NULL,
    match_type TEXT NOT NULL,  -- 'manual_override', 'direct_match', 'name_variation', 'shared_brand'
    confidence_score REAL NOT NULL,
    priority_rank INTEGER NOT NULL,
    match_rank INTEGER NOT NULL DEFAULT 1,
    source_table TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Problems Found in Optimization Package

### Problem 1: FSCSTestDatabase - FK Constraint Violation

**File**: `packages/optimization/src/__tests__/helpers/FSCSTestDatabase.ts`
**Line**: 175-192

**Code**:
```typescript
insertInstitutionPreference(params: {
  frn: string;
  bankName: string;
  personalLimit: number;
  easyAccessRequired?: boolean;
  trustLevel?: 'high' | 'medium' | 'low';
  riskNotes?: string;
}): void {
  const stmt = this.db!.prepare(`
    INSERT INTO institution_preferences
    (frn, bank_name, personal_limit, easy_access_required_above_fscs, trust_level, risk_notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    params.frn,  // ← Problem: This FRN must exist in boe_institutions
    params.bankName,
    params.personalLimit,
    params.easyAccessRequired !== false ? 1 : 0,
    params.trustLevel || 'medium',
    params.riskNotes || null
  );
}
```

**Issue**: The `institution_preferences` table has a foreign key constraint:
```sql
CREATE TABLE institution_preferences (
    ...
    frn TEXT NOT NULL,
    ...
    FOREIGN KEY (frn) REFERENCES boe_institutions(frn)
);
```

When tests try to insert preferences with FRN `'TEST_EA_REQ'`, it fails because that FRN doesn't exist in `boe_institutions`.

**Impact**: Test fails with "FOREIGN KEY constraint failed" error.

---

### Problem 2: FSCS Tests - Hardcoded FRNs Without Validation

**File**: `packages/optimization/src/compliance/__tests__/fscs.test.ts`
**Lines**: 140-148, 158-166, 217-235

**Code**:
```typescript
test('should apply NS&I £2M personal limit from institution_preferences', async () => {
  testDb.clearAllAccounts();
  testDb.insertTestAccount({
    frn: '845350',  // ← Hardcoded FRN - assumes it exists
    bank: 'NS&I',
    balance: 500000
  });
  // ...
});

test('should use standard FSCS limit when no institution preference exists', async () => {
  testDb.clearAllAccounts();
  testDb.insertTestAccount({
    frn: 'TEST_NO_PREF',  // ← Invalid FRN format
    bank: 'No Preference Bank',
    balance: 80000
  });
  // ...
});

test('should handle easy access requirement for amounts above FSCS', async () => {
  testDb.clearAllAccounts();
  testDb.insertTestAccount({
    frn: '124659',  // ← Hardcoded Goldman Sachs FRN - assumes it exists
    bank: 'Goldman Sachs International Bank',
    balance: 110000,
    subType: 'Easy Access'
  });
  // ...
});
```

**Issues**:
1. Hardcoded FRNs ('845350', '124659') assume these exist in the database
2. No validation that FRNs exist in `frn_lookup_helper`
3. Tests may pass on one database but fail on another if FRN data differs
4. Doesn't follow the pattern from pipeline tests which dynamically query lookup tables

---

### Problem 3: Optimization Source Code - Direct boe_institutions References

**File**: `packages/optimization/src/optimization/easy-access.ts`
**Grep Result**: Found 1 file with references to `boe_institutions` or `boe_shared_brands`

**Issue**: The optimization implementation code is directly querying base FRN tables instead of using `frn_lookup_helper`.

**Example Pattern** (likely):
```typescript
// WRONG - direct reference to boe_institutions
const institution = db.prepare(`
  SELECT * FROM boe_institutions WHERE frn = ?
`).get(frn);

// CORRECT - use frn_lookup_helper
const institution = db.prepare(`
  SELECT frn, canonical_name, match_type FROM frn_lookup_helper
  WHERE frn = ? AND match_rank = 1
  LIMIT 1
`).get(frn);
```

**Impact**:
- Misses manual FRN overrides
- Doesn't benefit from normalized search names
- Tightly coupled to schema structure

---

## Proposed Fixes

### Fix 1: Update FSCSTestDatabase Helper

**File**: `packages/optimization/src/__tests__/helpers/FSCSTestDatabase.ts`

Add validation and helper methods:

```typescript
/**
 * Validate FRN exists in frn_lookup_helper
 */
private validateFRN(frn: string): boolean {
  const row = this.db!.prepare(`
    SELECT frn FROM frn_lookup_helper
    WHERE frn = ? AND match_rank = 1
    LIMIT 1
  `).get(frn) as { frn: string } | undefined;

  return row !== undefined;
}

/**
 * Get a valid FRN for testing by searching frn_lookup_helper
 */
getValidTestFRN(bankNamePattern: string): string | null {
  const row = this.db!.prepare(`
    SELECT frn, canonical_name FROM frn_lookup_helper
    WHERE (canonical_name LIKE ? OR search_name LIKE ?)
      AND match_rank = 1
    LIMIT 1
  `).get(`%${bankNamePattern}%`, `%${bankNamePattern}%`) as { frn: string; canonical_name: string } | undefined;

  return row ? row.frn : null;
}

/**
 * Get all available test FRNs with their details
 */
getAvailableTestFRNs(limit: number = 10): Array<{ frn: string; bankName: string; matchType: string }> {
  const rows = this.db!.prepare(`
    SELECT frn, canonical_name as bankName, match_type as matchType
    FROM frn_lookup_helper
    WHERE match_rank = 1
    ORDER BY canonical_name
    LIMIT ?
  `).all(limit) as Array<{ frn: string; bankName: string; matchType: string }>;

  return rows;
}

/**
 * Insert institution preference for testing
 */
insertInstitutionPreference(params: {
  frn: string;
  bankName: string;
  personalLimit: number;
  easyAccessRequired?: boolean;
  trustLevel?: 'high' | 'medium' | 'low';
  riskNotes?: string;
}): void {
  // Validate FRN exists in frn_lookup_helper first
  if (!this.validateFRN(params.frn)) {
    throw new Error(
      `Cannot insert institution preference: FRN ${params.frn} not found in frn_lookup_helper. ` +
      `Use getValidTestFRN() to find a valid FRN for testing.`
    );
  }

  const stmt = this.db!.prepare(`
    INSERT INTO institution_preferences
    (frn, bank_name, personal_limit, easy_access_required_above_fscs, trust_level, risk_notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    params.frn,
    params.bankName,
    params.personalLimit,
    params.easyAccessRequired !== false ? 1 : 0,
    params.trustLevel || 'medium',
    params.riskNotes || null
  );
}
```

---

### Fix 2: Update FSCS Tests to Query frn_lookup_helper

**File**: `packages/optimization/src/compliance/__tests__/fscs.test.ts`

Replace hardcoded FRNs with dynamic queries:

```typescript
describe('Institution Preferences', () => {
  test('should apply NS&I £2M personal limit from institution_preferences', async () => {
    const db = testDb.getConnection();

    // Query frn_lookup_helper for NS&I FRN
    const nsiFRN = db.prepare(`
      SELECT frn, canonical_name FROM frn_lookup_helper
      WHERE (canonical_name LIKE '%NS&I%' OR canonical_name LIKE '%National Savings%')
        AND match_rank = 1
      LIMIT 1
    `).get() as { frn: string; canonical_name: string } | undefined;

    if (!nsiFRN) {
      console.warn('NS&I FRN not found in frn_lookup_helper, skipping test');
      return;
    }

    testDb.clearAllAccounts();
    testDb.insertTestAccount({
      frn: nsiFRN.frn,
      bank: nsiFRN.canonical_name,
      balance: 500000  // Half million - would breach £85k but OK for NS&I £2M limit
    });

    const report = await engine.generateComplianceReport();

    const nsiExposure = report.exposures.find(e => e.frn === nsiFRN.frn);
    expect(nsiExposure).toBeDefined();
    expect(nsiExposure!.totalExposure).toBe(500000);
    expect(nsiExposure!.effectiveLimit).toBe(2000000); // NS&I personal limit
    expect(nsiExposure!.complianceStatus).toBe('COMPLIANT');
    expect(nsiExposure!.protectionType).toMatch(/personal_override|government_protected/);
  });

  test('should use standard FSCS limit when no institution preference exists', async () => {
    const db = testDb.getConnection();

    // Get any FRN that doesn't have institution preferences
    const anyFRN = db.prepare(`
      SELECT frn, canonical_name FROM frn_lookup_helper
      WHERE match_rank = 1
        AND frn NOT IN (SELECT frn FROM institution_preferences)
      LIMIT 1
    `).get() as { frn: string; canonical_name: string } | undefined;

    if (!anyFRN) {
      console.warn('No FRN without preferences found, skipping test');
      return;
    }

    testDb.clearAllAccounts();
    testDb.insertTestAccount({
      frn: anyFRN.frn,
      bank: anyFRN.canonical_name,
      balance: 80000
    });

    const report = await engine.generateComplianceReport();

    const exposure = report.exposures.find(e => e.frn === anyFRN.frn);
    expect(exposure!.effectiveLimit).toBe(85000); // Standard FSCS
    expect(exposure!.protectionType).toBe('standard_fscs');
  });
});

describe('Easy Access Requirements', () => {
  test('should handle easy access requirement for amounts above FSCS', async () => {
    const db = testDb.getConnection();

    // Query for Goldman Sachs or any bank with personal limit > £85k
    const goldmanFRN = db.prepare(`
      SELECT ip.frn, ip.bank_name, ip.personal_limit
      FROM institution_preferences ip
      JOIN frn_lookup_helper flh ON ip.frn = flh.frn
      WHERE ip.personal_limit > 85000
        AND ip.easy_access_required_above_fscs = 1
        AND flh.match_rank = 1
      LIMIT 1
    `).get() as { frn: string; bank_name: string; personal_limit: number } | undefined;

    if (!goldmanFRN) {
      console.warn('No FRN with easy access requirement found, skipping test');
      return;
    }

    testDb.clearAllAccounts();
    testDb.insertTestAccount({
      frn: goldmanFRN.frn,
      bank: goldmanFRN.bank_name,
      balance: 110000,
      subType: 'Easy Access'
    });

    const report = await engine.generateComplianceReport();

    const exposure = report.exposures.find(e => e.frn === goldmanFRN.frn);
    expect(exposure).toBeDefined();
    expect(exposure!.effectiveLimit).toBe(goldmanFRN.personal_limit);
    expect(exposure!.totalExposure).toBe(110000);
    expect(exposure!.complianceStatus).toBe('NEAR_LIMIT'); // 92% of limit
  });
});
```

**Alternative approach** - Use helper method:

```typescript
test('should apply NS&I £2M personal limit', async () => {
  // Use helper to get valid FRN
  const nsiFRN = testDb.getValidTestFRN('NS&I');

  if (!nsiFRN) {
    console.warn('NS&I FRN not found, skipping test');
    return;
  }

  testDb.clearAllAccounts();
  testDb.insertTestAccount({
    frn: nsiFRN,
    bank: 'NS&I',
    balance: 500000
  });

  // ... rest of test
});
```

---

### Fix 3: Update Optimization Source Code

**File**: `packages/optimization/src/optimization/easy-access.ts`

Audit and replace direct FRN table queries:

```typescript
// BEFORE (WRONG):
const institution = db.prepare(`
  SELECT frn, bank_name, fscs_protected
  FROM boe_institutions
  WHERE frn = ?
`).get(frn);

const sharedBrand = db.prepare(`
  SELECT frn, trading_name
  FROM boe_shared_brands
  WHERE frn = ?
`).get(frn);

// AFTER (CORRECT):
const institution = db.prepare(`
  SELECT
    frn,
    canonical_name as bank_name,
    match_type,
    confidence_score
  FROM frn_lookup_helper
  WHERE frn = ? AND match_rank = 1
  LIMIT 1
`).get(frn);

// For fuzzy/search queries:
const matches = db.prepare(`
  SELECT
    frn,
    canonical_name,
    search_name,
    match_type
  FROM frn_lookup_helper
  WHERE search_name LIKE ? AND match_rank = 1
  ORDER BY confidence_score DESC
  LIMIT 10
`).all(`%${searchTerm}%`);
```

---

## Implementation Checklist

### Phase 1: Test Infrastructure
- [ ] Add `validateFRN()` private method to FSCSTestDatabase
- [ ] Add `getValidTestFRN(bankNamePattern)` public helper
- [ ] Add `getAvailableTestFRNs(limit)` public helper
- [ ] Update `insertInstitutionPreference()` to validate FRN
- [ ] Add unit tests for new helper methods

### Phase 2: Update FSCS Tests
- [ ] Update "NS&I personal limit" test to query frn_lookup_helper
- [ ] Update "standard FSCS limit" test to query frn_lookup_helper
- [ ] Update "easy access requirement" test to query frn_lookup_helper
- [ ] Add graceful skip logic when expected FRNs not found
- [ ] Run FSCS tests and verify all pass

### Phase 3: Audit Optimization Source Code
- [ ] Search for all `boe_institutions` references in src/
- [ ] Search for all `boe_shared_brands` references in src/
- [ ] Search for all `frn_manual_overrides` references in src/
- [ ] Replace with `frn_lookup_helper` queries
- [ ] Run optimization package tests
- [ ] Run integration tests

### Phase 4: Documentation
- [ ] Update CLAUDE.md to document FRN lookup pattern
- [ ] Add code comments explaining why frn_lookup_helper is used
- [ ] Document test helper methods in FSCSTestDatabase

---

## Benefits of These Changes

### 1. **Decoupling**
Code doesn't depend on internal FRN table structure. Schema changes to `boe_institutions`, `boe_shared_brands`, or `frn_manual_overrides` won't break the optimization package.

### 2. **Consistency**
All packages (pipeline, optimization) use the same FRN lookup pattern, making codebase easier to understand and maintain.

### 3. **Correctness**
Manual FRN overrides in `frn_manual_overrides` are automatically applied through `frn_lookup_helper`, ensuring data quality.

### 4. **Normalization**
Search names are normalized according to configuration, improving match quality.

### 5. **Performance**
`frn_lookup_helper_cache` has optimized indexes for fast lookups.

### 6. **Test Reliability**
Tests dynamically adapt to available FRN data instead of hardcoding, making them more robust across different database states.

---

## Related Files

### Pipeline Reference Implementation
- `/packages/pipeline/src/services/FRNMatchingService.ts` (lines 930-966)
- `/packages/pipeline/src/tests/integration/frn-matching/BasicMatchingTests.ts`
- `/packages/pipeline/src/tests/helpers/TestDatabase.ts`

### Optimization Files to Update
- `/packages/optimization/src/__tests__/helpers/FSCSTestDatabase.ts`
- `/packages/optimization/src/compliance/__tests__/fscs.test.ts`
- `/packages/optimization/src/optimization/easy-access.ts`

---

## Estimated Effort

- **Phase 1 (Test Infrastructure)**: 1 hour
- **Phase 2 (Update Tests)**: 1 hour
- **Phase 3 (Source Code Audit)**: 30 minutes
- **Phase 4 (Documentation)**: 30 minutes

**Total**: ~3 hours

---

## Questions / Discussion Points

1. Should we add a migration script to rebuild `frn_lookup_helper_cache` if it's empty?
2. Should `FSCSTestDatabase` automatically rebuild the cache on setup?
3. Do we need a "test FRN factory" utility for creating realistic test FRN data?
4. Should we add a CI check to prevent direct queries to boe_* tables?

---

**Author**: Claude
**Reviewed**: [Pending]
**Status**: Proposed

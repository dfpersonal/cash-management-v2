# Electron App V2 Enhancement - Master Implementation Plan

**Document Version**: 3.0 (Consolidated)
**Last Updated**: 2025-01-14
**Status**: Ready for Implementation
**Supersedes**: ELECTRON-APP-V2-COMPREHENSIVE-PLAN.md (v2.1), PIPELINE-INTEGRATION-PLAN.md (v1.0)

---

## Executive Summary

This consolidated plan outlines the complete V2 enhancement of the Electron Cash Management Desktop application, integrating:

1. **JSON Processing Pipeline** (ingestion → FRN matching → deduplication → data quality)
2. **Native Reporting System** (replacing Python portfolio-reporter with React/MUI)
3. **Strategic Allocation Management** (existing 10-tier liquidity system)
4. **Enhanced Portfolio Management** (3-tab structure with optimization integration)

### Key Findings & Decisions

✅ **ZERO Database Schema Changes Required** (Phases 1-13)
✅ **Existing Allocation Tables Are Perfect** (Phase 13 uses current schema)
✅ **Clone-Based Development** (safe isolated development while production runs)
✅ **Shared Database Safe** (no schema changes = both apps can share DB)
✅ **15 Bite-Sized Phases** (2-4 days each, easier testing and rollback)

### Timeline

- **Total Duration**: 44 working days (~9 weeks)
- **15 Phases**: Grouped into 5 major milestones
- **Merge Points**: 5 stable checkpoints to master branch

---

## Table of Contents

1. [Development Strategy](#development-strategy)
2. [Database Schema Analysis](#database-schema-analysis)
3. [System Architecture](#system-architecture)
4. [Implementation Phases](#implementation-phases)
5. [Git Workflow](#git-workflow)
6. [Testing Strategy](#testing-strategy)
7. [Component Architecture](#component-architecture)
8. [IPC Handlers](#ipc-handlers)
9. [Success Criteria](#success-criteria)

---

## Development Strategy

### Clone-Based Approach (RECOMMENDED)

**Why Clone Instead of Branch-Only?**

✅ **Complete Isolation** - Break things freely without affecting production
✅ **Production Keeps Running** - Use current version daily while developing V2
✅ **No Git Gymnastics** - Simpler workflow, develop on master of clone
✅ **Side-by-Side Testing** - Run both versions simultaneously
✅ **Clean Cut-Over** - When ready, just replace the production folder
✅ **Safety Net** - Old version is always there for rollback

### Setup Process

```bash
# 1. Create backup of database
cd /Users/david/Websites/cash-management-v2
cp data/database/cash_savings.db data/database/cash_savings.db.backup-v2-start

# 2. Clone repository for V3 development
cd /Users/david/Websites/
git clone cash-management-v2 cash-management-v3

# 3. Create development branch in clone
cd cash-management-v3
git checkout -b develop

# Directory structure:
# /Websites/cash-management-v2  ← PRODUCTION (keep using!)
# /Websites/cash-management-v3  ← DEVELOPMENT (work here)
```

### Benefits of Shared Database

Since there are **ZERO schema changes** in phases 1-13:

- Both apps can safely share `cash_savings.db`
- Test new features with real production data
- No database migration hassles
- Easy rollback if needed

### Cut-Over Strategy (When Complete)

```bash
# Option A: Replace production folder
cd /Users/david/Websites/
mv cash-management-v2 cash-management-v2-old
mv cash-management-v3 cash-management-v2

# Option B: Merge back to original repo
cd cash-management-v2
git remote add v3 ../cash-management-v3
git fetch v3
git merge v3/develop
```

---

## Database Schema Analysis

### CRITICAL FINDING: Zero Schema Changes Needed!

#### Phases 1-12: No Changes Required ✅

All pipeline, CSV import, product catalog, power user, and dashboard features use **existing tables**:

- `available_products_raw`, `available_products`
- `pipeline_audit`, `json_ingestion_audit`, `frn_matching_audit`, `deduplication_audit`
- `my_deposits`, `pending_deposits`
- `frn_manual_overrides`, `frn_research_queue`
- `configuration`

**No schema modifications needed!** ✅

#### Phase 13: Strategic Allocation - Use Existing Tables ✅

The plan document proposed new tables (`allocation_targets`, `allocation_tier_mappings`), but analysis shows **existing tables are already perfect**:

##### Table 1: `liquidity_allocation_config` (Already Exists!)

```sql
CREATE TABLE liquidity_allocation_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    liquidity_tier TEXT NOT NULL,              -- e.g. 'easy_access', 'fixed_12m'
    target_percentage REAL NOT NULL,           -- e.g. 20.0
    min_percentage REAL,                       -- e.g. 15.0
    max_percentage REAL,                       -- e.g. 25.0
    tier_description TEXT NOT NULL,
    tier_short_name TEXT,                      -- e.g. 'Easy Access'
    tier_order INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);
```

**Current Configuration (10 tiers - MORE granular than plan's 8 tiers):**

| Order | Tier | Target % | Description |
|-------|------|----------|-------------|
| 1 | easy_access | 20% | Immediate access for emergencies |
| 2 | notice_1_30 | 0% | 1-30 day notice accounts |
| 3 | notice_31_60 | 20% | 31-60 day notice accounts |
| 4 | notice_61_90 | 0% | 61-90 day notice accounts |
| 5 | notice_90+ | 0% | 90+ day notice accounts |
| 6 | fixed_9m | 5% | 9-month fixed terms |
| 7 | fixed_12m | 25% | 12-month fixed terms |
| 8 | fixed_24m | 10% | 24-month fixed terms |
| 9 | fixed_36m | 10% | 36-month fixed terms |
| 10 | fixed_60m | 0% | 60-month fixed terms |

**Phase 13 Implementation**: Build UI to work with this existing structure. No schema changes needed!

##### Table 2: `allocation_status_thresholds` (Already Exists!)

```sql
CREATE TABLE allocation_status_thresholds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    threshold_name TEXT NOT NULL UNIQUE,
    min_deviation REAL NOT NULL,
    max_deviation REAL,
    status_indicator TEXT NOT NULL,            -- '✅', '🟡', '🟠', '🔴'
    status_color TEXT NOT NULL,                -- 'green', 'yellow', 'orange', 'red'
    priority_level INTEGER NOT NULL,
    action_urgency TEXT NOT NULL,              -- 'MONITOR', 'PLAN', 'STRATEGIC', 'URGENT'
    description TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);
```

**Current Configuration (4 threshold levels):**

| Threshold | Deviation Range | Status | Color | Urgency |
|-----------|----------------|--------|-------|---------|
| within_target | 0-2% | ✅ | Green | MONITOR |
| minor_deviation | 2-5% | 🟡 | Yellow | PLAN |
| moderate_deviation | 5-10% | 🟠 | Orange | STRATEGIC |
| significant_deviation | 10%+ | 🔴 | Red | URGENT |

**Phase 13 Implementation**: Use this existing threshold system for allocation health calculations!

#### Phase 14-15: Native Reporting - One Optional Table

**Only if you want report history tracking** (can be skipped initially):

```sql
CREATE TABLE IF NOT EXISTS report_history (
  report_id INTEGER PRIMARY KEY,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  report_type TEXT NOT NULL,                   -- 'full', 'summary', 'custom'
  sections_included TEXT,                      -- JSON array
  portfolio_mode TEXT NOT NULL,                -- 'current', 'projected', 'combined'
  output_format TEXT NOT NULL,                 -- 'html', 'pdf'
  file_path TEXT,
  file_size_bytes INTEGER,
  generation_time_ms INTEGER
);
```

**Recommendation**: Skip initially. Generate reports on-demand without history. Add later if needed.

### Summary: Database Schema Impact

| Phase Range | Schema Changes | Tables Affected |
|-------------|----------------|-----------------|
| 1-12 | **ZERO** ✅ | Use existing tables |
| 13 | **ZERO** ✅ | Use existing allocation tables |
| 14-15 | **ONE OPTIONAL** | `report_history` (can skip) |

**Result**: Entire project can be completed with **ZERO required schema changes**! 🎉

---

## System Architecture

### Complete Data & Reporting Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA SOURCES                             │
│  🌐 Web Scrapers + 📄 CSV Import                            │
│         │                                                    │
│         ↓                                                    │
│  ┌──────────────────────┐                                  │
│  │ JSON Normalization   │                                   │
│  └──────────────────────┘                                   │
│         │                                                    │
│         ↓                                                    │
│  available_products_raw (All sources, method-based)         │
│         │                                                    │
├─────────┼───────────────────────────────────────────────────┤
│         │ PIPELINE STAGES                                   │
│         ↓                                                    │
│  1. JSON Ingestion → json_ingestion_audit                   │
│  2. FRN Matching → frn_matching_audit                       │
│  3. Deduplication → deduplication_audit                     │
│  4. Quality Analysis → pipeline_audit                       │
│         │                                                    │
│         ↓                                                    │
│  available_products (Final deduplicated catalog)            │
│         │                                                    │
├─────────┼───────────────────────────────────────────────────┤
│         │ USER INTERFACE                                    │
│         ↓                                                    │
│  📦 Product Catalog → 💼 Portfolio Management               │
│         │                                                    │
│         ↓                                                    │
│  📊 Strategic Allocation → 📈 Rebalancing                   │
│         │                                                    │
│         ↓                                                    │
│  📄 Native Report Generation (React/MUI)                    │
│  • Interactive report viewer                                │
│  • MUI DataGrid tables (auto-sizing)                       │
│  • Recharts visualizations                                 │
│  • PDF export via Puppeteer                                │
└─────────────────────────────────────────────────────────────┘
```

### User Mode System

**Basic User** (Default):
- Essential workflow only
- Simplified interfaces
- Current data views
- Key results and actions

**Power User** (Opt-in via Settings):
- All basic features PLUS:
- Advanced configuration
- Audit table access
- Raw data inspection
- Detailed diagnostics

**Toggle Location**: Settings → Power User Mode

---

## Implementation Phases

### Phase Grouping & Milestones

| Milestone | Phases | Days | Merge to Master | Description |
|-----------|--------|------|-----------------|-------------|
| **M1: Foundation** | 1-2 | 4 | After Phase 2 | Power user mode + page restructure |
| **M2: Pipeline Complete** | 3-9 | 20 | After Phase 9 | Full pipeline integration + power features |
| **M3: Enhanced UX** | 10-12 | 8 | After Phase 12 | Portfolio tabs + dashboard + FRN |
| **M4: Strategic Allocation** | 13 | 4 | After Phase 13 | Allocation system |
| **M5: Native Reporting** | 14-15 | 8 | After Phase 15 | Complete reporting system |

**Total**: 44 days (~9 weeks)

---

### Phase 1: Foundation - Power User Mode (2 days)

**Branch**: `feature/phase-1-power-user-mode`
**Merge**: Not yet (wait for Phase 2)

#### Deliverables

- [ ] Add power user mode toggle to Configuration/Settings page
- [ ] Create `ViewModeContext` or enhance existing context to track basic vs power user mode
- [ ] Store preference in `configuration` table (new key: `user_mode` = 'basic' | 'power')
- [ ] Add conditional rendering logic in Layout (no visible changes yet, just infrastructure)
- [ ] Update Layout component to show/hide future power user features

#### IPC Handlers (if needed)

```typescript
// If storing in configuration table:
'configuration:get-user-mode'
'configuration:set-user-mode'
```

#### Testing Checklist

**New Features:**
- [ ] Toggle between basic/power mode in Settings
- [ ] Preference persists across app restarts
- [ ] No visual changes yet (just infrastructure)

**Regression:**
- [ ] All existing pages load correctly
- [ ] No console errors
- [ ] Settings page works as before

**Git Tag**: `v2.1-phase-1-complete`

---

### Phase 2: Rename & Restructure Data Processing Page (2 days)

**Branch**: `feature/phase-2-data-processing-rename`
**Merge**: After this phase → **Merge M1 to master** (Phases 1-2 together)

#### Deliverables

- [ ] Rename `DataCollection.tsx` → `DataProcessing.tsx`
- [ ] Update route: `/data-collection` → `/data-processing`
- [ ] Create 3-tab layout (Material-UI Tabs component)
  - Tab 1: Data Collection (wraps existing ScraperDashboard)
  - Tab 2: Pipeline Processing (empty placeholder with "Coming soon")
  - Tab 3: Results & Quality (empty placeholder)
- [ ] Move existing `ScraperDashboard` into Tab 1 container
- [ ] Update navigation menu (rename "Data Collection" → "Data Processing")
- [ ] Update App.tsx routes
- [ ] Update breadcrumbs

#### Testing Checklist

**New Features:**
- [ ] Navigate to Data Processing page via menu
- [ ] Tab 1 shows existing scraper dashboard
- [ ] Tabs 2 & 3 show placeholder content
- [ ] Tab switching works smoothly

**Regression:**
- [ ] Existing scraper functionality works in Tab 1
- [ ] Can run scrapers as before
- [ ] Scraper logs display correctly
- [ ] All other pages unaffected

**Git Operations:**
```bash
git checkout develop
git merge --no-ff feature/phase-1-power-user-mode
git merge --no-ff feature/phase-2-data-processing-rename
git tag v2.1-milestone-1-complete -m "M1: Foundation Complete"
git push origin develop --tags

# NOW MERGE TO MASTER (first stable checkpoint)
git checkout master
git merge --no-ff develop
git push origin master
```

**Git Tag**: `v2.1-phase-2-complete`, `v2.1-milestone-1-complete`

---

### Phase 3: Pipeline Execution UI (Basic) (3 days)

**Branch**: `feature/phase-3-pipeline-execution`
**Merge**: Not yet (wait for Phase 9)

#### Deliverables

- [ ] Implement Tab 2 (Pipeline Processing) basic UI
- [ ] Add "Run Pipeline" button
- [ ] Add "Rebuild from Raw" button (hot-reload config)
- [ ] Add emergency "Stop Pipeline" button
- [ ] Display pipeline status card:
  - Status: idle | running | complete | error | stopped
  - Last run timestamp
  - Last run duration
- [ ] Create basic IPC handlers for pipeline control
- [ ] Wire up button actions to IPC

#### IPC Handlers Required

```typescript
'orchestrator:execute-pipeline'          // Existing
'orchestrator:rebuild-from-raw'          // NEW
'orchestrator:cancel-pipeline'           // NEW
'orchestrator:get-status'                // Existing
```

#### Component Structure

```typescript
/renderer/components/pipeline/tabs/
  PipelineProcessingTab.tsx
    - PipelineControlPanel (buttons)
    - PipelineStatusCard (current status)
```

#### Testing Checklist

**New Features:**
- [ ] "Run Pipeline" button triggers pipeline execution
- [ ] "Rebuild from Raw" button works
- [ ] Status card updates when pipeline runs
- [ ] Emergency stop button cancels pipeline
- [ ] Error states display correctly

**Regression:**
- [ ] Tab 1 (scrapers) still works
- [ ] Other pages unaffected
- [ ] Database not corrupted by stopped pipeline

**Git Tag**: `v2.1-phase-3-complete`

---

### Phase 4: Pipeline Progress Tracking (3 days)

**Branch**: `feature/phase-4-pipeline-progress`
**Merge**: Not yet (wait for Phase 9)

#### Deliverables

- [ ] Implement real-time progress tracking in Tab 2
- [ ] Add 4-stage progress indicator (stepper component):
  1. JSON Ingestion
  2. FRN Matching
  3. Deduplication
  4. Quality Analysis
- [ ] Show products processed count per stage
- [ ] Show percentage complete
- [ ] Add estimated time remaining (based on progress rate)
- [ ] Wire up IPC event listeners for progress updates
- [ ] Add progress bar within each stage

#### IPC Event Listeners

```typescript
// Listen to these events from main process:
'pipeline:progress:stage-start'    // { stage, timestamp }
'pipeline:progress:stage-update'   // { stage, current, total, percentage }
'pipeline:progress:stage-complete' // { stage, duration, productsProcessed }
'pipeline:complete'                // { totalDuration, summary }
'pipeline:error'                   // { stage, error }
```

#### Component Structure

```typescript
/renderer/components/pipeline/widgets/
  StageProgressIndicator.tsx
    - Material UI Stepper
    - 4 steps with icons
    - Progress bars per step
  ProgressMetrics.tsx
    - Products processed count
    - Percentage complete
    - Time remaining estimate
```

#### Testing Checklist

**New Features:**
- [ ] Progress indicator shows all 4 stages
- [ ] Current stage highlights correctly
- [ ] Products processed count updates in real-time
- [ ] Percentage complete calculates correctly
- [ ] Time remaining estimate is reasonable
- [ ] Progress updates don't freeze UI

**Regression:**
- [ ] Pipeline still completes successfully
- [ ] Can still run scrapers
- [ ] Other pages work normally

**Git Tag**: `v2.1-phase-4-complete`

---

### Phase 5: Pipeline Results & Quality (3 days)

**Branch**: `feature/phase-5-pipeline-results`
**Merge**: Not yet (wait for Phase 9)

#### Deliverables

- [ ] Implement Tab 3 (Results & Quality)
- [ ] Display quality score (0-100) with gauge visualization
- [ ] Show key metrics:
  - Products: raw → validated → enriched → final
  - FRN match rates (exact %, fuzzy %, alias %, no match %)
  - Deduplication: duplicates removed count
- [ ] Display anomaly alerts (expandable cards, color-coded by severity)
- [ ] Add FRN research items preview (top 3)
- [ ] Add "View All in FRN Management" button → deep-links to Research Queue
- [ ] Add recommendations list
- [ ] Create IPC handlers for quality reporting

#### IPC Handlers Required

```typescript
'orchestrator:get-quality-report'      // NEW - Latest report or by batch_id
'orchestrator:get-quality-history'     // NEW - Last N reports (if retention enabled)
'orchestrator:get-anomalies'           // NEW - Current anomalies list
'orchestrator:get-research-queue-items' // NEW - FRN research items from pipeline
```

#### Component Structure

```typescript
/renderer/components/pipeline/tabs/
  ResultsQualityTab.tsx
/renderer/components/pipeline/widgets/
  QualityScoreWidget.tsx           // Gauge chart (0-100)
  AnomalyAlertList.tsx             // Expandable cards
  FRNResearchPreview.tsx           // Top 3 items preview
  PipelineMetricsSummary.tsx       // Key metrics table
```

#### Testing Checklist

**New Features:**
- [ ] Quality score displays correctly after pipeline run
- [ ] Metrics show pipeline progression (raw → final)
- [ ] FRN match rate percentages sum to 100%
- [ ] Anomaly alerts expand/collapse
- [ ] FRN research preview shows top 3 items
- [ ] "View All" button navigates to FRN Management

**Regression:**
- [ ] Pipeline execution still works (Phases 3-4)
- [ ] All tabs work correctly
- [ ] Other pages unaffected

**Git Tag**: `v2.1-phase-5-complete`

---

### Phase 6: CSV Import Feature (3 days)

**Branch**: `feature/phase-6-csv-import`
**Merge**: Not yet (wait for Phase 9)

#### Deliverables

- [ ] Add CSV import section to Tab 1 (Data Collection) below scraper dashboard
- [ ] Implement drag-drop file upload (using react-dropzone or Material-UI)
- [ ] Create column mapping UI:
  - Auto-detection of common columns (bank_name, aer_rate, account_type, platform)
  - Manual mapping dropdown for unmatched columns
  - Visual mapping display (CSV column → App field)
  - Required field validation
- [ ] Add import preview (first 5 rows) in a table
- [ ] Implement data transformation (CSV → JSON format matching scraper output)
- [ ] Insert into `available_products_raw` with `source='csv_import'`
- [ ] Add "Auto-trigger pipeline after import" checkbox (default: checked)
- [ ] Create CSV IPC handlers
- [ ] Add success/error feedback with row count

#### IPC Handlers Required

```typescript
'csv:validate-file'       // NEW - Parse and validate CSV
'csv:preview-import'      // NEW - Return first 5 rows + auto-detected mappings
'csv:execute-import'      // NEW - Transform and insert into available_products_raw
```

#### Component Structure

```typescript
/renderer/components/csv/
  CSVUploader.tsx          // Drag-drop zone
  ColumnMapper.tsx         // Auto-detect + manual mapping
  ImportPreview.tsx        // First 5 rows table
  ImportSummary.tsx        // Success/error display
```

#### CSV Parsing

Use PapaParse library (already available or add dependency):
```json
"dependencies": {
  "papaparse": "^5.4.1"
}
```

#### Testing Checklist

**New Features:**
- [ ] Drag-drop CSV file works
- [ ] Auto-detection identifies common columns
- [ ] Manual mapping allows correction
- [ ] Preview shows first 5 rows correctly
- [ ] Import inserts data into database
- [ ] Auto-trigger pipeline works when checked
- [ ] Error handling for malformed CSV
- [ ] Success message shows row count

**Regression:**
- [ ] Scraper dashboard (above CSV section) still works
- [ ] Pipeline tabs work correctly
- [ ] Other pages unaffected

**Git Tag**: `v2.1-phase-6-complete`

---

### Phase 7: Product Catalog Page (3 days)

**Branch**: `feature/phase-7-product-catalog`
**Merge**: Not yet (wait for Phase 9)

#### Deliverables

- [ ] Create new `ProductCatalog.tsx` page
- [ ] Implement MUI DataGrid displaying `available_products`
- [ ] Add filtering panel:
  - Platform multi-select dropdown
  - Account type dropdown
  - AER range slider (min/max)
  - FSCS protection toggle
  - Bank name search (autocomplete)
  - Term months filter (for fixed term products)
- [ ] Add sorting on all columns
- [ ] Implement "Add to Portfolio" button (opens add deposit dialog)
- [ ] Add export functionality (CSV, JSON)
- [ ] Add footer info: product count, last updated, data quality indicator
- [ ] Add to navigation menu
- [ ] Create product catalog IPC handlers

#### IPC Handlers Required

```typescript
'products:get-available-products'  // NEW - With filters
'products:get-product-stats'       // NEW - Count by platform, type, FSCS status
```

#### Component Structure

```typescript
/renderer/pages/
  ProductCatalog.tsx
/renderer/components/catalog/
  ProductDataGrid.tsx        // Main table
  ProductFilters.tsx         // Filter panel
  ProductActions.tsx         // Add to portfolio button
```

#### DataGrid Columns

```typescript
- Bank Name (sortable, filterable)
- Platform (sortable, filterable)
- Account Type (sortable, filterable)
- AER Rate (sortable, number filter)
- Gross Rate (sortable)
- Term Months (sortable, number filter)
- Notice Period (sortable)
- Min Deposit (sortable, number filter)
- Max Deposit (sortable)
- FSCS Protected (sortable, boolean filter)
- FRN (sortable, filterable)
```

#### Testing Checklist

**New Features:**
- [ ] Navigate to Product Catalog via menu
- [ ] DataGrid displays all products
- [ ] Platform filter works
- [ ] AER range slider filters correctly
- [ ] Bank name search works (autocomplete)
- [ ] Sorting works on all columns
- [ ] Export to CSV works
- [ ] Footer shows correct product count
- [ ] "Add to Portfolio" button opens dialog

**Regression:**
- [ ] Data Processing page still works
- [ ] Pipeline can populate products
- [ ] Other pages unaffected

**Git Tag**: `v2.1-phase-7-complete`

---

### Phase 8: Power User - Raw Data Inspector (2 days)

**Branch**: `feature/phase-8-raw-data-inspector`
**Merge**: Not yet (wait for Phase 9)

#### Deliverables

- [ ] Add Tab 4 (Raw Data Inspector) to Data Processing page
- [ ] **Show only when power user mode enabled**
- [ ] Display `available_products_raw` in MUI DataGrid
- [ ] Add advanced filters:
  - Source dropdown (ajbell, flagstone, hl, moneyfacts, csv_import)
  - Platform dropdown
  - Date range picker
  - Bank name search
- [ ] Add "Compare Raw vs Final" toggle view
- [ ] Add export functionality (CSV, JSON)
- [ ] Display statistics footer (total raw products, sources breakdown)
- [ ] Create IPC handlers for raw data access

#### IPC Handlers Required

```typescript
'products:get-raw-products'        // NEW - View available_products_raw with filters
'products:compare-raw-vs-final'    // NEW - Side-by-side comparison
```

#### Component Structure

```typescript
/renderer/components/pipeline/tabs/
  RawDataInspectorTab.tsx      // Power user only
/renderer/components/pipeline/widgets/
  RawDataGrid.tsx              // Table of raw data
  RawDataFilters.tsx           // Advanced filters
  RawVsFinalComparison.tsx     // Comparison view
```

#### Conditional Rendering

```typescript
// In DataProcessing.tsx:
const { isPowerUser } = useViewMode();

<Tabs>
  <Tab label="Data Collection" />
  <Tab label="Pipeline Processing" />
  <Tab label="Results & Quality" />
  {isPowerUser && <Tab label="Raw Data Inspector" />}
  {isPowerUser && <Tab label="Audit Trail" />}
</Tabs>
```

#### Testing Checklist

**New Features:**
- [ ] Tab 4 only visible when power user mode enabled
- [ ] Raw data displays correctly
- [ ] Source filter works (show only flagstone, etc.)
- [ ] Date range filter works
- [ ] Compare raw vs final view works
- [ ] Export functionality works
- [ ] Statistics footer shows correct counts

**Regression:**
- [ ] Basic users don't see Tab 4
- [ ] Other tabs still work
- [ ] Pipeline execution not affected

**Git Tag**: `v2.1-phase-8-complete`

---

### Phase 9: Power User - Pipeline Audit Trail (3 days)

**Branch**: `feature/phase-9-audit-trail`
**Merge**: After this phase → **Merge M2 to master** (Phases 3-9)

#### Deliverables

- [ ] Add Tab 5 (Audit Trail) to Data Processing page - **power user only**
- [ ] Create multi-table viewer with dropdown selector:
  - pipeline_audit (overall execution)
  - json_ingestion_audit (validation, filtering)
  - frn_matching_audit (match decisions)
  - deduplication_audit (selection reasons)
- [ ] Implement MUI DataGrid with:
  - Sortable columns
  - Expandable rows (JSON metadata viewer with syntax highlighting)
  - Dynamic columns based on selected table
- [ ] Add advanced filtering:
  - Date range picker
  - Batch ID search (autocomplete)
  - Status filter (success, error, warning, all)
  - Stage filter (per-table specific stages)
- [ ] Add export functionality (CSV, JSON)
- [ ] Display retention info (if enabled)
- [ ] Add audit retention settings to Configuration page
- [ ] Create audit trail IPC handlers

#### IPC Handlers Required

```typescript
'orchestrator:get-audit-trail'      // NEW - Query with filters
'orchestrator:export-audit-trail'   // NEW - Export to CSV/JSON
'orchestrator:clear-audit-history'  // NEW - Manual cleanup
'orchestrator:get-audit-stats'      // NEW - Storage size, record counts
```

#### Configuration Settings (Add to Configuration Page)

```typescript
// In Configuration page, add new section:
"Audit & Diagnostics" (collapsible):
  - Audit retention enabled: toggle (default: false)
  - Retention period: slider 1-90 days (default: 7)
  - Current audit size: display (read-only)
  - [Clear All Audit History Now] button
  - Privacy warning: "Audit logs contain sensitive data details"
```

#### Component Structure

```typescript
/renderer/components/pipeline/tabs/
  PipelineAuditTab.tsx         // Power user only
/renderer/components/audit/
  AuditTableSelector.tsx       // Dropdown for table selection
  AuditDataGrid.tsx            // Table with expandable rows
  AuditFilters.tsx             // Advanced filters
  JSONMetadataViewer.tsx       // Syntax highlighted JSON
```

#### Testing Checklist

**New Features:**
- [ ] Tab 5 only visible when power user mode enabled
- [ ] Table selector dropdown works
- [ ] Audit data displays correctly for each table
- [ ] Expandable rows show JSON metadata
- [ ] Filters work (date range, batch ID, status)
- [ ] Export functionality works
- [ ] Audit retention settings in Configuration work
- [ ] Clear history button works

**Regression:**
- [ ] Basic users don't see Tab 5
- [ ] Other tabs still work
- [ ] Pipeline execution creates audit records correctly

**Git Operations:**
```bash
git checkout develop
git merge --no-ff feature/phase-3-pipeline-execution
git merge --no-ff feature/phase-4-pipeline-progress
git merge --no-ff feature/phase-5-pipeline-results
git merge --no-ff feature/phase-6-csv-import
git merge --no-ff feature/phase-7-product-catalog
git merge --no-ff feature/phase-8-raw-data-inspector
git merge --no-ff feature/phase-9-audit-trail
git tag v2.1-milestone-2-complete -m "M2: Pipeline Integration Complete"
git push origin develop --tags

# NOW MERGE TO MASTER (second stable checkpoint)
git checkout master
git merge --no-ff develop
git push origin master
```

**Git Tag**: `v2.1-phase-9-complete`, `v2.1-milestone-2-complete`

---

### Phase 10: Portfolio Management - 3-Tab Restructure (3 days)

**Branch**: `feature/phase-10-portfolio-tabs`
**Merge**: Not yet (wait for Phase 12)

#### Deliverables

- [ ] Restructure `PortfolioManagement.tsx` into 3-tab layout
- [ ] Tab 1: Current Holdings (move existing content here)
- [ ] Tab 2: Projected State (new - shows current + pending deposits)
- [ ] Tab 3: Optimization (move `OptimizationDashboard` content here)
- [ ] Remove current toggle UI (replace with tabs)
- [ ] Implement projected state logic:
  - Overlay pending deposits on current holdings
  - Calculate forward-looking FSCS exposure
  - Show impact visualization (balance changes, rate changes)
- [ ] Wire optimization → pending moves → projected tab
- [ ] Update navigation (remove separate Optimization page from menu)
- [ ] Update App.tsx routes (keep `/optimization` route for backward compatibility, redirect to `/management?tab=2`)

#### Component Structure

```typescript
/renderer/pages/
  PortfolioManagement.tsx
    - 3 tabs (Current, Projected, Optimization)
/renderer/components/portfolio/
  CurrentHoldingsTab.tsx       // Existing content
  ProjectedStateTab.tsx        // NEW - current + pending
  OptimizationTab.tsx          // Moved from OptimizationDashboard
```

#### Testing Checklist

**New Features:**
- [ ] 3 tabs display correctly
- [ ] Tab 1 shows current holdings (existing functionality)
- [ ] Tab 2 shows projected state (current + pending)
- [ ] Tab 3 shows optimization interface
- [ ] Optimization execution creates pending moves
- [ ] Pending moves appear in Tab 2 automatically
- [ ] Forward-looking FSCS calculation works

**Regression:**
- [ ] Existing portfolio features work in Tab 1
- [ ] Optimization still works in Tab 3
- [ ] Other pages unaffected

**Git Tag**: `v2.1-phase-10-complete`

---

### Phase 11: Dashboard Enhancements (3 days)

**Branch**: `feature/phase-11-dashboard-cards`
**Merge**: Not yet (wait for Phase 12)

#### Deliverables

- [ ] Add new dashboard cards:
  - **Data Status Card**: Last update timestamp, freshness indicator (green/yellow/red), sources active
  - **Quality Score Card**: Score 0-100, trend indicator (↑/↓), anomaly count
  - **Allocation Health Card**: Overall health score, status color, link to Strategic Allocation
  - **Pending Actions Card**: Total action count, breakdown by type (FRN research, optimizations, maturities, FSCS issues)
- [ ] Add conditional alerts (show only when applicable):
  - Stale data alert (if last update > 24h)
  - FRN research alert (if items > 0)
  - Low quality alert (if score < 70)
  - Optimization alert (if recommendations available)
- [ ] Add Data & Processing Status section
- [ ] Enhance Market Intelligence section (best rates from Product Catalog)
- [ ] Add power user compact metrics view:
  - Pipeline metrics
  - Recent activity log
  - System health
  - Quick actions bar
- [ ] Wire all links to new Data Processing page

#### Component Structure

```typescript
/renderer/components/dashboard/
  DataStatusCard.tsx           // NEW
  QualityScoreCard.tsx         // NEW
  AllocationHealthCard.tsx     // NEW
  PendingActionsCard.tsx       // NEW
  StaleDataAlert.tsx           // NEW (conditional)
  FRNResearchAlert.tsx         // NEW (conditional)
  LowQualityAlert.tsx          // NEW (conditional)
  PowerUserMetrics.tsx         // NEW (power user only)
```

#### Testing Checklist

**New Features:**
- [ ] New cards display on dashboard
- [ ] Data freshness indicator works (green < 6h, yellow 6-24h, red > 24h)
- [ ] Quality score displays correctly
- [ ] Allocation health card shows current status
- [ ] Pending actions card shows correct counts
- [ ] Conditional alerts appear when conditions met
- [ ] Power user metrics visible only in power mode
- [ ] Links navigate to correct pages

**Regression:**
- [ ] Existing dashboard cards still work
- [ ] Portfolio summary displays correctly
- [ ] Other pages unaffected

**Git Tag**: `v2.1-phase-11-complete`

---

### Phase 12: FRN Management Enhancements (2 days)

**Branch**: `feature/phase-12-frn-enhancements`
**Merge**: After this phase → **Merge M3 to master** (Phases 10-12)

#### Deliverables

- [ ] Add pipeline context to FRN Research Queue tab:
  - Display which scraper/batch generated each item
  - Show timestamp of discovery
  - Show product details that triggered research
- [ ] Add "From Pipeline" badges to Manual Overrides tab
- [ ] Enhance quick actions in Research Queue:
  - [Research on FCA Register] → Opens browser to FS Register
  - [Create Override] → Pre-fills override form with context
  - [Dismiss] → Mark as reviewed, remove from queue
  - [Batch Process] → Handle multiple similar items
- [ ] Add deep linking from Data Processing → FRN Management (Research Queue tab)
- [ ] Add badge notifications:
  - Badge on FRN Management nav item showing pending research count
  - Example: "🔐 FRN Management [20]"
- [ ] Create FRN integration IPC handlers

#### IPC Handlers Required

```typescript
'frn:batch-process-research'       // NEW - Handle multiple research items
'frn:get-pipeline-context'         // NEW - Which batch/scraper generated item
```

#### Component Structure

```typescript
/renderer/components/frn/
  FRNResearchQueueTab.tsx      // Enhanced with pipeline context
  FRNManualOverridesTab.tsx    // Add "From Pipeline" badges
/renderer/components/pipeline/
  QuickFRNResearchModal.tsx    // NEW - Simple cases modal
```

#### Testing Checklist

**New Features:**
- [ ] Pipeline context displays in Research Queue
- [ ] "From Pipeline" badges appear on relevant overrides
- [ ] Quick actions work (Research FCA, Create Override, Dismiss)
- [ ] Batch process handles multiple items
- [ ] Deep linking from Data Processing works
- [ ] Badge notification shows correct count
- [ ] Badge updates when items resolved

**Regression:**
- [ ] Existing FRN management features work
- [ ] Manual overrides still work
- [ ] BoE Registry tab unaffected
- [ ] Other pages work normally

**Git Operations:**
```bash
git checkout develop
git merge --no-ff feature/phase-10-portfolio-tabs
git merge --no-ff feature/phase-11-dashboard-cards
git merge --no-ff feature/phase-12-frn-enhancements
git tag v2.1-milestone-3-complete -m "M3: Enhanced UX Complete"
git push origin develop --tags

# NOW MERGE TO MASTER (third stable checkpoint)
git checkout master
git merge --no-ff develop
git push origin master
```

**Git Tag**: `v2.1-phase-12-complete`, `v2.1-milestone-3-complete`

---

### Phase 13: Strategic Allocation System (4 days)

**Branch**: `feature/phase-13-strategic-allocation`
**Merge**: After this phase → **Merge M4 to master**

#### Deliverables

- [ ] Create new `StrategicAllocation.tsx` page with 2-tab layout
- [ ] Tab 1: Allocation Targets & Analysis
  - [ ] MUI DataGrid displaying `liquidity_allocation_config` (editable)
  - [ ] Edit targets with validation (ensure sum to 100%)
  - [ ] Recharts: Current allocation pie chart
  - [ ] Recharts: Target allocation pie chart
  - [ ] Recharts: Gap analysis bar chart (current vs target)
  - [ ] Portfolio health metrics card (calculated from `allocation_status_thresholds`)
- [ ] Tab 2: Rebalancing Recommendations
  - [ ] Phase-based rebalancing plan (MUI DataGrid)
  - [ ] Availability summary (what can be moved)
  - [ ] Constraint analysis (notice periods, fixed terms)
  - [ ] Execute rebalancing → creates pending deposits
- [ ] Calculate allocation health scores:
  - Overall health score (0-100)
  - FSCS utilization score
  - Allocation efficiency score (deviation from targets)
  - Rate optimization score
  - Diversification score
- [ ] Add to navigation menu
- [ ] Create allocation IPC handlers
- [ ] Add Allocation Health card to Dashboard (if not done in Phase 11)

#### IMPORTANT: Use Existing Tables! (Zero Schema Changes)

**Tables to Use:**
- `liquidity_allocation_config` - Target percentages (already configured!)
- `allocation_status_thresholds` - Threshold rules (already configured!)
- `my_deposits` - Current holdings with `liquidity_tier` field

**Calculation Logic:**

```typescript
// For each tier in liquidity_allocation_config:
const current_balance = SUM(my_deposits.balance WHERE liquidity_tier = tier)
const total_balance = SUM(my_deposits.balance WHERE is_active = 1)
const current_percentage = (current_balance / total_balance) * 100
const target_percentage = tier.target_percentage
const deviation = Math.abs(current_percentage - target_percentage)

// Apply thresholds from allocation_status_thresholds:
const threshold = allocation_status_thresholds.find(t =>
  deviation >= t.min_deviation &&
  (t.max_deviation === null || deviation < t.max_deviation)
)

const status = {
  current: current_percentage,
  target: target_percentage,
  deviation: deviation,
  status_indicator: threshold.status_indicator,  // ✅, 🟡, 🟠, 🔴
  status_color: threshold.status_color,         // green, yellow, orange, red
  urgency: threshold.action_urgency             // MONITOR, PLAN, STRATEGIC, URGENT
}
```

#### IPC Handlers Required

```typescript
'allocation:get-targets'              // NEW - Get liquidity_allocation_config
'allocation:update-targets'           // NEW - Update target percentages
'allocation:restore-defaults'         // NEW - Reset to default allocation
'allocation:get-current-analysis'     // NEW - Current vs target with deviations
'allocation:get-health-metrics'       // NEW - Portfolio health scores
'allocation:get-rebalancing-plan'     // NEW - Rebalancing recommendations
'allocation:get-availability-summary' // NEW - What can be moved
'allocation:execute-rebalancing-phase' // NEW - Create pending deposits
```

#### Component Structure

```typescript
/renderer/pages/
  StrategicAllocation.tsx
/renderer/components/allocation/
  AllocationTargetsTab.tsx       // Tab 1
  RebalancingPlanTab.tsx         // Tab 2
/renderer/components/allocation/widgets/
  AllocationPieChart.tsx         // Recharts pie
  GapAnalysisChart.tsx           // Recharts bar
  HealthScoreCard.tsx            // Metrics display
  AvailabilitySummary.tsx        // What can move
```

#### Testing Checklist

**New Features:**
- [ ] Navigate to Strategic Allocation page
- [ ] Tab 1 displays current allocation
- [ ] Current allocation calculated correctly from my_deposits
- [ ] Target allocation displays from liquidity_allocation_config
- [ ] Gap analysis chart shows deviations
- [ ] Color coding matches allocation_status_thresholds
- [ ] Can edit target percentages (with validation)
- [ ] Tab 2 shows rebalancing recommendations
- [ ] Availability summary shows what can be moved
- [ ] Execute rebalancing creates pending deposits
- [ ] Pending deposits appear in Portfolio → Projected State

**Regression:**
- [ ] Portfolio management still works
- [ ] Dashboard displays correctly
- [ ] Other pages unaffected
- [ ] Database schema unchanged (verify!)

**Git Operations:**
```bash
git checkout develop
git merge --no-ff feature/phase-13-strategic-allocation
git tag v2.1-milestone-4-complete -m "M4: Strategic Allocation Complete"
git push origin develop --tags

# NOW MERGE TO MASTER (fourth stable checkpoint)
git checkout master
git merge --no-ff develop
git push origin master
```

**Git Tag**: `v2.1-phase-13-complete`, `v2.1-milestone-4-complete`

---

### Phase 14: Native Reporting - Core Structure (3 days)

**Branch**: `feature/phase-14-reporting-structure`
**Merge**: Not yet (wait for Phase 15)

#### Deliverables

- [ ] Create new `Reports.tsx` page with 3-tab layout
- [ ] Tab 1: Report Configuration
  - Section selection checkboxes (Executive Summary, Holdings, Allocation, Risk, Market, Maturity, Actions, Appendix)
  - Portfolio mode selection (Current, Projected, Combined)
  - Filter options (priority, tiers)
  - Generate Report button
- [ ] Tab 3: Report History (list recent reports)
  - MUI DataGrid with recent reports
  - View/delete actions
  - File size display
- [ ] Create base report sections:
  - ExecutiveSummary.tsx (portfolio cards, health metrics)
  - PortfolioHoldings.tsx (MUI DataGrid with all deposits)
- [ ] **(OPTIONAL)** Implement `report_history` database schema
  - Skip initially if you don't want history tracking
  - Can add later if needed
- [ ] Add to navigation menu
- [ ] Create basic report generation IPC handlers

#### Database Schema (OPTIONAL)

```sql
-- ONLY if you want report history tracking:
CREATE TABLE IF NOT EXISTS report_history (
  report_id INTEGER PRIMARY KEY,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  report_type TEXT NOT NULL,
  sections_included TEXT,
  portfolio_mode TEXT NOT NULL,
  output_format TEXT NOT NULL,
  file_path TEXT,
  file_size_bytes INTEGER,
  generation_time_ms INTEGER
);
```

**Recommendation**: Skip this table initially. Generate reports on-demand without saving history. Add later if you find you need it.

#### IPC Handlers Required

```typescript
'reports:get-executive-summary'    // NEW - Portfolio stats, health metrics
'reports:get-holdings-data'        // NEW - All deposits with full details
'reports:generate-html'            // NEW - Generate HTML report content
'reports:get-history'              // NEW (if implementing history)
'reports:delete-report'            // NEW (if implementing history)
```

#### Component Structure

```typescript
/renderer/pages/
  Reports.tsx
/renderer/components/reports/
  ReportConfigurationTab.tsx       // Tab 1
  ReportHistoryTab.tsx             // Tab 3
/renderer/components/reports/sections/
  ExecutiveSummary.tsx             // Base section
  PortfolioHoldings.tsx            // Base section
```

#### Testing Checklist

**New Features:**
- [ ] Navigate to Reports page
- [ ] Tab 1 shows configuration options
- [ ] Section checkboxes work
- [ ] Tab 3 shows report history (if implemented)
- [ ] Executive summary section renders
- [ ] Portfolio holdings section renders with MUI DataGrid

**Regression:**
- [ ] All other pages work normally
- [ ] No performance issues
- [ ] Database unchanged (if skipping report_history)

**Git Tag**: `v2.1-phase-14-complete`

---

### Phase 15: Native Reporting - Complete Sections & PDF Export (5 days)

**Branch**: `feature/phase-15-reporting-complete`
**Merge**: After this phase → **Merge M5 to master** (V2.1 RELEASE!)

#### Deliverables

- [ ] Complete all report sections:
  - [ ] StrategicAllocationSection.tsx (allocation table, charts, gap analysis)
  - [ ] RiskAssessment.tsx (FSCS exposure table, color-coded compliance)
  - [ ] MarketIntelligence.tsx (best products by tier, rate comparison, FSCS headroom)
  - [ ] MaturityPlanning.tsx (maturity schedule, timeline visualization)
  - [ ] ActionItems.tsx (recommendations table, priority sorting)
  - [ ] Appendix.tsx (configuration snapshot, methodology notes)
- [ ] Tab 2: Report Viewer (interactive display)
  - [ ] TOC sidebar with section navigation
  - [ ] Report content display
  - [ ] Export controls (PDF, HTML)
  - [ ] Print button
- [ ] Implement Puppeteer PDF export:
  - [ ] Install puppeteer dependency
  - [ ] Create ReportPDFExporter.ts (main process)
  - [ ] HTML → PDF conversion
  - [ ] Page break handling
  - [ ] Header/footer with page numbers
- [ ] Add print-optimized CSS (`@media print`)
  - [ ] Hide UI elements (nav, buttons)
  - [ ] Optimize tables for print
  - [ ] Page break rules
  - [ ] MUI DataGrid print styling
- [ ] Wire up "Generate Report" toolbar button
- [ ] Create all report generation IPC handlers

#### Dependencies

Add to `packages/electron-app/package.json`:
```json
{
  "dependencies": {
    "puppeteer": "^21.0.0"
  }
}
```

#### PDF Export Implementation

Create in `/main/services/ReportPDFExporter.ts`:

```typescript
import puppeteer from 'puppeteer';
import * as fs from 'fs';

export class ReportPDFExporter {
  async generatePDF(reportHTML: string, outputPath: string): Promise<void> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.setContent(reportHTML, { waitUntil: 'networkidle0' });

    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:10px; width:100%; text-align:center; color:#666;">Portfolio Analysis Report</div>`,
      footerTemplate: `<div style="font-size:10px; width:100%; text-align:center; color:#666;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
      preferCSSPageSize: true
    });

    await browser.close();
  }
}
```

#### Print CSS

Add to report components:

```css
@media print {
  nav, .no-print, button { display: none !important; }

  body { background: white; color: black; }

  .report-section { page-break-after: always; }
  .report-section:last-child { page-break-after: auto; }

  table { page-break-inside: avoid; }

  .MuiDataGrid-root { border: 1px solid #ddd; }
  .recharts-wrapper { page-break-inside: avoid; }
}
```

#### IPC Handlers Required

```typescript
'reports:get-allocation-data'      // NEW
'reports:get-fscs-analysis'        // NEW
'reports:get-market-intelligence'  // NEW
'reports:get-maturity-schedule'    // NEW
'reports:get-action-items-data'    // NEW
'reports:export-pdf'               // NEW - Calls Puppeteer in main process
'reports:save-report'              // NEW
```

#### Component Structure

```typescript
/renderer/components/reports/
  ReportViewerTab.tsx              // Tab 2
/renderer/components/reports/sections/
  StrategicAllocationSection.tsx   // Allocation analysis
  RiskAssessment.tsx               // FSCS exposure
  MarketIntelligence.tsx           // Best products
  MaturityPlanning.tsx             // Maturity timeline
  ActionItems.tsx                  // Recommendations
  Appendix.tsx                     // Config + methodology
/renderer/components/reports/print/
  PrintLayout.tsx                  // Print CSS wrapper
/main/services/
  ReportPDFExporter.ts             // Puppeteer integration
```

#### Testing Checklist

**New Features:**
- [ ] All report sections render correctly
- [ ] Tab 2 displays full interactive report
- [ ] TOC sidebar navigation works
- [ ] Recharts visualizations display in report
- [ ] Export to PDF works (uses Puppeteer)
- [ ] PDF quality is good (check page breaks, tables, charts)
- [ ] Print via browser works
- [ ] "Generate Report" toolbar button works
- [ ] Report configuration persists

**Regression:**
- [ ] All previous features still work
- [ ] Dashboard displays correctly
- [ ] Portfolio management works
- [ ] Strategic allocation works
- [ ] No performance degradation

**Git Operations:**
```bash
git checkout develop
git merge --no-ff feature/phase-14-reporting-structure
git merge --no-ff feature/phase-15-reporting-complete
git tag v2.1-milestone-5-complete -m "M5: Native Reporting Complete - V2.1 RELEASE!"
git tag v2.1.0 -m "V2.1 Complete Enhancement Release"
git push origin develop --tags

# FINAL MERGE TO MASTER (V2.1 RELEASE!)
git checkout master
git merge --no-ff develop
git push origin master --tags
```

**Git Tag**: `v2.1-phase-15-complete`, `v2.1-milestone-5-complete`, `v2.1.0`

---

## Git Workflow

### Branch Structure

```
master (production-ready, protected)
  ├── develop (integration branch for tested features)
  │   ├── feature/phase-1-power-user-mode
  │   ├── feature/phase-2-data-processing-rename
  │   ├── feature/phase-3-pipeline-execution
  │   └── ... (one branch per phase)
```

### Workflow Per Phase

```bash
# 1. Start new phase
git checkout develop
git pull origin develop
git checkout -b feature/phase-X-description

# 2. Work on phase (commit frequently)
git add .
git commit -m "feat(phase-X): descriptive message"

# 3. Test locally - ensure app still works!
npm run build
npm run start
# Manual testing: new features + regression testing

# 4. Ready for review
git push origin feature/phase-X-description

# 5. Merge to develop
git checkout develop
git merge --no-ff feature/phase-X-description
git tag v2.1-phase-X-complete -m "Completed Phase X"
git push origin develop --tags

# 6. At milestone points, merge develop → master
```

### 5 Merge Points to Master

| Merge Point | After Phase | Description |
|-------------|-------------|-------------|
| **M1** | Phase 2 | Foundation & page restructure |
| **M2** | Phase 9 | Pipeline integration complete |
| **M3** | Phase 12 | Enhanced UX complete |
| **M4** | Phase 13 | Strategic allocation |
| **M5** | Phase 15 | V2.1 Release (complete) |

### Emergency Rollback

If something goes wrong:

```bash
# Rollback to last good state
git checkout develop
git reset --hard v2.1-phase-X-complete  # Last working tag
git push origin develop --force  # Only if not shared!

# Or create a revert commit (safer if shared)
git revert <bad-commit-sha>
```

---

## Testing Strategy

### Testing Checklist Template

For each phase, use this template:

```markdown
## Phase X Testing Checklist

### New Features
- [ ] Feature A works as expected
- [ ] Feature B works as expected
- [ ] Error handling works correctly
- [ ] Edge cases handled

### Regression Testing
- [ ] Dashboard loads and displays correctly
- [ ] Portfolio Management still works
- [ ] FRN Management still works
- [ ] Data Collection (scrapers) still works
- [ ] Optimization still works
- [ ] Navigation between pages works
- [ ] Database operations work
- [ ] No console errors
- [ ] No memory leaks observed

### Performance
- [ ] App starts within acceptable time (<5 seconds)
- [ ] Navigation is responsive (<500ms)
- [ ] No UI freezing during operations
- [ ] Database queries performant

### Data Integrity
- [ ] No data loss
- [ ] Database schema unchanged (phases 1-13)
- [ ] Existing data displays correctly
```

### Manual Testing Approach

1. **Before Starting Phase**:
   - Backup database: `cp cash_savings.db cash_savings.db.backup-phase-X`
   - Document current app state

2. **During Development**:
   - Test incrementally as you build
   - Use browser DevTools console for debugging
   - Check database with sqlite3 CLI after operations

3. **After Phase Completion**:
   - Run full testing checklist
   - Test both basic and power user modes (phases 8+)
   - Verify database integrity
   - Check for console errors/warnings

4. **Before Merging**:
   - Full regression test
   - Test with production-like data
   - Verify rollback works (tag previous phase)

### Automated Testing (Future Enhancement)

Consider adding automated tests after V2.1 release:
- Playwright E2E tests for critical workflows
- Jest unit tests for complex calculations
- Database schema validation tests

---

## Component Architecture

### Directory Structure

```
/renderer/pages/
├── DataProcessing.tsx (renamed from DataCollection.tsx)
├── StrategicAllocation.tsx (NEW)
├── Reports.tsx (NEW)
├── ProductCatalog.tsx (NEW)
├── PortfolioManagement.tsx (enhanced with 3-tab structure)
├── Dashboard.tsx (enhanced)
├── FRNManagement.tsx (enhanced)
└── Configuration.tsx (enhanced)

/renderer/components/pipeline/
├── tabs/
│   ├── DataCollectionTab.tsx
│   ├── PipelineProcessingTab.tsx
│   ├── ResultsQualityTab.tsx
│   ├── RawDataInspectorTab.tsx (power user)
│   └── PipelineAuditTab.tsx (power user)
├── widgets/
│   ├── PipelineStatusCard.tsx
│   ├── StageProgressIndicator.tsx
│   ├── QualityScoreWidget.tsx
│   ├── AnomalyAlertList.tsx
│   └── FRNResearchPreview.tsx
└── dialogs/
    └── QuickFRNResearchModal.tsx

/renderer/components/csv/
├── CSVUploader.tsx
├── ColumnMapper.tsx
├── ImportPreview.tsx
└── ImportSummary.tsx

/renderer/components/catalog/
├── ProductDataGrid.tsx
├── ProductFilters.tsx
└── ProductActions.tsx

/renderer/components/allocation/
├── AllocationTargetsTab.tsx
├── RebalancingPlanTab.tsx
└── widgets/
    ├── AllocationPieChart.tsx
    ├── GapAnalysisChart.tsx
    ├── HealthScoreCard.tsx
    └── AvailabilitySummary.tsx

/renderer/components/reports/
├── ReportConfigurationTab.tsx
├── ReportViewerTab.tsx
├── ReportHistoryTab.tsx
├── sections/
│   ├── ExecutiveSummary.tsx
│   ├── PortfolioHoldings.tsx
│   ├── StrategicAllocationSection.tsx
│   ├── RiskAssessment.tsx
│   ├── MarketIntelligence.tsx
│   ├── MaturityPlanning.tsx
│   ├── ActionItems.tsx
│   └── Appendix.tsx
└── print/
    └── PrintLayout.tsx

/renderer/components/dashboard/
├── DataStatusCard.tsx
├── QualityScoreCard.tsx
├── AllocationHealthCard.tsx
├── PendingActionsCard.tsx
├── StaleDataAlert.tsx
├── FRNResearchAlert.tsx
└── PowerUserMetrics.tsx

/renderer/components/audit/
├── AuditTableSelector.tsx
├── AuditDataGrid.tsx
├── AuditFilters.tsx
└── JSONMetadataViewer.tsx

/main/services/
├── ReportPDFExporter.ts (NEW)
└── [existing services]
```

### Component Patterns

**Reuse Existing:**
- MUI DataGrid for all table displays
- Card layouts for dashboard sections
- Tab structure (Material-UI Tabs)
- Recharts for visualizations

**New Patterns:**
- Real-time progress: IPC event listeners
- Expandable rows: MUI DataGrid detail panels
- Color-coded status: Consistent system-wide (green/yellow/red/orange)
- Conditional rendering: Power user mode

**State Management:**
- Local state for UI (tabs, filters, modals)
- IPC queries for data (no Redux/Context for read-only)
- Event listeners for real-time updates

---

## IPC Handlers

### Complete List by Feature Area

#### Pipeline Execution
```typescript
'orchestrator:execute-pipeline'
'orchestrator:rebuild-from-raw'
'orchestrator:cancel-pipeline'
'orchestrator:get-status'
'orchestrator:get-health'
```

#### Data Quality
```typescript
'orchestrator:get-quality-report'
'orchestrator:get-quality-history'
'orchestrator:get-anomalies'
```

#### Audit Trail
```typescript
'orchestrator:get-audit-trail'
'orchestrator:export-audit-trail'
'orchestrator:clear-audit-history'
'orchestrator:get-audit-stats'
```

#### Configuration
```typescript
'orchestrator:update-config'
'orchestrator:validate-config'
'orchestrator:get-config-categories'
'configuration:get-user-mode'
'configuration:set-user-mode'
```

#### Product Catalog
```typescript
'products:get-available-products'
'products:get-raw-products'
'products:compare-raw-vs-final'
'products:get-product-stats'
```

#### CSV Import
```typescript
'csv:validate-file'
'csv:preview-import'
'csv:execute-import'
```

#### Strategic Allocation
```typescript
'allocation:get-targets'
'allocation:update-targets'
'allocation:restore-defaults'
'allocation:get-current-analysis'
'allocation:get-health-metrics'
'allocation:get-rebalancing-plan'
'allocation:get-availability-summary'
'allocation:execute-rebalancing-phase'
```

#### Native Reporting
```typescript
'reports:get-executive-summary'
'reports:get-holdings-data'
'reports:get-allocation-data'
'reports:get-fscs-analysis'
'reports:get-market-intelligence'
'reports:get-maturity-schedule'
'reports:get-action-items-data'
'reports:generate-html'
'reports:export-pdf'
'reports:save-report'
'reports:get-history'
'reports:delete-report'
```

#### FRN Integration
```typescript
'orchestrator:get-research-queue-items'
'frn:batch-process-research'
'frn:get-pipeline-context'
```

---

## Success Criteria

### Functional Requirements

**Must Have:**
- ✅ Complete scraper → pipeline → catalog → portfolio workflow
- ✅ CSV import with column mapping
- ✅ Real-time pipeline progress display
- ✅ Quality reporting with actionable insights
- ✅ FRN research queue integration
- ✅ Basic/Power user mode implementation
- ✅ Configuration hot-reload (rebuild from raw)
- ✅ Product catalog with advanced filtering
- ✅ Portfolio optimization integration (3-tab structure)
- ✅ Audit trail access (power users)
- ✅ Strategic allocation management (10-tier system)
- ✅ Portfolio health scoring
- ✅ Rebalancing recommendations
- ✅ Native report generation (React/MUI)
- ✅ High-quality PDF export (Puppeteer)

### User Experience

**Must Have:**
- ✅ Intuitive navigation (8-9 pages max)
- ✅ Progressive disclosure (complexity when needed)
- ✅ Clear visual hierarchy (color-coded status)
- ✅ Actionable dashboard (what to do next)
- ✅ Privacy-first (no retention by default)
- ✅ FSCS disclaimers (user responsibility clear)
- ✅ Responsive design (desktop/tablet)
- ✅ Interactive reports (sort, filter tables)
- ✅ Professional PDF output

### Technical Quality

**Must Have:**
- ✅ Reuse existing components/patterns (MUI, DataGrid, Cards)
- ✅ Real-time IPC event streaming
- ✅ Proper error handling (user-friendly messages)
- ✅ Type safety (TypeScript strict mode)
- ✅ Performance optimization (virtualized tables for >1000 rows)
- ✅ No CSS width brittleness (MUI auto-sizing)
- ✅ Single codebase (no Python subprocess for reports)
- ✅ Zero database schema changes (phases 1-13)

---

## Timeline Summary

| Phase Range | Description | Days | Cumulative |
|-------------|-------------|------|------------|
| **1-2** | Foundation | 4 | 4 |
| **3-5** | Pipeline UI & Progress | 9 | 13 |
| **6-7** | CSV Import & Product Catalog | 6 | 19 |
| **8-9** | Power User Features | 5 | 24 |
| **10-12** | Portfolio/Dashboard/FRN Enhancements | 8 | 32 |
| **13** | Strategic Allocation | 4 | 36 |
| **14-15** | Native Reporting | 8 | 44 |

**Total: 44 working days (~9 weeks)**

---

## Navigation Structure

### Basic User Navigation (8 pages)

```
Main Nav:
├── 📊 Dashboard (enhanced with new cards)
├── 💼 Portfolio Management (3 tabs: Current, Projected, Optimization)
├── 📈 Strategic Allocation (NEW - 2 tabs)
├── 📅 Calendar
├── 🔄 Data Processing (3 tabs: Collection, Pipeline, Results)
├── 🔐 FRN Management (5 tabs)
├── 📦 Product Catalog (NEW)
├── 📄 Reports & Analysis (NEW - 3 tabs)
└── ⚙️ Configuration

Toolbar Actions:
├── 🔄 Update Data
├── ⚙️ Run Pipeline
├── 🎯 Optimize
└── 📄 Generate Report
```

### Power User Navigation (8 pages + enhanced tabs)

```
Main Nav:
├── 📊 Dashboard ⚡ (enhanced metrics)
├── 💼 Portfolio Management ⚡ (3 tabs)
├── 📈 Strategic Allocation ⚡ (2 tabs)
├── 📅 Calendar
├── 🔄 Data Processing ⚡ (5 tabs: +Raw Data, +Audit)
├── 🔐 FRN Management (5 tabs)
├── 📦 Product Catalog ⚡ (advanced filters)
├── 📄 Reports & Analysis ⚡ (3 tabs)
└── ⚙️ Configuration ⚡ (pipeline config)
```

---

## Dependencies

### New Dependencies to Add

```json
{
  "dependencies": {
    "puppeteer": "^21.0.0",
    "papaparse": "^5.4.1"
  },
  "devDependencies": {
    "@types/papaparse": "^5.3.14"
  }
}
```

**Note**: `recharts` and `@mui/x-charts` are already installed.

---

## Risk Mitigation

### Technical Risks

**Risk**: Puppeteer PDF generation performance
**Mitigation**: Generate PDFs in background, show progress indicator
**Fallback**: Browser print dialog (simpler, no Puppeteer)

**Risk**: MUI DataGrid performance with large datasets (>1000 rows)
**Mitigation**: Built-in virtualization, pagination, lazy loading

**Risk**: Report generation blocking UI
**Mitigation**: Run in separate render process or use Web Workers

### UX Risks

**Risk**: Reports too complex for basic users
**Mitigation**: "Quick Report" option (Executive Summary only)
**Mitigation**: Progressive disclosure (expandable sections)

**Risk**: PDF export confusion (where did it save?)
**Mitigation**: File save dialog with user-chosen location
**Mitigation**: Success notification with "Open Folder" button

---

## Version History

- **v1.0** (2025-10-07): Initial pipeline integration plan (PIPELINE-INTEGRATION-PLAN.md)
- **v2.0** (2025-10-07): Added Strategic Allocation + Native Reporting (ELECTRON-APP-V2-COMPREHENSIVE-PLAN.md)
- **v2.1** (2025-10-12): FRN Cache Rebuild & Normalization UI Implementation
- **v3.0** (2025-01-14): **CONSOLIDATED PLAN** (this document)
  - Merged pipeline integration + comprehensive plan
  - Added database schema analysis (ZERO changes for phases 1-13)
  - Broke down into 15 bite-sized phases (vs original 11)
  - Added clone-based development strategy
  - Added git workflow with 5 merge points
  - Added testing strategy per phase
  - Identified existing allocation tables (no new schema needed)
  - Timeline: 44 days (~9 weeks)

---

## Related Documentation

- **Superseded Documents** (see `/docs/electron-app/archived/`):
  - ELECTRON-APP-V2-COMPREHENSIVE-PLAN.md (v2.1)
  - PIPELINE-INTEGRATION-PLAN.md (v1.0)
- **Pipeline Services**: `/docs/scrapers-and-json-processing/`
- **Database Schema**: `/docs/database/Schema-doc.md`
- **FRN Testing**: `/docs/testing/json-pipeline/frn-matching/`

---

## Next Steps

1. ✅ **Review this consolidated plan** - Ensure all stakeholders agree
2. ✅ **Set up clone repository** - `git clone cash-management-v2 cash-management-v3`
3. ✅ **Backup database** - `cp cash_savings.db cash_savings.db.backup-v2-start`
4. ✅ **Create develop branch** - `git checkout -b develop` in clone
5. ✅ **Begin Phase 1** - Power User Mode (2 days)

---

**Document Status**: ✅ Ready for Implementation
**Next Action**: Set up clone repository and begin Phase 1
**Estimated Completion**: 44 working days from start (~9 weeks)
**Target Release**: V2.1.0

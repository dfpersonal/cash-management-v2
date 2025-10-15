# Pipeline Integration - Comprehensive Implementation Plan

**Document Version**: 1.0
**Last Updated**: 2025-10-07
**Status**: Ready for Implementation

---

## Executive Summary

This plan outlines the integration of the fully-implemented JSON processing pipeline into the Electron desktop application. The pipeline (ingestion → FRN matching → deduplication → data quality) is production-ready but currently has no user interface. This implementation will create a complete, user-friendly workflow from data collection through to portfolio optimization.

### Core Objectives
- **Unified Workflow**: Seamless scraper → pipeline → catalog → portfolio flow
- **User Experience**: Progressive disclosure (basic vs power users)
- **Privacy-First**: No data retention by default for personal finance context
- **User Responsibility**: Clear FSCS disclaimers throughout

---

## System Architecture

### Complete Data Flow

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

### Database Strategy

#### State Tables (Cleared on each run)
- `available_products_raw` - Replaced with new scraper/import data
- `available_products` - Rebuilt from pipeline
- `deduplication_groups` - Regenerated on each run

#### Audit Tables (Optional retention)
- `pipeline_audit`
- `json_ingestion_audit`
- `frn_matching_audit`
- `deduplication_audit`

**Configuration**:
- `orchestrator_audit_retention_enabled` (BOOLEAN, default: false)
- `orchestrator_audit_retention_days` (NUMBER, default: 7)
- `orchestrator_clear_audit_on_run` (BOOLEAN, default: true)

**Rationale**: Personal finance app, not regulatory system. Privacy-first approach with opt-in history for power users who want troubleshooting capability.

---

## Page Architecture

### 1. Data Processing (Renamed from "Data Collection")

**Route**: `/data-processing`
**Access**: All users

#### Basic User View (3 tabs)

**Tab 1: Data Collection**
- Existing ScraperDashboard component (runs web scrapers)
- NEW: CSV Import feature
  - Drag-drop file upload
  - Column mapping UI (auto-detect + manual)
  - Validation preview (first 5 rows)
  - Convert to JSON format matching scraper output
  - Insert into available_products_raw
- Auto-trigger pipeline option (checkbox)

**Tab 2: Pipeline Processing**
- Run pipeline button (processes all sources in available_products_raw)
- Rebuild from raw button (configuration hot-reload without re-scraping)
- Real-time stage progress:
  - Stage indicator (ingestion → FRN → dedup → quality)
  - Progress percentage
  - Products processed count
  - Estimated time remaining
- Current run summary on completion
- Emergency stop button

**Tab 3: Results & Quality**
- Quality score (0-100) with trend indicator
- Key metrics:
  - Products: raw → validated → enriched → final
  - FRN match rates (exact, fuzzy, alias, no match)
  - Deduplication: cross-platform duplicates removed
- FRN research items preview (top 3 with "View All" button)
- Anomaly alerts (expandable cards, color-coded by severity)
- Recommendations list
- Link to FRN Management for research queue

#### Power User View (+2 additional tabs)

**Tab 4: Raw Data Inspector**
- View `available_products_raw` in MUI DataGrid
- Advanced filters:
  - Source (ajbell, flagstone, hl, moneyfacts, csv_import)
  - Platform dropdown
  - Date range picker
  - Bank name search
- Compare raw vs final products (side-by-side view)
- Export filtered data to CSV/JSON
- Statistics: Total raw products, sources breakdown

**Tab 5: Audit Trail**
- Multi-table viewer (dropdown selector):
  - pipeline_audit (overall execution)
  - json_ingestion_audit (validation, filtering)
  - frn_matching_audit (match decisions)
  - deduplication_audit (selection reasons)
- Advanced filtering:
  - Date range
  - Batch ID search
  - Status filter (success, error, warning)
  - Stage filter
- MUI DataGrid with:
  - Sortable columns
  - Expandable rows (JSON metadata viewer with syntax highlighting)
  - Dynamic columns based on selected table
- Export functionality (CSV, JSON)
- Retention info display (if enabled)

---

### 2. Portfolio Management (Enhanced)

**Route**: `/portfolio-management`
**Access**: All users

#### New 3-Tab Structure
Replaces current toggle with integrated tabs:

**Tab 1: Current Holdings**
- View/edit existing deposits (existing functionality)
- FSCS exposure summary by FRN
- Maturity calendar
- Account list with sorting/filtering

**Tab 2: Projected State**
- Include pending deposits/moves (overlaid on current)
- Forward-looking FSCS analysis
- "What if" scenario modeling
- Impact visualization (balance changes, rate changes)

**Tab 3: Optimization**
- Run rate optimizer / FSCS optimizer (existing optimization page content)
- View recommendations with annual benefit calculations
- Approve/reject individual actions
- Batch approve/reject
- Execute approved moves → Creates pending deposits/moves

**Workflow Integration**:
- Tab 1: See current state
- Tab 2: See projected state (includes pending changes)
- Tab 3: Generate optimization recommendations
- Optimization execution → Creates pending moves → Feeds Tab 2

---

### 3. FRN Management (Existing - Enhanced)

**Route**: `/frn-management`
**Access**: All users
**Structure**: Keep existing 5-tab layout

#### Enhancements

**Tab 1: Dashboard**
- Add "From Pipeline" section showing recent research queue items
- Statistics on pipeline-generated FRN issues
- Link to Research Queue tab

**Tab 2: Manual Overrides**
- "From Pipeline" badge on items generated during pipeline runs
- Batch actions: Approve/reject multiple overrides
- Filter by source (manual vs pipeline-generated)

**Tab 3: Research Queue**
- Pipeline context display:
  - Which scraper/batch generated this item
  - Timestamp of discovery
  - Product details that triggered research
- Enhanced quick actions:
  - [Research on FCA Register] → Opens browser to FS Register
  - [Create Override] → Pre-fills override form with context
  - [Dismiss] → Mark as reviewed, remove from queue
  - [Batch Process] → Handle multiple similar items
- Deep-linked from Data Processing Results tab

**Tab 4: Lookup Helper** (No changes)

**Tab 5: BoE Registry** (No changes)

#### Integration with Data Processing

**In Data Processing → Tab 3 (Results)**:
- Show FRN research items summary card
- Preview top 3 items with basic details
- "Resolve in FRN Management" button → Deep-links to Research Queue tab
- Optional: Quick action modal for simple cases (dismiss/accept fuzzy match)

**Navigation**:
- Badge notification on FRN Management nav item when items pending: `🔐 FRN Management [20]`
- Breadcrumb trail: Data Processing → FRN Management → Back

---

### 4. Product Catalog (NEW)

**Route**: `/product-catalog`
**Access**: All users

#### Features

**Main View**: MUI DataGrid displaying `available_products`

**Rich Filtering**:
- Platform dropdown (multi-select)
- Account type dropdown (easy_access, fixed_term, notice, etc.)
- AER range slider (min/max)
- FSCS protection toggle
- Min/max deposit range
- Bank name search (autocomplete)
- Term months filter (for fixed term products)

**Sortable Columns**:
- Bank Name, Platform, Account Type
- AER Rate, Gross Rate
- Term Months, Notice Period
- Min/Max Deposit
- FSCS Protected, FRN

**Actions**:
- [Add to Portfolio] → Opens add deposit dialog
- [Compare Selected] → Side-by-side comparison table
- [Export Filtered] → CSV/JSON export
- [Show Duplicates] → View removed duplicates with reasons

**Footer Info**:
- Product count: "1,620 products shown (160 duplicates hidden)"
- Last updated timestamp
- Data quality indicator

**Power User Toggles**:
- ☐ Show deduplication metadata (business_key, selection_reason)
- ☐ Show confidence scores
- ☐ Include removed duplicates
- ☐ Show source/platform details

---

### 5. Settings (Restructured)

**Route**: `/configuration`
**Access**: All users

#### Basic User View

**General Settings**:
- App theme (light/dark/system)
- Default view on startup
- FSCS warnings toggle (show/hide disclaimers)

**Data Processing Settings**:
- ☐ Auto-run pipeline after scraping
- ☐ Keep audit history
  - When enabled: Retention period slider (1-90 days)
  - Current audit size display
  - [Clear All Audit History Now] button
  - ⚠️ Warning: "Audit logs contain sensitive financial data details"

**Advanced Settings**:
- [Power User Mode] toggle
  - Description: "Unlocks advanced features, diagnostic tools, and audit access across the app"
  - Warning on enable: "Power user mode shows technical details and audit trails"

#### Power User View

All basic settings PLUS:

**Pipeline Configuration** (Collapsible accordion sections):

**▼ Orchestrator Settings**
- ☑ Atomic mode (all-or-nothing transactions)
- Stage timeout: [300000] ms
- ☑ Concurrent execution check
- ☑ UI progress updates
- Data corruption threshold: [0.5]

**▼ JSON Ingestion**
- Rate filtering threshold: [2.0] %
- Validation strictness: [Medium ▼]
- Business rules: [22 active] [Manage Rules]
- ☑ Accumulation mode (vs rebuild)

**▼ FRN Matching**
- Fuzzy match threshold: [0.85] (0-1 scale)
- ☑ Enable alias matching
- ☑ Auto-create research queue items
- Confidence threshold for auto-accept: [0.95]

**▼ Deduplication**
- Rate tolerance (basis points): [10] bp
- Platform preferences: [Manage Preferences]
- ☑ Cross-platform deduplication
- Selection priority: [Preferred platform, Best rate, Most recent]

**▼ Data Quality**
- ☑ Enable quality analysis stage
- ☑ Anomaly detection
- ☐ Verbose output (detailed logs)
- Min FRN match rate threshold: [0.70]
- Max anomaly rate threshold: [0.10]

**Configuration Actions**:
- [Test Configuration] → Dry-run validation
- [Restore Defaults] → Reset to default values
- [Export Configuration] → Save to JSON file
- [Import Configuration] → Load from JSON file

---

### 6. Audit & Diagnostics (NEW - Power User Only)

**Route**: `/audit-diagnostics`
**Access**: Power users only

#### Features

**Unified Audit Viewer**:
- Table selector dropdown:
  - Pipeline Audit (pipeline_audit)
  - JSON Ingestion (json_ingestion_audit)
  - FRN Matching (frn_matching_audit)
  - Deduplication (deduplication_audit)

**Advanced Filtering**:
- Date range picker (from/to)
- Batch ID search (autocomplete)
- Status filter (success, error, warning, all)
- Stage filter (per-table specific stages)

**Data Display**:
- MUI DataGrid with dynamic columns based on selected table
- Sortable, filterable columns
- Expandable rows for JSON metadata fields
- Syntax highlighting for JSON (using react-json-view or similar)
- Pagination for large datasets

**Actions**:
- [Export Filtered] → CSV/JSON with current filters applied
- [Clear Old Records] → Delete records beyond retention period
- [Download All] → Export complete table

**Storage Info Footer**:
- Total storage: "2.3 MB across all audit tables"
- Retention status: "7 days retention enabled" or "No retention (cleared on each run)"
- Record counts per table

---

## Dashboard Enhancements

### Top Priority Metrics (4 Cards)

**1. Portfolio Status Card** (Existing - Enhanced)
- Total balance with currency formatting
- Weighted average AER
- Account count
- Quick link: [View Portfolio →]

**2. Data Status Card** (NEW)
- Last update timestamp with freshness indicator:
  - ✅ Fresh (< 6h): Green
  - ⚠️ Aging (6-24h): Yellow
  - 🔴 Stale (> 24h): Red
- Data sources active: "4 of 4 sources" or "3 of 4 (Moneyfacts failed)"
- Quick action: [Update Data Now →]

**3. Data Quality Card** (NEW)
- Quality score: Large number (0-100) with color coding
- Trend indicator: ↑ +3 vs last run
- Anomaly count with severity breakdown
- Quick link: [View Quality Report →]

**4. Pending Actions Card** (NEW)
- Total action count: Large number
- Breakdown by type:
  - FRN Research: 20
  - Optimizations: 3
  - Maturities: 1
  - FSCS Issues: 2
- Quick link: [View All Actions →]

### Conditional Alerts

Show only when conditions are met:

**⚠️ Stale Data Alert** (if last update > 24h)
```
Data Last Updated: 3 days ago
Your product rates may be outdated.
[Run Scrapers Now] [Schedule Update]
```

**🔍 FRN Research Alert** (if items > 0)
```
20 Banks Need FRN Research
New banks discovered during data import require FSCS verification.
[Resolve in FRN Management →] [Quick Review]
```

**⚠️ Low Quality Alert** (if score < 70)
```
Data Quality Issues Detected (Score: 67/100)
• 15 products with missing FRN
• 3 rate outliers detected
• 8 duplicate conflicts unresolved
[View Details →] [Rebuild Pipeline]
```

**💡 Optimization Alert** (if recommendations available)
```
£450/year Rate Improvement Available
3 recommendations ready to review
[View Optimization →]
```

### Detailed Dashboard Sections

#### Section 1: Portfolio Overview (Existing + Enhanced)
- Total balance, weighted AER, account count
- FSCS status summary with warning count
- Quick tab switcher: [Current] [Projected] [Optimize]
- Allocation by tier (visual bars):
  - Easy Access (60%) £75,204
  - Fixed 12m (30%) £37,602
  - Notice (10%) £12,534
- Next maturity: "14 days (Santander 12m, £10,000)"

#### Section 2: Data & Processing Status (NEW)
- Last scraper run: Timestamp + platforms
- Last pipeline run: Timestamp
- Products available: Count (with duplicates removed count)
- Quality score: Visual bar (0-100) with trend
- Active sources: ✅/❌ status for each (AJ Bell, HL, Flagstone, Moneyfacts)
- Anomaly highlights (top 2-3):
  - "High rate outlier: Vanquis Bank (8.5% - verify!)"
  - "Missing FRN: Metro Bank (needs research)"
- Quick actions: [Update Data →] [View Quality Report →]

#### Section 3: Actionable Insights (NEW)
Prioritized action list with one-click access:

- 🔍 **FRN Research (20 banks)** → [Review →]
  "New banks need FSCS verification"

- 📊 **Optimization Ready (£450/year)** → [View →]
  "3 rate improvement recommendations"

- 📅 **Maturity Alert (14 days)** → [Plan →]
  "Santander 12m £10,000 maturing"

- ⚠️ **FSCS Breach Risk (2 accounts)** → [Fix →]
  "£95k with Barclays (limit: £85k)"

- ⏰ **Balance Check Overdue (3 accounts)** → [Update →]
  "Last checked: 45+ days ago"

#### Section 4: Market Intelligence (Existing + Enhanced)
- Best current rates by category (from Product Catalog):
  - Easy Access: 5.20% ✅ (Chip)
  - Notice 90d: 5.35% ✅ (Shawbrook)
  - Fixed 12m: 5.15% ✅ (Gatehouse Bank)
  - Fixed 24m: 4.95% ✅ (UBL UK)
- Your portfolio vs best comparison:
  - Easy Access: 4.80% (0.40% below best) ⚠️
  - Fixed 12m: 5.10% (0.05% below best) ✅
- Quick actions: [Browse Product Catalog →] [Run Optimization →]

### Power User Dashboard (Compact View)

**Metrics Header**:
```
Portfolio: £125,340 @ 4.75% | Data: ✅ 2h | Quality: 94 | Actions: 23
FRN: 20 | FSCS: 2⚠️ | Maturity: 14d
```

**Three-Column Panel Layout**:

**Column 1: Pipeline Metrics**
- Ingestion: 1,780 products
- Validated: 1,620 products
- Duplicates removed: 160
- FRN match rate: 92%
- [View Audit Trail →]

**Column 2: Recent Activity**
- 14:23 - Pipeline Complete
- 14:20 - AJ Bell Scraper
- 14:15 - HL Scraper
- 14:10 - Flagstone Scraper
- [View Full Log →]

**Column 3: System Health**
- Database: 45.2 MB
- Audit tables: 2.3 MB (or "Off" if disabled)
- Configuration: ✅ Valid
- Services: ✅ All running
- [Diagnostics →]

**Quick Actions Bar**:
[Update Data] [Run Pipeline] [Optimize] [View Audit]

---

## CSV Import Feature

### Implementation Details

**Location**: Data Processing → Tab 1 (Data Collection section)

**UI Flow**:

1. **File Upload**
   - Drag-drop zone with browse button
   - Accepted formats: .csv, .txt
   - File size validation (warn if > 10MB)
   - Loading indicator during parse

2. **Column Mapping**
   - Auto-detection of common columns:
     - Bank/Bank Name/Institution → bank_name
     - Rate/AER/Interest Rate/AER% → aer_rate
     - Product/Account/Type → account_type
     - Platform/Provider/Source → platform
   - Manual mapping dropdown for unmatched columns
   - Visual mapping display:
     ```
     CSV Column          → App Field
     ─────────────────────────────────
     Bank Name           → bank_name       ✓
     Product Name        → account_type    ✓
     Interest Rate (%)   → aer_rate        ✓
     Platform            → platform        ✓
     FRN                 → frn             ? (optional)
     ```
   - Required field validation (bank_name, aer_rate, account_type, platform)
   - Optional field mapping (frn, gross_rate, term_months, notice_period_days, min_deposit, max_deposit, fscs_protected)

3. **Preview & Validation**
   - Preview table showing first 5 rows
   - Data type validation per column
   - Error highlighting (missing required fields, invalid formats)
   - Row count and summary stats
   - Warnings display:
     - "15 rows have missing AER rate - will be skipped"
     - "Platform column not found - will default to 'CSV Import'"

4. **Import Execution**
   - Data transformation:
     - Convert to JSON format matching scraper output
     - Normalize data types (percentages, decimals, booleans)
     - Generate metadata: `{source: "csv_import", method: "manual_upload"}`
     - Add import timestamp
   - Insert into `available_products_raw` with source tracking
   - Success message with product count
   - Auto-trigger pipeline option (checkbox, default checked)

**Technical Implementation**:
- CSV parsing library: PapaParse or similar
- Validation: Schema validation matching pipeline requirements
- Error handling: Detailed error messages per row
- Progress indicator for large files

---

## Integration Workflows

### Workflow 1: Scraper → Pipeline → Catalog

1. User navigates to Data Processing → Tab 1 (Data Collection)
2. Selects scraper platform (e.g., AJ Bell) from existing ScraperDashboard
3. Configures scraper options (visible mode, account types, timeout)
4. Checks "Auto-trigger pipeline" option (default: on)
5. Clicks [Run Scraper]
6. Scraper executes → Creates JSON file → Inserts into available_products_raw
7. On scraper completion:
   - If auto-trigger enabled: Automatically switches to Tab 2, starts pipeline
   - If auto-trigger disabled: Shows "Scraper complete" with [Run Pipeline] button
8. Pipeline executes through 4 stages (Tab 2 shows real-time progress)
9. On completion: Automatically switches to Tab 3 (Results & Quality)
10. Results displayed:
    - Quality score: 94/100 ✅
    - Products processed: 450 raw → 420 final
    - If FRN research items: Shows preview, badge appears on FRN Management nav
11. User can now:
    - Browse products in Product Catalog
    - Resolve FRN issues in FRN Management
    - Run optimization in Portfolio Management

### Workflow 2: CSV Import → Pipeline → Catalog

1. User navigates to Data Processing → Tab 1 (Data Collection)
2. Clicks CSV Import section
3. Drags CSV file or clicks browse
4. System parses file, auto-detects columns
5. User reviews/adjusts column mappings
6. Validates preview (first 5 rows)
7. Checks "Run pipeline after import" (default: on)
8. Clicks [Import]
9. System:
   - Converts CSV to JSON format
   - Inserts into available_products_raw with source='csv_import'
   - Shows import summary: "245 products imported from CSV"
10. If auto-trigger enabled: Same flow as workflow 1, step 7 onwards

### Workflow 3: FRN Research Resolution

1. Pipeline generates FRN research items (banks with no match/uncertain match)
2. Data Processing → Tab 3 (Results) shows:
   - "⚠️ 20 Banks Need FRN Research"
   - Preview card with top 3 items
3. User clicks [Resolve in FRN Management]
4. App navigates to FRN Management page, Research Queue tab (deep-link)
5. Research Queue displays pipeline-generated items with context:
   - Which scraper/batch discovered the bank
   - Product details that triggered research
   - Timestamp of discovery
6. For each item, user can:
   - [Research on FCA Register] → Opens browser to FS Register search
   - [Create Override] → Opens override form, pre-filled with bank name
   - [Dismiss] → Removes from queue (marks as reviewed)
   - [Batch Process] → Handle multiple similar items at once
7. User processes items (e.g., creates manual override for Metro Bank)
8. Uses breadcrumb or back button to return to Data Processing
9. Next pipeline run will use the new override automatically

**Alternative: Quick Action Modal** (for simple cases)
- In Data Processing → Tab 3, user clicks [Quick Review] on research preview
- Modal opens showing research items with simplified actions:
  - ☐ Metro Bank → [Dismiss] [Search FCA]
  - ☐ Vanquis Bank (Fuzzy 0.82) → [Accept Fuzzy Match]
- User handles 80% of simple cases without leaving page
- Complex cases: [Open Full FRN Management] button

### Workflow 4: Configuration Hot-Reload

1. User wants to test different deduplication settings
2. Navigates to Settings (Power User mode enabled)
3. Expands "▼ Deduplication" section
4. Changes rate tolerance: 10bp → 25bp
5. Changes platform preference priority
6. Clicks [Test Configuration] → Dry-run validation confirms settings valid
7. Clicks [Save]
8. Navigates to Data Processing → Tab 2 (Pipeline Processing)
9. Clicks [Rebuild from Raw]
10. Pipeline re-processes available_products_raw with new settings
11. Results show in Tab 3:
    - Different deduplication outcome
    - Comparison to previous run (if audit retention enabled)
12. User evaluates results, can revert settings if needed

**Benefit**: Test configuration changes without re-running scrapers (saves time)

### Workflow 5: Portfolio Optimization Integration

1. User reviews portfolio in Portfolio Management → Tab 1 (Current Holdings)
2. Switches to Tab 3 (Optimization)
3. Clicks [Run Rate Optimizer]
4. Optimizer analyzes current holdings against Product Catalog (available_products)
5. Generates recommendations:
   - "Move £10k from Santander (4.5%) to Chip (5.2%) - Annual benefit: £70"
   - "Move £15k from Halifax (4.8%) to Shawbrook Notice (5.35%) - Annual benefit: £82.50"
6. User reviews recommendations:
   - Approves some (checkboxes)
   - Rejects others (X button)
7. Clicks [Execute Approved Moves]
8. System creates pending deposits for approved recommendations
9. Switches to Tab 2 (Projected State) automatically
10. Shows projected portfolio with pending moves applied:
    - New weighted AER calculation
    - FSCS exposure preview
    - Total balance allocation changes
11. User confirms moves look good
12. Executes pending deposits (converts pending → actual in my_deposits)

---

## Navigation Structure

### Basic User Navigation

**Main Menu** (7 pages):
1. 📊 Dashboard
2. 💼 Portfolio Management (3 tabs: Current, Projected, Optimization)
3. 📅 Calendar
4. 🔄 Data Processing (3 tabs: Collection, Pipeline, Results)
5. 🔐 FRN Management (5 tabs: Dashboard, Overrides, Research, Lookup, BoE)
6. 📦 Product Catalog
7. ⚙️ Settings

### Power User Navigation

**Main Menu** (8 pages):
1. 📊 Dashboard (enhanced with metrics)
2. 💼 Portfolio Management ⚡ (3 tabs)
3. 📅 Calendar
4. 🔄 Data Processing ⚡ (5 tabs: Collection, Pipeline, Results, Raw Data, Audit)
5. 🔐 FRN Management (5 tabs)
6. 📦 Product Catalog ⚡ (advanced filters enabled)
7. 🔍 Audit & Diagnostics (power user only)
8. ⚙️ Settings ⚡ (pipeline configuration enabled)

### Badge Notifications

Dynamic badges on nav items:

- **FRN Management [20]** - Red badge with pending research item count
- **Data Processing ✅** - Green checkmark when last run successful
- **Data Processing ⚠️** - Yellow warning when quality < 85
- **Data Processing ❌** - Red X when pipeline failed
- **Portfolio Management ⚠️** - Yellow warning when FSCS issues present

### Breadcrumb Navigation

Key cross-page flows use breadcrumbs:

```
Dashboard → Data Processing → FRN Management → Research Queue
                ↑__________________|

Data Processing → Product Catalog → Portfolio Management → Add Deposit
                          ↑______________|

Settings → Data Processing → Test Configuration → Results
              ↑___________________|
```

---

## IPC Handlers (Required Additions)

### Pipeline Execution

```typescript
// Core execution
'orchestrator:execute-pipeline' // Existing
'orchestrator:rebuild-from-raw' // NEW - Hot-reload without re-scraping
'orchestrator:cancel-pipeline' // NEW - Emergency stop

// Status
'orchestrator:get-status' // Existing
'orchestrator:get-health' // Existing
```

### Data Quality

```typescript
'orchestrator:get-quality-report' // NEW - Latest report or by batch_id
'orchestrator:get-quality-history' // NEW - Last N reports (if retention enabled)
'orchestrator:get-anomalies' // NEW - Current anomalies list
```

### Audit Trail

```typescript
'orchestrator:get-audit-trail' // NEW - Query with filters (table, date range, batch_id, stage)
'orchestrator:export-audit-trail' // NEW - Export to CSV/JSON
'orchestrator:clear-audit-history' // NEW - Manual cleanup
'orchestrator:get-audit-stats' // NEW - Storage size, record counts
```

### Configuration

```typescript
'orchestrator:update-config' // Existing
'orchestrator:validate-config' // Existing
'orchestrator:get-config-categories' // NEW - Grouped config for UI display
'orchestrator:validate-config-update' // NEW - Pre-flight validation before save
'orchestrator:test-configuration' // NEW - Dry-run with current settings
'orchestrator:restore-defaults' // NEW - Reset category or all config
'orchestrator:export-config' // NEW - Save to JSON file
'orchestrator:import-config' // NEW - Load from JSON file
```

### Product Catalog

```typescript
'products:get-available-products' // NEW - With filters (platform, type, rate range, FSCS, bank)
'products:get-raw-products' // NEW - Power user, view available_products_raw with filters
'products:compare-raw-vs-final' // NEW - Deduplication analysis, show what was removed
'products:get-product-stats' // NEW - Count by platform, type, FSCS status
```

### CSV Import

```typescript
'csv:validate-file' // NEW - Pre-import validation (parse, column check)
'csv:preview-import' // NEW - Return first 5 rows with detected mappings
'csv:execute-import' // NEW - Import to available_products_raw
```

### FRN Integration

```typescript
'orchestrator:get-research-queue-items' // NEW - From pipeline context
'frn:batch-process-research' // NEW - Handle multiple research items
'frn:get-pipeline-context' // NEW - Which batch/scraper generated item
```

---

## Component Architecture

### Directory Structure

```
/renderer/pages/
├── DataProcessing.tsx (renamed from DataCollection.tsx)
├── ProductCatalog.tsx (new)
├── AuditDiagnostics.tsx (new, power user only)
└── PortfolioManagement.tsx (enhanced with 3-tab structure)

/renderer/components/pipeline/
├── tabs/
│   ├── DataCollectionTab.tsx (wraps existing ScraperDashboard + CSV import)
│   ├── PipelineProcessingTab.tsx (execution, progress, controls)
│   ├── ResultsQualityTab.tsx (results display, quality metrics)
│   ├── RawDataInspectorTab.tsx (power user - view raw data)
│   └── PipelineAuditTab.tsx (power user - audit trail viewer)
├── widgets/
│   ├── PipelineStatusCard.tsx (current status display)
│   ├── StageProgressIndicator.tsx (4-stage visual timeline)
│   ├── QualityScoreWidget.tsx (score gauge with trend)
│   ├── AnomalyAlertList.tsx (expandable anomaly cards)
│   ├── FRNResearchPreview.tsx (top 3 items with link)
│   └── ConfigurationEditor.tsx (grouped config form)
└── dialogs/
    ├── QuickFRNResearchModal.tsx (simple research action modal)
    └── PipelineErrorDialog.tsx (detailed error display)

/renderer/components/csv/
├── CSVUploader.tsx (drag-drop file upload)
├── ColumnMapper.tsx (auto-detect + manual mapping UI)
├── ImportPreview.tsx (first 5 rows validation preview)
└── ImportSummary.tsx (success/error summary after import)

/renderer/components/catalog/
├── ProductDataGrid.tsx (main product table with filters)
├── ProductFilters.tsx (platform, type, rate, FSCS, bank filters)
├── ProductComparator.tsx (side-by-side comparison view)
└── DuplicateViewer.tsx (power user - view removed duplicates)

/renderer/components/dashboard/
├── DataStatusCard.tsx (new - freshness indicator)
├── QualityScoreCard.tsx (new - quality score display)
├── ActionableInsightsPanel.tsx (new - prioritized action list)
└── PowerUserMetrics.tsx (new - compact pipeline metrics)

/renderer/components/audit/
├── AuditTableSelector.tsx (dropdown for table selection)
├── AuditDataGrid.tsx (table display with expandable rows)
├── AuditFilters.tsx (date range, batch ID, status filters)
└── JSONMetadataViewer.tsx (syntax highlighted JSON expansion)
```

### Component Patterns

**Reuse Existing**:
- MUI DataGrid for all table displays (Product Catalog, Raw Data, Audit)
- Card layouts for dashboard sections
- Tab structure (follow FRN Management pattern)
- ScraperDashboard component (embed in Data Collection tab)

**New Patterns**:
- Real-time progress: IPC event listeners (follow ScraperDashboard pattern)
- Expandable rows: MUI DataGrid detail panels with JSON viewer
- Color-coded status: Consistent system-wide (green/yellow/red)
- Action button placement: Top-right of cards, bottom of forms

**State Management**:
- Local state for UI (tabs, filters, modals)
- IPC queries for data (no Redux/Context needed for read-only)
- Event listeners for real-time updates (pipeline progress, scraper status)

---

## UI/UX Guidelines

### Visual Hierarchy

**Color-Coded Status System**:

🟢 **Green (Good)**:
- Quality score > 85
- Data fresh (< 24h)
- FSCS compliant
- Pipeline success
- No pending critical actions

🟡 **Yellow (Attention)**:
- Quality score 70-85
- Data 1-3 days old
- Minor anomalies detected
- Some pending actions
- FSCS warnings (non-critical)

🔴 **Red (Urgent)**:
- Quality score < 70
- Data > 3 days old
- Pipeline failure
- FSCS breach risk
- Critical research items

**Typography**:
- Large numbers for key metrics (48px for dashboard cards)
- Descriptive labels in secondary color
- Monospace font for technical data (FRN, batch IDs)
- Consistent heading hierarchy (h4 → h5 → h6)

### Information Density

**Basic User**:
- Simplified views with essential data only
- Single-column layouts on mobile
- Collapsed details by default (expand to see more)
- Focus on actionable information

**Power User**:
- Compact metrics headers
- Multi-column layouts
- Expanded details by default
- Technical information visible
- Dense tables with all columns

**Responsive Breakpoints**:
- Desktop (>1200px): Full multi-column layouts
- Tablet (768-1200px): 2-column, scrollable details
- Mobile (<768px): Single column stack, most critical at top

### Privacy & Disclaimers

**FSCS Responsibility Disclaimers**:

**FRN Management Page Header**:
```
⚠️ FSCS Protection Notice
The FRN matching system provides guidance only. You are responsible
for verifying FSCS protection status of your deposits. Always check
the official FCA Financial Services Register at register.fca.org.uk
```

**Pipeline Results (when research items generated)**:
```
⚠️ 20 banks require FRN research
These banks could not be automatically matched to FRNs. Research them
in FRN Management before depositing funds. YOU are responsible for
verifying FSCS protection for your deposits.
```

**Audit Retention Settings**:
```
⚠️ Privacy Notice
Audit logs contain details about pipeline decisions, including which
products were selected/rejected and why. These logs may contain
sensitive financial data. Disable retention if you prefer not to keep
this historical data on your device.
```

**First-Time Setup** (if implemented):
```
Important: User Responsibility

☐ I understand that:
  • I am responsible for FSCS due diligence on my deposits
  • This app provides guidance, not financial advice
  • I should verify all FRNs with the official FCA register
  • The app developer is not liable for FSCS coverage issues

[Continue]
```

### Accessibility

- ARIA labels on all interactive elements
- Keyboard navigation support (tab order)
- Screen reader announcements for status changes
- Color blind friendly palette (don't rely on color alone)
- High contrast mode support

---

## Implementation Phases

### Phase 1: Core Data Processing (4-5 days)

**Deliverables**:
- [ ] Rename DataCollection.tsx → DataProcessing.tsx
- [ ] Create 3-tab layout for basic users
- [ ] Implement Tab 1 (Data Collection):
  - [ ] Wrap existing ScraperDashboard component
  - [ ] Add CSV import section placeholder
- [ ] Implement Tab 2 (Pipeline Processing):
  - [ ] Pipeline execution UI
  - [ ] Real-time progress tracking (IPC events)
  - [ ] Stage indicators (4 stages)
  - [ ] Rebuild from raw button
  - [ ] Emergency stop
- [ ] Implement Tab 3 (Results & Quality):
  - [ ] Quality score display
  - [ ] FRN research preview (top 3)
  - [ ] Anomaly list
  - [ ] Link to FRN Management
- [ ] Add power user mode toggle to Settings
- [ ] Update navigation (rename menu item)

**IPC Handlers Required**:
- `orchestrator:rebuild-from-raw`
- `orchestrator:cancel-pipeline`
- `orchestrator:get-quality-report`

### Phase 2: CSV Import (2-3 days)

**Deliverables**:
- [ ] CSVUploader component (drag-drop)
- [ ] CSV parsing (PapaParse integration)
- [ ] ColumnMapper component:
  - [ ] Auto-detection logic
  - [ ] Manual mapping UI
  - [ ] Required field validation
- [ ] ImportPreview component (first 5 rows table)
- [ ] Data transformation (CSV → JSON format)
- [ ] Integration with available_products_raw
- [ ] Auto-trigger pipeline option
- [ ] Success/error feedback

**IPC Handlers Required**:
- `csv:validate-file`
- `csv:preview-import`
- `csv:execute-import`

### Phase 3: Product Catalog (2-3 days)

**Deliverables**:
- [ ] Create ProductCatalog.tsx page
- [ ] ProductDataGrid component (MUI DataGrid)
- [ ] ProductFilters component:
  - [ ] Platform multi-select
  - [ ] Account type dropdown
  - [ ] AER range slider
  - [ ] FSCS toggle
  - [ ] Bank search autocomplete
- [ ] Sorting implementation (all columns)
- [ ] Export functionality (CSV, JSON)
- [ ] Action buttons:
  - [ ] Add to Portfolio (dialog)
  - [ ] Compare Selected (side-by-side)
  - [ ] Show Duplicates (power user)
- [ ] Power user toggles (metadata, confidence, source)
- [ ] Add to navigation

**IPC Handlers Required**:
- `products:get-available-products`
- `products:get-product-stats`

### Phase 4: Power User Features (3-4 days)

**Deliverables**:
- [ ] Add Tabs 4 & 5 to Data Processing (power user only)
- [ ] Tab 4: Raw Data Inspector
  - [ ] ProductDataGrid for available_products_raw
  - [ ] Advanced filters (source, platform, date, bank)
  - [ ] Compare raw vs final view
  - [ ] Export functionality
- [ ] Tab 5: Pipeline Audit
  - [ ] Multi-table viewer (dropdown)
  - [ ] AuditDataGrid component
  - [ ] Expandable rows (JSON metadata)
  - [ ] AuditFilters component
  - [ ] Export functionality
- [ ] Create AuditDiagnostics.tsx page
  - [ ] Unified audit viewer
  - [ ] Storage statistics
  - [ ] Clear history button
- [ ] Add to navigation (power user only)
- [ ] Tab visibility based on power mode

**IPC Handlers Required**:
- `products:get-raw-products`
- `products:compare-raw-vs-final`
- `orchestrator:get-audit-trail`
- `orchestrator:export-audit-trail`
- `orchestrator:clear-audit-history`
- `orchestrator:get-audit-stats`

### Phase 5: Portfolio Management Consolidation (2-3 days)

**Deliverables**:
- [ ] Restructure PortfolioManagement.tsx
- [ ] Create 3-tab layout:
  - [ ] Tab 1: Current Holdings (existing content)
  - [ ] Tab 2: Projected State (new)
  - [ ] Tab 3: Optimization (move from OptimizationDashboard.tsx)
- [ ] Remove current toggle UI
- [ ] Implement projected state logic:
  - [ ] Overlay pending deposits on current
  - [ ] Forward-looking FSCS calculation
  - [ ] Impact visualization
- [ ] Wire optimization → pending moves → projected
- [ ] Update navigation (remove separate Optimization page)
- [ ] Breadcrumb navigation

### Phase 6: Configuration Restructure (2-3 days)

**Deliverables**:
- [ ] Restructure Configuration.tsx (Settings)
- [ ] Basic user section:
  - [ ] General settings
  - [ ] Data processing settings
  - [ ] Audit retention settings
  - [ ] Power user mode toggle
- [ ] Power user section:
  - [ ] Pipeline configuration accordion
  - [ ] 5 collapsible sections (Orchestrator, Ingestion, FRN, Dedup, Quality)
  - [ ] ConfigurationEditor component
  - [ ] Per-setting tooltips
  - [ ] Validation logic
- [ ] Configuration actions:
  - [ ] Test Configuration button
  - [ ] Restore Defaults button
  - [ ] Export/Import buttons
- [ ] Visual impact preview (simulated results)

**IPC Handlers Required**:
- `orchestrator:get-config-categories`
- `orchestrator:validate-config-update`
- `orchestrator:test-configuration`
- `orchestrator:restore-defaults`
- `orchestrator:export-config`
- `orchestrator:import-config`

### Phase 7: Dashboard Enhancements (2-3 days)

**Deliverables**:
- [ ] Create new dashboard cards:
  - [ ] DataStatusCard (freshness indicator)
  - [ ] QualityScoreCard (score with trend)
  - [ ] Enhanced ActionableInsightsPanel
- [ ] Conditional alerts:
  - [ ] Stale data alert
  - [ ] FRN research alert
  - [ ] Low quality alert
  - [ ] Optimization alert
- [ ] Data & Processing Status section
- [ ] Market Intelligence enhancements (best rates from catalog)
- [ ] Power user compact metrics:
  - [ ] PowerUserMetrics component
  - [ ] Three-column panel
  - [ ] Quick actions bar
- [ ] Wire all links to new pages

**IPC Handlers Required**:
- Use existing handlers from previous phases

### Phase 8: FRN Management Enhancements (1-2 days)

**Deliverables**:
- [ ] Dashboard tab: Add pipeline context section
- [ ] Research Queue tab enhancements:
  - [ ] Pipeline context display (batch, scraper, timestamp)
  - [ ] Enhanced quick actions
  - [ ] Batch processing UI
  - [ ] [Research on FCA] button (opens browser)
- [ ] Manual Overrides tab:
  - [ ] "From Pipeline" badges
  - [ ] Source filter (manual vs pipeline)
- [ ] QuickFRNResearchModal component (simple cases)
- [ ] Deep linking from Data Processing
- [ ] Badge notification system

**IPC Handlers Required**:
- `orchestrator:get-research-queue-items`
- `frn:batch-process-research`
- `frn:get-pipeline-context`

### Phase 9: Integration & Polish (2-3 days)

**Deliverables**:
- [ ] Auto-trigger workflow (scraper → pipeline)
- [ ] Badge notification system:
  - [ ] FRN Management badge (research count)
  - [ ] Data Processing status badge
  - [ ] Portfolio Management warning badge
- [ ] Cross-page navigation refinement:
  - [ ] Breadcrumbs
  - [ ] Deep linking
  - [ ] Back button behavior
- [ ] FSCS disclaimers throughout:
  - [ ] FRN Management header
  - [ ] Pipeline results
  - [ ] Settings audit retention
- [ ] Error handling & validation
- [ ] Loading states & skeletons
- [ ] Responsive design testing (desktop, tablet, mobile)
- [ ] Accessibility audit (ARIA, keyboard nav)
- [ ] Performance optimization (virtualized tables for large datasets)
- [ ] User acceptance testing
- [ ] Documentation updates

**Total Estimated Time: 20-28 days**

---

## Success Criteria

### Functional Requirements

**Must Have**:
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

**Should Have**:
- ✅ Quick FRN research modal (simple cases)
- ✅ Batch FRN processing
- ✅ Configuration test/validation
- ✅ Export functionality (products, audit, config)
- ✅ Dashboard conditional alerts

**Nice to Have**:
- Historical quality trends (if audit retention enabled)
- Configuration import/export
- Advanced analytics (power user)

### User Experience

**Must Have**:
- ✅ Intuitive navigation (7-8 pages max)
- ✅ Progressive disclosure (complexity when needed)
- ✅ Clear visual hierarchy (color-coded status)
- ✅ Actionable dashboard (what to do next)
- ✅ Privacy-first (no retention by default)
- ✅ FSCS disclaimers (user responsibility clear)
- ✅ Responsive design (desktop/tablet/mobile)

**Should Have**:
- Real-time status updates (no page refresh needed)
- Keyboard navigation support
- Loading states for all async operations
- Error recovery guidance

**Nice to Have**:
- Onboarding tour for new users
- Contextual help tooltips
- Dark mode optimization

### Technical Quality

**Must Have**:
- ✅ Reuse existing components/patterns (MUI, DataGrid, Cards)
- ✅ Real-time IPC event streaming
- ✅ Proper error handling (user-friendly messages)
- ✅ Type safety (TypeScript strict mode)
- ✅ Performance optimization (virtualized tables for >1000 rows)

**Should Have**:
- Code documentation (JSDoc comments)
- Component unit tests (critical paths)
- Integration tests (workflows)
- Accessibility compliance (WCAG 2.1 AA)

**Nice to Have**:
- E2E tests (Playwright/Cypress)
- Performance benchmarking
- Bundle size optimization

---

## Future Considerations

### Scheduled Operations
- Automated scraper runs (cron-like scheduling)
- Periodic pipeline execution
- Email/notification system for alerts

### Historical Analytics
- Quality score trends over time (if retention enabled)
- Deduplication effectiveness tracking
- FRN match rate improvements
- Platform reliability metrics

### Advanced Features
- Multi-user support (future consideration)
- Cloud sync for configuration
- API integration for external data sources
- Machine learning for better FRN matching

### Mobile App
- React Native implementation using same data model
- Simplified UI for mobile workflows
- Push notifications for alerts

---

## Risk Mitigation

### Technical Risks

**Risk**: Pipeline performance with large datasets (>5000 products)
- **Mitigation**: Virtualized tables (MUI DataGrid built-in), pagination, lazy loading

**Risk**: IPC event flooding during real-time updates
- **Mitigation**: Event throttling, batch updates, progress sampling

**Risk**: CSV import with malformed data
- **Mitigation**: Robust validation, error preview, row-level error handling

### UX Risks

**Risk**: Power user features overwhelming basic users
- **Mitigation**: Progressive disclosure, clear mode toggle, default to basic

**Risk**: FSCS liability concerns
- **Mitigation**: Clear disclaimers, user responsibility emphasis, no financial advice claims

**Risk**: Configuration changes breaking pipeline
- **Mitigation**: Test configuration feature, validation, restore defaults option

---

## Appendix

### Glossary

- **FRN**: Firm Reference Number (UK Financial Conduct Authority identifier)
- **FSCS**: Financial Services Compensation Scheme (UK deposit protection)
- **Pipeline**: JSON processing workflow (ingestion → FRN → dedup → quality)
- **Atomic Mode**: All-or-nothing transaction processing
- **Hot-Reload**: Rebuild from raw data without re-scraping
- **Business Key**: Unique identifier for cross-platform deduplication
- **Audit Trail**: Immutable log of pipeline decisions

### Related Documentation

- **Pipeline Services**: `/docs/scrapers-and-json-processing/`
- **Database Schema**: `/.claude/database_schema.md`
- **Current Phase**: `/.claude/current_phase.md`
- **Implementation Status**: `/.claude/implementation_status.md`
- **FRN Testing**: `/docs/testing/json-pipeline/frn-matching/`

### Version History

- **v1.0** (2025-10-07): Initial comprehensive plan
  - Complete workflow design
  - Basic/Power user modes
  - Privacy-first approach
  - 9-phase implementation schedule

---

**Document Status**: ✅ Ready for Implementation
**Next Step**: Review with stakeholder, begin Phase 1
**Estimated Completion**: 20-28 working days from start

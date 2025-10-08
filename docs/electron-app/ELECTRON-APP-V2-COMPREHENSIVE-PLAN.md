# Electron App V2: Comprehensive Integration Plan

**Document Version**: 2.0
**Last Updated**: 2025-10-07
**Status**: Ready for Implementation

---

## Executive Summary

This plan outlines the complete transformation of the Electron Cash Management Desktop application, integrating:
1. **JSON Processing Pipeline** (ingestion → FRN matching → deduplication → data quality)
2. **Native Reporting System** (replacing Python portfolio-reporter with React/MUI implementation)
3. **Strategic Allocation Management** (8-tier liquidity allocation system)
4. **Enhanced Portfolio Management** (3-tab structure with optimization integration)

### Core Objectives
- **Unified Workflow**: Seamless data collection → processing → analysis → reporting
- **Native Implementation**: Single TypeScript/React codebase (no Python subprocess)
- **Professional Reports**: Interactive reports with high-quality PDF export via Puppeteer
- **Strategic Planning**: Portfolio allocation targets and rebalancing recommendations
- **User Experience**: Progressive disclosure (basic vs power users)
- **Privacy-First**: No data retention by default for personal finance context

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

---

## Page Architecture

### 1. Data Processing (Renamed from "Data Collection")

**Route**: `/data-processing`
**Access**: All users

[Same as original plan - Tabs 1-5 with scraper, pipeline, results, raw data inspector, audit trail]

### 2. Portfolio Management (Enhanced)

**Route**: `/portfolio-management`
**Access**: All users

[Same as original plan - 3 tabs: Current Holdings, Projected State, Optimization]

### 3. Strategic Allocation (NEW)

**Route**: `/strategic-allocation`
**Access**: All users

#### 2-Tab Structure

**Tab 1: Allocation Targets & Analysis**

**Target Management Section**:
- **8-Tier Liquidity System** (matching Python reporter):
  1. Emergency Fund (immediate access)
  2. Short-term Reserve (< 3 months)
  3. Medium-term Reserve (3-6 months)
  4. Long-term Reserve (6-12 months)
  5. Strategic Cash (12-24 months)
  6. Fixed 12-month
  7. Fixed 24-month
  8. Fixed 36-month

**UI Components**:
```
┌─────────────────────────────────────────────────────────┐
│ ALLOCATION TARGETS                                      │
│                                                         │
│ MUI DataGrid: Allocation Configuration                 │
│ ┌───────────────┬──────────┬──────────┬───────────────┐│
│ │ Tier          │ Target % │ Current %│ Status        ││
│ ├───────────────┼──────────┼──────────┼───────────────┤│
│ │ Emergency     │   5%     │   3.6%   │ 🟡 Below      ││
│ │ Short-term    │  15%     │  18.2%   │ 🟢 On Target  ││
│ │ Medium-term   │  20%     │  25.1%   │ 🔴 Over       ││
│ │ Easy Access   │  25%     │  43.3%   │ 🔴 Over       ││
│ │ Fixed 12m     │  30%     │  11.3%   │ 🔴 Under      ││
│ │ Fixed 24m     │   5%     │   0%     │ 🟡 Below      ││
│ └───────────────┴──────────┴──────────┴───────────────┘│
│                                                         │
│ [Edit Targets] [Restore Defaults] [Save]               │
│                                                         │
│ ⚠️  Validation: Targets sum to 100% ✅                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ ALLOCATION VISUALIZATION                                │
│                                                         │
│ ┌─────────────────────┬─────────────────────────────┐  │
│ │ Current Allocation  │ Target Allocation           │  │
│ │ (Recharts Pie)      │ (Recharts Pie)              │  │
│ │                     │                             │  │
│ │   [Pie Chart]       │   [Pie Chart]               │  │
│ └─────────────────────┴─────────────────────────────┘  │
│                                                         │
│ Gap Analysis (Recharts Bar - Current vs Target):       │
│ ████████████▓▓▓▓▓▓▓▓ Emergency (3.6% vs 5%)           │
│ █████████████████▓▓▓ Short-term (18.2% vs 15%)         │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ PORTFOLIO HEALTH METRICS                                │
│                                                         │
│ Overall Health Score: 78/100 🟡                         │
│                                                         │
│ ┌───────────────────┬─────────┬────────┬──────────────┐│
│ │ Metric            │ Current │ Target │ Status       ││
│ ├───────────────────┼─────────┼────────┼──────────────┤│
│ │ FSCS Utilization  │   73%   │  <90%  │ ✅ Compliant ││
│ │ Allocation Eff.   │  2.3/5  │  >4.0  │ 🟡 Improve   ││
│ │ Rate Optimization │  4.1/5  │  >3.5  │ ✅ Good      ││
│ │ Diversification   │  3.8/5  │  >3.0  │ ✅ Good      ││
│ └───────────────────┴─────────┴────────┴──────────────┘│
└─────────────────────────────────────────────────────────┘
```

**Tab 2: Rebalancing Recommendations**

**Phase-Based Rebalancing Plan**:
```
┌─────────────────────────────────────────────────────────┐
│ STRATEGIC REBALANCING PLAN                              │
│                                                         │
│ MUI DataGrid: Rebalancing Actions                      │
│ ┌────────┬──────────────┬──────────┬─────────┬────────┐│
│ │ Phase  │ From → To    │ Amount   │ Timing  │ Action ││
│ ├────────┼──────────────┼──────────┼─────────┼────────┤│
│ │ Phase 1│ Easy Access  │ £50,000  │ Now     │ [Plan] ││
│ │        │ → Fixed 12m  │          │         │        ││
│ ├────────┼──────────────┼──────────┼─────────┼────────┤│
│ │ Phase 2│ Medium-term  │ £30,000  │ 3 weeks │ [Plan] ││
│ │        │ → Fixed 12m  │          │         │        ││
│ ├────────┼──────────────┼──────────┼─────────┼────────┤│
│ │ Phase 3│ Easy Access  │ £20,000  │ 6 weeks │ [Plan] ││
│ │        │ → Emergency  │          │         │        ││
│ └────────┴──────────────┴──────────┴─────────┴────────┘│
│                                                         │
│ Constraints & Availability:                            │
│ • Easy Access: £710,383 available (unrestricted)       │
│ • Medium-term: £85,000 available (notice accounts)     │
│ • Fixed terms: £185,000 maturing in next 90 days       │
│                                                         │
│ [Execute Phase 1] [Execute All Phases]                 │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ AVAILABILITY SUMMARY                                    │
│                                                         │
│ Immediate Access:     £710,383 (43.3%)                 │
│ Notice 30 days:       £45,000  (2.7%)                  │
│ Notice 60 days:       £40,000  (2.4%)                  │
│ Maturing < 90 days:   £185,000 (11.3%)                 │
│ Locked (> 90 days):   £659,617 (40.3%)                 │
│                                                         │
│ Total Portfolio:      £1,640,000                       │
└─────────────────────────────────────────────────────────┘
```

**Integration with Portfolio Management**:
- Rebalancing actions create pending deposits
- Execute → Navigates to Portfolio Management → Projected State
- Shows impact on allocation targets

### 4. Reports & Analysis (NEW)

**Route**: `/reports`
**Access**: All users

#### Report Generation System

**Main Report Page (3 tabs)**:

**Tab 1: Report Configuration**
```
┌─────────────────────────────────────────────────────────┐
│ REPORT CONFIGURATION                                    │
│                                                         │
│ Report Type:                                           │
│ ◉ Comprehensive Analysis (All sections)                │
│ ○ Executive Summary Only                               │
│ ○ Custom (Select sections)                             │
│                                                         │
│ Sections to Include: (if Custom)                       │
│ ☑ Executive Summary                                    │
│ ☑ Portfolio Holdings                                   │
│ ☑ Strategic Allocation                                 │
│ ☑ Risk Assessment (FSCS)                               │
│ ☑ Market Intelligence                                  │
│ ☑ Maturity Planning                                    │
│ ☑ Action Items                                         │
│ ☑ Appendix                                             │
│                                                         │
│ Portfolio State:                                       │
│ ◉ Current Holdings                                     │
│ ○ Projected (with pending moves)                       │
│ ○ Combined View                                        │
│                                                         │
│ Filters:                                               │
│ Priority: [All ▼] Tiers: [All ▼]                      │
│                                                         │
│ [Generate Report] [Save Configuration]                 │
└─────────────────────────────────────────────────────────┘
```

**Tab 2: Report Viewer** (Interactive)
```
┌─────────────────────────────────────────────────────────┐
│ ┌──────────────┬────────────────────────────────────────┐│
│ │ TOC          │ REPORT CONTENT                         ││
│ │ (Sidebar)    │                                        ││
│ │              │ # Portfolio Analysis Report            ││
│ │ ▼ Executive  │ Generated: 2025-10-07 14:30            ││
│ │ ▼ Holdings   │                                        ││
│ │   • Summary  │ ## Executive Summary                   ││
│ │   • Details  │                                        ││
│ │ ▼ Allocation │ Total Portfolio: £1,640,000            ││
│ │ ▼ Risk       │ Weighted AER: 4.75%                    ││
│ │ ▼ Market     │ Accounts: 12 active                    ││
│ │ ▼ Maturity   │                                        ││
│ │ ▼ Actions    │ Portfolio Health: 78/100 🟡            ││
│ │ ▼ Appendix   │                                        ││
│ │              │ [Interactive MUI DataGrid tables]      ││
│ │              │ [Recharts visualizations]              ││
│ │              │ [Expandable sections]                  ││
│ └──────────────┴────────────────────────────────────────┘│
│                                                         │
│ [Print] [Export PDF] [Export HTML] [Share]             │
└─────────────────────────────────────────────────────────┘
```

**Tab 3: Report History**
```
┌─────────────────────────────────────────────────────────┐
│ RECENT REPORTS                                          │
│                                                         │
│ MUI DataGrid: Report History                           │
│ ┌──────────────────┬──────────┬─────────┬─────────────┐│
│ │ Generated        │ Type     │ Format  │ Actions     ││
│ ├──────────────────┼──────────┼─────────┼─────────────┤│
│ │ 2025-10-07 14:30 │ Full     │ PDF     │ [View][Del] ││
│ │ 2025-10-05 10:15 │ Summary  │ HTML    │ [View][Del] ││
│ │ 2025-10-01 16:45 │ Custom   │ PDF     │ [View][Del] ││
│ └──────────────────┴──────────┴─────────┴─────────────┘│
│                                                         │
│ [Clear All History]                                    │
└─────────────────────────────────────────────────────────┘
```

#### Report Sections (React Components)

**1. Executive Summary**
- Portfolio overview cards (reuse existing dashboard cards)
- Key metrics: Total balance, weighted AER, account count
- Portfolio health score with breakdown
- Top 3 action items preview

**2. Portfolio Holdings**
```tsx
// MUI DataGrid - Auto-sizing columns
<DataGrid
  rows={deposits}
  columns={[
    { field: 'bank', headerName: 'Bank', flex: 1 },
    { field: 'platform', headerName: 'Platform', flex: 0.8 },
    { field: 'accountType', headerName: 'Type', flex: 1 },
    { field: 'balance', headerName: 'Balance', flex: 0.7,
      valueFormatter: (value) => `£${value.toLocaleString()}` },
    { field: 'aer', headerName: 'AER', flex: 0.5,
      valueFormatter: (value) => `${value}%` },
    { field: 'frn', headerName: 'FRN', flex: 0.7 },
    { field: 'termEnd', headerName: 'Maturity', flex: 0.8,
      type: 'date' },
    { field: 'noticePeriod', headerName: 'Notice', flex: 0.7 }
  ]}
  autoHeight
  sortingOrder={['desc', 'asc']}
  initialState={{
    sorting: { sortModel: [{ field: 'balance', sort: 'desc' }] }
  }}
  groupBy={['frn', 'bank']}
/>
```

**No manual CSS width management!** ✅

**3. Strategic Allocation**
- Allocation targets table (MUI DataGrid)
- Current vs Target visualization (Recharts Bar Chart)
- Gap analysis with color-coded status
- Rebalancing recommendations summary

**4. Risk Assessment**
- FSCS exposure by FRN (MUI DataGrid)
- Color-coded compliance status:
  - 🟢 Green: < 80% of £85k limit
  - 🟡 Yellow: 80-95% of limit
  - 🔴 Red: > 95% of limit or breached
- Joint account considerations
- NS&I (unlimited FSCS) highlighted

**5. Market Intelligence**
- Best products by tier (MUI DataGrid)
- Comparison with your current rates
- FSCS headroom available per bank
- Platform availability

**6. Maturity Planning**
- Upcoming maturities (MUI DataGrid)
- Timeline visualization (Recharts Gantt-style)
- Maturity calendar with 30/60/90 day breakdown

**7. Action Items**
- Optimization recommendations (MUI DataGrid)
- Priority sorting (1-4 scale)
- Financial impact (annual benefit)
- Implementation status

**8. Appendix**
- Configuration snapshot (current settings)
- Methodology notes
- Data sources and freshness
- Report generation timestamp

#### PDF Export via Puppeteer

**Implementation** (Main Process):

```typescript
// src/main/services/ReportPDFExporter.ts

import puppeteer from 'puppeteer';
import * as fs from 'fs';

export class ReportPDFExporter {
  async generatePDF(reportHTML: string, outputPath: string): Promise<void> {
    // Launch headless Chrome
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set viewport for consistent rendering
    await page.setViewport({ width: 1200, height: 800 });

    // Load report HTML
    await page.setContent(reportHTML, {
      waitUntil: 'networkidle0' // Wait for all resources
    });

    // Generate PDF with Chrome's PDF engine
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm'
      },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size:10px; width:100%; text-align:center; color:#666;">
          Portfolio Analysis Report - Generated ${new Date().toLocaleDateString()}
        </div>
      `,
      footerTemplate: `
        <div style="font-size:10px; width:100%; text-align:center; color:#666;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `,
      preferCSSPageSize: true
    });

    await browser.close();
  }
}
```

**Benefits over WeasyPrint**:
- ✅ Uses Chrome's PDF rendering engine (excellent quality)
- ✅ Full CSS3 support (Flexbox, Grid, modern selectors)
- ✅ Handles complex layouts automatically
- ✅ Page breaks work correctly (`page-break-after`, `page-break-inside`)
- ✅ Headers/footers with page numbers
- ✅ No markdown embedding issues

**Print-Optimized CSS**:

```css
@media print {
  /* Hide UI elements */
  nav, .no-print, button { display: none !important; }

  /* Optimize for print */
  body {
    background: white;
    color: black;
  }

  /* Page breaks */
  .report-section {
    page-break-after: always;
  }

  .report-section:last-child {
    page-break-after: auto;
  }

  /* Keep tables together */
  table {
    page-break-inside: avoid;
  }

  /* MUI DataGrid print optimization */
  .MuiDataGrid-root {
    border: 1px solid #ddd;
  }

  /* Charts */
  .recharts-wrapper {
    page-break-inside: avoid;
  }
}
```

### 5. FRN Management (Existing - Enhanced)

[Same as original plan - 5 tabs with pipeline integration]

### 6. Product Catalog (NEW)

[Same as original plan - MUI DataGrid with rich filtering]

### 7. Settings (Restructured)

[Same as original plan - Basic/Power user modes, pipeline configuration]

### 8. Audit & Diagnostics (NEW - Power User Only)

[Same as original plan - Unified audit viewer]

---

## Dashboard Enhancements

### Top Priority Metrics (5 Cards - Updated)

```
┌─────────────┬─────────────┬─────────────┬─────────────┬───────────┐
│ Portfolio   │ Data Status │ Data Quality│ Allocation  │ Pending   │
│ £1,640,000  │ ✅ Fresh    │ 94/100      │ 78/100 🟡   │ Actions   │
│ 4.75% avg   │ 2 hrs ago   │ 2 anomalies │ Needs work  │ 23        │
│ [View →]    │ [Update →]  │ [Review →]  │ [Rebalance] │ [View →]  │
└─────────────┴─────────────┴─────────────┴─────────────┴───────────┘
```

**New Card: Allocation Health** (replaces generic "Pending Actions" with more specific info)
- Overall allocation health score (0-100)
- Status: Optimal / Needs Improvement / Out of Balance
- Quick link to Strategic Allocation page

[Rest of dashboard enhancements same as original plan]

---

## Complete Navigation Structure

### Basic User Navigation (8 pages)

```
Main Nav:
├── 📊 Dashboard (enhanced with allocation health card)
├── 💼 Portfolio Management (3 tabs: Current, Projected, Optimization)
├── 📈 Strategic Allocation (NEW - 2 tabs: Targets, Rebalancing) ⭐
├── 📅 Calendar
├── 🔄 Data Processing (3 tabs: Collection, Pipeline, Results)
├── 🔐 FRN Management (5 tabs: Dashboard, Overrides, Research, Lookup, BoE)
├── 📦 Product Catalog
├── 📄 Reports & Analysis (NEW - 3 tabs: Config, Viewer, History) ⭐
└── ⚙️ Settings

Toolbar Actions:
├── 🔄 Update Data
├── ⚙️ Run Pipeline
├── 🎯 Optimize
└── 📄 Generate Report (opens Reports page) ⭐
```

### Power User Navigation (9 pages)

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
├── 🔍 Audit & Diagnostics (power user only) ⚡
└── ⚙️ Settings ⚡ (pipeline config)
```

---

## Database Schema Additions

### Strategic Allocation Tables

> ***NB: These tables, or very similar tables already exist. They are liquidity_allocation_config, allocation_status_thresholds. Let's discuss the pros and cons of the existing and the proposed new approach***

```sql
-- Strategic allocation targets (8-tier system)
CREATE TABLE IF NOT EXISTS allocation_targets (
  tier_id INTEGER PRIMARY KEY,
  tier_name TEXT NOT NULL UNIQUE,
  tier_short_name TEXT NOT NULL,
  target_percentage REAL NOT NULL DEFAULT 0,
  min_percentage REAL,
  max_percentage REAL,
  priority INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (target_percentage >= 0 AND target_percentage <= 100),
  CHECK (min_percentage IS NULL OR (min_percentage >= 0 AND min_percentage <= 100)),
  CHECK (max_percentage IS NULL OR (max_percentage >= 0 AND max_percentage <= 100))
);

-- Default allocation targets (matching Python reporter)
INSERT INTO allocation_targets (tier_id, tier_name, tier_short_name, target_percentage, priority, description) VALUES
(1, 'emergency_fund', 'Emergency', 5.0, 1, 'Immediate access emergency fund'),
(2, 'short_term_reserve', 'Short-term', 15.0, 2, 'Short-term reserve (< 3 months)'),
(3, 'medium_term_reserve', 'Medium-term', 20.0, 3, 'Medium-term reserve (3-6 months)'),
(4, 'easy_access', 'Easy Access', 25.0, 4, 'Easy access savings'),
(5, 'fixed_12m', 'Fixed 12m', 30.0, 5, 'Fixed 12-month deposits'),
(6, 'fixed_24m', 'Fixed 24m', 5.0, 6, 'Fixed 24-month deposits'),
(7, 'fixed_36m', 'Fixed 36m', 0.0, 7, 'Fixed 36-month deposits'),
(8, 'long_term_strategic', 'Strategic', 0.0, 8, 'Long-term strategic allocation');

-- Allocation tier mappings (map my_deposits.liquidity_tier to allocation_targets.tier_id)
CREATE TABLE IF NOT EXISTS allocation_tier_mappings (
  mapping_id INTEGER PRIMARY KEY,
  liquidity_tier TEXT NOT NULL,
  allocation_tier_id INTEGER NOT NULL,
  FOREIGN KEY (allocation_tier_id) REFERENCES allocation_targets(tier_id),
  UNIQUE (liquidity_tier)
);

INSERT INTO allocation_tier_mappings (liquidity_tier, allocation_tier_id) VALUES
('easy_access', 4),
('notice_1_30', 2),
('notice_31_60', 3),
('notice_61_90', 3),
('notice_90+', 5),
('fixed_12m', 5),
('fixed_24m', 6),
('fixed_36m', 7);

-- Portfolio health metrics history (optional - if user wants tracking)
CREATE TABLE IF NOT EXISTS portfolio_health_history (
  record_id INTEGER PRIMARY KEY,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  overall_score REAL NOT NULL,
  fscs_utilization_score REAL,
  allocation_efficiency_score REAL,
  rate_optimization_score REAL,
  diversification_score REAL,
  total_balance REAL NOT NULL,
  weighted_aer REAL NOT NULL,
  account_count INTEGER NOT NULL,
  CHECK (overall_score >= 0 AND overall_score <= 100)
);
```

### Report History Table

```sql
-- Report generation history
CREATE TABLE IF NOT EXISTS report_history (
  report_id INTEGER PRIMARY KEY,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  report_type TEXT NOT NULL, -- 'full', 'summary', 'custom'
  sections_included TEXT, -- JSON array of section names
  portfolio_mode TEXT NOT NULL, -- 'current', 'projected', 'combined'
  output_format TEXT NOT NULL, -- 'html', 'pdf'
  file_path TEXT,
  file_size_bytes INTEGER,
  generation_time_ms INTEGER,
  CHECK (report_type IN ('full', 'summary', 'custom')),
  CHECK (portfolio_mode IN ('current', 'projected', 'combined')),
  CHECK (output_format IN ('html', 'pdf'))
);
```

---

## IPC Handlers (Complete List)

### Pipeline Execution (Existing)
```typescript
'orchestrator:execute-pipeline'
'orchestrator:rebuild-from-raw'
'orchestrator:cancel-pipeline'
'orchestrator:get-status'
'orchestrator:get-health'
'orchestrator:validate-config'
```

### Data Quality (Existing)
```typescript
'orchestrator:get-quality-report'
'orchestrator:get-quality-history'
'orchestrator:get-anomalies'
```

### Audit Trail (Existing)
```typescript
'orchestrator:get-audit-trail'
'orchestrator:export-audit-trail'
'orchestrator:clear-audit-history'
'orchestrator:get-audit-stats'
```

### Configuration (Existing)
```typescript
'orchestrator:update-config'
'orchestrator:validate-config'
'orchestrator:get-config-categories'
'orchestrator:validate-config-update'
'orchestrator:test-configuration'
'orchestrator:restore-defaults'
'orchestrator:export-config'
'orchestrator:import-config'
```

### Product Catalog (Existing)
```typescript
'products:get-available-products'
'products:get-raw-products'
'products:compare-raw-vs-final'
'products:get-product-stats'
```

### CSV Import (Existing)
```typescript
'csv:validate-file'
'csv:preview-import'
'csv:execute-import'
```

### Strategic Allocation (NEW) ⭐
```typescript
// Allocation targets
'allocation:get-targets' // Get all tier targets
'allocation:update-targets' // Update tier targets
'allocation:restore-defaults' // Reset to default allocation

// Analysis
'allocation:get-current-analysis' // Current allocation by tier with gaps
'allocation:get-health-metrics' // Portfolio health scores
'allocation:get-rebalancing-plan' // Phase-based rebalancing recommendations
'allocation:get-availability-summary' // What's available to move

// Execution
'allocation:execute-rebalancing-phase' // Execute a rebalancing phase → creates pending deposits
```

### Native Reporting (NEW) ⭐
```typescript
// Report data gathering
'reports:get-executive-summary' // Portfolio stats, health metrics
'reports:get-holdings-data' // All deposits with full details
'reports:get-allocation-data' // Current vs target by tier
'reports:get-fscs-analysis' // FSCS exposure by FRN with compliance status
'reports:get-market-intelligence' // Best products by tier vs current
'reports:get-maturity-schedule' // Upcoming maturities with timeline
'reports:get-action-items-data' // Optimization recommendations

// Report generation
'reports:generate-html' // Generate HTML report content
'reports:export-pdf' // Generate PDF via Puppeteer (main process)
'reports:save-report' // Save to file system
'reports:get-history' // List recent reports
'reports:delete-report' // Delete report from history
```

---

## Component Architecture

### Directory Structure

```
/renderer/pages/
├── DataProcessing.tsx (renamed from DataCollection.tsx)
├── StrategicAllocation.tsx (NEW) ⭐
├── Reports.tsx (NEW) ⭐
├── ProductCatalog.tsx (new)
├── AuditDiagnostics.tsx (new, power user)
└── PortfolioManagement.tsx (enhanced with 3-tab structure)

/renderer/components/allocation/ (NEW) ⭐
├── AllocationTargetsTab.tsx
│   - Target configuration (MUI DataGrid)
│   - Current vs Target pie charts (Recharts)
│   - Gap analysis bar chart (Recharts)
│   - Health metrics display
├── RebalancingPlanTab.tsx
│   - Phase-based recommendations (MUI DataGrid)
│   - Availability summary
│   - Constraint display
│   - Execute actions
└── widgets/
    ├── AllocationPieChart.tsx (Recharts)
    ├── GapAnalysisChart.tsx (Recharts Bar)
    ├── HealthScoreCard.tsx
    └── AvailabilitySummary.tsx

/renderer/components/reports/ (NEW) ⭐
├── ReportConfigurationTab.tsx
│   - Section selection
│   - Portfolio mode selection
│   - Filter options
├── ReportViewerTab.tsx
│   - Report display with TOC sidebar
│   - Section navigation
│   - Export controls
├── ReportHistoryTab.tsx
│   - Recent reports table (MUI DataGrid)
│   - View/delete actions
├── sections/
│   ├── ExecutiveSummary.tsx
│   │   - Portfolio overview cards
│   │   - Health metrics
│   │   - Key stats
│   ├── PortfolioHoldings.tsx
│   │   - MUI DataGrid with all deposits
│   │   - Grouping by FRN/Bank
│   │   - Sortable, filterable
│   ├── StrategicAllocationSection.tsx
│   │   - Allocation table (MUI DataGrid)
│   │   - Visualization (Recharts)
│   │   - Gap analysis
│   ├── RiskAssessment.tsx
│   │   - FSCS exposure table (MUI DataGrid)
│   │   - Color-coded compliance
│   ├── MarketIntelligence.tsx
│   │   - Best products table (MUI DataGrid)
│   │   - Rate comparison
│   │   - FSCS headroom
│   ├── MaturityPlanning.tsx
│   │   - Maturity schedule (MUI DataGrid)
│   │   - Timeline chart (Recharts)
│   ├── ActionItems.tsx
│   │   - Recommendations table (MUI DataGrid)
│   │   - Priority sorting
│   └── Appendix.tsx
│       - Configuration display
│       - Methodology
└── print/
    ├── PrintLayout.tsx (print CSS wrapper)
    └── ReportPDFGenerator.tsx (Puppeteer integration)

/renderer/components/pipeline/ (Existing)
├── tabs/ [Data Collection, Pipeline Processing, Results, etc.]
└── widgets/ [Pipeline status, quality score, etc.]

/renderer/components/csv/ (Existing)
├── CSVUploader.tsx
├── ColumnMapper.tsx
└── ImportPreview.tsx

/renderer/components/catalog/ (Existing)
├── ProductDataGrid.tsx
├── ProductFilters.tsx
└── ProductComparator.tsx

/renderer/components/dashboard/ (Enhanced)
├── DataStatusCard.tsx
├── QualityScoreCard.tsx
├── AllocationHealthCard.tsx (NEW) ⭐
├── ActionableInsightsPanel.tsx
└── PowerUserMetrics.tsx

/main/services/ (Main Process)
├── ReportPDFExporter.ts (NEW - Puppeteer) ⭐
└── [existing services]
```

---

## Implementation Phases

### Phase 1-9: Pipeline Integration (Same as Original Plan)

[All original 9 phases remain unchanged - see original PIPELINE-INTEGRATION-PLAN.md]

**Estimated Time: 20-28 days**

---

### Phase 10: Strategic Allocation (3-4 days) ⭐

**Deliverables**:
- [ ] Create StrategicAllocation.tsx page
- [ ] Implement allocation_targets schema and default data
- [ ] Implement allocation_tier_mappings schema
- [ ] Tab 1: Allocation Targets & Analysis
  - [ ] MUI DataGrid for target configuration
  - [ ] Edit targets with validation (sum to 100%)
  - [ ] Recharts: Current allocation pie chart
  - [ ] Recharts: Target allocation pie chart
  - [ ] Recharts: Gap analysis bar chart (current vs target)
  - [ ] Portfolio health metrics card:
    - [ ] Overall health score calculation
    - [ ] FSCS utilization score
    - [ ] Allocation efficiency score
    - [ ] Rate optimization score
    - [ ] Diversification score
- [ ] Tab 2: Rebalancing Plan
  - [ ] Phase-based rebalancing recommendations
  - [ ] Availability summary (what can be moved)
  - [ ] Constraint analysis (notice periods, fixed terms)
  - [ ] Execute rebalancing → creates pending deposits
- [ ] Add to navigation
- [ ] Dashboard: Add Allocation Health card

**IPC Handlers**:
- [ ] `allocation:get-targets`
- [ ] `allocation:update-targets`
- [ ] `allocation:restore-defaults`
- [ ] `allocation:get-current-analysis`
- [ ] `allocation:get-health-metrics`
- [ ] `allocation:get-rebalancing-plan`
- [ ] `allocation:get-availability-summary`
- [ ] `allocation:execute-rebalancing-phase`

**Allocation Analysis Logic**:
```typescript
// Calculate allocation gaps
for each tier:
  current_balance = sum of deposits in tier
  current_percentage = (current_balance / total_balance) * 100
  target_percentage = tier.target_percentage
  gap = target_percentage - current_percentage
  rebalancing_amount = (gap / 100) * total_balance

  status = {
    if gap > 5: 'UNDERWEIGHT'
    if gap < -5: 'OVERWEIGHT'
    else: 'ON_TARGET'
  }

// Portfolio health score
fscs_utilization = max_frn_exposure / 85000
allocation_efficiency = 1 - (sum(abs(gaps)) / 200)
rate_optimization = your_avg_rate / best_available_rate
diversification = 1 / (1 + gini_coefficient)

overall_health = weighted_average([
  fscs_utilization * 0.3,
  allocation_efficiency * 0.3,
  rate_optimization * 0.25,
  diversification * 0.15
])
```

---

### Phase 11: Native Report System (4-6 days) ⭐

**Deliverables**:

#### **Day 1-2: Core Report Structure**
- [ ] Create Reports.tsx page with 3-tab layout
- [ ] Implement report_history schema
- [ ] Tab 1: Report Configuration
  - [ ] Section selection checkboxes
  - [ ] Portfolio mode selection
  - [ ] Filter options (priority, tiers)
  - [ ] Generate Report button
- [ ] Tab 3: Report History
  - [ ] MUI DataGrid with recent reports
  - [ ] View/delete actions
  - [ ] File size display
- [ ] Create base report sections:
  - [ ] ExecutiveSummary.tsx (portfolio cards, health metrics)
  - [ ] PortfolioHoldings.tsx (MUI DataGrid with all deposits)

#### **Day 3-4: Complete Report Sections**
- [ ] StrategicAllocationSection.tsx
  - [ ] Allocation table (MUI DataGrid)
  - [ ] Current vs Target charts (Recharts)
  - [ ] Gap analysis
- [ ] RiskAssessment.tsx
  - [ ] FSCS exposure table (MUI DataGrid)
  - [ ] Color-coded compliance status
- [ ] MarketIntelligence.tsx
  - [ ] Best products by tier (MUI DataGrid)
  - [ ] Rate comparison vs current holdings
  - [ ] FSCS headroom display
- [ ] MaturityPlanning.tsx
  - [ ] Maturity schedule (MUI DataGrid)
  - [ ] Timeline visualization (Recharts)
- [ ] ActionItems.tsx
  - [ ] Recommendations table (MUI DataGrid)
  - [ ] Priority sorting
- [ ] Appendix.tsx
  - [ ] Configuration snapshot
  - [ ] Methodology notes

#### **Day 5: PDF Export with Puppeteer**
- [ ] Create ReportPDFExporter.ts (main process)
- [ ] Puppeteer integration:
  - [ ] Install puppeteer dependency
  - [ ] Headless Chrome setup
  - [ ] HTML → PDF conversion
  - [ ] Page break handling
  - [ ] Header/footer with page numbers
- [ ] Print-optimized CSS (`@media print`)
  - [ ] Hide UI elements (nav, buttons)
  - [ ] Optimize tables for print
  - [ ] Page break rules
  - [ ] MUI DataGrid print styling
- [ ] Alternative: Browser print dialog (fallback option)

#### **Day 6: Polish & Integration**
- [ ] Tab 2: Report Viewer
  - [ ] TOC sidebar with section navigation
  - [ ] Report content display
  - [ ] Export controls (PDF, HTML)
  - [ ] Print button
- [ ] Toolbar: Add "Generate Report" button
- [ ] Report configuration persistence
- [ ] Error handling (Puppeteer failures)
- [ ] Loading states
- [ ] Success notifications

**IPC Handlers**:
- [ ] `reports:get-executive-summary`
- [ ] `reports:get-holdings-data`
- [ ] `reports:get-allocation-data`
- [ ] `reports:get-fscs-analysis`
- [ ] `reports:get-market-intelligence`
- [ ] `reports:get-maturity-schedule`
- [ ] `reports:get-action-items-data`
- [ ] `reports:generate-html`
- [ ] `reports:export-pdf` (calls Puppeteer in main)
- [ ] `reports:save-report`
- [ ] `reports:get-history`
- [ ] `reports:delete-report`

**Dependencies**:
```json
{
  "dependencies": {
    "puppeteer": "^21.0.0"
  }
}
```

---

## Complete Implementation Timeline

| Phase | Description | Days | Cumulative |
|-------|-------------|------|------------|
| 1 | Core Data Processing | 4-5 | 4-5 |
| 2 | CSV Import | 2-3 | 6-8 |
| 3 | Product Catalog | 2-3 | 8-11 |
| 4 | Power User Features | 3-4 | 11-15 |
| 5 | Portfolio Management Consolidation | 2-3 | 13-18 |
| 6 | Configuration Restructure | 2-3 | 15-21 |
| 7 | Dashboard Enhancements | 2-3 | 17-24 |
| 8 | FRN Management Enhancements | 1-2 | 18-26 |
| 9 | Integration & Polish | 2-3 | 20-29 |
| **10** | **Strategic Allocation** ⭐ | **3-4** | **23-33** |
| **11** | **Native Report System** ⭐ | **4-6** | **27-39** |

**Total Estimated Time: 27-39 working days (~5.5-8 weeks)**

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
- ✅ **Strategic allocation management (8-tier system)** ⭐
- ✅ **Portfolio health scoring** ⭐
- ✅ **Rebalancing recommendations** ⭐
- ✅ **Native report generation (React/MUI)** ⭐
- ✅ **High-quality PDF export (Puppeteer)** ⭐

### User Experience

**Must Have**:
- ✅ Intuitive navigation (8-9 pages max)
- ✅ Progressive disclosure (complexity when needed)
- ✅ Clear visual hierarchy (color-coded status)
- ✅ Actionable dashboard (what to do next)
- ✅ Privacy-first (no retention by default)
- ✅ FSCS disclaimers (user responsibility clear)
- ✅ Responsive design (desktop/tablet/mobile)
- ✅ **Interactive reports (sort, filter tables)** ⭐
- ✅ **Professional PDF output** ⭐

### Technical Quality

**Must Have**:
- ✅ Reuse existing components/patterns (MUI, DataGrid, Cards)
- ✅ Real-time IPC event streaming
- ✅ Proper error handling (user-friendly messages)
- ✅ Type safety (TypeScript strict mode)
- ✅ Performance optimization (virtualized tables for >1000 rows)
- ✅ **No CSS width brittleness (MUI auto-sizing)** ⭐
- ✅ **Single codebase (no Python subprocess)** ⭐

---

## Comparison: Python Reporter vs Native Electron

| Feature | Python Reporter | Native Electron V2 |
|---------|----------------|-------------------|
| **Table Styling** | 🔴 Brittle CSS (200+ lines of nth-child selectors) | ✅ MUI DataGrid (auto-sizing, zero manual CSS) |
| **PDF Quality** | 🔴 WeasyPrint broken (markdown leaks) | ✅ Chrome PDF engine via Puppeteer |
| **Interactivity** | 🔴 Static HTML | ✅ Live sorting, filtering, drill-down |
| **Maintainability** | 🔴 Jinja2 templates, complex cascade | ✅ React components, clear hierarchy |
| **Consistency** | 🔴 Different styling from app | ✅ Material-UI throughout |
| **Development** | 🔴 Python + TypeScript split | ✅ Single TypeScript codebase |
| **User Experience** | 🔴 CLI tool, subprocess | ✅ Integrated native UI |
| **Performance** | 🟡 Template rendering + subprocess | ✅ Native in-process rendering |
| **Visualization** | 🔴 No charts | ✅ Recharts integration |
| **Export Options** | 🟡 HTML, PDF (broken), Markdown | ✅ Interactive HTML, High-quality PDF |

**Winner: Native Electron V2** ✅

---

## Migration Path from Python Reporter

### Phase 1: Feature Parity (Phases 10-11)
- Implement all report sections in React
- Match or exceed Python reporter functionality
- Native PDF export via Puppeteer

### Phase 2: Python Reporter Retirement
- Archive Python reporter code to `/portfolio-reporter-archived/`
- Update documentation
- Remove Python dependencies from project

### Phase 3: Future Enhancements
- Add interactive charts (Recharts: area, line, scatter)
- Report scheduling (generate automatically)
- Email reports (future consideration)
- Historical report comparison (if audit retention enabled)

---

## Risk Mitigation

### Technical Risks

**Risk**: Puppeteer PDF generation performance
- **Mitigation**: Generate PDFs in background, show progress indicator
- **Fallback**: Browser print dialog (simpler, no Puppeteer)

**Risk**: MUI DataGrid performance with large datasets (>1000 rows)
- **Mitigation**: Built-in virtualization, pagination, lazy loading

**Risk**: Report generation blocking UI
- **Mitigation**: Run in separate render process or use Web Workers

### UX Risks

**Risk**: Reports too complex for basic users
- **Mitigation**: "Quick Report" option (Executive Summary only)
- **Mitigation**: Progressive disclosure (expandable sections)

**Risk**: PDF export confusion (where did it save?)
- **Mitigation**: File save dialog with user-chosen location
- **Mitigation**: Success notification with "Open Folder" button

---

## Appendix

### Dependencies Added

```json
{
  "dependencies": {
    "puppeteer": "^21.0.0",
    "recharts": "^2.10.0"
  }
}
```

### Related Documentation

- **Pipeline Services**: `/docs/scrapers-and-json-processing/`
- **Python Reporter Analysis**: `/docs/electron-app/python-reporter-vs-electron-analysis.md`
- **Database Schema**: `/.claude/database_schema.md`
- **Current Phase**: `/.claude/current_phase.md`
- **Implementation Status**: `/.claude/implementation_status.md`

### Version History

- **v1.0** (2025-10-07): Initial pipeline integration plan
- **v2.0** (2025-10-07): Added Strategic Allocation (Phase 10) and Native Reporting (Phase 11)
  - Complete replacement of Python reporter with React/MUI implementation
  - Puppeteer-based PDF export
  - 8-tier strategic allocation system
  - Portfolio health scoring
  - Estimated timeline: 27-39 days (vs 20-28 for v1.0)

---

**Document Status**: ✅ Ready for Implementation
**Next Step**: Review with stakeholder, begin Phase 1
**Estimated Completion**: 27-39 working days (~5.5-8 weeks) from start

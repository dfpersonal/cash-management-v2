# FRN Management User Guide

A step-by-step guide for managing Financial Reference Number (FRN) research and deployment in the cash management system.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Daily Operations](#daily-operations)
3. [Research Process](#research-process)
4. [Script Reference](#script-reference)
5. [Troubleshooting](#troubleshooting)
6. [Advanced Usage](#advanced-usage)

## Getting Started

### Prerequisites

- SQLite3 installed and accessible via command line
- Access to `/Users/david/Websites/cash-management/data/database/cash_savings.db`
- Internet access for FSCS protection checker
- Basic understanding of SQL (helpful but not required)

### First-Time Setup

1. **Navigate to project directory:**
   ```bash
   cd /Users/david/Websites/cash-management
   ```

2. **Create database views (one-time setup):**
   ```bash
   sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/create-research-views.sql
   ```

3. **Check current status:**
   ```bash
   sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/research-status.sql
   ```

## Daily Operations

### Morning Routine: Check System Status

**What:** Get an overview of FRN coverage and pending research  
**When:** Start of each research session  
**Command:**
```bash
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/research-status.sql
```

**What to look for:**
- Current coverage percentage (goal: 80%+)
- Number of banks awaiting research
- Recent deployment activity

### Weekly Maintenance: Refresh Research Queue

**What:** Add newly discovered unmatched banks to the research queue  
**When:** Weekly or after major scraper runs  
**Command:**
```bash
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/refresh-research-temp.sql
```

**Expected output:** Number of new banks added to research queue

## Research Process

### Research Status Lifecycle

The system tracks research progress through the following status progression:

- **`NULL`** → Research not started
- **`'VERIFIED'`** → Research completed and verified via FSCS, ready for deployment
- **`'DEPLOYED'`** → Research successfully deployed to production manual overrides
- **`'NOT_FOUND'`** → Confirmed that bank has no FRN (rare)

**Important:** Only records with `research_status = 'VERIFIED'` will be deployed. After deployment, status automatically changes to `'DEPLOYED'`.

### Step 1: Identify Priority Banks

Run the status report and focus on banks with:
- High product count (5+ products)
- High interest rates (competitive banks)
- Major platforms (direct, hargreaves_lansdown, etc.)

### Step 2: Manual FSCS Research

**Tool:** FSCS Protection Checker - https://www.fscs.org.uk/check/check-your-money-is-protected/

**Process for each bank:**

1. **Search the bank name** in the FSCS checker
2. **Look for autocomplete suggestions** showing "(FRN: xxxxxx)"
3. **Record findings:**
   - Bank name as it appears in scraper data
   - Official firm name from FSCS
   - FRN number
   - Notes about any name variations

### Step 3: Update Research Table

**Manual SQL Updates:**
```sql
-- Template for updating research findings
UPDATE frn_research_temp 
SET 
    researched_frn = 'INSERT_FRN_HERE',
    researched_firm_name = 'INSERT_OFFICIAL_NAME_HERE',
    research_notes = 'Found via FSCS checker - INSERT_DATE',
    research_status = 'VERIFIED',
    research_date = date('now')
WHERE bank_name = 'INSERT_SCRAPED_NAME_HERE'
  AND researched_frn IS NULL;
```

**Example:**
```sql
UPDATE frn_research_temp 
SET 
    researched_frn = '206023',
    researched_firm_name = 'The Chorley and District Building Society',
    research_notes = 'Found via FSCS checker - 2025-08-03',
    research_status = 'VERIFIED',
    research_date = date('now')
WHERE bank_name = 'Chorley Building Society'
  AND researched_frn IS NULL;
```

### Step 4: Deploy Research Results

**When:** After completing a batch of research (5-10 banks)  
**Command:**
```bash
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/deploy-research.sql
```

**What happens:**
- Verified research added to manual overrides
- Product FRNs updated in production
- Research marked as applied with timestamp

## Script Reference

### Core Scripts

| Script | Purpose | Frequency | Safety |
|--------|---------|-----------|---------|
| `research-status.sql` | Status reporting | Daily | ✅ Read-only |
| `refresh-research-temp.sql` | Add new banks | Weekly | ✅ Idempotent |
| `deploy-research.sql` | Apply verified research | After research | ✅ Safe to re-run |
| `frn-research-update-script.sql` | Full deployment | Major deployments | ⚠️ Comprehensive |

### Utility Scripts

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `create-research-views.sql` | Setup database views | One-time setup |
| `cleanup-research-data.sql` | Data maintenance | Monthly cleanup |
| `frn-research-helper.sql` | Research assistance | During manual research |

### Automated Tools

| Tool | Command | Purpose |
|------|---------|---------|
| FSCS Scraper | `npm run fscs:lookup` | Automated FRN lookup |
| FSCS Scraper (visible) | `npm run fscs:lookup:visible` | Debug/monitor scraping |
| FSCS Scraper (limited) | `npm run fscs:lookup:5` | Test with 5 banks |

## Troubleshooting

### Common Scenarios

#### Scenario 1: No Research Records Ready for Deployment
**Symptom:** `deploy-research.sql` shows "0 records applied"

**Check:**
```sql
-- Verify research status
SELECT bank_name, research_status, researched_frn, applied_date 
FROM frn_research_temp 
WHERE research_status = 'VERIFIED' AND applied_date IS NULL;
```

**Solution:** Ensure research records have `research_status = 'VERIFIED'` and `applied_date IS NULL`

#### Scenario 2: Bank Names Don't Match
**Symptom:** Products still missing FRNs after deployment

**Check:**
```sql
-- Find exact bank name in products
SELECT DISTINCT bank_name FROM available_products WHERE frn IS NULL LIMIT 10;

-- Compare with research table
SELECT bank_name FROM frn_research_temp WHERE research_status = 'VERIFIED';
```

**Solution:** Ensure bank names match exactly between tables, or add name variants to manual overrides

#### Scenario 3: Duplicate Research Entries
**Symptom:** Same bank appears multiple times in research queue

**Check:**
```bash
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/cleanup-research-data.sql
```

**Solution:** Review duplicates and remove/consolidate as needed

### Data Verification Commands

```sql
-- Check coverage improvement
SELECT 
    COUNT(*) as total_products,
    COUNT(CASE WHEN frn IS NOT NULL THEN 1 END) as with_frn,
    ROUND(COUNT(CASE WHEN frn IS NOT NULL THEN 1 END) * 100.0 / COUNT(*), 1) as coverage_pct
FROM available_products;

-- Check manual overrides
SELECT COUNT(*) FROM frn_manual_overrides WHERE frn IS NOT NULL;

-- Check recent deployments
SELECT COUNT(*) FROM frn_research_temp WHERE applied_date >= date('now', '-1 day');
```

## Advanced Usage

### Batch Research Updates

For updating multiple banks at once:

```sql
-- Start transaction for safety
BEGIN TRANSACTION;

-- Multiple updates
UPDATE frn_research_temp SET researched_frn = '123456', researched_firm_name = 'Bank One', research_status = 'VERIFIED', research_date = date('now') WHERE bank_name = 'Bank1';
UPDATE frn_research_temp SET researched_frn = '234567', researched_firm_name = 'Bank Two', research_status = 'VERIFIED', research_date = date('now') WHERE bank_name = 'Bank2';
-- ... more updates

-- Verify changes look correct
SELECT bank_name, researched_frn, researched_firm_name FROM frn_research_temp WHERE research_date = date('now');

-- Commit if satisfied
COMMIT;
```

### Custom Research Queries

```sql
-- Find banks with similar names for potential matching
SELECT bank_name, product_count FROM frn_research_temp 
WHERE bank_name LIKE '%building%' AND research_status IS NULL
ORDER BY product_count DESC;

-- High-value targets by interest rate
SELECT bank_name, product_count, avg_rate 
FROM frn_research_temp 
WHERE research_status IS NULL AND avg_rate > 4.0
ORDER BY avg_rate DESC, product_count DESC;

-- Research progress by platform
SELECT platform, 
       COUNT(*) as total_banks,
       COUNT(CASE WHEN research_status = 'VERIFIED' THEN 1 END) as researched
FROM frn_research_temp 
GROUP BY platform;
```

### Automated Research with FSCS Scraper

The FSCS scraper can automate some research, but manual verification is recommended:

```bash
# Run automated lookup on top 10 unmatched banks
npm run fscs:lookup

# Check results
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/research-status.sql

# Deploy any successful automated findings
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/deploy-research.sql
```

## Best Practices

1. **Always check status first** - Understand current state before making changes
2. **Work in small batches** - Research and deploy 5-10 banks at a time
3. **Verify deployments** - Check coverage improvement after each deployment
4. **Document findings** - Use meaningful research notes for future reference
5. **Test queries first** - Use `SELECT` before `UPDATE` when uncertain
6. **Keep backups** - Database is automatically backed up, but be cautious with manual SQL

## Success Metrics

- **Coverage Target**: 80%+ products with FRNs
- **Research Efficiency**: Process 10+ banks per hour (manual research)
- **Deployment Safety**: Zero errors in production manual overrides
- **Maintenance**: Monthly refresh cycles, weekly progress reviews

---

**Need Help?**
- Check the main README.md for technical details
- Review troubleshooting section for common issues
- Use `research-status.sql` to understand current state
- Test changes on small batches before large deployments

*Last Updated: 2025-08-03*
# FRN Research and Management Scripts

This directory contains a comprehensive set of scripts for managing FRN (Financial Reference Number) research and deployment in the cash management system.

## Quick Start

```bash
# Navigate to project root first
cd /Users/david/Websites/cash-management

# Generate current status report
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/research-status.sql

# Add new unmatched banks to research queue
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/refresh-research-temp.sql

# Deploy completed research to production
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/deploy-research.sql
```

## Scripts Overview

### Core Workflow Scripts

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `research-status.sql` | Comprehensive status report | Check progress anytime |
| `refresh-research-temp.sql` | Add new unmatched banks | Weekly/monthly maintenance |
| `deploy-research.sql` | Apply verified research | After completing manual research |
| `frn-research-update-script.sql` | Full deployment with lifecycle tracking | Major deployments |

### Research Tools

| Tool | Purpose | Usage |
|------|---------|-------|
| `fscs-frn-lookup.js` | Automated FSCS lookup | `npm run fscs:lookup` |
| `frn-research-helper.sql` | Research assistance queries | Manual research support |

### Database Management

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `create-research-views.sql` | Create management views | One-time setup |
| `cleanup-research-data.sql` | Data maintenance utilities | Periodic cleanup |

## Current Status (as of 2025-08-03)

✅ **Successfully Deployed**: 52 verified FRNs covering 226 products  
📊 **Coverage**: 83.2% of products now have FRNs (1,076 out of 1,294)  
🎯 **Bank Coverage**: 67.3% of unique banks matched (136 out of 202)  
⏳ **Remaining**: 97 banks covering 218 products awaiting research  

## Research Workflow

### 1. Check Status
```bash
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/research-status.sql
```

### 2. Refresh Research Queue (if needed)
```bash
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/refresh-research-temp.sql
```

### 3. Manual Research Process
Use the FSCS protection checker: https://www.fscs.org.uk/check/check-your-money-is-protected/

For each unmatched bank:
1. Search bank name in FSCS checker
2. Record FRN and official firm name
3. Update research table with findings

### 4. Deploy Research Results
```bash
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/deploy-research.sql
```

## Database Views

After running `create-research-views.sql`, you'll have access to:

- `pending_frn_research` - Banks awaiting research
- `completed_frn_research` - Verified research ready for deployment  
- `frn_coverage_summary` - Overall coverage statistics
- `high_impact_unmatched` - Priority targets for research

## Automated Tools

### FSCS Scraper
```bash
# Process top 10 unmatched banks
npm run fscs:lookup

# Process specific number with visible browser
npm run fscs:lookup:5 --visible

# Custom limit
npm run fscs:lookup -- --limit=15
```

### Research Helper Queries
The `frn-research-helper.sql` script provides useful queries for:
- Finding banks with similar names
- Checking research progress
- Identifying high-impact targets

## Data Lifecycle

The system maintains a complete audit trail:

1. **Research Queue** (`frn_research_temp`) - Working table for research
2. **Manual Overrides** (`frn_manual_overrides`) - Production lookup table
3. **Applied Tracking** - `applied_date` column tracks deployment history
4. **Archive System** - Historical research data preservation

## Best Practices

1. **Always check status first** - Run `research-status.sql` before making changes
2. **Use incremental deployment** - Use `deploy-research.sql` for frequent small deployments
3. **Maintain research notes** - Document findings for future reference
4. **Verify results** - Check coverage improvements after deployment
5. **Regular maintenance** - Run `refresh-research-temp.sql` monthly to catch new banks

## Troubleshooting

### Common Issues

**Q: Deployment shows 0 records applied**  
A: Check that research records have `research_status = 'VERIFIED'` and `applied_date IS NULL`

**Q: Products still missing FRNs after deployment**  
A: Verify bank names match exactly between research and product tables

**Q: Duplicate research entries**  
A: Run `cleanup-research-data.sql` to identify and resolve duplicates

### Data Verification

```sql
-- Check research ready for deployment
SELECT COUNT(*) FROM frn_research_temp 
WHERE research_status = 'VERIFIED' AND applied_date IS NULL;

-- Check manual overrides count
SELECT COUNT(*) FROM frn_manual_overrides WHERE frn IS NOT NULL;

-- Check product coverage
SELECT COUNT(*) FROM available_products WHERE frn IS NOT NULL;
```

## Success Metrics

- **Immediate Goal**: 80%+ product coverage through systematic research
- **Long-term Goal**: Self-maintaining system with minimal manual intervention
- **Quality Goal**: 100% accuracy for FSCS compliance reporting

---

*Last Updated: 2025-08-03*  
*Research Status: 52 verified FRNs applied, 97 banks remaining*
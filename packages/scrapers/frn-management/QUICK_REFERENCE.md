# FRN Management Quick Reference

Essential commands for daily FRN management operations.

## 🚀 Quick Commands

```bash
# Navigate to project root
cd /Users/david/Websites/cash-management

# Check current status
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/research-status.sql

# Deploy verified research
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/deploy-research.sql

# Add new banks to research queue
sqlite3 data/database/cash_savings.db < puppeteer-scraper/frn-management/refresh-research-temp.sql
```

## 📊 Current Status (2025-08-03)

- ✅ **83.2% coverage** (1,076 out of 1,294 products)
- 🏦 **67.3% banks matched** (136 out of 202 banks)  
- 📋 **52 FRNs deployed** covering 226 products
- ⏳ **97 banks remaining** (218 products)

## 🔍 Research Template

**FSCS Lookup:** https://www.fscs.org.uk/check/check-your-money-is-protected/

**SQL Update Template:**
```sql
UPDATE frn_research_temp 
SET 
    researched_frn = 'FRN_NUMBER',
    researched_firm_name = 'OFFICIAL_FIRM_NAME',
    research_notes = 'Found via FSCS checker - TODAY_DATE',
    research_status = 'VERIFIED',
    research_date = date('now')
WHERE bank_name = 'SCRAPED_BANK_NAME'
  AND researched_frn IS NULL;
```

**Status Lifecycle:** `NULL` → `VERIFIED` → `DEPLOYED`

## 🛠️ File Organization

```
puppeteer-scraper/frn-management/
├── README.md                    # Complete documentation
├── USER_GUIDE.md               # Step-by-step guide
├── QUICK_REFERENCE.md          # This file
├── research-status.sql         # Status reporting
├── deploy-research.sql         # Apply verified research
├── refresh-research-temp.sql   # Add new banks
├── frn-research-update-script.sql # Full deployment
├── create-research-views.sql   # Database views setup
├── cleanup-research-data.sql   # Maintenance utilities
└── frn-research-helper.sql     # Research assistance
```

## 🎯 Daily Workflow

1. **Check status** → `research-status.sql`
2. **Research 5-10 banks** → FSCS checker + SQL updates  
3. **Deploy findings** → `deploy-research.sql`
4. **Verify results** → `research-status.sql`

## 🔧 Troubleshooting

- **0 records deployed?** → Check `research_status = 'VERIFIED'` and `applied_date IS NULL`
- **Products missing FRNs?** → Verify exact bank name matching
- **Need to start over?** → Check `USER_GUIDE.md` troubleshooting section

---
*For detailed instructions, see USER_GUIDE.md*
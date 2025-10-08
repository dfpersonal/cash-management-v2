-- Research Data Cleanup Utilities
-- Safe utilities for managing research data lifecycle

.print "=== FRN RESEARCH DATA CLEANUP UTILITIES ==="
.print ""

-- Option 1: Archive old applied research (older than 90 days)
-- Uncomment and run if you want to clean up very old applied research
/*
.print "Archiving applied research older than 90 days..."

-- Create archive table if not exists
CREATE TABLE IF NOT EXISTS frn_research_archive (
    bank_name TEXT,
    platform TEXT,
    source TEXT,
    account_type TEXT,
    product_count INTEGER,
    min_rate REAL,
    max_rate REAL,
    avg_rate REAL,
    first_seen TEXT,
    last_seen TEXT,
    researched_frn TEXT,
    researched_firm_name TEXT,
    research_notes TEXT,
    research_status TEXT,
    research_date TEXT,
    applied_date TEXT,
    archived_date TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Move old applied research to archive
INSERT INTO frn_research_archive 
SELECT 
    *,
    CURRENT_TIMESTAMP as archived_date
FROM frn_research_temp 
WHERE applied_date IS NOT NULL 
  AND applied_date < date('now', '-90 days');

-- Remove from active table
DELETE FROM frn_research_temp 
WHERE applied_date IS NOT NULL 
  AND applied_date < date('now', '-90 days');

SELECT 'Records archived' as action, changes() as count;
*/

-- Option 2: Remove duplicate research entries (keep most recent)
.print "Checking for duplicate research entries..."

SELECT 
    'Potential Duplicates' as check_type,
    COUNT(*) - COUNT(DISTINCT bank_name) as duplicate_count
FROM frn_research_temp;

-- Show any duplicates
SELECT 
    bank_name,
    COUNT(*) as entry_count,
    GROUP_CONCAT(research_status, ', ') as statuses
FROM frn_research_temp 
GROUP BY bank_name 
HAVING COUNT(*) > 1;

-- Option 3: Clean up inconsistent data
.print ""
.print "Checking data consistency..."

-- Banks with FRN but no research status
SELECT 
    'FRN without VERIFIED status' as issue,
    COUNT(*) as count
FROM frn_research_temp 
WHERE researched_frn IS NOT NULL 
  AND research_status != 'VERIFIED';

-- Applied research without FRN
SELECT 
    'Applied without FRN' as issue,
    COUNT(*) as count
FROM frn_research_temp 
WHERE applied_date IS NOT NULL 
  AND researched_frn IS NULL;

-- Option 4: Reset failed research attempts (use carefully)
/*
.print "Resetting failed research attempts..."

UPDATE frn_research_temp 
SET research_status = NULL,
    research_notes = NULL,
    research_date = NULL
WHERE research_status = 'FAILED' 
   OR research_status = 'ERROR'
   OR (research_notes LIKE '%error%' AND research_status != 'VERIFIED');

SELECT 'Research attempts reset' as action, changes() as count;
*/

.print ""
.print "=== MAINTENANCE COMPLETE ==="
.print "Review any issues above and run specific cleanup sections as needed."
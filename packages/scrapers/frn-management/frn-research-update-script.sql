-- FRN Research Update Script - Enhanced with Lifecycle Management
-- This script applies researched FRNs from frn_research_temp to both 
-- frn_manual_overrides and available_products tables
-- 
-- Features:
-- - Idempotent (safe to re-run)
-- - Tracks deployment history with applied_date
-- - Comprehensive reporting of changes
-- - Maintains audit trail

-- Pre-deployment check: Add applied_date column if not exists
ALTER TABLE frn_research_temp ADD COLUMN applied_date TEXT DEFAULT NULL;

-- Step 1: Insert/Update manual overrides for researched banks
INSERT OR REPLACE INTO frn_manual_overrides (
    scraped_name, 
    frn, 
    firm_name, 
    confidence_score, 
    notes, 
    created_at
)
SELECT 
    bank_name,
    researched_frn,
    researched_firm_name,
    1.0,
    COALESCE(research_notes, 'Manual research - ' || research_date),
    CURRENT_TIMESTAMP
FROM frn_research_temp 
WHERE researched_frn IS NOT NULL 
  AND research_status = 'VERIFIED';

-- Step 2: Update existing available_products records with researched FRNs
UPDATE available_products 
SET 
    frn = (
        SELECT researched_frn 
        FROM frn_research_temp 
        WHERE frn_research_temp.bank_name = available_products.bank_name 
          AND researched_frn IS NOT NULL 
          AND research_status = 'VERIFIED'
    ),
    bank_name = (
        SELECT researched_firm_name 
        FROM frn_research_temp 
        WHERE frn_research_temp.bank_name = available_products.bank_name 
          AND researched_firm_name IS NOT NULL 
          AND research_status = 'VERIFIED'
    )
WHERE bank_name IN (
    SELECT bank_name 
    FROM frn_research_temp 
    WHERE researched_frn IS NOT NULL 
      AND research_status = 'VERIFIED'
)
AND frn IS NULL;

-- Step 3: Mark applied records with timestamp and update status to DEPLOYED
UPDATE frn_research_temp 
SET applied_date = datetime('now'),
    research_status = 'DEPLOYED'
WHERE researched_frn IS NOT NULL 
  AND research_status = 'VERIFIED'
  AND applied_date IS NULL;

-- Step 4: Deployment Summary Report
.print "=== FRN DEPLOYMENT SUMMARY ==="
.print ""

SELECT 
    'Records Applied This Run' as metric,
    COUNT(*) as count
FROM frn_research_temp 
WHERE applied_date >= datetime('now', '-1 minute');

.print ""

SELECT 
    'Manual Overrides - Total in Database' as metric,
    COUNT(*) as count
FROM frn_manual_overrides;

.print ""

SELECT 
    'Products with FRNs - Before vs After' as metric,
    COUNT(*) as count
FROM available_products 
WHERE frn IS NOT NULL;

.print ""

-- Step 5: Coverage Analysis
SELECT 
    CASE 
        WHEN research_status = 'DEPLOYED' THEN 'Deployed to Production'
        WHEN research_status = 'VERIFIED' THEN 'Verified (Ready to Deploy)'
        WHEN researched_frn IS NOT NULL THEN 'Has FRN (Pending Review)'
        ELSE 'Needs Research'
    END as status,
    COUNT(*) as bank_count,
    SUM(product_count) as total_products,
    ROUND(SUM(product_count) * 100.0 / (SELECT SUM(product_count) FROM frn_research_temp), 1) as percentage
FROM frn_research_temp 
GROUP BY 
    CASE 
        WHEN research_status = 'DEPLOYED' THEN 'Deployed to Production'
        WHEN research_status = 'VERIFIED' THEN 'Verified (Ready to Deploy)'
        WHEN researched_frn IS NOT NULL THEN 'Has FRN (Pending Review)'
        ELSE 'Needs Research'
    END
ORDER BY total_products DESC;

.print ""
.print "=== TOP UNMATCHED BANKS (By Product Count) ==="

SELECT 
    bank_name,
    product_count,
    platform,
    COALESCE(research_notes, 'No research attempted') as status
FROM frn_research_temp 
WHERE research_status IS NULL OR (research_status NOT IN ('VERIFIED', 'DEPLOYED'))
ORDER BY product_count DESC 
LIMIT 10;
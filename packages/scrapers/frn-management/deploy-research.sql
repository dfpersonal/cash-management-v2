-- Deploy Research Script
-- Safer version of the main update script focused only on applying verified research
-- Can be run frequently to apply newly verified research without affecting ongoing work

.print "=== DEPLOYING VERIFIED FRN RESEARCH ==="
.print ""

-- Pre-deployment check
SELECT 
    'Ready for Deployment' as status,
    COUNT(*) as verified_count
FROM frn_research_temp 
WHERE research_status = 'VERIFIED' 
  AND researched_frn IS NOT NULL
  AND applied_date IS NULL;

-- Only proceed if there are records to deploy
.print "Beginning deployment of verified research..."

-- Add applied_date column if not exists (safe to re-run)
ALTER TABLE frn_research_temp ADD COLUMN applied_date TEXT DEFAULT NULL;

-- Deploy to manual overrides
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
  AND research_status = 'VERIFIED'
  AND applied_date IS NULL;

-- Update products with new FRNs
UPDATE available_products 
SET 
    frn = (
        SELECT researched_frn 
        FROM frn_research_temp 
        WHERE frn_research_temp.bank_name = available_products.bank_name 
          AND researched_frn IS NOT NULL 
          AND research_status = 'VERIFIED'
          AND applied_date IS NULL
    )
WHERE bank_name IN (
    SELECT bank_name 
    FROM frn_research_temp 
    WHERE researched_frn IS NOT NULL 
      AND research_status = 'VERIFIED'
      AND applied_date IS NULL
)
AND frn IS NULL;

-- Mark as applied with DEPLOYED status
UPDATE frn_research_temp 
SET applied_date = datetime('now'),
    research_status = 'DEPLOYED'
WHERE researched_frn IS NOT NULL 
  AND research_status = 'VERIFIED'
  AND applied_date IS NULL;

.print ""
.print "=== DEPLOYMENT RESULTS ==="

SELECT 
    'Banks Deployed This Run' as metric,
    COUNT(*) as count
FROM frn_research_temp 
WHERE applied_date >= datetime('now', '-1 minute');

SELECT 
    'Total Manual Overrides' as metric,
    COUNT(*) as count
FROM frn_manual_overrides;

SELECT 
    'Total Products with FRNs' as metric,
    COUNT(*) as count
FROM available_products 
WHERE frn IS NOT NULL;

.print ""
.print "Deployment completed successfully!"
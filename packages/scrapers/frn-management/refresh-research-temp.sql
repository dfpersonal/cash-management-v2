-- Refresh Research Temp Script
-- Adds new unmatched banks to frn_research_temp for ongoing research cycles
-- Safe to run repeatedly - only adds new banks not already in research

.print "=== REFRESHING FRN RESEARCH TEMP ==="
.print ""

-- Add new unmatched banks from current available_products that aren't already being researched
INSERT OR IGNORE INTO frn_research_temp (
    bank_name,
    platform,
    source,
    account_type,
    product_count,
    min_rate,
    max_rate,
    avg_rate,
    first_seen,
    last_seen,
    research_status
)
SELECT 
    bank_name,
    MAX(platform) as platform,  -- Pick one platform for display
    source,
    GROUP_CONCAT(DISTINCT account_type) as account_type,  -- All account types
    COUNT(*) as product_count,  -- Total across all types
    MIN(aer_rate) as min_rate,
    MAX(aer_rate) as max_rate,
    AVG(aer_rate) as avg_rate,
    MIN(created_at) as first_seen,
    MAX(created_at) as last_seen,
    NULL as research_status
FROM available_products ap
WHERE frn IS NULL
  AND bank_name NOT IN (
    SELECT bank_name FROM frn_research_temp
  )
GROUP BY bank_name, source  -- Group by bank and source only, not account_type
ORDER BY COUNT(*) DESC;

.print "New banks added for research:"

SELECT 
    'Newly Added Banks' as metric,
    COUNT(*) as count
FROM frn_research_temp 
WHERE research_status IS NULL
  AND applied_date IS NULL;

.print ""
.print "=== RESEARCH QUEUE STATUS ==="

SELECT 
    CASE 
        WHEN research_status = 'VERIFIED' AND applied_date IS NOT NULL THEN 'Completed & Applied'
        WHEN research_status = 'VERIFIED' AND applied_date IS NULL THEN 'Verified (Pending Apply)'
        WHEN research_status IS NOT NULL THEN 'In Progress'
        ELSE 'Pending Research'
    END as status,
    COUNT(*) as bank_count,
    SUM(product_count) as total_products
FROM frn_research_temp 
GROUP BY 
    CASE 
        WHEN research_status = 'VERIFIED' AND applied_date IS NOT NULL THEN 'Completed & Applied'
        WHEN research_status = 'VERIFIED' AND applied_date IS NULL THEN 'Verified (Pending Apply)'
        WHEN research_status IS NOT NULL THEN 'In Progress'
        ELSE 'Pending Research'
    END
ORDER BY total_products DESC;

.print ""
.print "=== TOP PRIORITY BANKS FOR RESEARCH ==="

SELECT 
    bank_name,
    product_count,
    platform,
    ROUND(avg_rate, 2) as avg_rate,
    last_seen
FROM frn_research_temp 
WHERE research_status IS NULL
ORDER BY product_count DESC 
LIMIT 15;
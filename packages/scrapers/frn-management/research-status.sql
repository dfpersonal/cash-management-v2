-- Research Status Report Script
-- Comprehensive reporting on FRN research progress and coverage

.print "=== FRN RESEARCH STATUS REPORT ==="
.print ""
.print "Generated: " || datetime('now')
.print ""

-- Overall Coverage Statistics
.print "=== COVERAGE OVERVIEW ==="

SELECT 
    'Total Products in System' as metric,
    COUNT(*) as count
FROM available_products;

SELECT 
    'Products with FRNs' as metric,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM available_products), 1) || '%' as percentage
FROM available_products 
WHERE frn IS NOT NULL;

SELECT 
    'Unique Banks in System' as metric,
    COUNT(DISTINCT bank_name) as count
FROM available_products;

SELECT 
    'Banks with FRN Matches' as metric,
    COUNT(DISTINCT bank_name) as count,
    ROUND(COUNT(DISTINCT bank_name) * 100.0 / (SELECT COUNT(DISTINCT bank_name) FROM available_products), 1) || '%' as percentage
FROM available_products 
WHERE frn IS NOT NULL;

.print ""
.print "=== RESEARCH PROGRESS BREAKDOWN ==="

SELECT 
    CASE 
        WHEN research_status = 'DEPLOYED' THEN 'Deployed to Production'
        WHEN research_status = 'VERIFIED' THEN 'Verified (Ready to Deploy)'
        WHEN research_status = 'NOT_FOUND' THEN 'Confirmed No FRN'
        WHEN research_status IS NOT NULL THEN 'Research In Progress'
        ELSE 'Awaiting Research'
    END as status,
    COUNT(*) as bank_count,
    SUM(product_count) as product_count,
    ROUND(SUM(product_count) * 100.0 / (SELECT SUM(product_count) FROM frn_research_temp), 1) || '%' as percentage
FROM frn_research_temp 
GROUP BY 
    CASE 
        WHEN research_status = 'DEPLOYED' THEN 'Deployed to Production'
        WHEN research_status = 'VERIFIED' THEN 'Verified (Ready to Deploy)'
        WHEN research_status = 'NOT_FOUND' THEN 'Confirmed No FRN'
        WHEN research_status IS NOT NULL THEN 'Research In Progress'
        ELSE 'Awaiting Research'
    END
ORDER BY product_count DESC;

.print ""
.print "=== MANUAL OVERRIDES STATUS ==="

SELECT 
    'Total Manual Overrides' as metric,
    COUNT(*) as count
FROM frn_manual_overrides;

SELECT 
    'Active Overrides (with FRN)' as metric,
    COUNT(*) as count
FROM frn_manual_overrides 
WHERE frn IS NOT NULL;

SELECT 
    'Flagged for Research' as metric,
    COUNT(*) as count
FROM frn_manual_overrides 
WHERE frn IS NULL AND confidence_score = 0.0;

.print ""
.print "=== TOP UNMATCHED BANKS (by Product Impact) ==="

SELECT 
    rt.bank_name,
    rt.product_count,
    rt.platform,
    ROUND(rt.avg_rate, 2) as avg_rate_percent,
    COALESCE(rt.research_status, 'Not Started') as research_status,
    rt.last_seen
FROM frn_research_temp rt
WHERE rt.research_status IS NULL OR rt.research_status != 'VERIFIED'
ORDER BY rt.product_count DESC, rt.avg_rate DESC
LIMIT 20;

.print ""
.print "=== RECENT RESEARCH ACTIVITY ==="

SELECT 
    bank_name,
    researched_firm_name,
    researched_frn,
    research_date,
    applied_date,
    product_count
FROM frn_research_temp 
WHERE research_date IS NOT NULL
ORDER BY research_date DESC 
LIMIT 15;

.print ""
.print "=== DEPLOYMENT HISTORY ==="

SELECT 
    DATE(applied_date) as deployment_date,
    COUNT(*) as banks_deployed,
    SUM(product_count) as products_affected
FROM frn_research_temp 
WHERE applied_date IS NOT NULL
GROUP BY DATE(applied_date)
ORDER BY deployment_date DESC
LIMIT 10;
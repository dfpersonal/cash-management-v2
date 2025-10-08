-- Create Research Views and Lifecycle Management
-- Creates helpful views for managing FRN research data lifecycle

.print "=== CREATING FRN RESEARCH VIEWS ==="

-- View: Pending Research Queue
DROP VIEW IF EXISTS pending_frn_research;
CREATE VIEW pending_frn_research AS
SELECT 
    bank_name,
    product_count,
    platform,
    source,
    avg_rate,
    last_seen,
    COALESCE(research_notes, 'No research started') as status
FROM frn_research_temp 
WHERE research_status IS NULL 
   OR (research_status != 'VERIFIED' AND research_status != 'NOT_FOUND')
ORDER BY product_count DESC, avg_rate DESC;

-- View: Completed Research (Ready for Deployment)
DROP VIEW IF EXISTS completed_frn_research;
CREATE VIEW completed_frn_research AS
SELECT 
    bank_name,
    researched_frn,
    researched_firm_name,
    product_count,
    research_date,
    applied_date,
    CASE 
        WHEN applied_date IS NOT NULL THEN 'Applied'
        ELSE 'Ready for Deployment'
    END as deployment_status
FROM frn_research_temp 
WHERE research_status = 'VERIFIED'
ORDER BY 
    CASE WHEN applied_date IS NULL THEN 0 ELSE 1 END,
    product_count DESC;

-- View: Research Coverage Summary
DROP VIEW IF EXISTS frn_coverage_summary;
CREATE VIEW frn_coverage_summary AS
SELECT 
    'Total Banks in System' as category,
    COUNT(DISTINCT bank_name) as count,
    0 as sort_order
FROM available_products
UNION ALL
SELECT 
    'Banks with FRNs' as category,
    COUNT(DISTINCT bank_name) as count,
    1 as sort_order
FROM available_products 
WHERE frn IS NOT NULL
UNION ALL
SELECT 
    'Banks in Research Queue' as category,
    COUNT(*) as count,
    2 as sort_order
FROM frn_research_temp
UNION ALL
SELECT 
    'Research Completed' as category,
    COUNT(*) as count,
    3 as sort_order
FROM frn_research_temp 
WHERE research_status = 'VERIFIED'
UNION ALL
SELECT 
    'Research Applied' as category,
    COUNT(*) as count,
    4 as sort_order
FROM frn_research_temp 
WHERE applied_date IS NOT NULL
ORDER BY sort_order;

-- View: High Impact Unmatched Banks
DROP VIEW IF EXISTS high_impact_unmatched;
CREATE VIEW high_impact_unmatched AS
SELECT 
    ap.bank_name,
    COUNT(*) as product_count,
    ROUND(AVG(ap.aer_rate), 2) as avg_rate,
    MAX(ap.aer_rate) as max_rate,
    ap.platform,
    MAX(ap.created_at) as last_seen,
    CASE 
        WHEN rt.research_status IS NOT NULL THEN rt.research_status
        WHEN rt.bank_name IS NOT NULL THEN 'In Research Queue'
        ELSE 'Not in Queue'
    END as research_status
FROM available_products ap
LEFT JOIN frn_research_temp rt ON ap.bank_name = rt.bank_name
WHERE ap.frn IS NULL
GROUP BY ap.bank_name, ap.platform
HAVING COUNT(*) >= 3  -- Only banks with 3+ products
ORDER BY COUNT(*) DESC, MAX(ap.aer_rate) DESC;

.print "Views created successfully!"
.print ""
.print "Available views:"
.print "- pending_frn_research: Banks awaiting research"
.print "- completed_frn_research: Verified research ready for deployment"
.print "- frn_coverage_summary: Overall coverage statistics"
.print "- high_impact_unmatched: Priority targets for research"
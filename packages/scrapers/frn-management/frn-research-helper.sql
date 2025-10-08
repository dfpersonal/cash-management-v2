-- FRN Research Helper Queries
-- Use these queries to help research and update FRNs in the frn_research_temp table

-- 1. View banks prioritized by product count (start with high-volume banks)
SELECT 
    bank_name,
    product_count,
    min_rate || '-' || max_rate || '%' as rate_range,
    platform,
    source,
    researched_frn,
    research_status
FROM frn_research_temp 
WHERE researched_frn IS NULL
ORDER BY product_count DESC, max_rate DESC
LIMIT 20;

-- 2. Search BOE institutions for potential matches (example: search for 'Cambridge')
-- Replace 'Cambridge' with the bank you're researching
SELECT frn, firm_name, 'Exact Match' as match_type
FROM boe_institutions 
WHERE firm_name LIKE '%Cambridge%'
UNION ALL
SELECT frn, firm_name, 'Partial Match' as match_type
FROM boe_institutions 
WHERE LOWER(firm_name) LIKE '%cambridge%'
ORDER BY match_type, firm_name;

-- 3. Template for updating research findings
-- Example: Update Cambridge BS with FRN 123456
/*
UPDATE frn_research_temp 
SET 
    researched_frn = '123456',
    researched_firm_name = 'Cambridge Building Society',
    research_notes = 'Found via BOE register search',
    research_status = 'VERIFIED',
    research_date = date('now')
WHERE bank_name = 'Cambridge BS';
*/

-- 4. Mark a bank as 'NOT_FOUND' if it doesn't exist in BOE register
/*
UPDATE frn_research_temp 
SET 
    research_notes = 'Not found in BOE register - may be overseas or non-regulated',
    research_status = 'NOT_FOUND',
    research_date = date('now')
WHERE bank_name = 'Some Overseas Bank';
*/

-- 5. Show research progress
SELECT 
    research_status,
    COUNT(*) as bank_count,
    SUM(product_count) as total_products
FROM frn_research_temp 
GROUP BY COALESCE(research_status, 'PENDING')
ORDER BY bank_count DESC;

-- 6. Show high-value banks still needing research (competitive rates)
SELECT 
    bank_name,
    product_count,
    max_rate,
    platform
FROM frn_research_temp 
WHERE researched_frn IS NULL 
  AND max_rate >= 4.0
ORDER BY max_rate DESC;

-- 7. Check for partial name matches in BOE register (fuzzy search helper)
-- Replace 'Beverley' with part of the bank name you're researching
SELECT 
    frn, 
    firm_name,
    CASE 
        WHEN LOWER(firm_name) LIKE '%beverley%' THEN 'Strong Match'
        WHEN LOWER(firm_name) LIKE '%bever%' THEN 'Partial Match'
        ELSE 'Weak Match'
    END as match_strength
FROM boe_institutions 
WHERE LOWER(firm_name) LIKE '%bever%'
ORDER BY match_strength, firm_name;
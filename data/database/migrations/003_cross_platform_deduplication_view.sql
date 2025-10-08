-- =====================================================================================
-- Migration: 003_cross_platform_deduplication_view.sql
-- Purpose: Create views for tracking cross-platform deduplication removals
-- Date: 2025-09-26
-- Author: Phase 4.5 Cross-Platform Deduplication Enhancement
-- =====================================================================================

-- Drop views if they already exist (for re-running migration)
DROP VIEW IF EXISTS v_cross_platform_deduplication;
DROP VIEW IF EXISTS v_deduplication_summary;

-- =====================================================================================
-- PRIMARY VIEW: v_cross_platform_deduplication
-- Purpose: Comprehensive tracking of products removed by cross-platform deduplication
-- Usage: SELECT * FROM v_cross_platform_deduplication WHERE removed_by_cross_platform_dedup = 1;
-- =====================================================================================
CREATE VIEW v_cross_platform_deduplication AS
SELECT
    -- Basic identification
    dg.id,
    dg.business_key,
    dg.batch_id,
    dg.products_in_group,

    -- Selection details (what was kept)
    dg.selected_product_id,
    dg.selected_product_platform,
    dg.selected_product_source,
    dg.selection_reason,

    -- Removal flag (simple boolean for easy querying)
    CASE
        WHEN dg.selection_reason = 'platform_separation' THEN 1
        WHEN dg.selection_reason = 'fscs_bank_separation' THEN 1
        WHEN dg.products_in_group > 1 THEN 1
        ELSE 0
    END as removed_by_cross_platform_dedup,

    -- Details about what was removed
    dg.rejected_products,
    dg.platforms_in_group,
    dg.sources_in_group,
    dg.quality_scores,

    -- Computed removal statistics
    (dg.products_in_group - 1) as products_removed_count,

    -- Platform analysis
    CASE
        WHEN JSON_VALID(dg.platforms_in_group) THEN JSON_ARRAY_LENGTH(dg.platforms_in_group)
        ELSE 0
    END as unique_platforms_count,

    CASE
        WHEN JSON_VALID(dg.sources_in_group) THEN JSON_ARRAY_LENGTH(dg.sources_in_group)
        ELSE 0
    END as unique_sources_count,

    -- Removal reason categories
    CASE
        WHEN dg.selection_reason = 'platform_separation' THEN 'Platform-based removal'
        WHEN dg.selection_reason = 'fscs_bank_separation' THEN 'FSCS compliance removal'
        WHEN dg.selection_reason = 'single_product' THEN 'No removal (single product)'
        ELSE 'Other removal reason'
    END as removal_category,

    -- Audit metadata
    dg.created_at as deduplication_timestamp

FROM deduplication_groups dg
WHERE dg.products_in_group >= 1  -- Include all groups for comprehensive view
ORDER BY dg.created_at DESC;

-- =====================================================================================
-- SUMMARY VIEW: v_deduplication_summary
-- Purpose: High-level statistics about deduplication decisions
-- Usage: SELECT * FROM v_deduplication_summary;
-- =====================================================================================
CREATE VIEW v_deduplication_summary AS
SELECT
    -- Selection reason breakdown
    dg.selection_reason,

    -- Group statistics
    COUNT(*) as group_count,
    SUM(CASE WHEN dg.products_in_group > 1 THEN 1 ELSE 0 END) as groups_with_removals,
    SUM(dg.products_in_group - 1) as total_products_removed,

    -- Group size analysis
    ROUND(AVG(CAST(dg.products_in_group as FLOAT)), 2) as avg_group_size,
    MIN(dg.products_in_group) as min_group_size,
    MAX(dg.products_in_group) as max_group_size,

    -- Processing statistics
    COUNT(DISTINCT dg.batch_id) as batch_count,
    MIN(dg.created_at) as first_occurrence,
    MAX(dg.created_at) as last_occurrence,

    -- Removal rate calculation
    ROUND(100.0 * SUM(dg.products_in_group - 1) / SUM(dg.products_in_group), 2) as removal_percentage

FROM deduplication_groups dg
GROUP BY dg.selection_reason
ORDER BY total_products_removed DESC;

-- =====================================================================================
-- ANALYSIS VIEW: v_cross_platform_removals_only
-- Purpose: Simplified view showing only products removed by cross-platform deduplication
-- Usage: SELECT * FROM v_cross_platform_removals_only;
-- =====================================================================================
CREATE VIEW v_cross_platform_removals_only AS
SELECT
    business_key,
    batch_id,
    products_in_group,
    products_removed_count,
    selected_product_platform as kept_platform,
    selected_product_source as kept_source,
    platforms_in_group as competing_platforms,
    rejected_products as removed_product_ids,
    selection_reason as removal_reason,
    deduplication_timestamp
FROM v_cross_platform_deduplication
WHERE removed_by_cross_platform_dedup = 1
ORDER BY products_removed_count DESC, deduplication_timestamp DESC;

-- =====================================================================================
-- Create indexes for performance (if they don't already exist)
-- =====================================================================================
CREATE INDEX IF NOT EXISTS idx_dedup_groups_selection_reason ON deduplication_groups(selection_reason);
CREATE INDEX IF NOT EXISTS idx_dedup_groups_products_count ON deduplication_groups(products_in_group);
CREATE INDEX IF NOT EXISTS idx_dedup_groups_created_at ON deduplication_groups(created_at);

-- =====================================================================================
-- Migration Complete
-- Views created:
-- 1. v_cross_platform_deduplication - Complete deduplication tracking with removal flags
-- 2. v_deduplication_summary - Statistical summary of deduplication decisions
-- 3. v_cross_platform_removals_only - Filtered view of only removed products
-- =====================================================================================

-- Test the views with sample queries (commented out for production)
-- SELECT COUNT(*) as total_groups FROM v_cross_platform_deduplication;
-- SELECT COUNT(*) as removed_groups FROM v_cross_platform_deduplication WHERE removed_by_cross_platform_dedup = 1;
-- SELECT * FROM v_deduplication_summary;
-- SELECT * FROM v_cross_platform_removals_only LIMIT 10;
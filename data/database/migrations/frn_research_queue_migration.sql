-- FRN Research Queue Migration Script
-- Purpose: Refactor FRN research workflow for cleaner separation of concerns
--
-- BEFORE RUNNING:
-- 1. Create backup: sqlite3 cash_savings.db ".backup 'backup_pre_frn_migration_$(date +%Y%m%d_%H%M%S).db'"
-- 2. Test on copy first: cp cash_savings.db test_migration.db && sqlite3 test_migration.db < frn_research_queue_migration.sql
--
-- Changes:
-- - frn_manual_overrides: Only contains resolved FRNs (no NULL values)
-- - frn_research_queue: All unresolved banks with status management
-- - Simplified trigger for research completion

.print "=== FRN Research Queue Migration Starting ==="
.print ""

-- Step 1: Create the new frn_research_queue table
.print "Step 1: Creating frn_research_queue table..."

CREATE TABLE frn_research_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_name TEXT NOT NULL UNIQUE,
    platform TEXT,
    source TEXT,

    -- Product aggregation data
    product_count INTEGER DEFAULT 1,
    min_rate REAL,
    max_rate REAL,
    avg_rate REAL,

    -- Timeline tracking
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Research workflow fields
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'researching', 'ignored', 'cannot_resolve')),
    priority INTEGER DEFAULT 0,  -- Higher = more important

    -- Research results (only populated when found)
    researched_frn TEXT,
    researched_firm_name TEXT,
    research_notes TEXT,
    researched_by TEXT,  -- Who did the research
    research_date DATETIME,

    -- Ignore management
    ignored_reason TEXT,  -- Why was it ignored
    ignored_by TEXT,     -- Who ignored it
    ignored_date DATETIME,

    -- Audit fields
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX idx_frn_research_queue_status ON frn_research_queue(status);
CREATE INDEX idx_frn_research_queue_priority ON frn_research_queue(priority DESC, product_count DESC);
CREATE INDEX idx_frn_research_queue_bank_name ON frn_research_queue(bank_name);

.print "✓ frn_research_queue table created with indexes"

-- Step 2: Migrate data from frn_research_temp (has richer product data)
.print ""
.print "Step 2: Migrating data from frn_research_temp..."

INSERT INTO frn_research_queue (
    bank_name,
    platform,
    source,
    product_count,
    min_rate,
    max_rate,
    avg_rate,
    first_seen,
    last_seen,
    researched_frn,
    researched_firm_name,
    research_notes,
    research_date,
    status,
    priority
)
SELECT
    bank_name,
    platform,
    source,
    COALESCE(product_count, 1),
    min_rate,
    max_rate,
    avg_rate,
    COALESCE(first_seen, CURRENT_TIMESTAMP),
    COALESCE(last_seen, CURRENT_TIMESTAMP),
    researched_frn,
    researched_firm_name,
    research_notes,
    research_date,
    CASE
        WHEN research_status = 'VERIFIED' THEN 'researching'
        WHEN research_status = 'NOT_FOUND' THEN 'cannot_resolve'
        WHEN researched_frn IS NOT NULL THEN 'researching'
        ELSE 'pending'
    END as status,
    -- Calculate priority: higher for more products and higher rates
    ROUND(
        COALESCE(product_count, 1) * 10 +
        COALESCE(avg_rate, 0) * 5
    ) as priority
FROM frn_research_temp;

SELECT changes() as research_temp_migrated;
.print "✓ Migrated records from frn_research_temp"

-- Step 3: Migrate NULL FRN entries from frn_manual_overrides
.print ""
.print "Step 3: Migrating auto-flagged entries from frn_manual_overrides..."

-- First, show what we're about to migrate
.print "Auto-flagged entries to migrate:"
SELECT COUNT(*) as null_frn_count FROM frn_manual_overrides WHERE frn IS NULL;

-- Migrate auto-flagged entries (avoiding duplicates)
INSERT OR IGNORE INTO frn_research_queue (
    bank_name,
    research_notes,
    status,
    priority,
    created_at
)
SELECT
    scraped_name,
    notes,
    'pending',
    5, -- Default medium priority for auto-flagged
    created_at
FROM frn_manual_overrides
WHERE frn IS NULL;

SELECT changes() as manual_overrides_migrated;
.print "✓ Migrated auto-flagged entries (duplicates ignored)"

-- Step 4: Show migration summary before cleanup
.print ""
.print "=== MIGRATION SUMMARY BEFORE CLEANUP ==="

SELECT
    'frn_research_queue' as table_name,
    COUNT(*) as total_records,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN status = 'researching' THEN 1 ELSE 0 END) as researching,
    SUM(CASE WHEN status = 'cannot_resolve' THEN 1 ELSE 0 END) as cannot_resolve,
    SUM(CASE WHEN researched_frn IS NOT NULL THEN 1 ELSE 0 END) as has_frn
FROM frn_research_queue

UNION ALL

SELECT
    'frn_manual_overrides' as table_name,
    COUNT(*) as total_records,
    SUM(CASE WHEN frn IS NULL THEN 1 ELSE 0 END) as null_frn,
    SUM(CASE WHEN frn IS NOT NULL THEN 1 ELSE 0 END) as has_frn,
    0 as cannot_resolve,
    0 as extra_col
FROM frn_manual_overrides;

-- Step 5: Clean up frn_manual_overrides (remove NULL FRN entries)
.print ""
.print "Step 5: Cleaning up frn_manual_overrides..."

-- Show what we're about to delete
.print "Removing NULL FRN entries from frn_manual_overrides:"
SELECT scraped_name FROM frn_manual_overrides WHERE frn IS NULL LIMIT 5;
.print "... (showing first 5)"

DELETE FROM frn_manual_overrides WHERE frn IS NULL;

SELECT changes() as null_entries_deleted;
.print "✓ Removed NULL FRN entries from frn_manual_overrides"

-- Step 6: Update the research completion trigger
.print ""
.print "Step 6: Updating database triggers..."

-- Drop old trigger
DROP TRIGGER IF EXISTS complete_frn_research;

-- Create new simplified trigger
CREATE TRIGGER promote_researched_frn
AFTER UPDATE OF researched_frn ON frn_research_queue
FOR EACH ROW
WHEN NEW.researched_frn IS NOT NULL
  AND OLD.researched_frn IS NULL
  AND NEW.researched_frn != ''
  AND NEW.status IN ('researching', 'pending')
BEGIN
  -- Validate FRN format (6 or 7 digits only)
  SELECT CASE
    WHEN LENGTH(NEW.researched_frn) NOT BETWEEN 6 AND 7 THEN
      RAISE(ABORT, 'Invalid FRN format: FRN must be exactly 6 or 7 digits long.')
    WHEN NEW.researched_frn NOT GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'
      AND NEW.researched_frn NOT GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]' THEN
      RAISE(ABORT, 'Invalid FRN format: FRN must contain only digits.')
  END;

  -- Insert into manual overrides (use INSERT OR REPLACE to handle duplicates)
  INSERT OR REPLACE INTO frn_manual_overrides (
    scraped_name,
    frn,
    firm_name,
    confidence_score,
    notes
  ) VALUES (
    NEW.bank_name,
    NEW.researched_frn,
    COALESCE(NEW.researched_firm_name, NEW.bank_name),
    1.0,
    'Manually researched: ' || COALESCE(NEW.research_notes, 'FRN verified') ||
      CASE
        WHEN NEW.researched_by IS NOT NULL THEN ' by ' || NEW.researched_by
        ELSE ''
      END ||
      ' [' || DATE('now') || ']'
  );

  -- Delete the completed entry from research queue
  DELETE FROM frn_research_queue WHERE id = NEW.id;
END;

.print "✓ Created promote_researched_frn trigger"

-- Step 7: Drop old frn_research_temp table
.print ""
.print "Step 7: Dropping old frn_research_temp table..."

DROP TABLE frn_research_temp;
.print "✓ Dropped frn_research_temp table"

-- Step 8: Create useful views for the new workflow
.print ""
.print "Step 8: Creating research workflow views..."

-- Drop existing view first, then recreate
DROP VIEW IF EXISTS pending_frn_research;
DROP VIEW IF EXISTS completed_frn_research;

-- Updated pending research view
CREATE VIEW pending_frn_research AS
SELECT
    id,
    bank_name,
    product_count,
    platform,
    source,
    avg_rate,
    priority,
    last_seen,
    status,
    CASE
        WHEN status = 'pending' THEN 'Needs Research'
        WHEN status = 'researching' THEN 'In Progress'
        WHEN status = 'ignored' THEN 'Ignored (' || COALESCE(ignored_reason, 'No reason') || ')'
        WHEN status = 'cannot_resolve' THEN 'No FRN Available'
        ELSE status
    END as status_display
FROM frn_research_queue
WHERE status IN ('pending', 'researching')
ORDER BY priority DESC, product_count DESC, avg_rate DESC;

-- Research statistics view
CREATE VIEW frn_research_stats AS
SELECT
    status,
    COUNT(*) as bank_count,
    SUM(product_count) as total_products,
    ROUND(AVG(product_count), 1) as avg_products_per_bank,
    ROUND(AVG(COALESCE(avg_rate, 0)), 2) as avg_rate,
    ROUND(SUM(product_count) * 100.0 / (
        SELECT SUM(product_count) FROM frn_research_queue
    ), 1) as percentage_of_products
FROM frn_research_queue
GROUP BY status
ORDER BY bank_count DESC;

.print "✓ Created research workflow views"

-- Step 9: Final validation and summary
.print ""
.print "=== FINAL MIGRATION SUMMARY ==="

.print ""
.print "Research Queue Status:"
SELECT status, COUNT(*) as count FROM frn_research_queue GROUP BY status;

.print ""
.print "Manual Overrides (should have no NULL FRNs):"
SELECT
    COUNT(*) as total_overrides,
    SUM(CASE WHEN frn IS NULL THEN 1 ELSE 0 END) as null_frn_count,
    SUM(CASE WHEN frn IS NOT NULL THEN 1 ELSE 0 END) as valid_frn_count
FROM frn_manual_overrides;

.print ""
.print "High Priority Research Items:"
SELECT bank_name, priority, product_count, avg_rate, status
FROM frn_research_queue
WHERE status = 'pending'
ORDER BY priority DESC
LIMIT 10;

.print ""
.print "=== MIGRATION COMPLETED SUCCESSFULLY ==="
.print ""
.print "Next Steps:"
.print "1. Test the trigger: UPDATE frn_research_queue SET researched_frn='123456' WHERE bank_name='test';"
.print "2. Use pending_frn_research view to see items needing attention"
.print "3. Update FRNManagerService.ts to use frn_research_queue for auto-flagging"
.print "4. Update test suite to reflect new schema"
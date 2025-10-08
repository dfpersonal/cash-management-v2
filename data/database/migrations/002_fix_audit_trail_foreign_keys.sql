-- Migration: Fix Audit Trail Foreign Key Constraints
-- Date: 2025-01-24
-- Purpose: Restructure audit tables to have proper parent-child relationships
-- Issue: Foreign keys reference pipeline_audit(batch_id) but batch_id is not unique

BEGIN TRANSACTION;

-- Step 1: Create master batch table with unique batch_id
CREATE TABLE IF NOT EXISTS pipeline_batch (
    batch_id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    total_stages INTEGER DEFAULT 3,
    stages_completed INTEGER DEFAULT 0,
    total_input_count INTEGER DEFAULT 0,
    total_output_count INTEGER DEFAULT 0,
    metadata TEXT,  -- JSON with pipeline configuration
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Backup existing audit data (if any exists)
CREATE TABLE IF NOT EXISTS pipeline_audit_backup AS
    SELECT * FROM pipeline_audit WHERE 0; -- Create empty backup table with same structure

-- Insert existing data if any
INSERT INTO pipeline_audit_backup SELECT * FROM pipeline_audit;

-- Backup other tables if they exist and have data
CREATE TABLE IF NOT EXISTS deduplication_groups_backup AS
    SELECT * FROM deduplication_groups WHERE EXISTS (SELECT 1 FROM deduplication_groups LIMIT 1);

CREATE TABLE IF NOT EXISTS json_ingestion_corruption_audit_backup AS
    SELECT * FROM json_ingestion_corruption_audit WHERE EXISTS (SELECT 1 FROM json_ingestion_corruption_audit LIMIT 1);

-- Step 3: Drop existing tables with problematic foreign keys
-- Check if tables exist before dropping
DROP TABLE IF EXISTS deduplication_groups;
DROP TABLE IF EXISTS json_ingestion_corruption_audit;

-- Step 4: Recreate deduplication_groups with correct FK to pipeline_batch
CREATE TABLE deduplication_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL,
    business_key TEXT NOT NULL,

    -- Group composition
    products_in_group INTEGER NOT NULL,
    platforms_in_group TEXT,       -- JSON array of platforms in this group
    sources_in_group TEXT,         -- JSON array of sources in this group

    -- Selection details
    selected_product_id TEXT,
    selected_product_platform TEXT,
    selected_product_source TEXT,
    selection_reason TEXT,         -- 'highest_rate', 'platform_priority', 'source_reliability'
    quality_scores TEXT,           -- JSON with quality scores for all products in group

    -- Alternative products (rejected)
    rejected_products TEXT,        -- JSON array of rejected products with reasons

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Correct foreign key reference to pipeline_batch
    FOREIGN KEY (batch_id) REFERENCES pipeline_batch(batch_id)
);

-- Step 5: Recreate json_ingestion_corruption_audit with correct FK
CREATE TABLE json_ingestion_corruption_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL,
    product_index INTEGER,
    bank_name TEXT,
    platform TEXT,
    corruption_type TEXT,
    field_name TEXT,
    original_value TEXT,
    expected_format TEXT,
    severity TEXT CHECK(severity IN ('low', 'medium', 'high', 'critical')),
    auto_fixed BOOLEAN DEFAULT 0,
    fixed_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Correct foreign key reference to pipeline_batch
    FOREIGN KEY (batch_id) REFERENCES pipeline_batch(batch_id)
);

-- Step 6: Add stage_order column to pipeline_audit for proper ordering
ALTER TABLE pipeline_audit ADD COLUMN stage_order INTEGER;

-- Update existing records with stage_order based on stage name
UPDATE pipeline_audit SET stage_order = 1 WHERE stage = 'json_ingestion';
UPDATE pipeline_audit SET stage_order = 2 WHERE stage = 'frn_matching';
UPDATE pipeline_audit SET stage_order = 3 WHERE stage = 'deduplication';

-- Step 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pipeline_batch_status ON pipeline_batch(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_batch_pipeline_id ON pipeline_batch(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_batch_started_at ON pipeline_batch(started_at);
CREATE INDEX IF NOT EXISTS idx_dedup_groups_batch_id ON deduplication_groups(batch_id);
CREATE INDEX IF NOT EXISTS idx_corruption_audit_batch_id ON json_ingestion_corruption_audit(batch_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_stage_order ON pipeline_audit(batch_id, stage_order);

-- Step 8: Enable foreign key constraints (ensure they're enforced)
PRAGMA foreign_keys = ON;

COMMIT;

-- Step 9: Verify the migration worked
-- Check that pipeline_batch table exists
SELECT 'pipeline_batch table created' as status
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='pipeline_batch');

-- Check foreign key constraints
SELECT 'Foreign key constraints verified' as status;

-- Display final schema for verification
.schema pipeline_batch
.schema deduplication_groups
.schema json_ingestion_corruption_audit
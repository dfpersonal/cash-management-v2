-- Pipeline Audit Tables (Development Only)
-- These tables are separate from the existing audit_log table used for deposit tracking
-- Purpose: Debug JSON ingestion → FRN → Deduplication pipeline processing

-- Main pipeline audit table for stage-level tracking
CREATE TABLE IF NOT EXISTS pipeline_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL,
    pipeline_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    input_count INTEGER,
    output_count INTEGER,
    passed_count INTEGER,
    rejected_count INTEGER,
    processing_time INTEGER,
    error_count INTEGER DEFAULT 0,
    metadata TEXT,  -- JSON with detailed stage info
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Detailed product tracking (verbose mode only)
CREATE TABLE IF NOT EXISTS pipeline_audit_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_id INTEGER REFERENCES pipeline_audit(id),
    batch_id TEXT NOT NULL,
    product_id TEXT,
    bank_name TEXT,
    platform TEXT,
    stage TEXT,
    status TEXT CHECK(status IN ('passed', 'rejected', 'error')),
    rejection_reason TEXT,
    metadata TEXT,  -- JSON with product details
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_batch_id ON pipeline_audit(batch_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_pipeline_id ON pipeline_audit(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_items_batch_id ON pipeline_audit_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_audit_items_audit_id ON pipeline_audit_items(audit_id);
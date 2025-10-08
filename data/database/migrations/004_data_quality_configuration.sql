-- =============================================
-- Data Quality Module Configuration Migration
-- =============================================
-- Purpose: Add configuration parameters for the Data Quality Analyzer module
-- Author: Development Team
-- Date: 2025-09-28
-- Version: 004

-- Add Data Quality Configuration Parameters
INSERT OR IGNORE INTO unified_config (config_key, config_value, category, description) VALUES
  ('orchestrator_data_quality_enabled', 'false', 'orchestrator', 'Enable data quality analysis stage in pipeline'),
  ('orchestrator_data_quality_verbose', 'false', 'orchestrator', 'Show detailed quality reports in console'),

  -- Quality thresholds
  ('data_quality_min_frn_match_rate', '0.70', 'data_quality', 'Minimum acceptable FRN match rate (0.0-1.0)'),
  ('data_quality_max_anomaly_rate', '0.10', 'data_quality', 'Maximum acceptable anomaly rate threshold'),
  ('data_quality_min_integrity_score', '80', 'data_quality', 'Minimum data integrity score (0-100)'),

  -- Analysis settings
  ('data_quality_enable_anomaly_detection', 'true', 'data_quality', 'Enable anomaly detection algorithms'),
  ('data_quality_enable_trend_analysis', 'true', 'data_quality', 'Enable historical trend comparison'),
  ('data_quality_sample_size', '1000', 'data_quality', 'Maximum sample size for analysis (0 = no limit)'),
  ('data_quality_timeout_ms', '30000', 'data_quality', 'Analysis timeout in milliseconds'),

  -- Report settings
  ('data_quality_report_retention_days', '90', 'data_quality', 'Number of days to retain quality reports'),
  ('data_quality_output_format', 'both', 'data_quality', 'Output format: console, database, or both');

-- Create Data Quality Reports Table
CREATE TABLE IF NOT EXISTS data_quality_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Summary metrics
  total_products_raw INTEGER NOT NULL,
  total_products_final INTEGER NOT NULL,
  frn_match_rate REAL NOT NULL,
  deduplication_rate REAL NOT NULL,

  -- Quality scores (0-100)
  data_integrity_score REAL NOT NULL,
  pipeline_efficiency_score REAL NOT NULL,
  deduplication_effectiveness_score REAL NOT NULL,
  overall_quality_score REAL NOT NULL,

  -- Detailed analysis (JSON)
  full_report TEXT NOT NULL,
  anomalies TEXT,
  recommendations TEXT,

  -- Performance metrics
  execution_time_ms INTEGER NOT NULL,
  config_snapshot TEXT,

  -- Optional foreign key (pipeline_audit table may not exist in all environments)
  CONSTRAINT fk_batch_id CHECK (batch_id IS NOT NULL)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_quality_reports_created_at
ON data_quality_reports(created_at);

CREATE INDEX IF NOT EXISTS idx_quality_reports_quality_score
ON data_quality_reports(overall_quality_score);

CREATE INDEX IF NOT EXISTS idx_quality_reports_batch_date
ON data_quality_reports(batch_id, created_at);

-- Add quality score performance index
CREATE INDEX IF NOT EXISTS idx_quality_reports_scores
ON data_quality_reports(data_integrity_score, pipeline_efficiency_score, overall_quality_score);

-- =============================================
-- Migration Verification Queries
-- =============================================

-- Verify configuration parameters were added
-- Expected: 11 data_quality parameters + 2 orchestrator parameters
SELECT COUNT(*) as data_quality_config_count
FROM unified_config
WHERE category = 'data_quality';

SELECT COUNT(*) as orchestrator_quality_config_count
FROM unified_config
WHERE category = 'orchestrator' AND config_key LIKE '%data_quality%';

-- Verify table structure
SELECT sql FROM sqlite_master WHERE type='table' AND name='data_quality_reports';

-- Verify indexes
SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='data_quality_reports';

-- =============================================
-- Usage Examples
-- =============================================

-- Example: Enable data quality analysis
-- UPDATE unified_config
-- SET config_value = 'true'
-- WHERE config_key = 'orchestrator_data_quality_enabled';

-- Example: Set verbose output for debugging
-- UPDATE unified_config
-- SET config_value = 'true'
-- WHERE config_key = 'orchestrator_data_quality_verbose';

-- Example: Query recent quality trends
-- SELECT
--   batch_id,
--   created_at,
--   overall_quality_score,
--   data_integrity_score,
--   JSON_EXTRACT(anomalies, '$') as anomaly_count
-- FROM data_quality_reports
-- ORDER BY created_at DESC
-- LIMIT 10;
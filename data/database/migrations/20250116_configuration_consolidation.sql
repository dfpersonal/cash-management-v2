-- Configuration Consolidation Migration
-- Date: 2025-01-16
-- Description: Consolidate configuration architecture for JSON pipeline implementation
--
-- Changes:
-- 1. Migrate all deduplication_config parameters to unified_config with proper categorization
-- 2. Rename deduplication_rules to unified_business_rules with category field
-- 3. Clean up legacy deduplication_config table
--
-- Implementation Principles:
-- - No hardcoded values: All parameters preserved in database
-- - Rules engine first: Prepare for json-rules-engine integration
-- - Complete functionality preservation: All existing data maintained

BEGIN TRANSACTION;

-- ==============================================================================
-- BACKUP EXISTING DATA (Safety measure)
-- ==============================================================================

-- Create backup tables for safety
CREATE TABLE IF NOT EXISTS deduplication_config_backup AS
SELECT * FROM deduplication_config;

CREATE TABLE IF NOT EXISTS deduplication_rules_backup AS
SELECT * FROM deduplication_rules;

-- ==============================================================================
-- PHASE 1: MIGRATE DEDUPLICATION_CONFIG TO UNIFIED_CONFIG
-- ==============================================================================

-- Insert deduplication configuration parameters into unified_config
-- Using proper category classification for pipeline implementation

INSERT OR REPLACE INTO unified_config (config_key, config_value, config_type, category, description, is_active, updated_at)
SELECT
    config_key,
    config_value,
    config_type,
    CASE config_category
        WHEN 'behavior' THEN 'deduplication'
        WHEN 'tolerance' THEN 'deduplication'
        WHEN 'rate_thresholds' THEN 'json_ingestion'
        WHEN 'operational_efficiency' THEN 'json_ingestion'
        WHEN 'user_preferences' THEN 'deduplication'
        ELSE 'deduplication'  -- fallback for any uncategorized items
    END as category,
    COALESCE(description, 'Migrated from deduplication_config') as description,
    1 as is_active,
    CURRENT_TIMESTAMP as updated_at
FROM deduplication_config;

-- Add specific configuration parameters that were in the pre-refactor system
-- Based on the pre-refactor deduplication-config-manager.js analysis

-- Platform Priority Configuration (from pre-refactor system)
INSERT OR REPLACE INTO unified_config (config_key, config_value, config_type, category, description, is_active, updated_at)
VALUES
    ('platform_priority_moneyfacts', '4', 'number', 'deduplication', 'MoneyFacts platform priority weight', 1, CURRENT_TIMESTAMP),
    ('platform_priority_flagstone', '3', 'number', 'deduplication', 'Flagstone platform priority weight', 1, CURRENT_TIMESTAMP),
    ('platform_priority_ajbell', '2', 'number', 'deduplication', 'AJ Bell platform priority weight', 1, CURRENT_TIMESTAMP),
    ('platform_priority_hargreaves_lansdown', '1', 'number', 'deduplication', 'Hargreaves Lansdown platform priority weight', 1, CURRENT_TIMESTAMP);

-- Quality Metrics Configuration (from pre-refactor system)
INSERT OR REPLACE INTO unified_config (config_key, config_value, config_type, category, description, is_active, updated_at)
VALUES
    ('quality_confidence_scoring_enabled', 'true', 'boolean', 'deduplication', 'Enable confidence scoring for quality metrics', 1, CURRENT_TIMESTAMP),
    ('quality_factor_rate_accuracy', '0.3', 'number', 'deduplication', 'Weight for rate accuracy in confidence scoring', 1, CURRENT_TIMESTAMP),
    ('quality_factor_data_completeness', '0.25', 'number', 'deduplication', 'Weight for data completeness in confidence scoring', 1, CURRENT_TIMESTAMP),
    ('quality_factor_platform_reliability', '0.2', 'number', 'deduplication', 'Weight for platform reliability in confidence scoring', 1, CURRENT_TIMESTAMP),
    ('quality_factor_recent_update', '0.15', 'number', 'deduplication', 'Weight for recent update in confidence scoring', 1, CURRENT_TIMESTAMP),
    ('quality_factor_source_verification', '0.1', 'number', 'deduplication', 'Weight for source verification in confidence scoring', 1, CURRENT_TIMESTAMP);

-- Business Key Generation Configuration (from pre-refactor system)
INSERT OR REPLACE INTO unified_config (config_key, config_value, config_type, category, description, is_active, updated_at)
VALUES
    ('business_key_components', '["provider_name", "account_type", "rate", "min_deposit"]', 'json', 'deduplication', 'Components used for business key generation', 1, CURRENT_TIMESTAMP),
    ('business_key_include_special_features', 'true', 'boolean', 'deduplication', 'Include special features in business key generation', 1, CURRENT_TIMESTAMP),
    ('business_key_include_min_deposit', 'true', 'boolean', 'deduplication', 'Include minimum deposit in business key generation', 1, CURRENT_TIMESTAMP),
    ('business_key_normalize_names', 'true', 'boolean', 'deduplication', 'Normalize provider names in business key generation', 1, CURRENT_TIMESTAMP);

-- Audit Trail Configuration (from pre-refactor system)
INSERT OR REPLACE INTO unified_config (config_key, config_value, config_type, category, description, is_active, updated_at)
VALUES
    ('audit_trail_enabled', 'true', 'boolean', 'deduplication', 'Enable comprehensive audit trail logging', 1, CURRENT_TIMESTAMP),
    ('audit_log_deduplication_decisions', 'true', 'boolean', 'deduplication', 'Log all deduplication decisions for audit', 1, CURRENT_TIMESTAMP),
    ('audit_preserve_original_data', 'true', 'boolean', 'deduplication', 'Preserve original data in audit trail', 1, CURRENT_TIMESTAMP),
    ('audit_track_business_keys', 'true', 'boolean', 'deduplication', 'Track business key generation in audit trail', 1, CURRENT_TIMESTAMP);

-- FRN Management Configuration (for Phase 3 - FRN Manager Service)
INSERT OR REPLACE INTO unified_config (config_key, config_value, config_type, category, description, is_active, updated_at)
VALUES
    ('frn_fuzzy_match_threshold', '0.8', 'number', 'frn_management', 'Threshold for fuzzy matching bank names to FRNs', 1, CURRENT_TIMESTAMP),
    ('frn_partial_match_confidence', '0.9', 'number', 'frn_management', 'Confidence multiplier for partial FRN matches', 1, CURRENT_TIMESTAMP),
    ('frn_fuzzy_match_confidence', '0.8', 'number', 'frn_management', 'Confidence multiplier for fuzzy FRN matches', 1, CURRENT_TIMESTAMP),
    ('frn_auto_flag_unmatched', 'true', 'boolean', 'frn_management', 'Automatically flag unmatched banks for research', 1, CURRENT_TIMESTAMP),
    ('frn_cache_enabled', 'true', 'boolean', 'frn_management', 'Enable FRN lookup caching for performance', 1, CURRENT_TIMESTAMP),
    ('frn_cache_ttl_hours', '24', 'number', 'frn_management', 'FRN cache time-to-live in hours', 1, CURRENT_TIMESTAMP);

-- JSON Ingestion Configuration (for Phase 2 - JSONIngestionService)
INSERT OR REPLACE INTO unified_config (config_key, config_value, config_type, category, description, is_active, updated_at)
VALUES
    ('json_ingestion_batch_size', '1000', 'number', 'json_ingestion', 'Batch size for processing JSON files', 1, CURRENT_TIMESTAMP),
    ('json_ingestion_timeout_ms', '300000', 'number', 'json_ingestion', 'Timeout for JSON processing in milliseconds', 1, CURRENT_TIMESTAMP),
    ('json_ingestion_validate_schema', 'true', 'boolean', 'json_ingestion', 'Validate JSON schema during ingestion', 1, CURRENT_TIMESTAMP),
    ('json_ingestion_track_files', 'true', 'boolean', 'json_ingestion', 'Track processed files to prevent reprocessing', 1, CURRENT_TIMESTAMP);

-- Orchestrator Configuration (for Phase 5 - Orchestrator Service)
INSERT OR REPLACE INTO unified_config (config_key, config_value, config_type, category, description, is_active, updated_at)
VALUES
    ('orchestrator_max_retries', '3', 'number', 'orchestrator', 'Maximum retry attempts for failed pipeline stages', 1, CURRENT_TIMESTAMP),
    ('orchestrator_retry_delay_ms', '5000', 'number', 'orchestrator', 'Delay between retry attempts in milliseconds', 1, CURRENT_TIMESTAMP),
    ('orchestrator_preserve_partial_success', 'true', 'boolean', 'orchestrator', 'Preserve partial success when pipeline stages fail', 1, CURRENT_TIMESTAMP),
    ('orchestrator_parallel_processing', 'false', 'boolean', 'orchestrator', 'Enable parallel processing where possible', 1, CURRENT_TIMESTAMP);

-- ==============================================================================
-- PHASE 2: RENAME DEDUPLICATION_RULES TO UNIFIED_BUSINESS_RULES
-- ==============================================================================

-- Create the new unified_business_rules table with category field
CREATE TABLE unified_business_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_name TEXT NOT NULL UNIQUE,
    rule_category TEXT NOT NULL, -- 'deduplication', 'json_ingestion', 'frn_management', etc.
    rule_type TEXT NOT NULL,
    conditions TEXT NOT NULL, -- JSON string containing rule conditions
    event_type TEXT NOT NULL,
    event_params TEXT, -- JSON string containing event parameters
    priority INTEGER DEFAULT 100,
    enabled BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migrate existing deduplication rules with category classification
INSERT INTO unified_business_rules (
    rule_name, rule_category, rule_type, conditions, event_type, event_params,
    priority, enabled, description, created_at, updated_at
)
SELECT
    rule_name,
    'deduplication' as rule_category, -- All existing rules are deduplication rules
    rule_type,
    conditions,
    event_type,
    event_params,
    priority,
    enabled,
    COALESCE(description, 'Migrated from deduplication_rules') as description,
    created_at,
    CURRENT_TIMESTAMP as updated_at
FROM deduplication_rules;

-- Add sample business rules for the new pipeline components
-- These will be used by the json-rules-engine in each service

-- JSON Ingestion Rules
INSERT INTO unified_business_rules (rule_name, rule_category, rule_type, conditions, event_type, event_params, priority, enabled, description)
VALUES
    ('rate_threshold_filter', 'json_ingestion', 'filter', '{"conditions": {"all": [{"fact": "aer_rate", "operator": "greaterThanInclusive", "value": {"fact": "min_rate_threshold"}}]}}', 'filter_product', '{"action": "exclude_low_rate"}', 100, 1, 'Filter products below minimum rate thresholds'),
    ('platform_priority_scoring', 'json_ingestion', 'scoring', '{"conditions": {"all": [{"fact": "platform", "operator": "in", "value": ["moneyfacts", "flagstone", "ajbell", "hargreaves_lansdown"]}]}}', 'apply_platform_score', '{"score_field": "platform_priority"}', 90, 1, 'Apply platform priority scoring during ingestion'),
    ('quality_validation', 'json_ingestion', 'validation', '{"conditions": {"all": [{"fact": "required_fields_complete", "operator": "equal", "value": true}]}}', 'validate_quality', '{"min_confidence": 0.7}', 80, 1, 'Validate product quality during JSON ingestion');

-- FRN Management Rules
INSERT INTO unified_business_rules (rule_name, rule_category, rule_type, conditions, event_type, event_params, priority, enabled, description)
VALUES
    ('auto_flag_no_frn_match', 'frn_management', 'flagging', '{"conditions": {"all": [{"fact": "frn_match_confidence", "operator": "lessThan", "value": 0.5}]}}', 'flag_for_research', '{"research_queue": "frn_research_temp"}', 100, 1, 'Auto-flag banks with low FRN match confidence for manual research'),
    ('fuzzy_match_threshold', 'frn_management', 'matching', '{"conditions": {"all": [{"fact": "name_similarity", "operator": "greaterThanInclusive", "value": 0.8}]}}', 'accept_fuzzy_match', '{"confidence_multiplier": 0.8}', 90, 1, 'Accept fuzzy matches above threshold with reduced confidence'),
    ('prioritize_manual_overrides', 'frn_management', 'priority', '{"conditions": {"all": [{"fact": "has_manual_override", "operator": "equal", "value": true}]}}', 'use_manual_override', '{"priority": "highest"}', 200, 1, 'Prioritize manual FRN overrides over automatic matching');

-- ==============================================================================
-- PHASE 3: CREATE INDEXES FOR PERFORMANCE
-- ==============================================================================

-- Index on unified_config for category-based queries (used by all services)
CREATE INDEX IF NOT EXISTS idx_unified_config_category ON unified_config(category);
CREATE INDEX IF NOT EXISTS idx_unified_config_active ON unified_config(is_active);

-- Index on unified_business_rules for category and enabled status
CREATE INDEX IF NOT EXISTS idx_unified_business_rules_category ON unified_business_rules(rule_category);
CREATE INDEX IF NOT EXISTS idx_unified_business_rules_enabled ON unified_business_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_unified_business_rules_priority ON unified_business_rules(priority);

-- ==============================================================================
-- PHASE 4: VALIDATION QUERIES
-- ==============================================================================

-- Verify migration completeness
-- This will be checked after migration execution

-- ==============================================================================
-- COMMIT TRANSACTION
-- ==============================================================================

COMMIT;

-- ==============================================================================
-- POST-MIGRATION VALIDATION QUERIES (to be run after migration)
-- ==============================================================================

-- Uncomment these queries to validate the migration after execution:

-- Count migrated records
-- SELECT 'deduplication_config records:' as table_name, COUNT(*) as count FROM deduplication_config_backup
-- UNION ALL
-- SELECT 'unified_config records (deduplication category):', COUNT(*) FROM unified_config WHERE category IN ('deduplication', 'json_ingestion', 'frn_management', 'orchestrator')
-- UNION ALL
-- SELECT 'deduplication_rules records:', COUNT(*) FROM deduplication_rules_backup
-- UNION ALL
-- SELECT 'unified_business_rules records:', COUNT(*) FROM unified_business_rules;

-- Verify no configuration loss
-- SELECT config_key, config_value, category FROM unified_config WHERE category IN ('deduplication', 'json_ingestion', 'frn_management', 'orchestrator') ORDER BY category, config_key;

-- Verify rules migration
-- SELECT rule_name, rule_category, enabled FROM unified_business_rules ORDER BY rule_category, priority;

-- ==============================================================================
-- CLEANUP INSTRUCTIONS (to be run after validation)
-- ==============================================================================

-- After validating the migration is successful, run these commands to clean up:
-- DROP TABLE deduplication_config;
-- DROP TABLE deduplication_rules;
--
-- Backup tables can be kept for safety or removed after validation:
-- DROP TABLE deduplication_config_backup;
-- DROP TABLE deduplication_rules_backup;
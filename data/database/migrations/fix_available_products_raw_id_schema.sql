-- Migration: Fix available_products_raw table ID field schema
-- Issue: ID field is defined as INT instead of INTEGER PRIMARY KEY AUTOINCREMENT
-- This causes products to have null IDs, breaking deduplication service
-- Date: 2025-09-19

-- SQLite requires recreating table to modify primary key
-- Step 1: Create new table with correct schema
CREATE TABLE available_products_raw_new(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT,
  source TEXT,
  bank_name TEXT,
  frn TEXT,
  account_type TEXT,
  aer_rate REAL,
  gross_rate REAL,
  term_months INT,
  notice_period_days INT,
  min_deposit INT,
  max_deposit INT,
  fscs_protected NUM,
  interest_payment_frequency TEXT,
  apply_by_date NUM,
  special_features TEXT,
  scrape_date NUM,
  confidence_score REAL,
  fuzzy_match_notes TEXT,
  created_at NUM,
  business_key TEXT,
  deduplication_metadata TEXT,
  raw_platform TEXT,
  imported_at,
  processed_at,
  dedup_status,
  dedup_reason
);

-- Step 2: Copy existing data (if any)
INSERT INTO available_products_raw_new (
  platform, source, bank_name, frn, account_type, aer_rate, gross_rate,
  term_months, notice_period_days, min_deposit, max_deposit, fscs_protected,
  interest_payment_frequency, apply_by_date, special_features, scrape_date,
  confidence_score, fuzzy_match_notes, created_at, business_key,
  deduplication_metadata, raw_platform, imported_at, processed_at,
  dedup_status, dedup_reason
)
SELECT
  platform, source, bank_name, frn, account_type, aer_rate, gross_rate,
  term_months, notice_period_days, min_deposit, max_deposit, fscs_protected,
  interest_payment_frequency, apply_by_date, special_features, scrape_date,
  confidence_score, fuzzy_match_notes, created_at, business_key,
  deduplication_metadata, raw_platform, imported_at, processed_at,
  dedup_status, dedup_reason
FROM available_products_raw;

-- Step 3: Drop old table
DROP TABLE available_products_raw;

-- Step 4: Rename new table
ALTER TABLE available_products_raw_new RENAME TO available_products_raw;

-- Step 5: Recreate indexes
CREATE INDEX idx_raw_products_processing ON available_products_raw(processed_at, dedup_status);
CREATE INDEX idx_raw_products_business_key ON available_products_raw(business_key);

-- Verification: Check that ID field now auto-increments
-- INSERT INTO available_products_raw (platform, bank_name, account_type, aer_rate, scrape_date)
-- VALUES ('test', 'Test Bank', 'easy_access', 4.5, '2025-09-19');
-- SELECT id FROM available_products_raw WHERE platform = 'test';
-- DELETE FROM available_products_raw WHERE platform = 'test';
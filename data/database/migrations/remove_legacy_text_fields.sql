-- Migration: Remove Legacy Text Fields
-- Date: 2025-01-17
-- Description: Remove notice_period, term, and interest_payment_frequency text fields
--              that are legacy from MVP iterations. These have been replaced by:
--              - notice_period_days (INTEGER) replaces notice_period (TEXT)
--              - term_months (INTEGER) replaces term (TEXT)
--              - interest_payment_type (TEXT) replaces interest_payment_frequency (TEXT)

-- SQLite doesn't support DROP COLUMN directly, so we need to:
-- 1. Create a new table without the legacy columns
-- 2. Copy data from old table
-- 3. Drop old table
-- 4. Rename new table

BEGIN TRANSACTION;

-- Create new my_deposits table without legacy fields
CREATE TABLE my_deposits_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Current', 'Savings')),
  sub_type TEXT NOT NULL CHECK (sub_type IN ('Easy Access', 'Notice', 'Term', 'n/a')),
  is_isa NUMERIC DEFAULT FALSE,
  platform TEXT,
  frn TEXT,
  account_name TEXT,
  sort_code TEXT,
  account_number TEXT,
  reference TEXT,
  designated_account TEXT,
  aer REAL,
  -- Legacy fields removed: notice_period, term, interest_payment_frequency
  deposit_date DATE,
  term_ends DATE,
  balance REAL,
  min_deposit REAL,
  max_deposit REAL,
  is_active NUMERIC DEFAULT TRUE,
  notes TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notice_period_days INTEGER,
  term_months INTEGER,
  liquidity_tier TEXT,
  can_withdraw_immediately INTEGER DEFAULT 1,
  earliest_withdrawal_date DATE,
  last_balance_update DATE,
  balance_update_frequency TEXT DEFAULT 'monthly' CHECK (balance_update_frequency IN ('weekly', 'bi-weekly', 'monthly', 'quarterly')),
  next_balance_check DATE,
  is_joint_account NUMERIC DEFAULT FALSE,
  num_account_holders INTEGER,
  minimum_balance REAL DEFAULT 0,
  interest_payment_type TEXT CHECK (interest_payment_type IN ('Monthly', 'Quarterly', 'Annually', 'Fixed_Date', 'At_Maturity')),
  interest_next_payment_date DATE,
  interest_fixed_payment_day INTEGER CHECK (interest_fixed_payment_day BETWEEN 1 AND 31),
  interest_fixed_payment_month INTEGER CHECK (interest_fixed_payment_month BETWEEN 1 AND 12),
  interest_payment_destination TEXT DEFAULT 'Same_Account' CHECK (interest_payment_destination IN ('Same_Account', 'Other_Account_Same_Bank', 'Designated_Account')),
  interest_payment_account_id INTEGER,
  designated_account_id INTEGER,
  FOREIGN KEY (interest_payment_account_id) REFERENCES my_deposits(id),
  FOREIGN KEY (designated_account_id) REFERENCES my_deposits(id)
);

-- Copy data from old table to new table (excluding legacy columns)
INSERT INTO my_deposits_new (
  id, bank, type, sub_type, is_isa, platform, frn, account_name, sort_code, account_number,
  reference, designated_account, aer, deposit_date, term_ends, balance, min_deposit, max_deposit,
  is_active, notes, last_updated, created_at, notice_period_days, term_months, liquidity_tier,
  can_withdraw_immediately, earliest_withdrawal_date, last_balance_update, balance_update_frequency,
  next_balance_check, is_joint_account, num_account_holders, minimum_balance, interest_payment_type,
  interest_next_payment_date, interest_fixed_payment_day, interest_fixed_payment_month,
  interest_payment_destination, interest_payment_account_id, designated_account_id
)
SELECT
  id, bank, type, sub_type, is_isa, platform, frn, account_name, sort_code, account_number,
  reference, designated_account, aer, deposit_date, term_ends, balance, min_deposit, max_deposit,
  is_active, notes, last_updated, created_at, notice_period_days, term_months, liquidity_tier,
  can_withdraw_immediately, earliest_withdrawal_date, last_balance_update, balance_update_frequency,
  next_balance_check, is_joint_account, num_account_holders, minimum_balance, interest_payment_type,
  interest_next_payment_date, interest_fixed_payment_day, interest_fixed_payment_month,
  interest_payment_destination, interest_payment_account_id, designated_account_id
FROM my_deposits;

-- Drop old table
DROP TABLE my_deposits;

-- Rename new table
ALTER TABLE my_deposits_new RENAME TO my_deposits;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_my_deposits_notice_days ON my_deposits(notice_period_days);
CREATE INDEX IF NOT EXISTS idx_my_deposits_term_months ON my_deposits(term_months);
CREATE INDEX IF NOT EXISTS idx_my_deposits_liquidity_tier ON my_deposits(liquidity_tier);
CREATE INDEX IF NOT EXISTS idx_my_deposits_withdrawal ON my_deposits(can_withdraw_immediately);
CREATE INDEX IF NOT EXISTS idx_deposits_next_check ON my_deposits(next_balance_check);
CREATE INDEX IF NOT EXISTS idx_deposits_frequency ON my_deposits(balance_update_frequency);

COMMIT;

-- Verification query (optional - commented out)
-- SELECT COUNT(*) as total_records FROM my_deposits;
-- PRAGMA table_info(my_deposits);

#!/bin/bash
# File: scripts/validate_migration.sh

set -e

DEV_DB="/Users/david/Websites/cash-management/data/database/cash_savings_dev.db"

echo "Validating database migrations..."

# Function to run SQL and show results
run_validation() {
    local description="$1"
    local sql="$2"
    echo "🔍 $description"
    sqlite3 "$DEV_DB" "$sql"
    echo ""
}

# Schema validation
echo "=== SCHEMA VALIDATION ==="
run_validation "Checking my_deposits schema for joint account columns:" \
    "PRAGMA table_info(my_deposits);"

run_validation "Checking my_pending_deposits schema for joint account columns:" \
    "PRAGMA table_info(my_pending_deposits);"

run_validation "Checking sharia_banks table exists:" \
    ".schema sharia_banks"

# Data validation
echo "=== DATA VALIDATION ==="
run_validation "Verifying joint account defaults in my_deposits:" \
    "SELECT is_joint_account, num_account_holders, COUNT(*) as count FROM my_deposits GROUP BY is_joint_account, num_account_holders;"

run_validation "Verifying Sharia banks registry:" \
    "SELECT frn, bank_name, is_sharia_compliant FROM sharia_banks;"

run_validation "Verifying new configuration entries:" \
    "SELECT config_key, config_value, config_type FROM compliance_config WHERE config_key IN ('include_pending_deposits_in_fscs', 'allow_sharia_banks');"

# Data integrity checks
echo "=== INTEGRITY CHECKS ==="
run_validation "Checking data integrity - record counts:" \
    "SELECT 
        'my_deposits' as table_name, COUNT(*) as count FROM my_deposits
     UNION ALL
     SELECT 
        'my_pending_deposits' as table_name, COUNT(*) as count FROM my_pending_deposits
     UNION ALL
     SELECT 
        'compliance_config' as table_name, COUNT(*) as count FROM compliance_config
     UNION ALL
     SELECT 
        'sharia_banks' as table_name, COUNT(*) as count FROM sharia_banks;"

# Performance check - ensure indexes exist
run_validation "Checking indexes:" \
    "SELECT name, sql FROM sqlite_master WHERE type='index' AND (name LIKE '%joint%' OR name LIKE '%sharia%');"

echo "✅ Database validation complete!"
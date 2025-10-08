#!/bin/bash
# File: scripts/create_dev_database.sh

set -e  # Exit on any error

SOURCE_DB="/Users/david/Websites/cash-management/data/database/cash_savings.db"
DEV_DB="/Users/david/Websites/cash-management/data/database/cash_savings_dev.db"
BACKUP_DIR="/Users/david/Websites/cash-management/data/backups"

echo "Creating development database copy..."

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create timestamped backup of source
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/cash_savings_pre_dev_copy_$TIMESTAMP.db"
cp "$SOURCE_DB" "$BACKUP_FILE"
echo "Backup created: $BACKUP_FILE"

# Create development copy
cp "$SOURCE_DB" "$DEV_DB"
echo "Development database created: $DEV_DB"

# Verify copy integrity
SOURCE_COUNT=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM my_deposits;")
DEV_COUNT=$(sqlite3 "$DEV_DB" "SELECT COUNT(*) FROM my_deposits;")

if [ "$SOURCE_COUNT" -eq "$DEV_COUNT" ]; then
    echo "✅ Database copy verified successfully ($SOURCE_COUNT records)"
else
    echo "❌ Database copy verification failed!"
    echo "Source: $SOURCE_COUNT records, Dev: $DEV_COUNT records"
    exit 1
fi

echo "Development database setup complete!"
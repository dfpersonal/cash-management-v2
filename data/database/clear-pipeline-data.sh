#!/bin/bash

###############################################################################
# Pipeline Data Clear Script
#
# Clears all pipeline-related data from the cash management database.
# Includes WAL checkpointing, safety features, and optional backup.
#
# Usage: ./clear-pipeline-data.sh [options]
#
# Options:
#   --with-backup      Create timestamped backup before clearing
#   --dry-run          Preview what would be deleted (show counts only)
#   --force            Skip confirmation prompt (use with caution!)
#   --help             Show this help message
#
# Examples:
#   ./clear-pipeline-data.sh                    # Standard clear with confirmation
#   ./clear-pipeline-data.sh --with-backup      # Backup then clear
#   ./clear-pipeline-data.sh --dry-run          # Preview only
#   ./clear-pipeline-data.sh --force            # Clear without confirmation
###############################################################################

set -e  # Exit on error

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# Script directory and database path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${SCRIPT_DIR}/cash_savings.db"
BACKUP_DIR="${SCRIPT_DIR}/backups"

# Parse command line options
WITH_BACKUP=false
DRY_RUN=false
FORCE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --with-backup)
      WITH_BACKUP=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --help|-h)
      echo -e "${BOLD}${CYAN}Pipeline Data Clear Script${RESET}"
      echo ""
      echo -e "${BOLD}USAGE:${RESET}"
      echo "  ./clear-pipeline-data.sh [options]"
      echo ""
      echo -e "${BOLD}OPTIONS:${RESET}"
      echo "  --with-backup      Create timestamped backup before clearing"
      echo "  --dry-run          Preview what would be deleted (show counts only)"
      echo "  --force            Skip confirmation prompt (use with caution!)"
      echo "  --help             Show this help message"
      echo ""
      echo -e "${BOLD}EXAMPLES:${RESET}"
      echo "  ./clear-pipeline-data.sh                    # Standard clear with confirmation"
      echo "  ./clear-pipeline-data.sh --with-backup      # Backup then clear"
      echo "  ./clear-pipeline-data.sh --dry-run          # Preview only"
      echo "  ./clear-pipeline-data.sh --force            # Clear without confirmation"
      echo ""
      exit 0
      ;;
    *)
      echo -e "${RED}Error: Unknown option '$1'${RESET}"
      echo "Run with --help for usage information"
      exit 1
      ;;
  esac
done

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
  echo -e "${RED}Error: Database not found at ${DB_PATH}${RESET}"
  exit 1
fi

# Banner
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${CYAN}        Pipeline Data Clear Script${RESET}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${RESET}"
echo ""
echo -e "${DIM}Database: ${DB_PATH}${RESET}"
echo ""

# Tables to clear
TABLES=(
  "available_products_raw"
  "available_products"
  "pipeline_audit"
  "json_ingestion_audit"
  "frn_matching_audit"
  "deduplication_audit"
  "json_ingestion_corruption_audit"
  "deduplication_groups"
  "data_quality_reports"
)

###############################################################################
# Function: Get record count for a table
###############################################################################
get_count() {
  local table=$1
  sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "0"
}

###############################################################################
# Function: Display record counts
###############################################################################
show_counts() {
  local label=$1
  echo -e "${BOLD}${label} Record Counts:${RESET}"
  echo -e "${DIM}┌─────────────────────────────────────┬───────────┐${RESET}"
  echo -e "${DIM}│ Table                               │ Records   │${RESET}"
  echo -e "${DIM}├─────────────────────────────────────┼───────────┤${RESET}"

  local total=0
  for table in "${TABLES[@]}"; do
    local count=$(get_count "$table")
    total=$((total + count))
    printf "${DIM}│${RESET} %-35s ${DIM}│${RESET} %9s ${DIM}│${RESET}\n" "$table" "$(printf "%'d" $count)"
  done

  echo -e "${DIM}├─────────────────────────────────────┼───────────┤${RESET}"
  printf "${DIM}│${RESET} ${BOLD}%-35s${RESET} ${DIM}│${RESET} ${BOLD}%9s${RESET} ${DIM}│${RESET}\n" "TOTAL" "$(printf "%'d" $total)"
  echo -e "${DIM}└─────────────────────────────────────┴───────────┘${RESET}"
  echo ""
}

###############################################################################
# Function: Create backup
###############################################################################
create_backup() {
  echo -e "${CYAN}Creating backup...${RESET}"

  # Create backup directory if it doesn't exist
  mkdir -p "$BACKUP_DIR"

  # Generate backup filename with timestamp
  local timestamp=$(date +"%Y%m%d_%H%M%S")
  local backup_file="${BACKUP_DIR}/cash_savings_backup_${timestamp}.db"

  # Copy database
  cp "$DB_PATH" "$backup_file"

  # Copy WAL and SHM files if they exist
  if [ -f "${DB_PATH}-wal" ]; then
    cp "${DB_PATH}-wal" "${backup_file}-wal"
  fi
  if [ -f "${DB_PATH}-shm" ]; then
    cp "${DB_PATH}-shm" "${backup_file}-shm"
  fi

  local backup_size=$(du -h "$backup_file" | cut -f1)
  echo -e "${GREEN}✓${RESET} Backup created: ${BOLD}${backup_file}${RESET} (${backup_size})"
  echo ""
}

###############################################################################
# Function: Checkpoint WAL
###############################################################################
checkpoint_wal() {
  local label=$1
  echo -e "${CYAN}${label} WAL checkpoint...${RESET}"
  sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(FULL);" >/dev/null 2>&1
  echo -e "${GREEN}✓${RESET} WAL checkpoint complete"
  echo ""
}

###############################################################################
# Function: Clear pipeline data
###############################################################################
clear_data() {
  echo -e "${CYAN}Clearing pipeline data...${RESET}"

  # Build SQL transaction
  local sql="BEGIN TRANSACTION;"

  for table in "${TABLES[@]}"; do
    sql="${sql} DELETE FROM ${table};"
  done

  sql="${sql} COMMIT;"

  # Execute transaction
  if sqlite3 "$DB_PATH" "$sql" 2>&1; then
    echo -e "${GREEN}✓${RESET} All pipeline data cleared successfully"
  else
    echo -e "${RED}✗${RESET} Failed to clear data (transaction rolled back)"
    exit 1
  fi
  echo ""
}

###############################################################################
# Main execution
###############################################################################

# Step 1: Initial WAL checkpoint
checkpoint_wal "Initial"

# Step 2: Show current record counts
show_counts "Current"

# Step 3: Dry run - exit early
if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}Dry run mode - no data will be deleted${RESET}"
  echo ""
  exit 0
fi

# Step 4: Confirmation prompt (unless --force)
if [ "$FORCE" = false ]; then
  echo -e "${YELLOW}${BOLD}WARNING:${RESET} ${YELLOW}This will permanently delete all pipeline data!${RESET}"
  echo ""
  echo "This includes:"
  echo "  • Raw scraped products"
  echo "  • Final deduplicated products"
  echo "  • All audit trails"
  echo "  • Deduplication groups"
  echo "  • Data quality reports"
  echo ""
  read -p "Are you sure you want to continue? (yes/no): " -r
  echo ""

  if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo -e "${CYAN}Operation cancelled${RESET}"
    echo ""
    exit 0
  fi
fi

# Step 5: Create backup if requested
if [ "$WITH_BACKUP" = true ]; then
  create_backup
fi

# Step 6: Clear the data
clear_data

# Step 7: Final WAL checkpoint
checkpoint_wal "Final"

# Step 8: Show final record counts
show_counts "Final"

# Step 9: Summary
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}        Pipeline Data Successfully Cleared${RESET}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════${RESET}"
echo ""

if [ "$WITH_BACKUP" = true ]; then
  echo -e "${DIM}Backup saved in: ${BACKUP_DIR}${RESET}"
  echo ""
fi

exit 0

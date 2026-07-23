#!/usr/bin/env bash
# Recreate the local development database, apply schema, and load synthetic seed.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${SWAP_DEV_DB:-swap_dev}"
ADMIN_DB="${SWAP_ADMIN_DB:-postgres}"

echo "==> (re)creating database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$ADMIN_DB" -c "drop database if exists $DB (force);"
psql -v ON_ERROR_STOP=1 -q -d "$ADMIN_DB" -c "create database $DB;"

bash "$ROOT_DIR/scripts/apply-schema.sh" "$DB"

echo "==> seeding synthetic development data"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT_DIR/supabase/seed/seed.sql"
echo "==> dev database ready: $DB"

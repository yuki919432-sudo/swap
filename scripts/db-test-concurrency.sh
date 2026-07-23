#!/usr/bin/env bash
# Provision a throwaway DB with the full schema, then run the multi-connection
# concurrency suite (node-postgres, real separate connections).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${SWAP_CONCURRENCY_DB:-swap_concurrency}"
ADMIN_DB="${SWAP_ADMIN_DB:-postgres}"

echo "==> (re)creating database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$ADMIN_DB" -c "drop database if exists $DB (force);"
psql -v ON_ERROR_STOP=1 -q -d "$ADMIN_DB" -c "create database $DB;"

bash "$ROOT_DIR/scripts/apply-schema.sh" "$DB"

echo "==> running concurrency suite"
SWAP_CONCURRENCY_DB="$DB" node "$ROOT_DIR/supabase/tests/concurrency/run.mjs"

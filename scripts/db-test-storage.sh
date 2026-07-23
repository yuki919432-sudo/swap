#!/usr/bin/env bash
# Storage policy tests. Provisions a throwaway DB WITH a local replica of the
# Supabase `storage` schema (so migration 0022 applies), then runs the storage
# pgTAP suite. Validates the object RLS policy logic; the Supabase storage
# SERVICE itself is a separate manual/integration check (see docs/storage.md).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${SWAP_STORAGE_DB:-swap_storage_test}"
ADMIN_DB="${SWAP_ADMIN_DB:-postgres}"

echo "==> (re)creating database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$ADMIN_DB" -c "drop database if exists $DB (force);"
psql -v ON_ERROR_STOP=1 -q -d "$ADMIN_DB" -c "create database $DB;"

# STORAGE_STUB=1 makes apply-schema install the storage replica before migrations.
STORAGE_STUB=1 bash "$ROOT_DIR/scripts/apply-schema.sh" "$DB"

echo "==> installing pgTAP + test helpers"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -c "create extension if not exists pgtap;"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT_DIR/supabase/tests/setup/01_helpers.sql"

echo "==> running storage pgTAP suite"
pg_prove --ext .sql -d "$DB" "$ROOT_DIR"/supabase/tests/storage/*.sql

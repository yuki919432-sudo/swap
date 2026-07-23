#!/usr/bin/env bash
# Recreate a throwaway test DB, apply schema, load pgTAP + helpers, run tests.
#
# Requires: a local PostgreSQL with the pgTAP extension and pg_prove available.
# See docs/testing.md for one-time setup.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${SWAP_TEST_DB:-swap_test}"
ADMIN_DB="${SWAP_ADMIN_DB:-postgres}"

echo "==> (re)creating database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$ADMIN_DB" -c "drop database if exists $DB (force);"
psql -v ON_ERROR_STOP=1 -q -d "$ADMIN_DB" -c "create database $DB;"

bash "$ROOT_DIR/scripts/apply-schema.sh" "$DB"

echo "==> installing pgTAP + test helpers"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -c "create extension if not exists pgtap;"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT_DIR/supabase/tests/setup/01_helpers.sql"

echo "==> running pgTAP suite"
pg_prove --ext .sql -d "$DB" "$ROOT_DIR"/supabase/tests/*.sql

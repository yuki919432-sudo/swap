#!/usr/bin/env bash
# Load synthetic seed into an already-provisioned dev database.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${SWAP_DEV_DB:-swap_dev}"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT_DIR/supabase/seed/seed.sql"

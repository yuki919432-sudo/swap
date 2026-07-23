#!/usr/bin/env bash
# Apply the local bootstrap + all migrations to a target database.
# Usage: apply-schema.sh <dbname>
#
# The bootstrap (supabase/tests/setup/00_bootstrap.sql) recreates the Supabase
# platform pieces (auth schema + roles) that production already provides, so it
# is applied here but NEVER via `supabase db push`.
set -euo pipefail

DB="${1:?usage: apply-schema.sh <dbname>}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 -q -d "$DB")

echo "==> bootstrap (local auth stubs + roles)"
"${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/setup/00_bootstrap.sql"

# Optional: apply a local replica of the Supabase `storage` schema BEFORE the
# migrations so 0022_storage.sql applies and its object policies can be tested.
if [ "${STORAGE_STUB:-}" = "1" ]; then
  echo "==> storage stub (local replica of Supabase storage schema)"
  "${PSQL[@]}" -f "$ROOT_DIR/supabase/tests/setup/02_storage_stub.sql"
fi

echo "==> migrations"
for f in "$ROOT_DIR"/supabase/migrations/*.sql; do
  echo "    - $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo "==> done: $DB"

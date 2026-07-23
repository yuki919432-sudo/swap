#!/usr/bin/env bash
# One command to fully verify the project from a clean state:
#   1. migrations apply in order on a clean DB + full pgTAP suite (cycle 1)
#   2. synthetic seed loads
#   3. TS <-> DB enum parity
#   4. schema is deterministic across a reset (no drift)  [repeatability]
#   5. storage-policy tests
#   6. multi-connection concurrency tests
#   7. typecheck + lint
#
# Fails (non-zero) on the first problem. Intended for local use and CI.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

section() { printf '\n\033[1m==== %s ====\033[0m\n' "$1"; }

section "1/8  dangerous-Unicode scan (bidi / zero-width / control chars)"
node scripts/check-unicode.mjs

section "2/8  clean migrate + pgTAP suite (cycle 1)"
bash scripts/db-test.sh

section "3/8  reset + synthetic seed loads"
bash scripts/db-reset.sh

section "4/8  TypeScript <-> DB enum parity"
SWAP_ENUM_DB="${SWAP_DEV_DB:-swap_dev}" node --experimental-strip-types scripts/check-enum-parity.mjs

section "5/8  schema repeatability / drift check (reset again, diff schema)"
SNAP1="$(mktemp)"; SNAP2="$(mktemp)"
# Strip pg_dump's per-run random \restrict/\unrestrict nonce (not schema).
dump_schema() { pg_dump --schema-only --no-owner --no-privileges -d "$1" | grep -vE '^\\(un)?restrict '; }
dump_schema "${SWAP_DEV_DB:-swap_dev}" > "$SNAP1"
bash scripts/db-reset.sh >/dev/null
dump_schema "${SWAP_DEV_DB:-swap_dev}" > "$SNAP2"
if diff -u "$SNAP1" "$SNAP2"; then
  echo "schema is identical across resets (no drift)"
else
  echo "SCHEMA DRIFT DETECTED between two clean applies" >&2
  exit 1
fi
rm -f "$SNAP1" "$SNAP2"

section "6/8  storage-policy tests"
bash scripts/db-test-storage.sh

section "7/8  multi-connection concurrency tests"
bash scripts/db-test-concurrency.sh

section "8/8  typecheck + lint"
pnpm typecheck
pnpm lint

printf '\n\033[1;32mVERIFY PASSED\033[0m — all checks green.\n'

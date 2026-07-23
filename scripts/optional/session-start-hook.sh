#!/usr/bin/env bash
# OPTIONAL, OPT-IN developer convenience hook. DISABLED BY DEFAULT.
#
# This is NOT wired into settings.json and does not run automatically. It exists
# only as a documented, safe helper you may choose to enable locally. CI and the
# explicit `pnpm` scripts remain the authoritative verification methods.
#
# Safety properties:
#   * Refuses to run unless SWAP_ENABLE_SESSION_HOOK=1 is explicitly set.
#   * Only ever targets a dev/test database (name must match ^swap_(dev|test)).
#   * Refuses anything that looks like production (name containing "prod").
#   * Never connects to a remote host (local socket / localhost only).
#   * Clearly prints the database it will reset before doing anything.
#   * Fails safely (non-zero) rather than guessing.
set -euo pipefail

if [ "${SWAP_ENABLE_SESSION_HOOK:-0}" != "1" ]; then
  echo "session-start-hook is disabled (set SWAP_ENABLE_SESSION_HOOK=1 to opt in). Doing nothing."
  exit 0
fi

DB="${SWAP_DEV_DB:-swap_dev}"

case "$DB" in
  *prod*|*production*)
    echo "Refusing: '$DB' looks like a production database." >&2
    exit 1
    ;;
esac
if [[ ! "$DB" =~ ^swap_(dev|test)$ ]]; then
  echo "Refusing: '$DB' is not an allowed dev/test database name (^swap_(dev|test)$)." >&2
  exit 1
fi
if [ -n "${PGHOST:-}" ] && [[ ! "$PGHOST" =~ ^(/|localhost|127\.0\.0\.1) ]]; then
  echo "Refusing: PGHOST='$PGHOST' is not local." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
echo "About to RESET local database: $DB (drop + recreate + migrate + seed)."
bash "$ROOT_DIR/scripts/db-reset.sh"
echo "Done. This was a local dev reset only."

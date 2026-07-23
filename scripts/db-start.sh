#!/usr/bin/env bash
# Ensure a LOCAL PostgreSQL is running for development/tests. Convenience only;
# it never touches a remote/production database. Role/database creation is a
# one-time manual step documented in docs/local-development.md.
set -euo pipefail

if pg_isready -q 2>/dev/null; then
  echo "PostgreSQL is already accepting connections."
  exit 0
fi

if command -v pg_ctlcluster >/dev/null 2>&1; then
  echo "Starting local PostgreSQL cluster 16/main ..."
  pg_ctlcluster 16 main start || pg_ctlcluster 16 main restart
  sleep 1
  pg_isready -q && echo "PostgreSQL is up." && exit 0
fi

echo "Could not auto-start PostgreSQL. Start your local server manually, then re-run." >&2
exit 1

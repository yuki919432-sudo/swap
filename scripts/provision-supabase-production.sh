#!/usr/bin/env bash
# provision-supabase-production.sh — automate SWAP! production Supabase provisioning.
#
# RUN THIS IN AN ENVIRONMENT WITH SUPABASE NETWORK ACCESS (e.g. a GitHub Codespace or
# your laptop) — NOT in Claude's sandbox, whose egress policy blocks Supabase.
#
# It: creates the production project, deploys all migrations, provisions IMG Academy,
# creates a synthetic App Review tenant + reviewer, and prints the PUBLIC EAS values.
# Secrets (service_role, DB password) are written ONLY to a gitignored local file and
# never printed to stdout.
#
# Prereqs (you provide, as SECRET ENV VARS — never commit):
#   SUPABASE_ACCESS_TOKEN   required. Create at https://supabase.com/dashboard/account/tokens
#                           (a Personal Access Token). Scope: your account. Revoke after.
# Optional:
#   SUPABASE_ORG_ID         your org id (auto-detected if you have exactly one org)
#   SUPABASE_REGION         default us-east-1 (US East — good for a Florida-first launch)
#   PROJECT_NAME            default swap-production
#   SUPABASE_DB_PASSWORD    default: strong random (stored in the secrets file)
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN=sbp_xxx      # do NOT commit; set it in the shell only
#   bash scripts/provision-supabase-production.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
SB() { npx --yes supabase@latest "$@"; }
say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
SECRETS_FILE="$ROOT_DIR/.env.production.secrets"   # gitignored (.env.* + explicit)
PROJECT_NAME="${PROJECT_NAME:-swap-production}"
REGION="${SUPABASE_REGION:-us-east-1}"

: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN (a Supabase Personal Access Token) in your shell first — never commit it}"
command -v node >/dev/null || { echo "node is required"; exit 1; }
node -e "require.resolve('@supabase/supabase-js')" 2>/dev/null || { echo "Run 'pnpm install' first (need @supabase/supabase-js)"; exit 1; }

# ---- 0. resolve organization ------------------------------------------------
say "Resolving organization"
if [ -z "${SUPABASE_ORG_ID:-}" ]; then
  ORGS_JSON="$(SB orgs list -o json)"
  ORG_COUNT="$(node -e "process.stdout.write(String(JSON.parse(process.argv[1]).length))" "$ORGS_JSON")"
  if [ "$ORG_COUNT" = "1" ]; then
    SUPABASE_ORG_ID="$(node -e "process.stdout.write(JSON.parse(process.argv[1])[0].id)" "$ORGS_JSON")"
  else
    echo "You have multiple organizations. Re-run with SUPABASE_ORG_ID set to one of:"; echo "$ORGS_JSON"
    exit 1
  fi
fi
echo "Using org: $SUPABASE_ORG_ID"

# ---- 1. refuse to clobber an existing project of the same name --------------
say "Checking for an existing '$PROJECT_NAME' project"
PROJECTS_JSON="$(SB projects list -o json)"
if node -e "const p=JSON.parse(process.argv[1]);process.exit(p.some(x=>x.name===process.argv[2])?0:1)" "$PROJECTS_JSON" "$PROJECT_NAME"; then
  echo "A project named '$PROJECT_NAME' already exists. Refusing to overwrite."
  echo "Delete it in the dashboard, or set PROJECT_NAME to a new name, then re-run."
  exit 1
fi

# ---- 2. create the project --------------------------------------------------
say "Creating project '$PROJECT_NAME' in $REGION"
DB_PASSWORD="${SUPABASE_DB_PASSWORD:-$(node -e "process.stdout.write(require('crypto').randomBytes(24).toString('base64url'))")}"
CREATE_JSON="$(SB projects create "$PROJECT_NAME" --org-id "$SUPABASE_ORG_ID" --db-password "$DB_PASSWORD" --region "$REGION" -o json)"
PROJECT_REF="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).id||JSON.parse(process.argv[1]).ref||'')" "$CREATE_JSON")"
[ -n "$PROJECT_REF" ] || { echo "Could not determine project ref from create output"; echo "$CREATE_JSON"; exit 1; }
echo "Project ref: $PROJECT_REF"

# ---- 3. wait until the project is healthy -----------------------------------
say "Waiting for the project to become healthy (a few minutes)"
for i in $(seq 1 40); do
  STATUS="$(SB projects list -o json | node -e "const p=JSON.parse(require('fs').readFileSync(0));const m=p.find(x=>x.id===process.argv[1]);process.stdout.write(m?String(m.status):'')" "$PROJECT_REF" || true)"
  echo "  [$i] status: ${STATUS:-unknown}"
  [ "$STATUS" = "ACTIVE_HEALTHY" ] && break
  sleep 15
done

SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

# ---- 4. fetch API keys ------------------------------------------------------
say "Fetching API keys"
KEYS_JSON="$(SB projects api-keys --project-ref "$PROJECT_REF" -o json)"
ANON_KEY="$(node -e "const k=JSON.parse(process.argv[1]);const a=k.find(x=>x.name==='anon');process.stdout.write(a?a.api_key:'')" "$KEYS_JSON")"
SERVICE_KEY="$(node -e "const k=JSON.parse(process.argv[1]);const s=k.find(x=>x.name==='service_role');process.stdout.write(s?s.api_key:'')" "$KEYS_JSON")"
[ -n "$ANON_KEY" ] && [ -n "$SERVICE_KEY" ] || { echo "Could not read API keys"; exit 1; }

# ---- 5. link + deploy all migrations ----------------------------------------
say "Linking and deploying migrations (supabase db push)"
export SUPABASE_DB_PASSWORD="$DB_PASSWORD"
SB link --project-ref "$PROJECT_REF"
SB db push
say "Migration history"
SB migration list --linked || true

# ---- 6. provision IMG Academy (real tenant) ---------------------------------
say "Provisioning IMG Academy tenant"
IMG_OUT="$(SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" node supabase/production/img_seed.mjs)"
echo "$IMG_OUT"
IMG_SCHOOL_ID="$(printf '%s\n' "$IMG_OUT" | sed -n 's/^IMG_SCHOOL_ID=//p')"

# ---- 7. synthetic App Review tenant + reviewer ------------------------------
say "Creating synthetic App Review tenant + reviewer"
REVIEW_PASSWORD="${REVIEW_PASSWORD:-$(node -e "process.stdout.write('Rev-'+require('crypto').randomBytes(9).toString('base64url')+'-9')")}"
# Discard the seeder's stdout — it echoes the reviewer password. Credentials go only
# to the gitignored secrets file below. On failure, surface a generic message.
if ! SUPABASE_URL="$SUPABASE_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" REVIEW_PASSWORD="$REVIEW_PASSWORD" node supabase/production/review_seed.mjs >/dev/null 2>/tmp/review_seed.err; then
  echo "review_seed failed:"; sed -n '1,20p' /tmp/review_seed.err; exit 1
fi
echo "Review tenant + reviewer created (credentials written to the secrets file only)."

# ---- 8. write secrets locally (gitignored), print PUBLIC values only --------
say "Writing secrets to $SECRETS_FILE (gitignored — never commit)"
umask 077
{
  echo "# SWAP! production — generated $(date -u +%FT%TZ). SECRET. DO NOT COMMIT."
  echo "PROJECT_REF=$PROJECT_REF"
  echo "SUPABASE_URL=$SUPABASE_URL"
  echo "SUPABASE_ANON_KEY=$ANON_KEY"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY"
  echo "SUPABASE_DB_PASSWORD=$DB_PASSWORD"
  echo "IMG_SCHOOL_ID=$IMG_SCHOOL_ID"
  echo "# --- App Review reviewer credentials (put in App Store Connect → App Review) ---"
  echo "REVIEW_EMAIL=appreview@swap-review.test"
  echo "REVIEW_PASSWORD=$REVIEW_PASSWORD"
  echo "REVIEW_INVITE_CODE=SWAP-REVIEW-2026"
} > "$SECRETS_FILE"

cat <<EOF

============================================================
 PROVISIONING COMPLETE
============================================================
 Public values for the mobile build (safe to share / put in EAS):

   EXPO_PUBLIC_SUPABASE_URL=$SUPABASE_URL
   EXPO_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
   EXPO_PUBLIC_PILOT_SCHOOL_ID=$IMG_SCHOOL_ID

 Secrets (service_role, DB password, reviewer credentials) were written to:
   $SECRETS_FILE   (gitignored — keep private, do NOT paste into the app/EAS)

 Next:
  1) Set the three EXPO_PUBLIC_* values above in EAS (see docs/appstore/PROVISION_PRODUCTION.md).
  2) Put the reviewer credentials from the secrets file into App Store Connect → App Review.
  3) Build: eas build --profile production --platform ios
============================================================
EOF

# Automated production Supabase provisioning

One script stands up the entire SWAP! production backend. **It cannot run from
Claude's sandbox** (that environment's egress policy blocks all Supabase hosts), so
run it where there IS Supabase network access — your **GitHub Codespace** (works from
an iPad) or your laptop.

What it does (Steps 2–7 of the plan), reusing the CI-proven migrations + seeders:
create the `swap-production` project → deploy all 33 migrations → provision **IMG
Academy** → create a **synthetic App Review tenant + reviewer** → print the **public**
EAS values. Secrets are written only to a gitignored local file, never printed or
committed.

## 1. Create a Supabase Personal Access Token (the single credential needed)

1. https://supabase.com/dashboard/account/tokens → **Generate new token** (name it
   `swap-provision`, any scope tied to your account).
2. Copy it (starts with `sbp_`). **Do not commit it or paste it into the app.**

## 2. Provide it as a secret env var (not committed)

In your **Codespace terminal** (or laptop), export it for this shell only:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx      # never committed; lives only in the shell
```

(You may also set it as a Codespaces **secret** so it's injected automatically — GitHub
→ Settings → Codespaces → Secrets. Never put it in a repo file.)

## 3. Run the provisioner

```bash
cd /workspaces/swap   # or your repo path
git checkout main && git pull
pnpm install
bash scripts/provision-supabase-production.sh
```

Optional overrides: `SUPABASE_ORG_ID` (if you have several orgs), `SUPABASE_REGION`
(default `us-east-1`), `PROJECT_NAME` (default `swap-production`).

It prints the **public** values at the end:

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_PILOT_SCHOOL_ID=<IMG school id>
```

and writes secrets (service_role, DB password, reviewer credentials) to
`./.env.production.secrets` — **gitignored; keep private.**

## 4. Add the public values to EAS (client-safe only)

Only the three `EXPO_PUBLIC_*` values above go to the mobile build. Also set the
support URL. **Never** put service_role, the DB password, or the access token in EAS.

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL       --value "https://<ref>.supabase.co"
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY  --value "<anon key>"
eas env:create --environment production --name EXPO_PUBLIC_PILOT_SCHOOL_ID    --value "<IMG school id>"
eas env:create --environment production --name EXPO_PUBLIC_SUPPORT_URL        --value "https://yuki919432-sudo.github.io/swap/support.html"
# (repeat for the `preview` environment if you build preview too)
```

Then verify before building:

```bash
EXPO_PUBLIC_APP_MODE=pilot \
EXPO_PUBLIC_SUPABASE_URL=… EXPO_PUBLIC_SUPABASE_ANON_KEY=… \
EXPO_PUBLIC_SUPPORT_URL=… EXPO_PUBLIC_PILOT_SCHOOL_ID=… \
pnpm check:mobile-env      # must exit 0
```

## 5. App Review credentials

From `.env.production.secrets`, copy `REVIEW_EMAIL` / `REVIEW_PASSWORD` /
`REVIEW_INVITE_CODE` into **App Store Connect → App Review Information** (see
`APP_REVIEW_NOTES.md` for the walkthrough text). These are for the synthetic review
school — no real student, roster, or manual approval is involved.

## Security notes

- The access token is only used by the script at run time; **revoke it** afterward
  (dashboard → account → tokens) if you like.
- `service_role`, the Management API token, and the DB password are **never** bundled
  into the app and never sent to EAS — only the `EXPO_PUBLIC_*` client values are.
- IMG's owner/moderator is promoted later once a real staff member signs up
  (`supabase/production/02_promote_owner.sql`). No roster, no real student data.

# Build profiles & environment safety

How SWAP! mobile is built for development vs the real pilot, and the guarantees that
keep a real build from ever quietly serving demo data.

## App modes

A single flag, `EXPO_PUBLIC_APP_MODE`, decides whether a build may use synthetic
demo data at all.

| Mode | Value | Data source | Demo data? |
|------|-------|-------------|------------|
| **demo** | `demo` (default) | Mock repositories, or the real backend once a dev signs in | Yes |
| **pilot** | `pilot` | **Always** the real Supabase repositories | **Never** |

The resolver is a pure, unit-tested function (`src/config/appMode.ts →
resolveDataSource`). Its safety-critical invariant:

> A **pilot** build never resolves to mock data. If the backend is not configured,
> it resolves to `unconfigured-pilot` and the app renders a clear **"Backend not
> configured"** screen (`MissingBackendScreen`) — it does **not** fall back to demo
> data.

This is enforced in exactly one place, `RepositoryProvider`, which is the only code
that chooses the data source.

## Environment variables

All `EXPO_PUBLIC_*` values are inlined into the client bundle at build time. They are
public by design — **never put a secret (e.g. a Supabase service-role key) here.**

| Variable | Purpose | Notes |
|----------|---------|-------|
| `EXPO_PUBLIC_APP_MODE` | `demo` or `pilot` | Defaults to `demo` when unset |
| `EXPO_PUBLIC_ENABLE_DEMO_MODE` | `true`/`false` demo session gate | Also requires a dev runtime; off in release builds |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL | Provided per build profile (EAS env) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase **anon** (public) key | Provided per build profile (EAS env) |

### Service-role key guard

`supabaseEnvStatus()` decodes the anon key's JWT `role` claim. If a **service-role**
key is detected, the build is treated as **not configured** and the missing-backend
screen explains the misconfiguration. The service-role key bypasses RLS and must
never ship in a client.

## EAS build profiles (`apps/mobile/eas.json`)

| Profile | Mode | Distribution | Use |
|---------|------|--------------|-----|
| `development` | demo | internal (dev client) | Local development, Expo Go / dev client |
| `preview` | **pilot** | internal | TestFlight-style internal pilot builds |
| `production` | **pilot** | store | App Store submission builds |

`preview` and `production` are **pilot** mode, so they require the real backend to be
configured or they fail loudly.

### Providing secrets (owner task — not committed)

The Supabase URL and anon key are **not** stored in `eas.json` or the repo. Set them
per profile as EAS environment variables before building, e.g.:

```
eas env:create --environment preview    --name EXPO_PUBLIC_SUPABASE_URL      --value "https://<project>.supabase.co"
eas env:create --environment preview    --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon-public-key>"
eas env:create --environment production  --name EXPO_PUBLIC_SUPABASE_URL      --value "https://<project>.supabase.co"
eas env:create --environment production  --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon-public-key>"
```

(Exact command form depends on your EAS CLI version; the point is these values live
in EAS, never in the repository.)

### Building

```
# Local development (demo mode)
pnpm --filter @swap/mobile start

# Internal pilot build (pilot mode, real backend required)
eas build --profile preview --platform ios

# Store build
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

## What still needs the project owner

- An **Apple Developer account** and the final **bundle identifier** (the repo ships a
  placeholder in `app.json`).
- A **production Supabase project** + the anon key (set as EAS env, above).
- A **transactional email provider** for OTP delivery (a later auth-UX step wires it).

The code and configuration are in the repo; only the accounts, secrets, and store
submission are owner-side.

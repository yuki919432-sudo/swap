# Authentication & Sessions

## Providers

Supabase Auth issues JWTs. Supported sign-in providers (configured per school):
Google OAuth, Microsoft OAuth, and email (for the OTP path). See
[school-verification.md](school-verification.md) for how sign-in maps to a
school membership.

## Trust rules

- The verified email is always read from the **provider identity / Supabase Auth
  session**, never from a value typed by the client.
- `auth.uid()` (JWT `sub`) identifies the user in every RLS policy and function.
- Authorization never depends on a client-selected `active_school_id`
  (correction #8) — membership is re-verified server-side each request.

## MFA / assurance levels (correction #4)

- The JWT carries an assurance level: `aal1` (single factor) or `aal2` (MFA
  satisfied), read as `auth.jwt() ->> 'aal'`.
- **Platform-admin access requires `aal2`.** `app.is_platform_admin()` and
  `app.has_platform_role()` return false without it, even for a real platform
  admin. Proven in `supabase/tests/30_platform_mfa.sql`.
- School-admin actions require the appropriate `school_admins` role but not
  necessarily MFA; enabling MFA for school admins is recommended and can be
  enforced later per policy.

## Sessions & revocation

- Standard Supabase JWT + refresh token lifecycle; sign-out and admin-driven
  session revocation invalidate refresh tokens.
- Suspension (`school_memberships.status = 'suspended'`) immediately removes
  access to that school's content via RLS, independent of session state.
- Device push tokens are stored in `device_tokens` and pruned when invalid.

## No default credentials

There are **no** seeded or hard-coded admin credentials in production. Platform
and school admins are provisioned explicitly (`platform_admins`, `school_admins`).
The synthetic seed (dev only) creates fictional accounts with no real secrets.

## OAuth configuration (external, not in the repo)

Google Cloud OAuth client and Azure AD app registration are configured outside
this repository. Required client IDs/secrets live in environment variables
(`.env.example`) and the Supabase dashboard — never committed. Redirect URIs,
scopes, and admin-consent troubleshooting are documented in
[school-verification.md](school-verification.md).

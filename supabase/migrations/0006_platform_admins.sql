-- 0006_platform_admins.sql
-- Correction #4: an explicit platform-admin model. Application/subdomain
-- separation is NOT a security boundary. Every platform-admin action is gated
-- in the database on: (a) a row here, (b) active = true, (c) MFA aal2 in the
-- JWT, and (d) the role permitting the action. See app.is_platform_admin (0014).

create table platform_admins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references users (id) on delete cascade,
  role       platform_role not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references users (id)
);
comment on table platform_admins is
  'Platform operators. Access additionally requires JWT aal2 (MFA). No default/seeded credentials in production.';

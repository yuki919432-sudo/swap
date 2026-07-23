-- 0003_identity_core.sql
-- Core tenant + identity tables: schools, their configuration, and user profiles.

-- Shared trigger to maintain updated_at columns.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- schools ---
create table schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 120),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  logo_url    text,
  -- School-supplied accent colour (branding). Must never override status colours
  -- in the UI; enforced in the design system, documented in docs/architecture.md.
  accent_color text check (accent_color is null or accent_color ~* '^#[0-9a-f]{6}$'),
  status      school_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
comment on table schools is 'Each school is a separate tenant. status disabled = platform suspended.';

-- --------------------------------------------------------- school_domains ---
create table school_domains (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools (id) on delete cascade,
  domain     text not null check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  verified   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (domain)
);
comment on table school_domains is 'Approved email domains per school. A domain maps to exactly one school.';

-- --------------------------------------------------------- school_settings --
create table school_settings (
  school_id             uuid primary key references schools (id) on delete cascade,
  enabled_verification_methods verification_method[] not null default array['email_otp','manual']::verification_method[],
  event_approval_policy  event_approval_policy not null default 'immediate',
  approval_categories    text[] not null default '{}',
  enabled_post_types     listing_post_type[] not null default array['give','swap','looking_for','borrow','lend']::listing_post_type[],
  enabled_categories     text[] not null default '{}',
  borrowing_enabled      boolean not null default true,
  grad_year_visible      boolean not null default true,
  participant_names_visible boolean not null default false,
  community_guidelines   text,
  notification_settings  jsonb not null default '{}'::jsonb,
  updated_at             timestamptz not null default now()
);
comment on table school_settings is 'Per-school configuration. One row per school.';

-- ------------------------------------------------- safe_handoff_locations ---
create table safe_handoff_locations (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 120),
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table safe_handoff_locations is 'Recommended public handoff spots. Never private home addresses.';

-- ------------------------------------------------------------------ users ---
-- Public-safe profile. Deliberately contains NO email or phone number.
-- The verified email lives only in private.user_emails (see 0004).
create table users (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  avatar_url  text,
  grad_year   int check (grad_year is null or grad_year between 1950 and 2100),
  account_status account_status not null default 'active',
  deletion_requested_at timestamptz,
  anonymized_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table users is 'Public-safe profile keyed to auth.users. Contains no email or phone.';

-- ------------------------------------------------------- user_preferences ---
-- active_school_id is a NAVIGATION convenience only. It never grants access;
-- every request independently verifies membership (see docs/rls.md).
create table user_preferences (
  user_id          uuid primary key references users (id) on delete cascade,
  active_school_id uuid references schools (id) on delete set null,
  notification_preferences jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);
comment on column user_preferences.active_school_id is
  'Client navigation hint only. Authorization NEVER depends on this value.';

create index school_domains_school_idx on school_domains (school_id);
create index safe_handoff_locations_school_idx on safe_handoff_locations (school_id, active);

create trigger schools_set_updated_at before update on schools
  for each row execute function app.set_updated_at();
create trigger users_set_updated_at before update on users
  for each row execute function app.set_updated_at();
create trigger school_settings_set_updated_at before update on school_settings
  for each row execute function app.set_updated_at();
create trigger user_preferences_set_updated_at before update on user_preferences
  for each row execute function app.set_updated_at();

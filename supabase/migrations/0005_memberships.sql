-- 0005_memberships.sql
-- Membership, roles, requests, and roster.

-- ----------------------------------------------------- school_memberships ---
create table school_memberships (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  status      membership_status not null default 'pending',
  verification_method verification_method,
  verified_at timestamptz,
  suspended_at timestamptz,
  left_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (school_id, user_id)
);
comment on table school_memberships is
  'A user''s standing in a school. Only status=verified unlocks tenant content (enforced by RLS).';
create index school_memberships_user_idx on school_memberships (user_id, status);
create index school_memberships_school_idx on school_memberships (school_id, status);

-- ----------------------------------------------------------- school_admins --
-- Correction #5: predefined, testable roles rather than arbitrary JSON.
create table school_admins (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools (id) on delete cascade,
  user_id    uuid not null references users (id) on delete cascade,
  role       school_role not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references users (id),
  unique (school_id, user_id)
);
comment on table school_admins is 'Per-school administrators with a single predefined role each.';
create index school_admins_user_idx on school_admins (user_id, active);
create index school_admins_school_idx on school_admins (school_id, active);

-- ------------------------------------------------------ membership_requests -
-- Single funnel for every verification method (Method F manual + pending states
-- of other methods route through here for admin review).
create table membership_requests (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  user_id       uuid not null references users (id) on delete cascade,
  method        verification_method not null,
  submitted_data jsonb not null default '{}'::jsonb,
  status        membership_request_status not null default 'pending',
  reviewed_by   uuid references users (id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index membership_requests_school_idx on membership_requests (school_id, status);
create index membership_requests_user_idx on membership_requests (user_id);

-- ------------------------------------------------- student_roster_entries ---
-- Method D. Stores normalized email + hash for matching. Never exposed publicly.
create table student_roster_entries (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools (id) on delete cascade,
  email_normalized text not null,
  email_hash     text not null,
  matched_user_id uuid references users (id) on delete set null,
  imported_by    uuid references users (id),
  imported_at    timestamptz not null default now(),
  unique (school_id, email_normalized)
);
comment on table student_roster_entries is 'Approved roster emails per school. Read-restricted to school reviewers.';
create index student_roster_entries_hash_idx on student_roster_entries (school_id, email_hash);

create trigger school_memberships_set_updated_at before update on school_memberships
  for each row execute function app.set_updated_at();

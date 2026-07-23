-- 0013_notifications_platform.sql
-- Notifications, device tokens, and feature flags.

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  school_id  uuid references schools (id) on delete cascade,
  type       notification_type not null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;

create table device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  token      text not null,
  platform   device_platform not null,
  invalid    boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (token)
);
comment on table device_tokens is 'Push tokens. Invalid tokens are flagged and pruned by retention jobs.';
create index device_tokens_user_idx on device_tokens (user_id) where invalid = false;

create table feature_flags (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique,
  description       text,
  enabled_globally  boolean not null default false,
  enabled_school_ids uuid[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table feature_flags is 'Platform-managed flags. Per-school rollout via enabled_school_ids.';

create trigger feature_flags_set_updated_at before update on feature_flags
  for each row execute function app.set_updated_at();

-- 0011_community_events.sql
-- Events and reusable community posts.
-- Correction #3: timezone-safe timestamps (starts_at/ends_at as timestamptz + a
--   stored IANA timezone). Store UTC, display in the event/school timezone.
-- Correction #7: non-event community posts live in community_posts, not events.

create table events (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  organizer_id  uuid not null references users (id) on delete cascade,
  title         text not null check (length(btrim(title)) between 1 and 120),
  description   text not null check (length(description) between 1 and 10000),
  category      text,
  cover_image_url text,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  timezone      text not null default 'UTC',
  location      text,
  max_participants int check (max_participants is null or max_participants > 0),
  registration_deadline timestamptz,
  status        event_status not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  check (ends_at is null or ends_at > starts_at)
);
comment on table events is 'Structured events. UTC timestamps + IANA timezone; supports midnight-spanning and DST.';
create index events_school_status_idx on events (school_id, status) where deleted_at is null;
create index events_starts_at_idx on events (school_id, starts_at);

create table event_participants (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events (id) on delete cascade,
  user_id    uuid not null references users (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  unique (event_id, user_id)
);
comment on table event_participants is 'A row exists only while joined; leaving deletes it. Capacity enforced in app.join_event.';
create index event_participants_event_idx on event_participants (event_id);
create index event_participants_user_idx on event_participants (user_id);

create table event_updates (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events (id) on delete cascade,
  author_id  uuid not null references users (id) on delete cascade,
  body       text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index event_updates_event_idx on event_updates (event_id, created_at desc);

create table community_posts (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  author_id   uuid not null references users (id) on delete cascade,
  type        community_post_type not null,
  title       text not null check (length(btrim(title)) between 1 and 120),
  description text not null check (length(description) between 1 and 10000),
  image_url   text,
  -- Optional link to a scheduled meeting.
  event_id    uuid references events (id) on delete set null,
  status      community_post_status not null default 'published',
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
comment on table community_posts is 'Volunteer/club/project/study-group/etc. posts. May reference an event.';
create index community_posts_school_status_idx on community_posts (school_id, status) where deleted_at is null;
create index community_posts_type_idx on community_posts (school_id, type);

create table announcements (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools (id) on delete cascade,
  author_id  uuid not null references users (id) on delete cascade,
  title      text not null check (length(btrim(title)) between 1 and 120),
  body       text not null check (length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index announcements_school_idx on announcements (school_id, created_at desc);

create trigger events_set_updated_at before update on events
  for each row execute function app.set_updated_at();
create trigger community_posts_set_updated_at before update on community_posts
  for each row execute function app.set_updated_at();

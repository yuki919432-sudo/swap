-- 0010_messaging.sql
-- School-scoped conversations and messages.
-- Correction #2: read state lives on conversation_members.last_read_at, not as
-- per-user JSON on every message. Unread counts derive from last_read_at.

create table conversations (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references schools (id) on delete cascade,
  context_type conversation_context not null default 'direct',
  context_id   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index conversations_school_idx on conversations (school_id);
create index conversations_context_idx on conversations (context_type, context_id);

create table conversation_members (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id         uuid not null references users (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz not null default now(),
  unique (conversation_id, user_id)
);
create index conversation_members_user_idx on conversation_members (user_id);
comment on column conversation_members.last_read_at is
  'Drives unread counts. A dedicated message_receipts table can be added later if per-message receipts are required.';

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  school_id       uuid not null references schools (id) on delete cascade, -- denormalized for fast RLS
  sender_id       uuid not null references users (id) on delete cascade,
  body            text not null check (length(body) between 1 and 2000),
  storage_path    text, -- optional image attachment (Phase 2+)
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on messages (conversation_id, created_at desc);

create trigger conversations_set_updated_at before update on conversations
  for each row execute function app.set_updated_at();

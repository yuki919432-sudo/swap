-- 0012_trust_safety.sql
-- Reports, blocks, moderation actions, and the append-only audit log.

create table reports (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  reporter_id   uuid not null references users (id) on delete cascade,
  target_type   report_target_type not null,
  target_id     uuid not null,
  reason        report_reason not null,
  explanation   text check (explanation is null or length(explanation) <= 2000),
  evidence_url  text,
  status        report_status not null default 'open',
  assigned_moderator_id uuid references users (id) on delete set null,
  resolution    text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
comment on table reports is 'User reports. Preserved for safety investigations (never hard-deleted by clients).';
create index reports_school_status_idx on reports (school_id, status);
create index reports_target_idx on reports (target_type, target_id);

create table blocks (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references schools (id) on delete cascade,
  blocker_id uuid not null references users (id) on delete cascade,
  blocked_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
comment on table blocks is 'Directed blocks. Enforced for new messages/offers by app logic; evidence stays visible to moderators.';
create index blocks_blocker_idx on blocks (blocker_id);
create index blocks_blocked_idx on blocks (blocked_id);

create table moderation_actions (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid references schools (id) on delete set null,
  actor_id    uuid not null references users (id) on delete set null,
  action      moderation_action_type not null,
  target_type report_target_type not null,
  target_id   uuid not null,
  report_id   uuid references reports (id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now()
);
comment on table moderation_actions is 'Every moderation decision. Preserved for accountability.';
create index moderation_actions_school_idx on moderation_actions (school_id, created_at desc);

-- Append-only audit log. Correction: platform-admin sensitive reads + all
-- mutations write here. Immutability (no UPDATE/DELETE) enforced in 0019.
--
-- actor_id/school_id are deliberately FK-free plain UUIDs: audit rows must
-- OUTLIVE the rows they reference and must never be mutated by ON DELETE
-- cascades (which would fight the append-only trigger). Referential meaning is
-- preserved at write time; integrity is not enforced by FK on purpose.
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  actor_role  text,                       -- 'student' | 'school_admin' | 'platform' | 'system'
  school_id   uuid,
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
comment on table audit_logs is 'Append-only. Application users cannot UPDATE or DELETE rows (see 0019).';
create index audit_logs_school_idx on audit_logs (school_id, created_at desc);
create index audit_logs_actor_idx on audit_logs (actor_id, created_at desc);

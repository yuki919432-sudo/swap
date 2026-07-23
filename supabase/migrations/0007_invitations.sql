-- 0007_invitations.sql
-- Correction #6: invitation codes are never stored in plaintext.
--   * code_prefix : short, NON-secret display identifier (shown in admin UI).
--   * code_hash   : sha256 of the full high-entropy code (deterministic, enables
--                   O(1) lookup + atomic single-use consumption).
-- The full code is shown to the admin exactly once at creation and never stored.

create table invitations (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references schools (id) on delete cascade,
  code_prefix      text not null,
  code_hash        text not null unique,
  type             invitation_type not null default 'single_use',
  max_uses         int not null default 1 check (max_uses >= 1),
  uses_count       int not null default 0 check (uses_count >= 0),
  requires_approval boolean not null default false,
  revoked          boolean not null default false,
  expires_at       timestamptz,
  created_by       uuid references users (id),
  created_at       timestamptz not null default now(),
  constraint invitation_uses_within_limit check (uses_count <= max_uses),
  constraint single_use_max_one check (type <> 'single_use' or max_uses = 1)
);
comment on table invitations is
  'School invite codes. Only a hash + non-secret prefix are stored. Consumed atomically in app.redeem_invitation.';
create index invitations_school_idx on invitations (school_id);

create table invite_code_uses (
  id            uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references invitations (id) on delete cascade,
  user_id       uuid not null references users (id) on delete cascade,
  used_at       timestamptz not null default now(),
  unique (invitation_id, user_id)
);
comment on table invite_code_uses is 'Audit trail of who consumed which invitation. One row per (invitation, user).';
create index invite_code_uses_user_idx on invite_code_uses (user_id);

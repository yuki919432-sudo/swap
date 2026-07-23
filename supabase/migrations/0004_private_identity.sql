-- 0004_private_identity.sql
-- Sensitive identity data isolated in the `private` schema.
--
-- Correction #9: public profiles must never expose email. Authorized membership
-- administrators still need operational access to a member's school email. We
-- achieve this by:
--   * storing email ONLY in private.user_emails (no client grants), and
--   * exposing a role-restricted, audit-logged SECURITY DEFINER accessor
--     (app.get_member_email, defined in 0018) for admins.
-- Regular students have no path to read another student's email.

create table private.user_emails (
  user_id          uuid primary key references users (id) on delete cascade,
  email            text not null,
  email_normalized text not null,
  -- Deterministic hash enables roster matching without exposing plaintext.
  email_hash       text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index user_emails_hash_idx on private.user_emails (email_hash);
comment on table private.user_emails is
  'Verified email per user. Never granted to clients; admin access via SECURITY DEFINER only.';

-- OTP codes for Verification Method C. Codes are hashed, expiring, rate-limited.
create table private.otp_codes (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  email_normalized text not null,
  code_hash     text not null,
  attempts      int not null default 0,
  max_attempts  int not null default 5,
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index otp_codes_lookup_idx on private.otp_codes (school_id, email_normalized, created_at desc);
comment on table private.otp_codes is 'Hashed, expiring OTPs. Retention: purged after expiry + short window (see docs).';

-- Transactional email delivery + bounce/complaint events (Postmark webhooks).
create table private.email_events (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid references schools (id) on delete set null,
  email_normalized text not null,
  message_type text not null,          -- 'otp', 'announcement', ...
  provider     text not null default 'postmark',
  provider_message_id text,
  event        text not null,          -- 'sent','delivered','bounce','complaint','failed'
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index email_events_lookup_idx on private.email_events (email_normalized, created_at desc);
comment on table private.email_events is 'Delivery/bounce/complaint log for deliverability monitoring.';

create trigger user_emails_set_updated_at before update on private.user_emails
  for each row execute function app.set_updated_at();

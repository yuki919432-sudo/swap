-- 0026_email_otp.sql
-- Phase 1B.3: Email OTP (Verification Method C) challenge model + flows.
--
-- Security model:
--   * Plaintext OTPs are NEVER stored. Only sha256(salt || code) + the salt are
--     kept, in the `private` schema (no client grants).
--   * A challenge is bound to (user, school, normalized email, purpose). At most
--     one ACTIVE challenge per key (partial unique index); issuing a new one
--     atomically supersedes the previous one.
--   * The request path (which sends email) runs in an Edge Function using the
--     service role; it calls public.request_otp_challenge (service-role only) for the
--     transactional DB enforcement (rate limits + supersede + insert). The verify
--     path is a client RPC (public.verify_email_otp) that consumes the challenge
--     atomically and applies the approved membership-state transitions.

-- ------------------------------------------------------- otp_challenges ------
create table private.otp_challenges (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  school_id        uuid not null references public.schools (id) on delete cascade,
  purpose          text not null default 'school_membership_verification',
  email_normalized text not null,            -- restricted (private schema); needed to resend/send
  email_hash       text not null,            -- sha256(normalized email) for safe lookup
  code_hash        text not null,            -- sha256(salt || code); never plaintext
  code_salt        text not null,            -- per-challenge salt
  attempts         int not null default 0,
  max_attempts     int not null default 5,
  resend_count     int not null default 0,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  consumed_at      timestamptz,
  superseded_at    timestamptz,
  locked_until     timestamptz,
  provider_message_id text,
  metadata         jsonb not null default '{}'::jsonb
);
comment on table private.otp_challenges is
  'Hashed, expiring email-OTP challenges. Plaintext OTP is never stored. No client grants.';

-- At most one ACTIVE challenge per (user, school, email, purpose).
create unique index otp_one_active_per_key
  on private.otp_challenges (user_id, school_id, email_hash, purpose)
  where consumed_at is null and superseded_at is null;

create index otp_challenges_lookup on private.otp_challenges (user_id, school_id, purpose, created_at desc);
create index otp_challenges_email_day on private.otp_challenges (email_hash, created_at desc);
create index otp_challenges_expiry on private.otp_challenges (expires_at) where consumed_at is null;

-- ------------------------------------------ email_events webhook idempotency -
alter table private.email_events add column if not exists signature_verified boolean not null default false;
-- One row per (provider, provider_message_id, event) -> webhook replay is a no-op.
create unique index if not exists email_events_idem
  on private.email_events (provider, provider_message_id, event)
  where provider_message_id is not null;

-- ------------------------------------------------- public.request_otp_challenge --
-- SERVICE-ROLE ONLY (called by the otp-request Edge Function after it has
-- generated the code and computed code_hash + salt). Enforces school active +
-- email_otp enabled + rate limits, atomically supersedes the prior active
-- challenge, and inserts the new one. Returns the new challenge id.
create or replace function public.request_otp_challenge(
  p_user uuid,
  p_school uuid,
  p_email_normalized text,
  p_purpose text,
  p_code_hash text,
  p_code_salt text,
  p_ttl interval default interval '10 minutes',
  p_resend_cooldown interval default interval '60 seconds',
  p_daily_cap_email int default 10,
  p_daily_cap_user int default 20
)
returns uuid
language plpgsql security definer
set search_path = app, public, private, auth, pg_catalog
as $$
declare
  v_hash text := app.hash_email(p_email_normalized);
  v_now timestamptz := now();
  v_recent timestamptz;
  v_cnt int;
  v_resend int := 0;
  v_id uuid;
begin
  if not exists (select 1 from public.schools where id = p_school and status = 'active') then
    raise exception 'not_found:school' using errcode = 'P0001';
  end if;
  if not coalesce((select 'email_otp' = any (enabled_verification_methods)
                   from public.school_settings where school_id = p_school), false) then
    raise exception 'method_not_enabled' using errcode = 'P0001';
  end if;

  -- Resend cooldown (per key).
  select max(created_at) into v_recent from private.otp_challenges
   where user_id = p_user and school_id = p_school and email_hash = v_hash and purpose = p_purpose;
  if v_recent is not null and v_recent > v_now - p_resend_cooldown then
    raise exception 'otp_cooldown' using errcode = 'P0001';
  end if;

  -- Daily caps (per email, per user) — transactional counts.
  select count(*) into v_cnt from private.otp_challenges
   where email_hash = v_hash and created_at > v_now - interval '1 day';
  if v_cnt >= p_daily_cap_email then raise exception 'otp_daily_limit' using errcode = 'P0001'; end if;
  select count(*) into v_cnt from private.otp_challenges
   where user_id = p_user and created_at > v_now - interval '1 day';
  if v_cnt >= p_daily_cap_user then raise exception 'otp_daily_limit' using errcode = 'P0001'; end if;

  -- Carry the resend counter forward from the (about-to-be-superseded) challenge.
  select coalesce(resend_count, 0) + 1 into v_resend from private.otp_challenges
   where user_id = p_user and school_id = p_school and email_hash = v_hash and purpose = p_purpose
     and consumed_at is null and superseded_at is null;

  -- Atomically supersede the previous active challenge, then insert the new one.
  update private.otp_challenges set superseded_at = v_now
   where user_id = p_user and school_id = p_school and email_hash = v_hash and purpose = p_purpose
     and consumed_at is null and superseded_at is null;

  insert into private.otp_challenges
    (user_id, school_id, purpose, email_normalized, email_hash, code_hash, code_salt, expires_at, resend_count)
  values (p_user, p_school, p_purpose, p_email_normalized, v_hash, p_code_hash, p_code_salt,
          v_now + p_ttl, coalesce(v_resend, 0))
  returning id into v_id;

  perform app.write_audit('system', p_school, 'otp_challenge_created', 'otp', v_id,
                          jsonb_build_object('purpose', p_purpose));
  return v_id;
end;
$$;
revoke execute on function public.request_otp_challenge(uuid, uuid, text, text, text, text, interval, interval, int, int) from public;
grant execute on function public.request_otp_challenge(uuid, uuid, text, text, text, text, interval, interval, int, int) to service_role;

-- ---------------------------------------------------- public.verify_email_otp
-- Client RPC: the caller submits the 6-digit code. Verifies + consumes the
-- challenge atomically and applies the approved membership transition.
--
-- Returns a RESULT OBJECT { ok, error?, membership? } rather than raising for
-- verification failures, so the persistent side effect (attempts++/lockout) is
-- NOT rolled back with an exception. Auth preconditions still raise (42501). The
-- @swap/server wrapper maps { ok:false, error } to a typed AppError.
create or replace function public.verify_email_otp(
  p_school uuid,
  p_code text,
  p_purpose text default 'school_membership_verification'
)
returns jsonb
language plpgsql security definer
set search_path = app, public, private, auth, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_hash text;
  v_ch private.otp_challenges;
  v_existing membership_status;
  v_m public.school_memberships;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'otp_invalid');
  end if;

  -- The email is read from the caller's own verified session (never client input).
  select email, email_confirmed_at into v_email, v_confirmed from auth.users where id = v_uid;
  if v_email is null or v_confirmed is null then
    raise exception 'email_not_verified' using errcode = '42501';
  end if;
  v_hash := app.hash_email(v_email);

  -- Find + lock the active challenge bound to THIS user + school + email + purpose.
  select * into v_ch from private.otp_challenges
   where user_id = v_uid and school_id = p_school and email_hash = v_hash and purpose = p_purpose
     and consumed_at is null and superseded_at is null
   order by created_at desc limit 1
   for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'otp_invalid'); end if;
  if v_ch.locked_until is not null and v_ch.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'otp_locked');
  end if;
  if v_ch.expires_at <= now() then return jsonb_build_object('ok', false, 'error', 'otp_expired'); end if;
  if v_ch.attempts >= v_ch.max_attempts then return jsonb_build_object('ok', false, 'error', 'otp_locked'); end if;

  -- Hash comparison (no plaintext stored/logged). A wrong code increments the
  -- attempt counter and (at the limit) locks the challenge — the update PERSISTS
  -- because we RETURN rather than raise.
  if encode(sha256(convert_to(v_ch.code_salt || p_code, 'UTF8')), 'hex') <> v_ch.code_hash then
    update private.otp_challenges
       set attempts = attempts + 1,
           locked_until = case when attempts + 1 >= max_attempts then now() + interval '15 minutes' else locked_until end
     where id = v_ch.id;
    return jsonb_build_object('ok', false, 'error', 'otp_invalid');
  end if;

  -- Correct code. Guard membership state BEFORE consuming (no partial membership).
  select status into v_existing from public.school_memberships
   where school_id = p_school and user_id = v_uid for update;
  if v_existing = 'suspended' then return jsonb_build_object('ok', false, 'error', 'membership_suspended'); end if;
  if v_existing = 'rejected' then return jsonb_build_object('ok', false, 'error', 'membership_rejected'); end if;

  -- Consume atomically (replay-safe: the row no longer matches the active filter).
  update private.otp_challenges set consumed_at = now() where id = v_ch.id;

  if v_existing = 'verified' then
    select * into v_m from public.school_memberships where school_id = p_school and user_id = v_uid;
  else
    insert into public.school_memberships (school_id, user_id, status, verification_method, verified_at)
    values (p_school, v_uid, 'verified', 'email_otp', now())
    on conflict (school_id, user_id) do update
       set status = 'verified', verification_method = 'email_otp',
           verified_at = coalesce(public.school_memberships.verified_at, now())
     where public.school_memberships.status in ('pending', 'left', 'expired')
    returning * into v_m;
  end if;

  perform app.write_audit('student', p_school, 'email_otp_verified', 'membership', v_m.id, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'membership', to_jsonb(v_m));
end;
$$;
revoke execute on function public.verify_email_otp(uuid, text, text) from public;
grant execute on function public.verify_email_otp(uuid, text, text) to authenticated;

-- ------------------------------------------------------------- retention -----
-- Purge consumed/expired/superseded challenges after a short grace window.
create or replace function app.purge_expired_otp(p_grace interval default interval '1 day')
returns void
language plpgsql security definer
set search_path = app, private, pg_catalog
as $$
begin
  delete from private.otp_challenges
   where (consumed_at is not null and consumed_at < now() - p_grace)
      or (superseded_at is not null and superseded_at < now() - p_grace)
      or (expires_at < now() - p_grace);
end;
$$;
revoke execute on function app.purge_expired_otp(interval) from public;
grant execute on function app.purge_expired_otp(interval) to service_role;

-- Retire the Phase-1A placeholder OTP table: private.otp_challenges (above) is the
-- canonical, wired-up OTP store. The placeholder was never referenced by any
-- function. Fold OTP purging in the existing ephemeral sweep into the new
-- challenge-aware purge so there is a single retention path.
drop table if exists private.otp_codes;

create or replace function app.purge_expired_ephemeral(
  p_otp_grace interval default interval '1 day',
  p_email_log_ttl interval default interval '180 days',
  p_draft_ttl interval default interval '90 days'
)
returns void
language plpgsql security definer
set search_path = app, public, private, auth, pg_catalog
as $$
begin
  perform app.purge_expired_otp(p_otp_grace);
  delete from private.email_events where created_at < now() - p_email_log_ttl;
  delete from device_tokens where invalid = true;

  -- Abandoned drafts (never published) are removed after the draft TTL.
  delete from listings where status = 'draft' and updated_at < now() - p_draft_ttl;
  delete from community_posts where status = 'draft' and updated_at < now() - p_draft_ttl;
  delete from events where status = 'draft' and updated_at < now() - p_draft_ttl;
end;
$$;
revoke execute on function app.purge_expired_ephemeral(interval, interval, interval) from public;
grant execute on function app.purge_expired_ephemeral(interval, interval, interval) to service_role;

-- ------------------------------------------------------------ mask_email -----
create or replace function app.mask_email(p text)
returns text language sql immutable
set search_path = pg_catalog
as $$
  select case when p is null or position('@' in p) = 0 then '***'
    else left(split_part(p, '@', 1), 1)
         || repeat('*', greatest(1, length(split_part(p, '@', 1)) - 1))
         || '@' || split_part(p, '@', 2) end;
$$;
revoke execute on function app.mask_email(text) from public;

-- ------------------------------------------------------ record_email_event ---
-- SERVICE-ROLE ONLY: called by the email-webhook Edge Function AFTER it has
-- verified the provider signature. Idempotent (unique index on
-- provider/provider_message_id/event) so a replayed webhook is a no-op.
create or replace function public.record_email_event(
  p_provider text,
  p_provider_message_id text,
  p_event text,
  p_email_normalized text,
  p_school uuid default null,
  p_detail jsonb default '{}'::jsonb,
  p_signature_verified boolean default false
)
returns boolean
language plpgsql security definer
set search_path = app, public, private, auth, pg_catalog
as $$
declare v_inserted boolean := false;
begin
  insert into private.email_events
    (school_id, email_normalized, message_type, provider, provider_message_id, event, detail, signature_verified)
  values (p_school, p_email_normalized, 'otp', p_provider, p_provider_message_id, p_event, coalesce(p_detail, '{}'::jsonb), p_signature_verified)
  on conflict (provider, provider_message_id, event) where provider_message_id is not null do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
revoke execute on function public.record_email_event(text, text, text, text, uuid, jsonb, boolean) from public;
grant execute on function public.record_email_event(text, text, text, text, uuid, jsonb, boolean) to service_role;

-- ------------------------------------------- public.get_email_delivery_status
-- Role-gated, MASKED delivery status for school administrators. Never returns
-- provider secrets, raw payloads, or full email addresses.
create or replace function public.get_email_delivery_status(p_school uuid, p_limit int default 50)
returns jsonb
language plpgsql security definer
set search_path = app, public, private, auth, pg_catalog
as $$
begin
  if not (app.has_school_role(p_school, 'school_owner', 'school_admin', 'membership_reviewer')
          or app.is_platform_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'email', app.mask_email(email_normalized),
             'event', event,
             'created_at', created_at)
             order by created_at desc)
    from (
      select email_normalized, event, created_at
      from private.email_events
      where school_id = p_school
      order by created_at desc
      limit greatest(1, least(p_limit, 200))
    ) e), '[]'::jsonb);
end;
$$;
revoke execute on function public.get_email_delivery_status(uuid, int) from public;
grant execute on function public.get_email_delivery_status(uuid, int) to authenticated;

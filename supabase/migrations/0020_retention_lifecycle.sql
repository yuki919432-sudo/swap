-- 0020_retention_lifecycle.sql
-- Correction #10: explicit account-deletion states, anonymization, and retention.
-- Content/transaction/report/moderation/audit history is preserved; only
-- ephemeral and user-facing personal data is expired or scrubbed.
--
-- Maintenance functions are intended to run under service_role (via pg_cron in
-- production). They are NOT granted to authenticated.

-- A user requests deletion of their own account (soft, reversible until purged).
create or replace function app.request_account_deletion()
returns users
language plpgsql security definer
set search_path = app, public, auth, pg_catalog
as $$
declare v_uid uuid := auth.uid(); v_user users;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  update users
     set account_status = 'deletion_requested', deletion_requested_at = now()
   where id = v_uid
  returning * into v_user;
  perform app.write_audit('student', null, 'account_deletion_requested', 'user', v_uid, '{}'::jsonb);
  return v_user;
end;
$$;
grant execute on function app.request_account_deletion() to authenticated;

-- Anonymize a user: scrub the public profile and detach user-facing content,
-- while preserving transaction / report / moderation / audit history.
create or replace function app.anonymize_user(p_user uuid)
returns void
language plpgsql security definer
set search_path = app, public, private, auth, pg_catalog
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update users
     set display_name = 'Former member',
         avatar_url = null,
         grad_year = null,
         account_status = 'anonymized',
         anonymized_at = now()
   where id = p_user;

  -- Remove the private email record; roster/audit rows are retained.
  delete from private.user_emails where user_id = p_user;

  -- Withdraw the user's still-open marketplace/community content from view.
  update listings set status = 'removed'
   where owner_id = p_user and status in ('draft', 'active', 'reserved');
  update community_posts set status = 'removed'
   where author_id = p_user and status in ('draft', 'pending_approval', 'published');

  -- Membership standing becomes 'left' everywhere.
  update school_memberships set status = 'left', left_at = now()
   where user_id = p_user and status <> 'left';

  perform app.write_audit('platform', null, 'user_anonymized', 'user', p_user, '{}'::jsonb);
end;
$$;
grant execute on function app.anonymize_user(uuid) to service_role;

-- Expire stale content. Safe to run frequently; each statement is idempotent.
create or replace function app.expire_stale_content(
  p_offer_ttl interval default interval '30 days',
  p_request_ttl interval default interval '60 days'
)
returns void
language plpgsql security definer
set search_path = app, public, auth, pg_catalog
as $$
begin
  -- Listings past their expiry.
  update listings set status = 'expired'
   where status = 'active' and expires_at is not null and expires_at < now() and deleted_at is null;

  -- Past events transition to completed.
  update events set status = 'completed'
   where status in ('published', 'full')
     and coalesce(ends_at, starts_at) < now()
     and deleted_at is null;

  -- Unanswered offers expire.
  update offers set status = 'expired'
   where status = 'sent' and created_at < now() - p_offer_ttl;

  -- Unanswered membership requests expire (row preserved with rejected+meta).
  update membership_requests set status = 'rejected', reviewed_at = now()
   where status = 'pending' and created_at < now() - p_request_ttl;
end;
$$;
grant execute on function app.expire_stale_content(interval, interval) to service_role;

-- Purge ephemeral data past its retention window.
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
  delete from private.otp_codes where expires_at < now() - p_otp_grace;
  delete from private.email_events where created_at < now() - p_email_log_ttl;
  delete from device_tokens where invalid = true;

  -- Abandoned drafts (never published) are removed after the draft TTL.
  delete from listings where status = 'draft' and updated_at < now() - p_draft_ttl;
  delete from community_posts where status = 'draft' and updated_at < now() - p_draft_ttl;
  delete from events where status = 'draft' and updated_at < now() - p_draft_ttl;
end;
$$;
grant execute on function app.purge_expired_ephemeral(interval, interval, interval) to service_role;

-- 02_promote_owner.sql — make an already-signed-up account the school owner.
-- The person must have created their SWAP! account FIRST (so an auth.users row +
-- private.user_emails row exist). Idempotent.
--   psql "$PROD_DATABASE_URL" -v school_id='...' -v owner_email='...' -f 02_promote_owner.sql
\set ON_ERROR_STOP on

\if :{?school_id}
\else
  \echo 'ERROR: pass -v school_id=''...'''
  \quit
\endif
\if :{?owner_email}
\else
  \echo 'ERROR: pass -v owner_email=''...'' (the email the owner signed up with)'
  \quit
\endif

-- Resolve the account by its normalized email (emails are stored hashed/normalized
-- in the private schema; we never keep plaintext in the public tables). Check
-- existence first so a missing account fails with a clear message, not a raw error.
select (exists (
  select 1 from private.user_emails ue
  where ue.email_normalized = app.normalize_email(:'owner_email')
))::text as owner_found \gset

\if :owner_found
\else
  \echo 'ERROR: no account found for that email. Have them sign up in the app first.'
  \quit
\endif

select ue.user_id from private.user_emails ue
where ue.email_normalized = app.normalize_email(:'owner_email') \gset owner_

-- Verified membership + owner role (both idempotent).
insert into school_memberships (school_id, user_id, status, verification_method, verified_at)
values (:'school_id', :'owner_user_id', 'verified', 'manual', now())
on conflict (school_id, user_id) do update set status = 'verified', verified_at = now();

insert into school_admins (school_id, user_id, role, active)
values (:'school_id', :'owner_user_id', 'school_owner', true)
on conflict (school_id, user_id) do update set role = 'school_owner', active = true;

\echo 'Owner promoted. They can now access the moderation queue for this school.'

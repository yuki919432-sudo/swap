-- 01_helpers.sql  (LOCAL / TEST ONLY)
-- pgTAP session helpers. Role switching uses set_config('role', ..., is_local)
-- which reliably persists to the end of the test transaction (the proven
-- Supabase test pattern), unlike a bare `SET LOCAL ROLE` inside a function.

create schema if not exists tests;

-- Authenticate as a user. p_aal simulates the JWT assurance level: 'aal1'
-- (password/single-factor) or 'aal2' (MFA satisfied).
create or replace function tests.authenticate_as(p_user uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated', 'aal', p_aal)::text,
    true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.become_service_role()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end;
$$;

create or replace function tests.become_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Return to the superuser test-runner role and clear the simulated session.
create or replace function tests.reset_auth()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', session_user, true);
end;
$$;

-- The switched-into roles must be able to call these helpers again mid-test
-- (e.g. to re-authenticate as a different user), so grant them access.
grant usage on schema tests to authenticated, anon, service_role;
grant execute on all functions in schema tests to authenticated, anon, service_role;

-- Convenience: create a synthetic auth user + public profile in one call.
create or replace function tests.make_user(p_display text, p_email text default null)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_id, p_email);
  insert into public.users (id, display_name) values (v_id, p_display);
  if p_email is not null then
    insert into private.user_emails (user_id, email, email_normalized, email_hash)
    values (v_id, p_email, app.normalize_email(p_email), app.hash_email(p_email));
  end if;
  return v_id;
end;
$$;

-- 00_bootstrap.sql  (LOCAL / TEST ONLY — never applied on Supabase)
--
-- Recreates the pieces of the Supabase platform that our migrations assume to
-- already exist: the anon/authenticated/service_role roles and a minimal `auth`
-- schema (auth.users + auth.uid()/auth.jwt()/auth.role()/auth.email()).
--
-- On real Supabase these are provided by the platform, so this file lives under
-- supabase/tests/setup and is applied ONLY by scripts/db-*.sh, not by db push.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  email_confirmed_at timestamptz,
  created_at         timestamptz not null default now()
);

-- Read the current request's JWT claims (set by tests via set_config).
create or replace function auth.jwt()
returns jsonb language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$;

create or replace function auth.uid()
returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

create or replace function auth.role()
returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
$$;

create or replace function auth.email()
returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
$$;

grant usage on schema auth to anon, authenticated, service_role;
-- auth.uid()/jwt()/role() must be callable inside RLS policy expressions.
grant execute on all functions in schema auth to anon, authenticated, service_role;
-- Only trusted server code reads raw auth.users (never the authenticated role).
grant select on auth.users to service_role;

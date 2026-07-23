-- 0001_extensions_schemas.sql
-- Foundational schemas and extensions.
--
-- Notes on portability:
--   * gen_random_uuid() and sha256() are Postgres core (>= 13 / >= 11); no
--     pgcrypto dependency is required.
--   * On Supabase, extensions live in the `extensions` schema which is already
--     on the search_path. Locally they install into `public`. Either is fine
--     because we reference pg_trgm only through index operator classes.

create extension if not exists pg_trgm;

-- `app`     : internal helper functions used by RLS. NOT exposed via PostgREST.
-- `private` : sensitive tables (emails, OTP codes, invite secrets, email logs).
--             No privileges are granted to anon/authenticated; reachable only
--             through SECURITY DEFINER functions with explicit authorization.
create schema if not exists app;
create schema if not exists private;

comment on schema app is 'Internal authorization/helper functions. Not exposed to PostgREST.';
comment on schema private is 'Sensitive data (emails, OTP, invite secrets). No client grants.';

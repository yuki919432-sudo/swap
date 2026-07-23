-- 0015_grants.sql
-- Role privileges. RLS (0016) does the row-level gating; these grants set the
-- coarse table-level capability. Policies are written `to authenticated`, so the
-- anon role is given schema usage but no table privileges.
--
-- Roles anon/authenticated/service_role are provided by Supabase in production
-- and by the local bootstrap (supabase/tests/setup) for local/test runs.

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema app to authenticated, service_role;

-- Authorization helpers are invoked inside RLS policy expressions, so the
-- invoking role needs EXECUTE (the bodies still run as the definer).
grant execute on all functions in schema app to authenticated, service_role;

-- Broad DML for authenticated; RLS narrows it to the right rows.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Client-read-only reference/derived tables.
revoke insert, update, delete on prohibited_categories from authenticated;
revoke insert, update, delete on feature_flags from authenticated;
revoke insert, update, delete on looking_for_matches from authenticated;

-- Append-only audit log: clients may (via RLS) read, but never write directly.
-- All audit writes go through SECURITY DEFINER functions. Immutability is
-- further enforced by trigger in 0019.
revoke insert, update, delete on audit_logs from authenticated;

-- service_role is used only by trusted server code (Edge Functions). It also has
-- BYPASSRLS, but still needs table privileges.
grant all on all tables in schema public to service_role;

-- The private schema is never reachable by clients.
revoke all on all tables in schema private from anon, authenticated;
grant all on all tables in schema private to service_role;

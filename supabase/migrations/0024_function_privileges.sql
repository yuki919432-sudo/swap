-- 0024_function_privileges.sql
-- Hardening: prevent direct execution of privileged SECURITY DEFINER functions
-- (notably app.write_audit, which would allow forging audit rows) and replace the
-- blanket `GRANT EXECUTE ON ALL FUNCTIONS` with an explicit allowlist.
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. This migration:
--   1. strips client EXECUTE on ALL app-schema functions, then re-grants only an
--      explicit allowlist to `authenticated`;
--   2. explicitly revokes app.write_audit from every client role;
--   3. sets safe DEFAULT PRIVILEGES so future functions are not auto-PUBLIC;
--   4. keeps trusted server (`service_role`) and the function owner working;
--   5. preserves internal calls: SECURITY DEFINER functions run as their owner,
--      which always retains EXECUTE on owner functions regardless of grants.
--
-- The `public` schema is left broadly alone (it also holds extension functions
-- such as pg_trgm that legitimately keep PUBLIC EXECUTE); our public RPCs were
-- already granted explicitly in 0023. Only default privileges are tightened.

-- 1. App schema: strip all client EXECUTE.
revoke execute on all functions in schema app from public;
revoke execute on all functions in schema app from anon;
revoke execute on all functions in schema app from authenticated;

-- Trusted server role keeps broad execute (it lost the PUBLIC-derived grant).
grant execute on all functions in schema app to service_role;

-- 2. Re-grant the explicit allowlist to `authenticated`:
--    - RLS helper functions (evaluated as the invoking role inside policies), and
--    - client-callable SECURITY DEFINER functions that authorize internally.
--    Granting by identity arguments avoids signature mistakes (e.g. VARIADIC).
do $$
declare
  allow text[] := array[
    -- RLS helpers (must be executable by `authenticated` for policy evaluation)
    'is_verified_member', 'is_school_staff', 'has_school_role', 'is_platform_admin',
    'has_platform_role', 'is_conversation_member', 'is_blocked_between',
    'shares_verified_school', 'has_block_in_conversation',
    -- Client-callable privileged functions (authorize internally)
    'create_invitation', 'redeem_invitation', 'create_offer', 'accept_offer',
    'decline_offer', 'cancel_offer', 'confirm_handoff', 'join_event',
    'get_member_email', 'request_account_deletion'
  ];
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = any (allow)
  loop
    execute format('grant execute on function app.%I(%s) to authenticated', r.proname, r.args);
  end loop;
end
$$;

-- 3. Belt-and-braces: app.write_audit is NEVER client-executable. Only the owner
--    (used by internal SECURITY DEFINER callers) and service_role may run it.
revoke execute on function app.write_audit(text, uuid, text, text, uuid, jsonb) from public;
revoke execute on function app.write_audit(text, uuid, text, text, uuid, jsonb) from anon;
revoke execute on function app.write_audit(text, uuid, text, text, uuid, jsonb) from authenticated;

-- 4. Trusted server can run future functions without a per-function grant.
alter default privileges in schema app grant execute on functions to service_role;
alter default privileges in schema public grant execute on functions to service_role;
--
-- NOTE on the built-in PUBLIC default: PostgreSQL grants EXECUTE on newly created
-- functions to PUBLIC by a BUILT-IN default, and `ALTER DEFAULT PRIVILEGES ...
-- REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` does NOT strip that built-in default
-- (it only records deltas relative to it; verified on PG16/17). Schema-USAGE
-- cannot be revoked either, because `authenticated` legitimately needs USAGE on
-- app/public to run RLS-helper functions and RPCs.
--
-- Therefore the AUTHORITATIVE safety net is the CI test
-- supabase/tests/28_function_privileges.sql: it fails whenever any app/public
-- function is executable by `authenticated` but is NOT on the explicit allowlist.
-- A new function must be either added to the allowlist (an approved, reviewed
-- decision) or explicitly REVOKEd in the same change, or CI goes red.

-- 05_definer_search_path.sql
-- Every SECURITY DEFINER function in the `app` schema MUST pin a search_path,
-- so a caller cannot shadow `public`/`auth` with objects in a writable schema
-- and hijack the definer's elevated execution.
begin;
select no_plan();

-- No SECURITY DEFINER function in `app` may lack a search_path setting.
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.prosecdef = true
     and (p.proconfig is null
          or not exists (
            select 1 from unnest(p.proconfig) c where c like 'search_path=%'))),
  0,
  'every SECURITY DEFINER function in schema app pins a search_path');

-- Sanity: there actually ARE SECURITY DEFINER functions to check (guards against
-- a false pass if the schema were empty).
select cmp_ok(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.prosecdef = true),
  '>=', 15,
  'there are SECURITY DEFINER functions in app to verify');

-- Each pinned search_path must NOT start with a user-writable schema before the
-- trusted ones (we require it to begin with `app`).
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace,
        unnest(p.proconfig) c
   where n.nspname = 'app' and p.prosecdef = true
     and c like 'search_path=%'
     and c not like 'search_path=app%'),
  0,
  'pinned search_paths begin with the app schema');

select * from finish();
rollback;

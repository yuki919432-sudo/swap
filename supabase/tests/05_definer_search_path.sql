-- 05_definer_search_path.sql
-- Every SECURITY DEFINER function we own (schemas app + public) MUST pin a
-- search_path, so a caller cannot shadow `public`/`auth` with objects in a
-- writable schema and hijack the definer's elevated execution. Extension-owned
-- functions (e.g. pgTAP) are excluded.
begin;
select plan(3);

-- No SECURITY DEFINER function of ours may lack a search_path setting.
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'public')
     and p.prosecdef = true
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and (p.proconfig is null
          or not exists (
            select 1 from unnest(p.proconfig) c where c like 'search_path=%'))),
  0,
  'every SECURITY DEFINER function we own pins a search_path');

-- Sanity: there actually ARE SECURITY DEFINER functions to check.
select cmp_ok(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'public') and p.prosecdef = true
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
  '>=', 20,
  'there are SECURITY DEFINER functions to verify');

-- Each pinned search_path must begin with the app schema (trusted first).
select is(
  (select count(*)::int
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace,
        unnest(p.proconfig) c
   where n.nspname in ('app', 'public') and p.prosecdef = true
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and c like 'search_path=%'
     and c not like 'search_path=app%'),
  0,
  'pinned search_paths begin with the app schema');

select * from finish();
rollback;

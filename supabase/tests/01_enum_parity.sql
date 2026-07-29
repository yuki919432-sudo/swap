-- 01_enum_parity.sql
-- Guards against DB/TypeScript enum drift. The expected arrays below mirror
-- packages/types/src/enums.ts; if either side changes without the other, this
-- fails and forces them back into sync.
begin;
select plan(6);

create or replace function pg_temp.enum_labels(p_type text)
returns text[] language sql stable as $$
  select array_agg(e.enumlabel order by e.enumsortorder)
  from pg_enum e join pg_type t on t.oid = e.enumtypid
  where t.typname = p_type;
$$;

select is(pg_temp.enum_labels('membership_status'),
  array['pending','verified','rejected','suspended','left','expired'],
  'membership_status matches TS');

select is(pg_temp.enum_labels('school_role'),
  array['school_owner','school_admin','school_moderator','membership_reviewer','event_reviewer'],
  'school_role matches TS');

select is(pg_temp.enum_labels('platform_role'),
  array['platform_owner','platform_admin','platform_support'],
  'platform_role matches TS');

select is(pg_temp.enum_labels('verification_method'),
  array['google','microsoft','email_otp','roster','invite_code','manual'],
  'verification_method matches TS');

select is(pg_temp.enum_labels('offer_status'),
  array['draft','sent','accepted','declined','countered','cancelled','expired','handoff_pending','completed','disputed','pending'],
  'offer_status matches TS');

select is(pg_temp.enum_labels('reservation_status'),
  array['active','released','completed','cancelled'],
  'reservation_status matches TS');

select * from finish();
rollback;

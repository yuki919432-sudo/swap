-- 01_pilot_school.sql — create the pilot school + settings + handoff locations.
-- Idempotent. Environment-specific data (NOT a migration).
--   psql "$PROD_DATABASE_URL" -v school_name='...' -v school_slug='...' -f 01_pilot_school.sql
\set ON_ERROR_STOP on

\if :{?school_name}
\else
  \echo 'ERROR: pass -v school_name=''...'''
  \quit
\endif
\if :{?school_slug}
\else
  \echo 'ERROR: pass -v school_slug=''...'' (lowercase, e.g. img-academy)'
  \quit
\endif

-- School (default pilot posture: invitation codes + manual approval; no roster,
-- OTP enabled later once email deliverability is confirmed).
insert into schools (name, slug, status)
values (:'school_name', :'school_slug', 'active')
on conflict (slug) do update set name = excluded.name, status = 'active'
returning id \gset school_

insert into school_settings (school_id, enabled_verification_methods)
values (:'school_id', array['invite_code','manual']::verification_method[])
on conflict (school_id) do nothing;

-- Safe on-campus handoff locations (edit/extend for the real campus). Idempotent
-- on (school_id, name).
insert into safe_handoff_locations (school_id, name)
select :'school_id', v.name
from (values ('Main Office Lobby'), ('Library Entrance'), ('Student Center')) as v(name)
where not exists (
  select 1 from safe_handoff_locations s
  where s.school_id = :'school_id' and s.name = v.name
);

\echo '---------------------------------------------------------------'
\echo 'Pilot school ready. school_id ='
\echo :'school_id'
\echo 'Next: 02_promote_owner.sql (-v school_id=... -v owner_email=...)'
\echo '      Set EXPO_PUBLIC_PILOT_SCHOOL_ID to this school_id in EAS.'
\echo '---------------------------------------------------------------'

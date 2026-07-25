-- seed.sql  (DEVELOPMENT ONLY — fully synthetic)
--
-- Two entirely fictional schools with synthetic users, listings, an event, and
-- a community post. NO real school names, domains, rosters, logos, or student
-- data appear here (see docs/privacy-data-retention.md and the build spec).
--
-- Runs as the superuser test-runner, so RLS is bypassed for seeding. On real
-- Supabase, auth users are created through the Auth Admin API, not SQL; this
-- seed targets the local swap_dev database only.

begin;

do $$
declare
  -- schools
  s_north uuid := gen_random_uuid();
  s_south uuid := gen_random_uuid();
  -- users
  u_plat  uuid := gen_random_uuid();  -- platform owner
  u_nora  uuid := gen_random_uuid();  -- Northgate school_owner
  u_ben   uuid := gen_random_uuid();  -- Northgate student
  u_cara  uuid := gen_random_uuid();  -- Northgate student
  u_sam   uuid := gen_random_uuid();  -- Southvale school_admin
  u_tara  uuid := gen_random_uuid();  -- Southvale student
  -- content
  loc_north uuid;
  l_hoodie uuid;
  l_calc uuid;
begin
  -- ---- auth users + public profiles + private emails (all @example.test) ----
  insert into auth.users (id, email) values
    (u_plat, 'ada.platform@example.test'),
    (u_nora, 'nora.owner@northgate.example.test'),
    (u_ben,  'ben.student@northgate.example.test'),
    (u_cara, 'cara.student@northgate.example.test'),
    (u_sam,  'sam.admin@southvale.example.test'),
    (u_tara, 'tara.student@southvale.example.test');

  insert into public.users (id, display_name, grad_year) values
    (u_plat, 'Ada (Platform)', null),
    (u_nora, 'Nora',  2026),
    (u_ben,  'Ben',   2027),
    (u_cara, 'Cara',  2027),
    (u_sam,  'Sam',   2025),
    (u_tara, 'Tara',  2028);

  insert into private.user_emails (user_id, email, email_normalized, email_hash)
  select id, email, app.normalize_email(email), app.hash_email(email) from auth.users;

  -- ---- schools + settings + domains + handoff locations ----
  insert into schools (id, name, slug, status) values
    (s_north, 'Northgate Preparatory (Demo)', 'northgate-demo', 'active'),
    (s_south, 'Southvale Academy (Demo)',     'southvale-demo', 'active');

  -- Verification posture is per-school and opt-in. Northgate runs the default
  -- pilot posture (invitation codes + manual approval) plus email OTP once
  -- deliverability is confirmed — NO roster. Southvale additionally demonstrates
  -- the OPTIONAL roster adapter, as if the school lawfully provided roster data.
  -- (All roster data here is synthetic; real roster data never appears in seeds.)
  insert into school_settings (school_id, enabled_verification_methods, enabled_categories) values
    (s_north, array['invite_code','manual','email_otp']::verification_method[],
              array['textbooks','clothing','electronics','sports_equipment','other']),
    (s_south, array['invite_code','manual','roster']::verification_method[],
              array['textbooks','clothing','electronics','other']);

  insert into school_domains (school_id, domain, verified) values
    (s_north, 'northgate.example.test', true),
    (s_south, 'southvale.example.test', true);

  insert into safe_handoff_locations (id, school_id, name) values
    (gen_random_uuid(), s_north, 'Library Entrance') returning id into loc_north;
  insert into safe_handoff_locations (school_id, name) values
    (s_north, 'Student Center'),
    (s_south, 'Main Office Lobby');

  -- ---- roles ----
  insert into platform_admins (user_id, role) values (u_plat, 'platform_owner');
  insert into school_admins (school_id, user_id, role) values
    (s_north, u_nora, 'school_owner'),
    (s_south, u_sam,  'school_admin');

  -- ---- memberships (verified) ----
  insert into school_memberships (school_id, user_id, status, verification_method, verified_at) values
    (s_north, u_nora, 'verified', 'manual', now()),
    (s_north, u_ben,  'verified', 'email_otp', now()),
    (s_north, u_cara, 'verified', 'email_otp', now()),
    (s_south, u_sam,  'verified', 'manual', now()),
    (s_south, u_tara, 'verified', 'roster', now());

  -- ---- listings ----
  insert into listings (id, school_id, owner_id, post_type, title, description, category, condition, handoff_location_id)
  values (gen_random_uuid(), s_north, u_ben, 'give', 'Blue Hoodie (M)',
          'Barely worn, freshly washed. Free to a good home.', 'clothing', 'like_new', loc_north)
  returning id into l_hoodie;

  insert into listings (id, school_id, owner_id, post_type, title, description, category, condition, desired_item)
  values (gen_random_uuid(), s_north, u_cara, 'swap', 'Graphing Calculator',
          'TI-84, works perfectly. Looking to swap for a hoodie or textbook.', 'electronics', 'good', 'Hoodie or textbook')
  returning id into l_calc;

  insert into listings (school_id, owner_id, post_type, title, description, category)
  values (s_south, u_tara, 'looking_for', 'Looking for a bike pump',
          'Anyone have a spare floor pump I could have or borrow?', 'sports_equipment');

  -- ---- event + community post (Northgate) ----
  insert into events (school_id, organizer_id, title, description, category, starts_at, ends_at, timezone, location, max_participants, status)
  values (s_north, u_nora, 'Beach Cleanup This Saturday',
          'Meet at the north lot. Gloves and bags provided.', 'volunteer',
          now() + interval '3 days', now() + interval '3 days 2 hours',
          'America/New_York', 'North Parking Lot', 30, 'published');

  insert into community_posts (school_id, author_id, type, title, description, status)
  values (s_north, u_cara, 'study_group', 'Chemistry study group forming',
          'Weekly Thursdays in the library. All welcome.', 'published');

  raise notice 'Seed complete: 2 schools, 6 users, 3 listings, 1 event, 1 community post.';
end
$$;

commit;

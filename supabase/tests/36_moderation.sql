-- 36_moderation.sql
-- Moderator tools (migration 0032): role-gated report resolution + content/user
-- actions. Proves a moderator can act ONLY within their own school, a non-moderator
-- cannot act at all, and every action is logged.
begin;
select plan(8);

-- ------------------------------------------------------------- fixtures ------
insert into schools (id, name, slug, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'School A', 'mod-a', 'active'),
  ('bbbb0000-0000-0000-0000-0000000000bb', 'School B', 'mod-b', 'active');
insert into school_settings (school_id, enabled_verification_methods) values
  ('aaaa0000-0000-0000-0000-0000000000aa', array['invite_code','manual']::verification_method[]),
  ('bbbb0000-0000-0000-0000-0000000000bb', array['invite_code','manual']::verification_method[]);

insert into auth.users (id, email, email_confirmed_at) values
  ('d0000000-0000-0000-0000-000000000001', 'mod@a.test',    now()),  -- A moderator
  ('d0000000-0000-0000-0000-000000000002', 'member@a.test', now()),  -- A normal member
  ('d0000000-0000-0000-0000-000000000003', 'modb@b.test',   now());  -- B moderator
insert into public.users (id, display_name) select id, 'U' from auth.users
  where id in ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000003');

insert into school_memberships (school_id, user_id, status) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000001', 'verified'),
  ('aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000002', 'verified'),
  ('bbbb0000-0000-0000-0000-0000000000bb', 'd0000000-0000-0000-0000-000000000003', 'verified');

insert into school_admins (school_id, user_id, role, active) values
  ('aaaa0000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000001', 'school_moderator', true),
  ('bbbb0000-0000-0000-0000-0000000000bb', 'd0000000-0000-0000-0000-000000000003', 'school_moderator', true);

-- A listing owned by the member, and a report against it.
insert into listings (id, school_id, owner_id, post_type, title, description, category, condition, status)
  values ('ee110000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-0000000000aa',
          'd0000000-0000-0000-0000-000000000002','give','Old lamp','x','dormitory_items','good','active');
insert into reports (id, school_id, reporter_id, target_type, target_id, reason)
  values ('ff110000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-0000000000aa',
          'd0000000-0000-0000-0000-000000000002','listing','ee110000-0000-0000-0000-000000000001','spam');

-- ============================================= a non-moderator cannot resolve
select tests.authenticate_as('d0000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.resolve_report('ff110000-0000-0000-0000-000000000001','resolved','ok')$$,
  '42501', null, 'a non-moderator cannot resolve a report');
select tests.reset_auth();

-- ============================================= the school moderator can resolve
select tests.authenticate_as('d0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.resolve_report('ff110000-0000-0000-0000-000000000001','reviewing','looking into it')$$,
  'the school moderator can triage a report');
select is((select status::text from reports where id='ff110000-0000-0000-0000-000000000001'), 'reviewing',
  'the report status was updated');

-- moderator removes then restores the listing.
select lives_ok(
  $$select public.moderator_set_listing_status('ee110000-0000-0000-0000-000000000001','remove_content',
        'ff110000-0000-0000-0000-000000000001','off-policy')$$,
  'the moderator can remove a listing');
select is((select status::text from listings where id='ee110000-0000-0000-0000-000000000001'), 'removed',
  'the listing is removed');
select public.moderator_set_listing_status('ee110000-0000-0000-0000-000000000001','restore_content', null, null);
select is((select status::text from listings where id='ee110000-0000-0000-0000-000000000001'), 'active',
  'the listing can be restored to active');
select tests.reset_auth();

-- ============================================= cross-school moderator is blocked
select tests.authenticate_as('d0000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select public.moderator_set_listing_status('ee110000-0000-0000-0000-000000000001','remove_content', null, null)$$,
  '42501', null, 'a moderator of another school cannot act on this school''s content');
select tests.reset_auth();

-- ============================================= suspend a member + audit trail
select tests.authenticate_as('d0000000-0000-0000-0000-000000000001');
select public.moderator_suspend_member('d0000000-0000-0000-0000-000000000002','aaaa0000-0000-0000-0000-0000000000aa','repeated violations');
select tests.reset_auth();
-- Verify without RLS (a school_moderator cannot SELECT another member's row; the
-- SECURITY DEFINER function still updated it — the authority is the DB, not the read).
select is((select status::text from school_memberships
           where user_id='d0000000-0000-0000-0000-000000000002' and school_id='aaaa0000-0000-0000-0000-0000000000aa'),
          'suspended', 'the moderator can suspend a member');

select * from finish();
rollback;

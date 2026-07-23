-- 0016_rls_policies.sql
-- Row Level Security for every table in `public`. Default posture is deny: RLS
-- is enabled on all tables and every policy is scoped `to authenticated`, so the
-- anon role (and any unmatched request) sees nothing.
--
-- Reusable predicate shorthand used throughout:
--   content read  := is_verified_member(school_id) OR is_school_staff(school_id) OR is_platform_admin()
-- Tenant isolation lives here AND is re-checked in privileged functions.

-- Enable RLS everywhere.
alter table schools                 enable row level security;
alter table school_domains          enable row level security;
alter table school_settings         enable row level security;
alter table safe_handoff_locations  enable row level security;
alter table users                   enable row level security;
alter table user_preferences        enable row level security;
alter table school_memberships      enable row level security;
alter table school_admins           enable row level security;
alter table membership_requests     enable row level security;
alter table student_roster_entries  enable row level security;
alter table platform_admins         enable row level security;
alter table invitations             enable row level security;
alter table invite_code_uses        enable row level security;
alter table prohibited_categories   enable row level security;
alter table listings                enable row level security;
alter table listing_images          enable row level security;
alter table saved_listings          enable row level security;
alter table looking_for_matches     enable row level security;
alter table offers                  enable row level security;
alter table offer_items             enable row level security;
alter table transactions            enable row level security;
alter table listing_reservations    enable row level security;
alter table handoff_confirmations   enable row level security;
alter table transaction_feedback    enable row level security;
alter table conversations           enable row level security;
alter table conversation_members    enable row level security;
alter table messages                enable row level security;
alter table events                  enable row level security;
alter table event_participants      enable row level security;
alter table event_updates           enable row level security;
alter table community_posts         enable row level security;
alter table announcements           enable row level security;
alter table reports                 enable row level security;
alter table blocks                  enable row level security;
alter table moderation_actions      enable row level security;
alter table audit_logs              enable row level security;
alter table notifications           enable row level security;
alter table device_tokens           enable row level security;
alter table feature_flags           enable row level security;

-- ============================================================ schools ========
create policy schools_select on schools for select to authenticated
  using (
    status = 'active'
    or app.is_school_staff(id)
    or app.is_platform_admin()
    or exists (select 1 from school_memberships m where m.school_id = schools.id and m.user_id = auth.uid())
  );
create policy schools_insert on schools for insert to authenticated
  with check (app.has_platform_role('platform_owner', 'platform_admin'));
create policy schools_update on schools for update to authenticated
  using (app.has_platform_role('platform_owner', 'platform_admin') or app.has_school_role(id, 'school_owner'))
  with check (app.has_platform_role('platform_owner', 'platform_admin') or app.has_school_role(id, 'school_owner'));

-- ======================================================= school_domains ======
create policy school_domains_select on school_domains for select to authenticated
  using (app.is_school_staff(school_id) or app.is_platform_admin());
create policy school_domains_write on school_domains for all to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin') or app.has_platform_role('platform_owner', 'platform_admin'))
  with check (app.has_school_role(school_id, 'school_owner', 'school_admin') or app.has_platform_role('platform_owner', 'platform_admin'));

-- ====================================================== school_settings ======
create policy school_settings_select on school_settings for select to authenticated
  using (app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin());
create policy school_settings_update on school_settings for update to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin') or app.is_platform_admin())
  with check (app.has_school_role(school_id, 'school_owner', 'school_admin') or app.is_platform_admin());
create policy school_settings_insert on school_settings for insert to authenticated
  with check (app.has_school_role(school_id, 'school_owner') or app.has_platform_role('platform_owner', 'platform_admin'));

-- ================================================= safe_handoff_locations =====
create policy handoff_loc_select on safe_handoff_locations for select to authenticated
  using (app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin());
create policy handoff_loc_write on safe_handoff_locations for all to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin') or app.is_platform_admin())
  with check (app.has_school_role(school_id, 'school_owner', 'school_admin') or app.is_platform_admin());

-- ============================================================== users ========
-- Public-safe profile visibility: self, or someone who shares a verified school.
create policy users_select on users for select to authenticated
  using (id = auth.uid() or app.shares_verified_school(id) or app.is_platform_admin());
create policy users_insert on users for insert to authenticated
  with check (id = auth.uid());
create policy users_update on users for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ==================================================== user_preferences =======
create policy user_prefs_all on user_preferences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =================================================== school_memberships ======
create policy memberships_select on school_memberships for select to authenticated
  using (
    user_id = auth.uid()
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'membership_reviewer')
    or app.is_platform_admin()
  );
-- A student may create only their OWN pending membership. Verification and
-- approval transitions happen through privileged functions / admin update.
create policy memberships_insert on school_memberships for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy memberships_admin_update on school_memberships for update to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin', 'membership_reviewer') or app.is_platform_admin())
  with check (app.has_school_role(school_id, 'school_owner', 'school_admin', 'membership_reviewer') or app.is_platform_admin());

-- ======================================================== school_admins ======
create policy school_admins_select on school_admins for select to authenticated
  using (user_id = auth.uid() or app.is_school_staff(school_id) or app.is_platform_admin());
create policy school_admins_write on school_admins for all to authenticated
  using (app.has_school_role(school_id, 'school_owner') or app.has_platform_role('platform_owner', 'platform_admin'))
  with check (app.has_school_role(school_id, 'school_owner') or app.has_platform_role('platform_owner', 'platform_admin'));

-- =================================================== membership_requests ======
create policy membership_requests_select on membership_requests for select to authenticated
  using (
    user_id = auth.uid()
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'membership_reviewer')
    or app.is_platform_admin()
  );
create policy membership_requests_insert on membership_requests for insert to authenticated
  with check (user_id = auth.uid());
create policy membership_requests_update on membership_requests for update to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin', 'membership_reviewer') or app.is_platform_admin())
  with check (app.has_school_role(school_id, 'school_owner', 'school_admin', 'membership_reviewer') or app.is_platform_admin());

-- ================================================ student_roster_entries ======
-- Roster is NOT public. Only reviewers/admins of the school (and platform).
create policy roster_select on student_roster_entries for select to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin', 'membership_reviewer') or app.is_platform_admin());
create policy roster_write on student_roster_entries for all to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin', 'membership_reviewer') or app.is_platform_admin())
  with check (app.has_school_role(school_id, 'school_owner', 'school_admin', 'membership_reviewer') or app.is_platform_admin());

-- ======================================================= platform_admins ======
create policy platform_admins_select on platform_admins for select to authenticated
  using (user_id = auth.uid() or app.is_platform_admin());
create policy platform_admins_write on platform_admins for all to authenticated
  using (app.has_platform_role('platform_owner'))
  with check (app.has_platform_role('platform_owner'));

-- ========================================================== invitations ======
-- Invite codes/hashes are admin-only; students redeem via app.redeem_invitation.
create policy invitations_select on invitations for select to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin') or app.is_platform_admin());
create policy invitations_write on invitations for all to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin') or app.is_platform_admin())
  with check (app.has_school_role(school_id, 'school_owner', 'school_admin') or app.is_platform_admin());

create policy invite_uses_select on invite_code_uses for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from invitations i
      where i.id = invite_code_uses.invitation_id
        and (app.has_school_role(i.school_id, 'school_owner', 'school_admin') or app.is_platform_admin())
    )
  );
-- No client INSERT/UPDATE/DELETE: consumption happens in app.redeem_invitation.

-- =================================================== prohibited_categories ====
create policy prohibited_categories_select on prohibited_categories for select to authenticated
  using (true);
-- Writes are platform-managed via migrations / service role.

-- ============================================================= listings ======
create policy listings_select on listings for select to authenticated
  using (
    (app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin())
    and (deleted_at is null or owner_id = auth.uid() or app.is_school_staff(school_id) or app.is_platform_admin())
    and (status <> 'draft' or owner_id = auth.uid() or app.is_school_staff(school_id) or app.is_platform_admin())
  );
create policy listings_insert on listings for insert to authenticated
  with check (owner_id = auth.uid() and app.is_verified_member(school_id));
create policy listings_update on listings for update to authenticated
  using (
    (owner_id = auth.uid() and app.is_verified_member(school_id))
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator')
    or app.is_platform_admin()
  )
  with check (
    (owner_id = auth.uid() and app.is_verified_member(school_id))
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator')
    or app.is_platform_admin()
  );
-- No DELETE policy: listings are soft-deleted via UPDATE deleted_at.

-- ======================================================== listing_images ======
create policy listing_images_select on listing_images for select to authenticated
  using (app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin());
create policy listing_images_write on listing_images for all to authenticated
  using (
    exists (select 1 from listings l where l.id = listing_id and l.owner_id = auth.uid())
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator')
    or app.is_platform_admin()
  )
  with check (
    app.is_verified_member(school_id)
    and (
      exists (select 1 from listings l where l.id = listing_id and l.owner_id = auth.uid())
      or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator')
      or app.is_platform_admin()
    )
  );

-- ======================================================== saved_listings ======
create policy saved_listings_all on saved_listings for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and app.is_verified_member(school_id));

-- ==================================================== looking_for_matches =====
create policy looking_for_matches_select on looking_for_matches for select to authenticated
  using (app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin());
-- Writes are system-generated via service role.

-- ============================================================== offers ========
-- Mutations happen through functions (create_offer/accept_offer/etc.); clients
-- get SELECT only here.
create policy offers_select on offers for select to authenticated
  using (
    from_user_id = auth.uid()
    or to_user_id = auth.uid()
    or app.is_school_staff(school_id)
    or app.is_platform_admin()
  );

create policy offer_items_select on offer_items for select to authenticated
  using (
    exists (
      select 1 from offers o
      where o.id = offer_items.offer_id
        and (o.from_user_id = auth.uid() or o.to_user_id = auth.uid()
             or app.is_school_staff(o.school_id) or app.is_platform_admin())
    )
  );

-- =========================================================== transactions =====
create policy transactions_select on transactions for select to authenticated
  using (
    exists (
      select 1 from offers o
      where o.id = transactions.offer_id
        and (o.from_user_id = auth.uid() or o.to_user_id = auth.uid())
    )
    or app.is_school_staff(school_id)
    or app.is_platform_admin()
  );

create policy reservations_select on listing_reservations for select to authenticated
  using (
    reserved_by = auth.uid()
    or exists (
      select 1 from offers o
      where o.id = listing_reservations.offer_id
        and (o.from_user_id = auth.uid() or o.to_user_id = auth.uid())
    )
    or app.is_school_staff(school_id)
    or app.is_platform_admin()
  );

create policy handoff_conf_select on handoff_confirmations for select to authenticated
  using (
    exists (
      select 1 from transactions t join offers o on o.id = t.offer_id
      where t.id = handoff_confirmations.transaction_id
        and (o.from_user_id = auth.uid() or o.to_user_id = auth.uid()
             or app.is_school_staff(o.school_id) or app.is_platform_admin())
    )
  );

create policy txn_feedback_select on transaction_feedback for select to authenticated
  using (
    from_user_id = auth.uid() or to_user_id = auth.uid()
    or exists (select 1 from transactions t where t.id = transaction_feedback.transaction_id and app.is_school_staff(t.school_id))
    or app.is_platform_admin()
  );
create policy txn_feedback_insert on transaction_feedback for insert to authenticated
  with check (
    from_user_id = auth.uid()
    and exists (
      select 1 from transactions t join offers o on o.id = t.offer_id
      where t.id = transaction_feedback.transaction_id
        and t.status = 'completed'
        and (o.from_user_id = auth.uid() or o.to_user_id = auth.uid())
    )
  );

-- =========================================================== conversations ====
create policy conversations_select on conversations for select to authenticated
  using (app.is_conversation_member(id) or app.is_school_staff(school_id) or app.is_platform_admin());
create policy conversations_insert on conversations for insert to authenticated
  with check (app.is_verified_member(school_id));

create policy conv_members_select on conversation_members for select to authenticated
  using (app.is_conversation_member(conversation_id) or app.is_platform_admin());
create policy conv_members_update on conversation_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- INSERT via start-conversation function (adds both participants atomically).

create policy messages_select on messages for select to authenticated
  using (app.is_conversation_member(conversation_id) or app.is_school_staff(school_id) or app.is_platform_admin());
create policy messages_insert on messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and app.is_conversation_member(conversation_id)
    and app.is_verified_member(school_id)
    and not app.has_block_in_conversation(conversation_id, auth.uid())
  );

-- ============================================================== events ========
create policy events_select on events for select to authenticated
  using (
    (app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin())
    and (deleted_at is null or organizer_id = auth.uid() or app.is_school_staff(school_id) or app.is_platform_admin())
    and (status not in ('draft', 'pending_approval')
         or organizer_id = auth.uid() or app.is_school_staff(school_id) or app.is_platform_admin())
  );
create policy events_insert on events for insert to authenticated
  with check (organizer_id = auth.uid() and app.is_verified_member(school_id));
create policy events_update on events for update to authenticated
  using (
    organizer_id = auth.uid()
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'event_reviewer', 'school_moderator')
    or app.is_platform_admin()
  )
  with check (
    organizer_id = auth.uid()
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'event_reviewer', 'school_moderator')
    or app.is_platform_admin()
  );

create policy event_participants_select on event_participants for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from events e
      where e.id = event_participants.event_id
        and (e.organizer_id = auth.uid() or app.is_school_staff(e.school_id) or app.is_platform_admin())
    )
  );
create policy event_participants_leave on event_participants for delete to authenticated
  using (user_id = auth.uid());
-- Joining happens through app.join_event (enforces capacity atomically).

create policy event_updates_select on event_updates for select to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = event_updates.event_id
        and (e.organizer_id = auth.uid() or app.is_school_staff(e.school_id) or app.is_platform_admin())
    )
    or exists (select 1 from event_participants ep where ep.event_id = event_updates.event_id and ep.user_id = auth.uid())
  );
create policy event_updates_insert on event_updates for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from events e where e.id = event_updates.event_id and e.organizer_id = auth.uid())
  );

-- ========================================================= community_posts ====
create policy community_posts_select on community_posts for select to authenticated
  using (
    (app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin())
    and (deleted_at is null or author_id = auth.uid() or app.is_school_staff(school_id) or app.is_platform_admin())
    and (status not in ('draft', 'pending_approval')
         or author_id = auth.uid() or app.is_school_staff(school_id) or app.is_platform_admin())
  );
create policy community_posts_insert on community_posts for insert to authenticated
  with check (author_id = auth.uid() and app.is_verified_member(school_id));
create policy community_posts_update on community_posts for update to authenticated
  using (
    author_id = auth.uid()
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator')
    or app.is_platform_admin()
  )
  with check (
    author_id = auth.uid()
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator')
    or app.is_platform_admin()
  );

-- ============================================================ announcements ====
create policy announcements_select on announcements for select to authenticated
  using ((app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin()) and deleted_at is null);
create policy announcements_write on announcements for all to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin') or app.is_platform_admin())
  with check (app.has_school_role(school_id, 'school_owner', 'school_admin') or app.is_platform_admin());

-- ============================================================== reports =======
create policy reports_select on reports for select to authenticated
  using (
    reporter_id = auth.uid()
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator')
    or app.is_platform_admin()
  );
create policy reports_insert on reports for insert to authenticated
  with check (reporter_id = auth.uid() and app.is_verified_member(school_id));
create policy reports_update on reports for update to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator') or app.is_platform_admin())
  with check (app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator') or app.is_platform_admin());

-- =============================================================== blocks =======
create policy blocks_select on blocks for select to authenticated
  using (blocker_id = auth.uid() or app.is_platform_admin());
create policy blocks_insert on blocks for insert to authenticated
  with check (blocker_id = auth.uid() and app.is_verified_member(school_id));
create policy blocks_delete on blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- ==================================================== moderation_actions ======
create policy moderation_actions_select on moderation_actions for select to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator') or app.is_platform_admin());
create policy moderation_actions_insert on moderation_actions for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator') or app.is_platform_admin())
  );

-- ============================================================= audit_logs =====
-- SELECT only; INSERT/UPDATE/DELETE are revoked at the grant level (0015) and
-- blocked by trigger (0019). Writes occur through SECURITY DEFINER functions.
create policy audit_logs_select on audit_logs for select to authenticated
  using (app.has_school_role(school_id, 'school_owner', 'school_admin') or app.is_platform_admin());

-- =========================================================== notifications ====
create policy notifications_select on notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy notifications_delete on notifications for delete to authenticated
  using (user_id = auth.uid());
-- INSERT is server-side (service role / SECURITY DEFINER).

-- =========================================================== device_tokens ====
create policy device_tokens_all on device_tokens for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================ feature_flags ====
create policy feature_flags_select on feature_flags for select to authenticated
  using (true);
-- Writes are platform-managed via service role.

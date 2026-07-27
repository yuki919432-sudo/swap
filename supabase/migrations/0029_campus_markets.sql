-- 0029_campus_markets.sql
-- Campus Markets & Student Stalls — the year-round student flea-market district.
--
-- Hierarchy: School → (permanent) Campus Market → Temporary Markets → Student
-- Stalls → Listings. The permanent Campus Market is a DERIVED discovery experience
-- over a school's active listings/stalls/wishlist (no table — it is simply the
-- school scope). This migration adds the persistent pieces: student stalls,
-- themed temporary markets, seller participation, and listing↔market association.
--
-- Strict school tenant isolation via RLS. Soft deletion + lifecycle status.

-- ------------------------------------------------------------------ enums ----
create type market_status as enum ('upcoming', 'active', 'ended', 'cancelled');
-- Who may create a temporary market (per-school policy).
create type market_creation_policy as enum ('verified_students', 'clubs_only', 'moderators_only');

alter table school_settings
  add column market_creation_policy market_creation_policy not null default 'verified_students';

-- Owners may opt a wishlist item into being shown on their stall.
alter table wishlist_items add column show_on_stall boolean not null default false;

-- ------------------------------------------------------------------ stalls ----
-- One lightweight personal stall per verified student per school. A stall is a
-- thin profile over the user + their listings; not a business storefront.
create table stalls (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  description text check (description is null or length(description) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (school_id, user_id)
);
comment on table stalls is 'Lightweight per-student stall (a casual profile over their listings). Not a business storefront.';
create index stalls_school_idx on stalls (school_id) where deleted_at is null;
create trigger stalls_set_updated_at before update on stalls for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------- markets ----
create table markets (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references schools (id) on delete cascade,
  host_user_id         uuid not null references users (id) on delete cascade,
  host_label           text check (host_label is null or length(host_label) <= 80), -- e.g. "Robotics Club"
  title                text not null check (length(btrim(title)) between 1 and 120),
  description          text check (description is null or length(description) <= 2000),
  cover_storage_path   text,
  starts_at            timestamptz,
  ends_at              timestamptz,
  location             text check (location is null or length(location) <= 200),  -- optional; never a private residential address
  handoff_instructions text check (handoff_instructions is null or length(handoff_instructions) <= 500),
  allowed_categories   text[] not null default '{}',   -- empty = all categories the school allows
  allows_regulated     boolean not null default false, -- regulated goods stay separate; HS can never enable (see docs)
  status               market_status not null default 'upcoming',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
comment on table markets is 'Themed temporary markets (digital and/or tied to a physical event). School-scoped.';
create index markets_school_status_idx on markets (school_id, status) where deleted_at is null;
create index markets_host_idx on markets (host_user_id);
create trigger markets_set_updated_at before update on markets for each row execute function app.set_updated_at();

-- A market may not allow a universally-prohibited category (mirrors listing rules;
-- prohibited items can't be smuggled in via a temporary market).
create or replace function app.reject_prohibited_market_categories()
returns trigger language plpgsql
set search_path = app, public, pg_catalog
as $$
declare v_cat text;
begin
  foreach v_cat in array coalesce(new.allowed_categories, '{}') loop
    if exists (select 1 from public.prohibited_categories p where p.category = lower(v_cat)) then
      raise exception 'category_prohibited: %', v_cat using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function app.reject_prohibited_market_categories() from public;
create trigger markets_reject_prohibited before insert or update of allowed_categories on markets
  for each row execute function app.reject_prohibited_market_categories();

-- Audit market creation + cancellation (append-only via SECURITY DEFINER).
create or replace function app.trg_audit_market()
returns trigger language plpgsql security definer
set search_path = app, public, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    perform app.write_audit('student', new.school_id, 'market_created', 'market', new.id,
                            jsonb_build_object('title', new.title));
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then
    perform app.write_audit('student', new.school_id, 'market_cancelled', 'market', new.id, '{}'::jsonb);
  end if;
  return null;
end;
$$;
revoke execute on function app.trg_audit_market() from public;
create trigger markets_audit after insert or update on markets for each row execute function app.trg_audit_market();

-- --------------------------------------------------------- market_sellers -----
create table market_sellers (
  id        uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets (id) on delete cascade,
  school_id uuid not null references schools (id) on delete cascade,
  user_id   uuid not null references users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (market_id, user_id)
);
create index market_sellers_market_idx on market_sellers (market_id);
create index market_sellers_user_idx on market_sellers (user_id);

-- -------------------------------------------------------- market_listings -----
-- A listing may belong to zero or more markets while still appearing in the
-- permanent Campus Market and its owner's stall. Removing an association never
-- deletes the listing.
create table market_listings (
  id         uuid primary key default gen_random_uuid(),
  market_id  uuid not null references markets (id) on delete cascade,
  school_id  uuid not null references schools (id) on delete cascade,
  listing_id uuid not null references listings (id) on delete cascade,
  added_by   uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (market_id, listing_id)
);
create index market_listings_market_idx on market_listings (market_id);
create index market_listings_listing_idx on market_listings (listing_id);

-- ---------------------------------------------- market-creation policy helper -
create or replace function app.can_create_market(p_school uuid)
returns boolean
language sql stable security definer
set search_path = app, public, pg_catalog
as $$
  select case (select market_creation_policy from public.school_settings where school_id = p_school)
    when 'verified_students' then app.is_verified_member(p_school)
    when 'moderators_only' then app.has_school_role(p_school, 'school_owner', 'school_admin', 'school_moderator')
    -- 'clubs_only': club entities aren't modeled yet; restrict to school staff until they are.
    when 'clubs_only' then app.has_school_role(p_school, 'school_owner', 'school_admin', 'school_moderator')
    else false
  end;
$$;
revoke execute on function app.can_create_market(uuid) from public;
grant execute on function app.can_create_market(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ RLS -------
alter table stalls enable row level security;
alter table markets enable row level security;
alter table market_sellers enable row level security;
alter table market_listings enable row level security;

-- Stalls: same-school members (+ staff/platform) see them; owner sees their own
-- even soft-deleted. Only a verified member may open/edit their OWN stall.
create policy stalls_select on stalls for select to authenticated
  using (
    (app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin())
    and (deleted_at is null or user_id = auth.uid() or app.is_school_staff(school_id) or app.is_platform_admin())
  );
create policy stalls_insert on stalls for insert to authenticated
  with check (user_id = auth.uid() and app.is_verified_member(school_id));
create policy stalls_update on stalls for update to authenticated
  using ((user_id = auth.uid() and app.is_verified_member(school_id)) or app.is_platform_admin())
  with check ((user_id = auth.uid() and app.is_verified_member(school_id)) or app.is_platform_admin());

-- Markets: same-school members (+ staff/platform) browse non-deleted markets.
-- Create is gated by the school policy; the host must be the caller. Host (or
-- staff/platform) may edit; moderators may cancel/hide but the host_user_id is
-- fixed by WITH CHECK so a moderator can't silently become the owner.
create policy markets_select on markets for select to authenticated
  using (
    (app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin())
    and (deleted_at is null or host_user_id = auth.uid() or app.is_school_staff(school_id) or app.is_platform_admin())
  );
create policy markets_insert on markets for insert to authenticated
  with check (host_user_id = auth.uid() and app.can_create_market(school_id));
create policy markets_update on markets for update to authenticated
  using (
    (host_user_id = auth.uid() and app.is_verified_member(school_id))
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator')
    or app.is_platform_admin()
  )
  with check (
    (host_user_id = auth.uid() and app.is_verified_member(school_id))
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator')
    or app.is_platform_admin()
  );

-- Market sellers: same-school members see participants; a verified member joins as
-- themselves (only while the market is upcoming/active) and may leave (delete own).
create policy market_sellers_select on market_sellers for select to authenticated
  using (app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin());
create policy market_sellers_insert on market_sellers for insert to authenticated
  with check (
    user_id = auth.uid()
    and app.is_verified_member(school_id)
    and exists (select 1 from markets m where m.id = market_id and m.school_id = market_sellers.school_id
                  and m.deleted_at is null and m.status in ('upcoming', 'active'))
  );
create policy market_sellers_delete on market_sellers for delete to authenticated
  using (user_id = auth.uid() or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator') or app.is_platform_admin());

-- Market listings: same-school members see associations. A member may associate
-- only a listing they OWN, in the SAME school as the market. Removing the
-- association (owner, adder, or staff) never deletes the listing.
create policy market_listings_select on market_listings for select to authenticated
  using (app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin());
create policy market_listings_insert on market_listings for insert to authenticated
  with check (
    added_by = auth.uid()
    and app.is_verified_member(school_id)
    and exists (select 1 from listings l where l.id = listing_id and l.owner_id = auth.uid()
                  and l.school_id = market_listings.school_id and l.deleted_at is null)
    and exists (select 1 from markets m where m.id = market_id and m.school_id = market_listings.school_id
                  and m.deleted_at is null and m.status in ('upcoming', 'active'))
  );
create policy market_listings_delete on market_listings for delete to authenticated
  using (
    added_by = auth.uid()
    or exists (select 1 from listings l where l.id = listing_id and l.owner_id = auth.uid())
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator')
    or app.is_platform_admin()
  );

-- --------------------------------------------------------------- grants -------
grant select, insert, update on stalls to authenticated;   -- soft-delete only
grant select, insert, update on markets to authenticated;  -- soft-delete only
grant select, insert, delete on market_sellers to authenticated;
grant select, insert, delete on market_listings to authenticated;
grant all on stalls, markets, market_sellers, market_listings to service_role;

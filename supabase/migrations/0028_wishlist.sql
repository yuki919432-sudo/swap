-- 0028_wishlist.sql
-- First-class Wishlist ("I'm looking for…") — persistent per-user requests,
-- distinct from bookmarked (saved) listings. Plus a deterministic match outbox
-- that surfaces new listings matching someone's wishlist, prepared for a future
-- "a new item matching your wishlist has been listed" notification (NOT sent here).

-- ------------------------------------------------------------------ enums ----
create type wishlist_urgency as enum ('low', 'normal', 'high');
create type wishlist_status as enum ('active', 'fulfilled', 'cancelled', 'expired');
create type wishlist_visibility as enum ('school');

-- --------------------------------------------------------- wishlist_items -----
create table wishlist_items (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools (id) on delete cascade,
  user_id            uuid not null references users (id) on delete cascade,
  title              text not null check (length(btrim(title)) between 1 and 120),
  description        text check (description is null or length(description) <= 2000),
  preferred_category text,
  preferred_condition item_condition,
  budget_cents       int check (budget_cents is null or budget_cents >= 0), -- future
  swap_acceptable    boolean not null default true,
  urgency            wishlist_urgency not null default 'normal',
  visibility         wishlist_visibility not null default 'school',
  status             wishlist_status not null default 'active',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
comment on table wishlist_items is
  'Persistent "looking for" requests, school-scoped. Distinct from saved_listings (bookmarks).';
create index wishlist_items_school_status_idx on wishlist_items (school_id, status) where deleted_at is null;
create index wishlist_items_user_idx on wishlist_items (user_id);
create index wishlist_items_title_trgm_idx on wishlist_items using gin (title gin_trgm_ops);

create trigger wishlist_items_set_updated_at before update on wishlist_items
  for each row execute function app.set_updated_at();

-- A prohibited category is never a valid wishlist preference either.
create or replace function app.reject_prohibited_wishlist_category()
returns trigger language plpgsql
set search_path = app, public, pg_catalog
as $$
begin
  if new.preferred_category is not null
     and exists (select 1 from public.prohibited_categories p where p.category = lower(new.preferred_category)) then
    raise exception 'category_prohibited: %', new.preferred_category using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function app.reject_prohibited_wishlist_category() from public;
create trigger wishlist_items_reject_prohibited
  before insert or update of preferred_category on wishlist_items
  for each row execute function app.reject_prohibited_wishlist_category();

-- -------------------------------------------------------- wishlist_matches ----
-- Outbox of (wishlist -> matching listing) with a deterministic score. Populated
-- by a trigger on new listings. `notified_at` is the hook a FUTURE notification
-- job would set once it has told the wishlist owner (no notification is sent now).
create table wishlist_matches (
  id               uuid primary key default gen_random_uuid(),
  wishlist_item_id uuid not null references wishlist_items (id) on delete cascade,
  listing_id       uuid not null references listings (id) on delete cascade,
  school_id        uuid not null references schools (id) on delete cascade,
  score            numeric(5,4) not null default 0,
  created_at       timestamptz not null default now(),
  notified_at      timestamptz,
  unique (wishlist_item_id, listing_id)
);
create index wishlist_matches_item_idx on wishlist_matches (wishlist_item_id, created_at desc);
create index wishlist_matches_unnotified_idx on wishlist_matches (created_at) where notified_at is null;

-- ------------------------------------------------ deterministic matcher -------
-- Deterministic, local scoring (no AI/ML). Score = trigram title similarity
-- (+0.3 same preferred category, +0.1 condition preference satisfied), clamped to
-- 1.0; a match is recorded at score >= 0.25. Only listings that OFFER an item
-- (give/swap/lend) can satisfy a wishlist, and a swap only matches when the
-- wishlist accepts swaps.
create or replace function app.match_listing_to_wishlists(p_listing uuid)
returns int
language plpgsql security definer
set search_path = app, public, pg_catalog
as $$
declare
  l public.listings;
  v_count int := 0;
begin
  select * into l from public.listings where id = p_listing;
  if not found or l.deleted_at is not null or l.status <> 'active' then return 0; end if;
  if l.post_type not in ('give', 'swap', 'lend') then return 0; end if;

  insert into public.wishlist_matches (wishlist_item_id, listing_id, school_id, score)
  select w.id, l.id, l.school_id, s.score
    from public.wishlist_items w
    cross join lateral (
      select least(1.0,
        similarity(lower(w.title), lower(l.title))
        + case when w.preferred_category is not null and w.preferred_category = l.category then 0.3 else 0 end
        + case when w.preferred_condition is null or w.preferred_condition = l.condition then 0.1 else 0 end
      )::numeric(5,4) as score
    ) s
   where w.school_id = l.school_id
     and w.status = 'active'
     and w.deleted_at is null
     and w.user_id <> l.owner_id
     and (l.post_type <> 'swap' or w.swap_acceptable)
     and s.score >= 0.25
  on conflict (wishlist_item_id, listing_id) do update set score = excluded.score;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function app.match_listing_to_wishlists(uuid) from public;
grant execute on function app.match_listing_to_wishlists(uuid) to service_role;

create or replace function app.trg_match_wishlists()
returns trigger language plpgsql security definer
set search_path = app, public, pg_catalog
as $$
begin
  perform app.match_listing_to_wishlists(new.id);
  return null;
end;
$$;
revoke execute on function app.trg_match_wishlists() from public;

-- Recompute matches whenever a new active listing appears.
create trigger listings_wishlist_match after insert on listings
  for each row when (new.status = 'active' and new.deleted_at is null)
  execute function app.trg_match_wishlists();

-- ------------------------------------------------------------------ RLS -------
alter table wishlist_items enable row level security;
alter table wishlist_matches enable row level security;

-- Wishlists are visible to verified members of the school (so they surface
-- throughout the product / student stalls), plus staff and platform. Others see
-- only ACTIVE, non-deleted items; the owner sees all of their own.
create policy wishlist_items_select on wishlist_items for select to authenticated
  using (
    (app.is_verified_member(school_id) or app.is_school_staff(school_id) or app.is_platform_admin())
    and (deleted_at is null or user_id = auth.uid() or app.is_school_staff(school_id) or app.is_platform_admin())
    and (status = 'active' or user_id = auth.uid() or app.is_school_staff(school_id) or app.is_platform_admin())
  );
create policy wishlist_items_insert on wishlist_items for insert to authenticated
  with check (user_id = auth.uid() and app.is_verified_member(school_id));
create policy wishlist_items_update on wishlist_items for update to authenticated
  using (
    (user_id = auth.uid() and app.is_verified_member(school_id))
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator')
    or app.is_platform_admin()
  )
  with check (
    (user_id = auth.uid() and app.is_verified_member(school_id))
    or app.has_school_role(school_id, 'school_owner', 'school_admin', 'school_moderator')
    or app.is_platform_admin()
  );
-- No DELETE policy: wishlists are soft-deleted via UPDATE deleted_at.

-- A user reads matches for THEIR OWN wishlist items; staff/platform may read.
-- Rows are written only by the SECURITY DEFINER matcher (no client write policy).
create policy wishlist_matches_select on wishlist_matches for select to authenticated
  using (
    exists (select 1 from wishlist_items w where w.id = wishlist_item_id and w.user_id = auth.uid())
    or app.is_school_staff(school_id)
    or app.is_platform_admin()
  );

-- --------------------------------------------------------------- grants -------
-- 0015 granted table privileges to the roles for tables existing THEN; new tables
-- need explicit grants. RLS still narrows access to the right rows.
grant select, insert, update on wishlist_items to authenticated;   -- soft-delete only (no DELETE)
grant all on wishlist_items to service_role;
-- Matches are read-only for clients; the matcher (SECURITY DEFINER) writes them.
grant select on wishlist_matches to authenticated;
grant all on wishlist_matches to service_role;

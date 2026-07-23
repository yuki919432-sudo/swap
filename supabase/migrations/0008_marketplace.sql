-- 0008_marketplace.sql
-- Listings and related marketplace tables.

-- Platform-managed prohibited categories, enforced by trigger on listings.
create table prohibited_categories (
  category   text primary key,
  created_at timestamptz not null default now()
);
comment on table prohibited_categories is 'Platform-wide banned categories. Enforced by trigger on listings.';

create table listings (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools (id) on delete cascade,
  owner_id      uuid not null references users (id) on delete cascade,
  post_type     listing_post_type not null,
  title         text not null check (length(btrim(title)) between 1 and 120),
  description   text not null check (length(description) between 1 and 2000),
  category      text not null,
  condition     item_condition,
  desired_item  text check (desired_item is null or length(desired_item) <= 120),
  handoff_location_id uuid references safe_handoff_locations (id) on delete set null,
  status        listing_status not null default 'active',
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
comment on table listings is 'Marketplace posts (give/swap/looking_for/borrow/lend). Soft-deleted, never hard-deleted by clients.';
create index listings_school_status_idx on listings (school_id, status) where deleted_at is null;
create index listings_owner_idx on listings (owner_id);
create index listings_category_idx on listings (school_id, category) where deleted_at is null;
-- Trigram search over title + description (search UI arrives in Phase 1B).
create index listings_title_trgm_idx on listings using gin (title gin_trgm_ops);
create index listings_desc_trgm_idx on listings using gin (description gin_trgm_ops);

create table listing_images (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  school_id  uuid not null references schools (id) on delete cascade,
  storage_path text not null,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index listing_images_listing_idx on listing_images (listing_id, position);

create table saved_listings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  listing_id uuid not null references listings (id) on delete cascade,
  school_id  uuid not null references schools (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);
create index saved_listings_user_idx on saved_listings (user_id);

-- Looking-For matches (matching engine is Phase 4; schema is defined now).
create table looking_for_matches (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references schools (id) on delete cascade,
  looking_for_listing_id uuid not null references listings (id) on delete cascade,
  matched_listing_id    uuid not null references listings (id) on delete cascade,
  score                 numeric(5,4) not null default 0,
  created_at            timestamptz not null default now(),
  unique (looking_for_listing_id, matched_listing_id)
);
create index looking_for_matches_school_idx on looking_for_matches (school_id);

-- Reject prohibited categories at write time.
create or replace function app.reject_prohibited_category()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from prohibited_categories p where p.category = lower(new.category)) then
    raise exception 'category_prohibited: %', new.category
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger listings_reject_prohibited_category
  before insert or update of category on listings
  for each row execute function app.reject_prohibited_category();

create trigger listings_set_updated_at before update on listings
  for each row execute function app.set_updated_at();

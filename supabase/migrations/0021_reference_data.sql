-- 0021_reference_data.sql
-- Platform-wide reference data that is NOT environment-specific (safe to ship in
-- every environment, unlike dev seed data). Keep in sync with
-- packages/types/src/enums.ts (PROHIBITED_CATEGORIES).

insert into prohibited_categories (category) values
  ('weapons'),
  ('drugs'),
  ('alcohol'),
  ('nicotine'),
  ('stolen_goods'),
  ('counterfeit'),
  ('prescription_medication'),
  ('sexually_explicit'),
  ('dangerous_materials'),
  ('illegal_services')
on conflict (category) do nothing;

-- Baseline feature flags (all off by default; enabled per-school later).
insert into feature_flags (key, description, enabled_globally) values
  ('borrow_lend', 'Borrow/Lend marketplace post types', false),
  ('looking_for_matching', 'Automatic Looking-For matching suggestions', false),
  ('impact_dashboard', 'School impact/analytics dashboard', false),
  ('multi_school_membership', 'Allow one user to belong to multiple schools at once', false)
on conflict (key) do nothing;

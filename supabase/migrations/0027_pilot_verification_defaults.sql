-- 0027_pilot_verification_defaults.sql
-- Correction: student roster access is OPTIONAL and must never be a dependency.
-- A pilot must be fully usable without any roster integration.
--
-- Practical verification priority for the initial pilot:
--   1. School-specific invitation codes
--   2. Manual membership requests + administrator approval
--   3. School email OTP — only where deliverability works
--   4. Google / Microsoft school-account auth — only where the institution
--      permits the OAuth application
--   5. Student roster matching — only when a school explicitly and lawfully
--      provides roster data (a configurable optional adapter)
--
-- Default pilot configuration for a NEW school therefore enables ONLY invitation
-- codes + manual approval. Email OTP is added by the school after deliverability
-- is confirmed; Google/Microsoft OAuth after the institution permits it; roster
-- only when lawfully provided. None of these are required to create a school,
-- launch a pilot, approve members, or use the marketplace/community/admin tools.
alter table school_settings
  alter column enabled_verification_methods
  set default array['invite_code','manual']::verification_method[];

comment on column school_settings.enabled_verification_methods is
  'Verification methods a school has turned on. Pilot default: invite_code + manual. '
  'email_otp is opt-in after deliverability is confirmed; google/microsoft are opt-in '
  'once the institution permits the OAuth app; roster is an OPTIONAL adapter, enabled '
  'only when a school lawfully provides roster data. Roster is never a dependency.';

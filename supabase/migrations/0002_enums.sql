-- 0002_enums.sql
-- Enumerated types. These MUST stay identical to packages/types/src/enums.ts.
-- Adding a value requires a migration (ALTER TYPE ... ADD VALUE) plus a matching
-- edit to the TypeScript source of truth.

create type school_status as enum ('active', 'disabled', 'pending');

create type membership_status as enum (
  'pending', 'verified', 'rejected', 'suspended', 'left', 'expired'
);

create type membership_request_status as enum ('pending', 'approved', 'rejected');

create type verification_method as enum (
  'google', 'microsoft', 'email_otp', 'roster', 'invite_code', 'manual'
);

create type school_role as enum (
  'school_owner', 'school_admin', 'school_moderator', 'membership_reviewer', 'event_reviewer'
);

create type platform_role as enum ('platform_owner', 'platform_admin', 'platform_support');

create type listing_post_type as enum ('give', 'swap', 'looking_for', 'borrow', 'lend');

create type listing_status as enum (
  'draft', 'active', 'reserved', 'in_transaction', 'completed', 'expired', 'removed'
);

create type item_condition as enum ('new', 'like_new', 'good', 'fair', 'poor');

create type reservation_status as enum ('active', 'released', 'completed', 'cancelled');

create type offer_status as enum (
  'draft', 'sent', 'accepted', 'declined', 'countered',
  'cancelled', 'expired', 'handoff_pending', 'completed', 'disputed'
);

create type offer_item_direction as enum ('offered', 'requested');

create type transaction_status as enum (
  'pending', 'handoff_pending', 'completed', 'disputed', 'cancelled'
);

create type conversation_context as enum ('listing', 'event', 'community_post', 'direct');

create type community_post_type as enum (
  'volunteer', 'club_recruitment', 'project_recruitment',
  'study_group', 'sports_activity', 'looking_for_members', 'general'
);

create type community_post_status as enum (
  'draft', 'pending_approval', 'published', 'closed', 'removed'
);

create type event_status as enum (
  'draft', 'pending_approval', 'published', 'full', 'cancelled', 'completed', 'removed'
);

create type event_approval_policy as enum (
  'immediate', 'all_require_approval', 'category_based', 'approved_organizers_only'
);

create type report_target_type as enum (
  'listing', 'event', 'community_post', 'user', 'message', 'conversation', 'transaction'
);

create type report_reason as enum (
  'inappropriate_content', 'harassment', 'spam', 'fraud',
  'misleading', 'unsafe_behavior', 'prohibited_item', 'other'
);

create type report_status as enum ('open', 'reviewing', 'resolved', 'dismissed', 'escalated');

create type moderation_action_type as enum (
  'hide_content', 'remove_content', 'warn_user',
  'suspend_user', 'remove_membership', 'dismiss', 'restore_content'
);

create type notification_type as enum (
  'new_message', 'new_offer', 'offer_accepted', 'offer_declined', 'counteroffer',
  'handoff_reminder', 'handoff_confirmation', 'transaction_completed', 'transaction_disputed',
  'looking_for_match', 'event_joined', 'event_reminder', 'event_update', 'event_cancelled',
  'membership_approved', 'membership_rejected', 'announcement', 'moderation_result'
);

create type device_platform as enum ('ios', 'android', 'web');

create type invitation_type as enum ('shared', 'single_use');

create type account_status as enum ('active', 'deletion_requested', 'deactivated', 'anonymized');

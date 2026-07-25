/** Human-readable labels + glyphs for enum values. Presentation only. */
import type { CommunityPostType, ItemCondition, ListingPostType } from "@swap/types";
import type { InstitutionType } from "../domain/models";

export const postTypeLabel: Record<ListingPostType, string> = {
  give: "Give",
  swap: "Swap",
  looking_for: "Looking For",
  borrow: "Borrow",
  lend: "Lend",
};

export const postTypeEmoji: Record<ListingPostType, string> = {
  give: "🎁",
  swap: "🔄",
  looking_for: "🔍",
  borrow: "🤲",
  lend: "📦",
};

export const conditionLabel: Record<ItemCondition, string> = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export const communityTypeLabel: Record<CommunityPostType, string> = {
  volunteer: "Volunteer",
  club_recruitment: "Club",
  project_recruitment: "Project",
  study_group: "Study group",
  sports_activity: "Sports",
  looking_for_members: "Recruiting",
  general: "General",
};

export const communityTypeEmoji: Record<CommunityPostType, string> = {
  volunteer: "🤝",
  club_recruitment: "🎪",
  project_recruitment: "🚀",
  study_group: "📚",
  sports_activity: "🏀",
  looking_for_members: "📣",
  general: "💬",
};

export const institutionLabel: Record<InstitutionType, string> = {
  high_school: "High school",
  university: "University",
};

/** Turn a snake_case category into Title Case for display. */
export const categoryLabel = (category: string): string =>
  category
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export const verificationMethodLabel: Record<string, string> = {
  google: "Google",
  microsoft: "Microsoft",
  email_otp: "Email OTP",
  roster: "Roster",
  invite_code: "Invite code",
  manual: "Manual approval",
};

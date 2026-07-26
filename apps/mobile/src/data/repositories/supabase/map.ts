/**
 * Row → domain mappers for the Supabase-backed repositories, plus small display
 * helpers. Real users have no stored avatar emoji, so we derive a stable one from
 * their name for the emoji-avatar UI (no PII, deterministic).
 */
import type { Listing, ImageRef, OwnerPreview } from "../../../domain/models";
import type { ListingRow, UserRow } from "../../supabase/database.types";

const AVATAR_EMOJIS = ["🌸", "🌿", "⚡", "🎧", "🚲", "🎬", "🧗", "🪴", "🌱", "🦊", "🐢", "🎨", "🏀", "📚", "🍀"];

/** Deterministic emoji avatar from a name/id (stable across renders). */
export function emojiForKey(key: string): string {
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum = (sum + key.charCodeAt(i)) % 997;
  return AVATAR_EMOJIS[sum % AVATAR_EMOJIS.length]!;
}

export function ownerFromUserRow(user: Pick<UserRow, "id" | "display_name" | "avatar_url"> | null, verified: boolean): OwnerPreview {
  const name = user?.display_name ?? "Student";
  return { displayName: name, avatarEmoji: emojiForKey(user?.id ?? name), verified };
}

/** Build a Listing from a listings row + resolved image refs + owner preview. */
export function rowToListing(row: ListingRow, images: ImageRef[], owner: OwnerPreview): Listing {
  return {
    id: row.id,
    schoolId: row.school_id,
    postType: row.post_type,
    status: row.status,
    title: row.title,
    description: row.description,
    category: row.category,
    condition: row.condition,
    desiredItem: row.desired_item,
    images,
    handoffLocation: null, // real handoff locations are a predefined-list feature (not free text)
    owner,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    demoLocal: false,
  };
}

/** A storage path or already-resolved URL becomes a renderable image ref. */
export const uriImage = (uri: string): ImageRef => ({ kind: "local", value: uri });

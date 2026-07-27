/**
 * Synthetic messaging helpers for demo mode. Resolves a user id to a display
 * "counterpart" (name + emoji) by scanning the existing synthetic cast — profiles,
 * listing owners, stall owners, and market hosts — so a conversation shows a
 * friendly name without inventing any real person. No emails, ever.
 */
import type { Counterpart } from "../../domain/models";
import { demoProfiles } from "./profiles";
import { demoListings } from "./listings";
import { demoStalls } from "./stalls";
import { demoMarkets } from "./markets";

/** Deterministic emoji fallback for an unknown id (never a real avatar). */
const EMOJIS = ["🦊", "🐢", "🦉", "🐸", "🐝", "🦄", "🐙", "🦋"];
const emojiFor = (key: string): string => {
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum = (sum + key.charCodeAt(i)) % 997;
  return EMOJIS[sum % EMOJIS.length]!;
};

export function demoCounterpart(userId: string): Counterpart {
  const profile = demoProfiles.find((p) => p.id === userId);
  if (profile) {
    return { userId, displayName: profile.displayName, avatarEmoji: profile.avatarEmoji, verified: profile.membershipStatus === "verified" };
  }
  const listing = demoListings.find((l) => l.ownerId === userId);
  if (listing) return { userId, displayName: listing.owner.displayName, avatarEmoji: listing.owner.avatarEmoji, verified: listing.owner.verified };
  const stall = demoStalls.find((s) => s.userId === userId);
  if (stall) return { userId, displayName: stall.owner.displayName, avatarEmoji: stall.owner.avatarEmoji, verified: stall.owner.verified };
  const market = demoMarkets.find((m) => m.hostUserId === userId);
  if (market) return { userId, displayName: market.host.displayName, avatarEmoji: market.host.avatarEmoji, verified: market.host.verified };
  return { userId, displayName: "A student", avatarEmoji: emojiFor(userId), verified: true };
}

/** School of a demo user id, if resolvable from the profile cast. */
export function demoUserSchool(userId: string): string | null {
  return demoProfiles.find((p) => p.id === userId)?.schoolId ?? null;
}

const minsAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();

/** A static demo conversation (merged read-only into the Inbox for its participants). */
export interface DemoConversation {
  id: string;
  schoolId: string;
  a: string;
  b: string;
  context: { kind: "listing" | "market" | "stall" | "none"; id: string | null };
}

/** Seed conversations so the Inbox isn't empty for the demo personas. */
export const demoConversations: DemoConversation[] = [
  { id: "conv-demo-uni", schoolId: "school-uni", a: "profile-uni-verified", b: "profile-uni-moderator", context: { kind: "listing", id: "l-uni-4" } },
  { id: "conv-demo-hs", schoolId: "school-hs", a: "profile-hs-verified", b: "profile-hs-pending", context: { kind: "listing", id: "l-hs-3" } },
];

/** Messages for the static demo conversations (system opener + a short exchange). */
export const demoMessages: Record<string, { senderId: string | null; body: string; createdAt: string }[]> = {
  "conv-demo-uni": [
    { senderId: null, body: "Conversation started", createdAt: minsAgo(60) },
    { senderId: "profile-uni-verified", body: "Hey! Is the physics lab coat still up for lending?", createdAt: minsAgo(58) },
    { senderId: "profile-uni-moderator", body: "It is! Size M — want to grab it this week?", createdAt: minsAgo(40) },
  ],
  "conv-demo-hs": [
    { senderId: null, body: "Conversation started", createdAt: minsAgo(120) },
    { senderId: "profile-hs-pending", body: "Hi, do you still have the graphing calculator?", createdAt: minsAgo(115) },
  ],
};


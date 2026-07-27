/**
 * Synthetic demo temporary markets + their participants and listing associations.
 * A market is a themed, time-boxed pop-up hosted by a student/club; a listing may
 * belong to zero or more markets while still living in the permanent Campus Market
 * and its owner's stall. All fictional; no real data, no map/address data.
 */
import type { ImageRef, OwnerPreview } from "../../domain/models";
import type { MarketStatus } from "@swap/types";

export interface DemoMarket {
  id: string;
  schoolId: string;
  hostUserId: string;
  host: OwnerPreview;
  hostLabel: string | null;
  title: string;
  description: string | null;
  coverImage: ImageRef | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  handoffInstructions: string | null;
  allowedCategories: string[];
  allowsRegulated: boolean;
  status: MarketStatus;
  createdAt: string;
}

const hoursAgo = (h: number): string => new Date(Date.now() - h * 3600_000).toISOString();
const hoursAhead = (h: number): string => new Date(Date.now() + h * 3600_000).toISOString();
const owner = (displayName: string, avatarEmoji: string, verified = true): OwnerPreview => ({ displayName, avatarEmoji, verified });
const cover = (emoji: string): ImageRef => ({ kind: "placeholder", value: emoji });

export const demoMarkets: DemoMarket[] = [
  {
    id: "market-uni-moveout",
    schoolId: "school-uni",
    hostUserId: "profile-uni-verified",
    host: owner("Maya", "🌸"),
    hostLabel: "West Hall RA",
    title: "Dorm Move-Out Sale",
    description: "End-of-term clear-out — dorm gear, furniture, and small appliances before everyone heads home.",
    coverImage: cover("📦"),
    startsAt: hoursAgo(2),
    endsAt: hoursAhead(48),
    location: "West Quad lawn",
    handoffInstructions: "Meet at the tables by the West Quad entrance during posted hours.",
    allowedCategories: ["dormitory_items", "furniture", "electronics"],
    allowsRegulated: false,
    status: "active",
    createdAt: hoursAgo(30),
  },
  {
    id: "market-uni-sneaker",
    schoolId: "school-uni",
    hostUserId: "u-theo",
    host: owner("Theo", "🧗"),
    hostLabel: "Sneaker Club",
    title: "Campus Sneaker & Fit Swap",
    description: "Trade shoes, jackets, and everyday fits. Digital-only listings welcome — arrange your own handoff.",
    coverImage: cover("👟"),
    startsAt: hoursAhead(72),
    endsAt: hoursAhead(96),
    location: null,
    handoffInstructions: null,
    allowedCategories: ["shoes", "clothing", "sports_equipment"],
    allowsRegulated: false,
    status: "upcoming",
    createdAt: hoursAgo(18),
  },
  {
    id: "market-uni-finals",
    schoolId: "school-uni",
    hostUserId: "profile-uni-moderator",
    host: owner("Devin", "🛡️"),
    hostLabel: "Study Commons",
    title: "Finals Week Textbook Giveaway",
    description: "Pass your used textbooks forward. This market wrapped up last term — kept here as an example of an ended market.",
    coverImage: cover("📚"),
    startsAt: hoursAgo(400),
    endsAt: hoursAgo(300),
    location: "Library atrium",
    handoffInstructions: null,
    allowedCategories: ["textbooks", "school_supplies"],
    allowsRegulated: false,
    status: "ended",
    createdAt: hoursAgo(420),
  },
  {
    id: "market-hs-clubfair",
    schoolId: "school-hs",
    hostUserId: "profile-hs-verified",
    host: owner("Alex", "⚡"),
    hostLabel: "Art Club",
    title: "Club Fair Swap Table",
    description: "Clubs sharing supplies and gear at the fall club fair. Bring something, take something.",
    coverImage: cover("🎨"),
    startsAt: hoursAhead(24),
    endsAt: hoursAhead(30),
    location: "Main gym",
    handoffInstructions: "Come by the swap table near the art club booth.",
    allowedCategories: ["art_and_music", "school_supplies", "sports_equipment"],
    allowsRegulated: false,
    status: "upcoming",
    createdAt: hoursAgo(10),
  },
];

/** Seller participation (market_sellers). */
export const demoMarketSellers: { marketId: string; userId: string }[] = [
  { marketId: "market-uni-moveout", userId: "profile-uni-verified" },
  { marketId: "market-uni-moveout", userId: "u-priya" },
  { marketId: "market-uni-sneaker", userId: "u-theo" },
  { marketId: "market-hs-clubfair", userId: "profile-hs-verified" },
];

/** Listing↔market associations (market_listings). listingId → demoListings ids. */
export const demoMarketListings: { marketId: string; listingId: string; userId: string }[] = [
  { marketId: "market-uni-moveout", listingId: "l-uni-1", userId: "profile-uni-verified" },
  { marketId: "market-uni-moveout", listingId: "l-uni-5", userId: "u-jordan" },
  { marketId: "market-uni-moveout", listingId: "l-uni-2", userId: "u-priya" },
  { marketId: "market-uni-sneaker", listingId: "l-uni-7", userId: "u-theo" },
  { marketId: "market-hs-clubfair", listingId: "l-hs-4", userId: "profile-hs-verified" },
];

export const demoMarketById = (id: string): DemoMarket | undefined => demoMarkets.find((m) => m.id === id);
export const demoMarketsForSchool = (schoolId: string): DemoMarket[] => demoMarkets.filter((m) => m.schoolId === schoolId);

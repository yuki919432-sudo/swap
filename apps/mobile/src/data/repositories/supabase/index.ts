/**
 * Builds the Supabase-backed repository set (real backend). Drafts stay LOCAL (an
 * on-device convenience) even in real mode — publishing a draft creates a real
 * listing through the marketplace repository. Community/Inbox are stubs until their
 * milestones. Every repo implements the same interface the screens already use, so
 * no screen changes are needed to switch data sources.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { JsonStore, type KeyValueStore } from "../../storage";
import { MockDraftListingsRepository } from "../mock";
import type { Repositories } from "../types";
import { SupabaseMarketplaceRepository, type ImageReader } from "./marketplace";
import { SupabaseSavedListingsRepository } from "./saved";
import { SupabaseSessionRepository } from "./session";
import { SupabaseCommunityRepository } from "./community";
import { SupabaseWishlistRepository } from "./wishlist";
import { SupabaseStallRepository } from "./stall";
import { SupabaseMarketRepository } from "./market";
import { SupabaseCampusMarketRepository } from "./campusMarket";
import { SupabaseMessagingRepository } from "./messaging";
import { SupabaseOfferRepository } from "./offers";

export function createSupabaseRepositories(
  client: SupabaseClient,
  kv: KeyValueStore,
  opts?: { imageReader?: ImageReader },
): Repositories {
  const store = new JsonStore(kv);
  const stalls = new SupabaseStallRepository(client);
  return {
    session: new SupabaseSessionRepository(client),
    marketplace: new SupabaseMarketplaceRepository(client, opts),
    community: new SupabaseCommunityRepository(),
    messaging: new SupabaseMessagingRepository(client),
    saved: new SupabaseSavedListingsRepository(client),
    drafts: new MockDraftListingsRepository(store),
    wishlist: new SupabaseWishlistRepository(client),
    stalls,
    markets: new SupabaseMarketRepository(client),
    campusMarket: new SupabaseCampusMarketRepository(client, stalls),
    offers: new SupabaseOfferRepository(client),
  };
}

export {
  SupabaseMarketplaceRepository,
  SupabaseSavedListingsRepository,
  SupabaseSessionRepository,
  SupabaseWishlistRepository,
  SupabaseStallRepository,
  SupabaseMarketRepository,
  SupabaseCampusMarketRepository,
  SupabaseMessagingRepository,
  SupabaseOfferRepository,
};
export type { ImageReader };

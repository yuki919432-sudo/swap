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
import { SupabaseCommunityRepository, SupabaseInboxRepository } from "./community";

export function createSupabaseRepositories(
  client: SupabaseClient,
  kv: KeyValueStore,
  opts?: { imageReader?: ImageReader },
): Repositories {
  const store = new JsonStore(kv);
  return {
    session: new SupabaseSessionRepository(client),
    marketplace: new SupabaseMarketplaceRepository(client, opts),
    community: new SupabaseCommunityRepository(),
    inbox: new SupabaseInboxRepository(),
    saved: new SupabaseSavedListingsRepository(client),
    drafts: new MockDraftListingsRepository(store),
  };
}

export { SupabaseMarketplaceRepository, SupabaseSavedListingsRepository, SupabaseSessionRepository };
export type { ImageReader };

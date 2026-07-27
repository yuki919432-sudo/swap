/**
 * Community is out of scope for the current checkpoints; the real implementation
 * arrives with the community milestone. For now it returns empty so the screen
 * renders its (unchanged) empty state against the real backend. (Messaging now has
 * a real SupabaseMessagingRepository — see ./messaging.)
 */
import type { CommunityItem } from "../../../domain/models";
import type { CommunityRepository } from "../types";

export class SupabaseCommunityRepository implements CommunityRepository {
  async list(): Promise<CommunityItem[]> {
    return [];
  }
}

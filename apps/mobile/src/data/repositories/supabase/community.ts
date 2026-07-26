/**
 * Community + Inbox are out of scope for the marketplace checkpoint. Real
 * implementations arrive with the community/messaging milestones; for now these
 * return empty so the screens render their (unchanged) empty states against the
 * real backend rather than showing synthetic demo content.
 */
import type { CommunityItem, InboxThread } from "../../../domain/models";
import type { CommunityRepository, InboxRepository } from "../types";

export class SupabaseCommunityRepository implements CommunityRepository {
  async list(): Promise<CommunityItem[]> {
    return [];
  }
}

export class SupabaseInboxRepository implements InboxRepository {
  async list(): Promise<InboxThread[]> {
    return [];
  }
}

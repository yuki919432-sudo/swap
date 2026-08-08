/**
 * Mock repository implementations for demo mode.
 *
 * Each implements a repository interface from ./types using synthetic data +
 * local persistence (JsonStore). Screens depend on the interfaces, so replacing
 * these with Supabase-backed implementations later requires no screen changes.
 */
import type {
  CommunityItem,
  Conversation,
  ConversationContext,
  ConversationDetail,
  DemoSchool,
  Listing,
  Market,
  MarketDetail,
  Message,
  OwnerPreview,
  Stall,
  StallDetail,
  WishlistItem,
  WishlistMatch,
  WishlistMatchDetail,
} from "../../domain/models";
import type { ListingPostType, ListingStatus, MarketStatus, WishlistStatus } from "@swap/types";
import { LISTING_POST_TYPE } from "@swap/types";
import {
  type DemoMarket,
  type DemoStall,
  demoCommunity,
  demoConversations,
  demoCounterpart,
  demoMessages,
  demoUserSchool,
  demoListings,
  demoMarketById,
  demoMarketListings,
  demoMarketsForSchool,
  demoMarketSellers,
  demoProfileById,
  demoProfilesForSchool,
  demoProfiles,
  demoSchoolById,
  demoSchools,
  demoStallById,
  demoStalls,
  demoStallsForSchool,
  demoWishlist,
} from "../demo";
import { JsonStore, StorageKeys, type KeyValueStore } from "../storage";
import { newId } from "../../lib/id";
import { scoreWishlistMatch, WISHLIST_MATCH_THRESHOLD } from "../../recommendations/scoring";
import { applyMarketplaceQuery } from "./marketplaceQuery";
import { buildDiscoveryShelves, buildDemandClusters } from "./campusDiscovery";
import { MockOfferRepository } from "./mockOffers";
import type {
  CampusMarketRepository,
  CommunityRepository,
  DemandCluster,
  DiscoveryShelf,
  DraftListing,
  DraftListingsRepository,
  MarketplaceQuery,
  MarketplaceRepository,
  MarketRepository,
  Membership,
  MembershipRepository,
  MessagingRepository,
  NewReport,
  BlockedUser,
  ReportRepository,
  NewListing,
  NewMarket,
  NewWishlistItem,
  Repositories,
  SavedListingsRepository,
  SessionRepository,
  SessionState,
  StallRepository,
  StartConversationInput,
  Unsubscribe,
  WishlistPatch,
  WishlistRepository,
} from "./types";

/* ----------------------------------------------------------------- session */

export class MockSessionRepository implements SessionRepository {
  constructor(private readonly store: JsonStore) {}

  async listSchools(): Promise<DemoSchool[]> {
    return demoSchools;
  }
  async listProfiles(schoolId: string) {
    return demoProfilesForSchool(schoolId);
  }
  async getCurrent(): Promise<SessionState | null> {
    const profileId = await this.store.read<string | null>(StorageKeys.selectedProfile, null);
    if (!profileId) return null;
    const profile = demoProfileById(profileId);
    if (!profile) return null;
    const school = demoSchoolById(profile.schoolId);
    if (!school) return null;
    return { school, profile };
  }
  async select(profileId: string): Promise<SessionState> {
    const profile = demoProfileById(profileId);
    if (!profile) throw new Error(`unknown demo profile: ${profileId}`);
    const school = demoSchoolById(profile.schoolId);
    if (!school) throw new Error(`unknown demo school: ${profile.schoolId}`);
    await this.store.write(StorageKeys.selectedProfile, profileId);
    return { school, profile };
  }
  async clear(): Promise<void> {
    await this.store.remove(StorageKeys.selectedProfile);
  }
}

/* -------------------------------------------------------------- marketplace */

export class MockMarketplaceRepository implements MarketplaceRepository {
  constructor(private readonly store: JsonStore) {}

  private async allForSchool(schoolId: string): Promise<Listing[]> {
    const published = await this.store.read<Listing[]>(StorageKeys.publishedDemoListings, []);
    return [...published.filter((l) => l.schoolId === schoolId), ...demoListings.filter((l) => l.schoolId === schoolId)];
  }

  async list(query: MarketplaceQuery): Promise<Listing[]> {
    return applyMarketplaceQuery(await this.allForSchool(query.schoolId), query);
  }
  async listMine(schoolId: string): Promise<Listing[]> {
    const uid = await this.store.read<string | null>(StorageKeys.selectedProfile, null);
    const me = uid ? demoProfileById(uid) : null;
    const all = await this.allForSchool(schoolId);
    // Demo listings carry only an owner NAME; a user's items are those under their name.
    return me ? all.filter((l) => l.owner.displayName === me.displayName) : all.filter((l) => l.demoLocal);
  }
  async getById(id: string): Promise<Listing | null> {
    const published = await this.store.read<Listing[]>(StorageKeys.publishedDemoListings, []);
    return published.find((l) => l.id === id) ?? demoListings.find((l) => l.id === id) ?? null;
  }
  async categoriesForSchool(schoolId: string): Promise<string[]> {
    const all = await this.allForSchool(schoolId);
    return [...new Set(all.map((l) => l.category))].sort();
  }
  async createListing(input: NewListing, owner: OwnerPreview): Promise<Listing> {
    const listing: Listing = {
      id: newId("listing"),
      schoolId: input.schoolId,
      ownerId: (await this.store.read<string | null>(StorageKeys.selectedProfile, null)) ?? "demo-user",
      postType: input.postType,
      status: "active",
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      condition: input.condition,
      desiredItem: input.desiredItem?.trim() || null,
      images: input.images.length ? input.images : [{ kind: "placeholder", value: "📦" }],
      handoffLocation: input.handoffLocation?.trim() || null,
      owner,
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      demoLocal: true,
    };
    const published = await this.store.read<Listing[]>(StorageKeys.publishedDemoListings, []);
    await this.store.write(StorageKeys.publishedDemoListings, [listing, ...published.filter((l) => l.id !== listing.id)]);
    return listing;
  }
  async deleteListing(id: string): Promise<void> {
    const published = await this.store.read<Listing[]>(StorageKeys.publishedDemoListings, []);
    await this.store.write(
      StorageKeys.publishedDemoListings,
      published.filter((l) => l.id !== id),
    );
  }
}

/* ---------------------------------------------------------------- community */

export class MockCommunityRepository implements CommunityRepository {
  async list(schoolId: string): Promise<CommunityItem[]> {
    return demoCommunity.filter((c) => c.schoolId === schoolId);
  }
}

/* ---------------------------------------------------------------- messaging */

/** Stored (dynamic) conversation row for demo mode. */
interface StoredConversation {
  id: string;
  schoolId: string;
  participants: [string, string];
  context: { kind: "listing" | "market" | "stall" | "none"; id: string | null };
  status: "active" | "archived" | "closed";
  createdAt: string;
  lastMessageAt: string;
}
interface StoredMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  type: "text" | "system";
  body: string;
  createdAt: string;
}

/** Deterministic mock messaging over the local KV store + static demo seed. */
export class MockMessagingRepository implements MessagingRepository {
  constructor(private readonly store: JsonStore) {}

  private me(): Promise<string> {
    return currentUser(this.store);
  }
  private stored(): Promise<StoredConversation[]> {
    return this.store.read<StoredConversation[]>(StorageKeys.demoConversations, []);
  }
  private storedMsgs(): Promise<StoredMessage[]> {
    return this.store.read<StoredMessage[]>(StorageKeys.demoMessages, []);
  }
  private reads(): Promise<Record<string, string>> {
    return this.store.read<Record<string, string>>(StorageKeys.demoReadState, {});
  }
  private blocks(): Promise<string[]> {
    return this.store.read<string[]>(StorageKeys.demoBlocks, []);
  }

  /** Static demo conversations for the current user, mapped to StoredConversation. */
  private seedFor(uid: string): StoredConversation[] {
    return demoConversations
      .filter((c) => c.a === uid || c.b === uid)
      .map((c) => {
        const msgs = demoMessages[c.id] ?? [];
        const last = msgs[msgs.length - 1];
        return {
          id: c.id,
          schoolId: c.schoolId,
          participants: [c.a, c.b] as [string, string],
          context: c.context,
          status: "active" as const,
          createdAt: msgs[0]?.createdAt ?? new Date().toISOString(),
          lastMessageAt: last?.createdAt ?? new Date().toISOString(),
        };
      });
  }

  private async allConversations(uid: string): Promise<StoredConversation[]> {
    const dynamic = (await this.stored()).filter((c) => c.participants.includes(uid));
    const seedIds = new Set(dynamic.map((c) => c.id));
    const seed = this.seedFor(uid).filter((c) => !seedIds.has(c.id));
    return [...dynamic, ...seed];
  }

  private async messagesFor(conversationId: string): Promise<StoredMessage[]> {
    const seeded: StoredMessage[] = (demoMessages[conversationId] ?? []).map((m, i) => ({
      id: `${conversationId}:seed:${i}`,
      conversationId,
      senderId: m.senderId,
      type: m.senderId === null ? "system" : "text",
      body: m.body,
      createdAt: m.createdAt,
    }));
    const dynamic = (await this.storedMsgs()).filter((m) => m.conversationId === conversationId);
    return [...seeded, ...dynamic].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  private resolveContext(kind: "listing" | "market" | "stall" | "none", id: string | null): ConversationContext {
    if (kind === "listing" && id) {
      const l = demoListings.find((x) => x.id === id);
      return { kind, id, label: l?.title ?? "Listing", subtitle: l ? "Listing" : "Listing no longer available", image: l?.images[0] ?? null, unavailable: !l };
    }
    if (kind === "market" && id) {
      const m = demoMarketById(id);
      return { kind, id, label: m?.title ?? "Market", subtitle: m ? "Temporary market" : "Market ended", image: m?.coverImage ?? null, unavailable: !m };
    }
    if (kind === "stall" && id) {
      const s = demoStallById(id);
      return { kind, id, label: s ? `${s.owner.displayName}'s stall` : "Stall", subtitle: "Student stall", image: null, unavailable: !s };
    }
    return { kind: "none", id: null, label: "Direct message", subtitle: null, image: null, unavailable: false };
  }

  private async toConversation(c: StoredConversation, uid: string, msgs: StoredMessage[]): Promise<Conversation> {
    const otherId = c.participants.find((p) => p !== uid) ?? c.participants[0];
    // Read state is keyed per-user so each participant tracks their own unread.
    const lastRead = (await this.reads())[`${uid}:${c.id}`];
    const unread = msgs.filter((m) => m.senderId !== uid && (!lastRead || Date.parse(m.createdAt) > Date.parse(lastRead))).length;
    const last = msgs[msgs.length - 1];
    return {
      id: c.id,
      schoolId: c.schoolId,
      counterpart: demoCounterpart(otherId),
      context: this.resolveContext(c.context.kind, c.context.id),
      lastPreview: last ? (last.type === "system" ? last.body : last.body) : "",
      lastMessageAt: c.lastMessageAt,
      unread,
    };
  }

  async listConversations(schoolId: string): Promise<Conversation[]> {
    const uid = await this.me();
    const convs = (await this.allConversations(uid)).filter((c) => c.schoolId === schoolId);
    const out = await Promise.all(convs.map(async (c) => this.toConversation(c, uid, await this.messagesFor(c.id))));
    return out.sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
  }

  async getConversation(id: string): Promise<ConversationDetail | null> {
    const uid = await this.me();
    const c = (await this.allConversations(uid)).find((x) => x.id === id);
    if (!c) return null;
    const rows = await this.messagesFor(id);
    const messages: Message[] = rows.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      type: m.type,
      body: m.body,
      createdAt: m.createdAt,
      editedAt: null,
      deletedAt: null,
      mine: m.senderId === uid,
    }));
    const conversation = await this.toConversation(c, uid, rows);
    const otherId = c.participants.find((p) => p !== uid) ?? c.participants[0];
    const blockedByMe = (await this.blocks()).includes(otherId);
    const canSend = c.status === "active" && !blockedByMe;
    return { conversation, messages, canSend, blockedByMe };
  }

  async startConversation(input: StartConversationInput): Promise<string> {
    const uid = await this.me();
    if (input.otherUserId === uid) throw new Error("cannot_message_self");
    if ((await this.blocks()).includes(input.otherUserId)) throw new Error("blocked");
    const kind = input.listingId ? "listing" : input.marketId ? "market" : input.stallId ? "stall" : "none";
    const ctxId = input.listingId ?? input.marketId ?? input.stallId ?? null;
    const key = [uid, input.otherUserId].sort().join(":") + ":" + kind + ":" + (ctxId ?? "direct");
    const existing = (await this.allConversations(uid)).find(
      (c) => c.status === "active" && [c.participants[0], c.participants[1]].sort().join(":") + ":" + c.context.kind + ":" + (c.context.id ?? "direct") === key,
    );
    if (existing) return existing.id;

    const schoolId = demoUserSchool(uid) ?? demoUserSchool(input.otherUserId) ?? "school-uni";
    const now = new Date().toISOString();
    const conv: StoredConversation = {
      id: newId("conv"),
      schoolId,
      participants: [uid, input.otherUserId],
      context: { kind, id: ctxId },
      status: "active",
      createdAt: now,
      lastMessageAt: now,
    };
    await this.store.write(StorageKeys.demoConversations, [conv, ...(await this.stored())]);
    const sys: StoredMessage = { id: newId("msg"), conversationId: conv.id, senderId: null, type: "system", body: "Conversation started", createdAt: now };
    await this.store.write(StorageKeys.demoMessages, [...(await this.storedMsgs()), sys]);
    return conv.id;
  }

  async sendMessage(conversationId: string, body: string): Promise<Message> {
    const uid = await this.me();
    const detail = await this.getConversation(conversationId);
    if (!detail) throw new Error("conversation_not_found");
    if (!detail.canSend) throw new Error("cannot_send");
    const now = new Date().toISOString();
    const row: StoredMessage = { id: newId("msg"), conversationId, senderId: uid, type: "text", body: body.trim(), createdAt: now };
    await this.store.write(StorageKeys.demoMessages, [...(await this.storedMsgs()), row]);
    // Bump lastMessageAt for a dynamic conversation (seed rows derive it from messages).
    const stored = await this.stored();
    if (stored.some((c) => c.id === conversationId)) {
      await this.store.write(
        StorageKeys.demoConversations,
        stored.map((c) => (c.id === conversationId ? { ...c, lastMessageAt: now } : c)),
      );
    }
    return { id: row.id, conversationId, senderId: uid, type: "text", body: row.body, createdAt: now, editedAt: null, deletedAt: null, mine: true };
  }

  async markRead(conversationId: string): Promise<void> {
    const uid = await this.me();
    const reads = await this.reads();
    await this.store.write(StorageKeys.demoReadState, { ...reads, [`${uid}:${conversationId}`]: new Date().toISOString() });
  }

  async unreadTotal(): Promise<number> {
    const uid = await this.me();
    const convs = await this.allConversations(uid);
    let total = 0;
    for (const c of convs) total += (await this.toConversation(c, uid, await this.messagesFor(c.id))).unread;
    return total;
  }

  async block(userId: string): Promise<void> {
    const blocks = await this.blocks();
    if (!blocks.includes(userId)) await this.store.write(StorageKeys.demoBlocks, [userId, ...blocks]);
  }
  async unblock(userId: string): Promise<void> {
    await this.store.write(StorageKeys.demoBlocks, (await this.blocks()).filter((b) => b !== userId));
  }

  watchConversation(id: string, onChange: (detail: ConversationDetail) => void): Unsubscribe {
    // Poll-based refresh (no fake realtime). The demo store only changes from this
    // device, so a gentle interval keeps the open thread fresh after local sends.
    const timer = setInterval(() => {
      void this.getConversation(id).then((d) => {
        if (d) onChange(d);
      });
    }, 4000);
    return () => clearInterval(timer);
  }
}

/* ----------------------------------------------------------- saved listings */

export class MockSavedListingsRepository implements SavedListingsRepository {
  constructor(private readonly store: JsonStore) {}

  async list(): Promise<string[]> {
    return this.store.read<string[]>(StorageKeys.savedListings, []);
  }
  async isSaved(listingId: string): Promise<boolean> {
    return (await this.list()).includes(listingId);
  }
  async toggle(listingId: string): Promise<boolean> {
    const current = await this.list();
    const has = current.includes(listingId);
    const next = has ? current.filter((id) => id !== listingId) : [listingId, ...current];
    await this.store.write(StorageKeys.savedListings, next);
    return !has;
  }
}

/* ------------------------------------------------------------------ drafts */

export class MockDraftListingsRepository implements DraftListingsRepository {
  constructor(private readonly store: JsonStore) {}

  async list(): Promise<DraftListing[]> {
    const drafts = await this.store.read<DraftListing[]>(StorageKeys.drafts, []);
    return [...drafts].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }
  async getById(id: string): Promise<DraftListing | null> {
    return (await this.list()).find((d) => d.id === id) ?? null;
  }
  async save(draft: DraftListing): Promise<DraftListing> {
    const drafts = await this.store.read<DraftListing[]>(StorageKeys.drafts, []);
    const next = [draft, ...drafts.filter((d) => d.id !== draft.id)];
    await this.store.write(StorageKeys.drafts, next);
    return draft;
  }
  async remove(id: string): Promise<void> {
    const drafts = await this.store.read<DraftListing[]>(StorageKeys.drafts, []);
    await this.store.write(
      StorageKeys.drafts,
      drafts.filter((d) => d.id !== id),
    );
  }
  async markPublished(id: string, listingId: string): Promise<void> {
    const drafts = await this.store.read<DraftListing[]>(StorageKeys.drafts, []);
    await this.store.write(
      StorageKeys.drafts,
      drafts.map((d) => (d.id === id ? { ...d, publishedListingId: listingId, status: "active" as const } : d)),
    );
  }
}

/* ---------------------------------------------------------------- wishlist */

export class MockWishlistRepository implements WishlistRepository {
  constructor(private readonly store: JsonStore) {}

  private mine(): Promise<WishlistItem[]> {
    return this.store.read<WishlistItem[]>(StorageKeys.demoWishlist, []);
  }
  private async currentUserId(): Promise<string> {
    return (await this.store.read<string | null>(StorageKeys.selectedProfile, null)) ?? "demo-user";
  }

  async listMine(): Promise<WishlistItem[]> {
    // All of the caller's requests regardless of status (cancelled included, so it
    // can be reopened); a hard remove() is what takes an item off the list.
    return this.mine();
  }
  async listForSchool(schoolId: string): Promise<WishlistItem[]> {
    const uid = await this.currentUserId();
    const others = demoWishlist.filter((w) => w.schoolId === schoolId && w.userId !== uid && w.status === "active");
    const mine = (await this.mine()).filter((w) => w.schoolId === schoolId && w.status === "active");
    return [...mine, ...others];
  }
  async create(input: NewWishlistItem): Promise<WishlistItem> {
    const item: WishlistItem = {
      id: newId("wish"),
      schoolId: input.schoolId,
      userId: await this.currentUserId(),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      preferredCategory: input.preferredCategory,
      preferredCondition: input.preferredCondition,
      budgetCents: input.budgetCents,
      swapAcceptable: input.swapAcceptable,
      urgency: input.urgency,
      visibility: input.visibility,
      status: "active",
      showOnStall: false,
      createdAt: new Date().toISOString(),
    };
    await this.store.write(StorageKeys.demoWishlist, [item, ...(await this.mine())]);
    return item;
  }
  async update(id: string, patch: WishlistPatch): Promise<WishlistItem> {
    const items = await this.mine();
    const current = items.find((w) => w.id === id);
    if (!current) throw new Error("wishlist_item_not_found");
    const next: WishlistItem = {
      ...current,
      title: patch.title !== undefined ? patch.title.trim() : current.title,
      description: patch.description !== undefined ? (patch.description?.trim() || null) : current.description,
      preferredCategory: patch.preferredCategory !== undefined ? patch.preferredCategory : current.preferredCategory,
      preferredCondition: patch.preferredCondition !== undefined ? patch.preferredCondition : current.preferredCondition,
      swapAcceptable: patch.swapAcceptable !== undefined ? patch.swapAcceptable : current.swapAcceptable,
      urgency: patch.urgency !== undefined ? patch.urgency : current.urgency,
    };
    await this.store.write(StorageKeys.demoWishlist, items.map((w) => (w.id === id ? next : w)));
    return next;
  }
  async updateStatus(id: string, status: WishlistStatus): Promise<void> {
    const items = await this.mine();
    await this.store.write(
      StorageKeys.demoWishlist,
      items.map((w) => (w.id === id ? { ...w, status } : w)),
    );
  }
  async setShowOnStall(id: string, show: boolean): Promise<void> {
    const items = await this.mine();
    await this.store.write(
      StorageKeys.demoWishlist,
      items.map((w) => (w.id === id ? { ...w, showOnStall: show } : w)),
    );
  }
  async remove(id: string): Promise<void> {
    await this.store.write(StorageKeys.demoWishlist, (await this.mine()).filter((w) => w.id !== id));
  }
  /** The current feed for the schools the caller has an active wish in. */
  private async matchFeed(mine: WishlistItem[]): Promise<Listing[]> {
    const published = await this.store.read<Listing[]>(StorageKeys.publishedDemoListings, []);
    const bySchool = new Set(mine.map((w) => w.schoolId));
    return [...published, ...demoListings].filter((l) => bySchool.has(l.schoolId));
  }

  async matchesForMe(): Promise<WishlistMatch[]> {
    const mine = (await this.mine()).filter((w) => w.status === "active");
    if (mine.length === 0) return [];
    const listings = await this.matchFeed(mine);
    const matches: WishlistMatch[] = [];
    for (const w of mine) {
      for (const l of listings) {
        const score = scoreWishlistMatch(l, w);
        if (score >= WISHLIST_MATCH_THRESHOLD) {
          matches.push({ wishlistItemId: w.id, listingId: l.id, score, createdAt: l.createdAt, notified: false });
        }
      }
    }
    return matches.sort((a, b) => b.score - a.score);
  }

  async matchDetailsForMe(): Promise<WishlistMatchDetail[]> {
    const mine = (await this.mine()).filter((w) => w.status === "active");
    if (mine.length === 0) return [];
    const listings = await this.matchFeed(mine);
    // Listing status can be overridden locally (e.g. reserved via an accepted offer);
    // a match to a now-unavailable listing is still shown, flagged not-available.
    const overrides = await this.store.read<Record<string, ListingStatus>>(StorageKeys.demoListingStatus, {});
    const details: WishlistMatchDetail[] = [];
    for (const w of mine) {
      for (const l of listings) {
        if (scoreWishlistMatch(l, w) < WISHLIST_MATCH_THRESHOLD) continue;
        const status = overrides[l.id] ?? l.status;
        details.push({
          wishlistItemId: w.id,
          wishlistTitle: w.title,
          listing: { id: l.id, title: l.title, ownerId: l.ownerId, postType: l.postType, status, image: l.images[0] ?? null },
          available: status === "active",
          score: scoreWishlistMatch(l, w),
          notified: false,
        });
      }
    }
    return details.sort((a, b) => b.score - a.score);
  }
}

/* --------------------------------------------------------- shared helpers */

/** All active listings for a school in demo mode (locally-published first). */
async function schoolListings(store: JsonStore, schoolId: string): Promise<Listing[]> {
  const published = await store.read<Listing[]>(StorageKeys.publishedDemoListings, []);
  return [...published.filter((l) => l.schoolId === schoolId), ...demoListings.filter((l) => l.schoolId === schoolId)];
}

/** The current demo user id (the selected profile), or a stable fallback. */
async function currentUser(store: JsonStore): Promise<string> {
  return (await store.read<string | null>(StorageKeys.selectedProfile, null)) ?? "demo-user";
}

const emptyBreakdown = (): Record<ListingPostType, number> =>
  Object.fromEntries(LISTING_POST_TYPE.map((t) => [t, 0])) as Record<ListingPostType, number>;

/* ------------------------------------------------------------ student stalls */

type LocalStall = { id: string; schoolId: string; userId: string; description: string | null; createdAt: string };

export class MockStallRepository implements StallRepository {
  constructor(private readonly store: JsonStore) {}

  private localStalls(): Promise<LocalStall[]> {
    return this.store.read<LocalStall[]>(StorageKeys.demoStalls, []);
  }

  /** Resolve an owner preview for a stall: demo owner, else the current profile. */
  private ownerFor(userId: string, demo?: DemoStall): OwnerPreview {
    if (demo) return demo.owner;
    const p = demoProfileById(userId);
    if (p) return { displayName: p.displayName, avatarEmoji: p.avatarEmoji, verified: p.membershipStatus === "verified" };
    return { displayName: "You", avatarEmoji: "🙂", verified: true };
  }

  private async listingsForStall(schoolId: string, owner: OwnerPreview): Promise<Listing[]> {
    const all = await schoolListings(this.store, schoolId);
    // Demo listings carry only an owner NAME, so a stall's items are those posted
    // under the same display name (locally-published items included).
    return all.filter((l) => l.owner.displayName === owner.displayName);
  }

  private toStall(schoolId: string, userId: string, description: string | null, createdAt: string, listings: Listing[], demo?: DemoStall): Stall {
    return {
      id: demo?.id ?? `stall-local-${userId}`,
      schoolId,
      userId,
      owner: this.ownerFor(userId, demo),
      description,
      createdAt,
      activeCount: listings.length,
    };
  }

  private async detail(schoolId: string, userId: string, description: string | null, createdAt: string, demo: DemoStall | undefined, includeHiddenWishlist: boolean): Promise<StallDetail> {
    const owner = this.ownerFor(userId, demo);
    const listings = await this.listingsForStall(schoolId, owner);
    const breakdown = emptyBreakdown();
    for (const l of listings) breakdown[l.postType] += 1;
    const stall = this.toStall(schoolId, userId, description, createdAt, listings, demo);
    const visibleWishlist = await this.wishlistFor(schoolId, userId, includeHiddenWishlist);
    return { stall, listings, breakdown, visibleWishlist };
  }

  /** A stall owner's "looking for" requests. Others see only opted-in ones. */
  private async wishlistFor(schoolId: string, userId: string, includeHidden: boolean): Promise<WishlistItem[]> {
    const mine = await this.store.read<WishlistItem[]>(StorageKeys.demoWishlist, []);
    const pool = [...mine, ...demoWishlist];
    return pool.filter(
      (w) => w.schoolId === schoolId && w.userId === userId && w.status === "active" && (includeHidden || w.showOnStall),
    );
  }

  async listForSchool(schoolId: string): Promise<Stall[]> {
    const locals = (await this.localStalls()).filter((s) => s.schoolId === schoolId);
    const localUserIds = new Set(locals.map((s) => s.userId));
    // Locally-opened stalls override the demo stall for the same user.
    const demos = demoStallsForSchool(schoolId).filter((d) => !localUserIds.has(d.userId));
    const out: Stall[] = [];
    for (const d of demos) {
      const listings = await this.listingsForStall(schoolId, d.owner);
      out.push(this.toStall(schoolId, d.userId, d.description, d.createdAt, listings, d));
    }
    for (const s of locals) {
      const owner = this.ownerFor(s.userId);
      const listings = await this.listingsForStall(schoolId, owner);
      out.push(this.toStall(schoolId, s.userId, s.description, s.createdAt, listings));
    }
    return out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async getById(id: string): Promise<StallDetail | null> {
    const demo = demoStallById(id);
    if (demo) return this.detail(demo.schoolId, demo.userId, demo.description, demo.createdAt, demo, false);
    const local = (await this.localStalls()).find((s) => s.id === id);
    if (local) {
      const viewerIsOwner = (await currentUser(this.store)) === local.userId;
      return this.detail(local.schoolId, local.userId, local.description, local.createdAt, undefined, viewerIsOwner);
    }
    return null;
  }

  async getByUser(schoolId: string, userId: string): Promise<StallDetail | null> {
    const viewerIsOwner = (await currentUser(this.store)) === userId;
    const local = (await this.localStalls()).find((s) => s.schoolId === schoolId && s.userId === userId);
    if (local) return this.detail(schoolId, userId, local.description, local.createdAt, undefined, viewerIsOwner);
    const demo = demoStalls.find((s) => s.schoolId === schoolId && s.userId === userId);
    if (demo) return this.detail(schoolId, userId, demo.description, demo.createdAt, demo, viewerIsOwner);
    return null;
  }

  async getMine(schoolId: string): Promise<StallDetail | null> {
    const uid = await currentUser(this.store);
    return this.getByUser(schoolId, uid);
  }

  async open(schoolId: string, description: string | null): Promise<Stall> {
    const uid = await currentUser(this.store);
    const locals = await this.localStalls();
    const existing = locals.find((s) => s.schoolId === schoolId && s.userId === uid);
    const demo = demoStalls.find((s) => s.schoolId === schoolId && s.userId === uid);
    const createdAt = existing?.createdAt ?? demo?.createdAt ?? new Date().toISOString();
    const next: LocalStall = { id: existing?.id ?? demo?.id ?? `stall-local-${uid}`, schoolId, userId: uid, description, createdAt };
    await this.store.write(StorageKeys.demoStalls, [next, ...locals.filter((s) => s.id !== next.id)]);
    const owner = this.ownerFor(uid, demo);
    const listings = await this.listingsForStall(schoolId, owner);
    return this.toStall(schoolId, uid, description, createdAt, listings, demo);
  }
}

/* --------------------------------------------------------- temporary markets */

type LocalMarket = DemoMarket;
type Participation = { marketId: string; userId: string };
type Association = { marketId: string; listingId: string; userId: string };

export class MockMarketRepository implements MarketRepository {
  constructor(private readonly store: JsonStore) {}

  private localMarkets(): Promise<LocalMarket[]> {
    return this.store.read<LocalMarket[]>(StorageKeys.demoMarkets, []);
  }
  private sellers(): Promise<Participation[]> {
    return this.store.read<Participation[]>(StorageKeys.demoMarketSellers, []);
  }
  private assocs(): Promise<Association[]> {
    return this.store.read<Association[]>(StorageKeys.demoMarketListings, []);
  }

  private async statusOverrides(): Promise<Record<string, MarketStatus>> {
    return this.store.read<Record<string, MarketStatus>>("swap.demo.marketStatus", {});
  }

  private async allMarkets(schoolId: string): Promise<DemoMarket[]> {
    const overrides = await this.statusOverrides();
    const locals = await this.localMarkets();
    const localIds = new Set(locals.map((m) => m.id));
    const demos = demoMarketsForSchool(schoolId).filter((m) => !localIds.has(m.id));
    const merged = [...locals.filter((m) => m.schoolId === schoolId), ...demos];
    return merged.map((m) => (overrides[m.id] ? { ...m, status: overrides[m.id]! } : m));
  }

  private async toMarket(m: DemoMarket): Promise<Market> {
    const sellerCount = (await this.allSellers()).filter((s) => s.marketId === m.id).length;
    const listingCount = (await this.allAssocs()).filter((a) => a.marketId === m.id).length;
    return {
      id: m.id,
      schoolId: m.schoolId,
      hostUserId: m.hostUserId,
      host: m.host,
      hostLabel: m.hostLabel,
      title: m.title,
      description: m.description,
      coverImage: m.coverImage,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      location: m.location,
      handoffInstructions: m.handoffInstructions,
      allowedCategories: m.allowedCategories,
      allowsRegulated: m.allowsRegulated,
      status: m.status,
      createdAt: m.createdAt,
      sellerCount,
      listingCount,
    };
  }

  private async allSellers(): Promise<Participation[]> {
    return [...demoMarketSellers, ...(await this.sellers())];
  }
  private async allAssocs(): Promise<Association[]> {
    const removed = await this.store.read<Association[]>("swap.demo.marketListingsRemoved", []);
    const base = [...demoMarketListings, ...(await this.assocs())];
    return base.filter((a) => !removed.some((r) => r.marketId === a.marketId && r.listingId === a.listingId));
  }

  async listForSchool(schoolId: string): Promise<Market[]> {
    const markets = await this.allMarkets(schoolId);
    const out = await Promise.all(markets.map((m) => this.toMarket(m)));
    return out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  private async findMarket(id: string): Promise<DemoMarket | null> {
    const overrides = await this.statusOverrides();
    const local = (await this.localMarkets()).find((m) => m.id === id);
    const demo = demoMarketById(id);
    const base = local ?? demo ?? null;
    if (!base) return null;
    return overrides[id] ? { ...base, status: overrides[id]! } : base;
  }

  async getById(id: string): Promise<MarketDetail | null> {
    const m = await this.findMarket(id);
    if (!m) return null;
    const market = await this.toMarket(m);
    const assocs = (await this.allAssocs()).filter((a) => a.marketId === id);
    const pool = await schoolListings(this.store, m.schoolId);
    const listings = assocs.map((a) => pool.find((l) => l.id === a.listingId)).filter((l): l is Listing => l !== undefined);
    const uid = await currentUser(this.store);
    const amHost = m.hostUserId === uid;
    const amSeller = (await this.allSellers()).some((s) => s.marketId === id && s.userId === uid);
    return { market, listings, amHost, amSeller };
  }

  async create(input: NewMarket, host: OwnerPreview): Promise<Market> {
    const uid = await currentUser(this.store);
    const now = new Date().toISOString();
    const m: DemoMarket = {
      id: newId("market"),
      schoolId: input.schoolId,
      hostUserId: uid,
      host,
      hostLabel: input.hostLabel?.trim() || null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      coverImage: input.coverImage,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location?.trim() || null,
      handoffInstructions: input.handoffInstructions?.trim() || null,
      allowedCategories: input.allowedCategories,
      allowsRegulated: input.allowsRegulated,
      status: input.status,
      createdAt: now,
    };
    await this.store.write(StorageKeys.demoMarkets, [m, ...(await this.localMarkets())]);
    return this.toMarket(m);
  }

  async setStatus(id: string, status: MarketStatus): Promise<void> {
    const overrides = await this.statusOverrides();
    await this.store.write("swap.demo.marketStatus", { ...overrides, [id]: status });
  }

  async join(marketId: string): Promise<void> {
    const uid = await currentUser(this.store);
    const sellers = await this.sellers();
    if (!sellers.some((s) => s.marketId === marketId && s.userId === uid)) {
      await this.store.write(StorageKeys.demoMarketSellers, [{ marketId, userId: uid }, ...sellers]);
    }
  }

  async leave(marketId: string): Promise<void> {
    const uid = await currentUser(this.store);
    const sellers = await this.sellers();
    await this.store.write(
      StorageKeys.demoMarketSellers,
      sellers.filter((s) => !(s.marketId === marketId && s.userId === uid)),
    );
  }

  async addListing(marketId: string, listingId: string): Promise<void> {
    const uid = await currentUser(this.store);
    const assocs = await this.assocs();
    if (!assocs.some((a) => a.marketId === marketId && a.listingId === listingId)) {
      await this.store.write(StorageKeys.demoMarketListings, [{ marketId, listingId, userId: uid }, ...assocs]);
    }
    // Un-remove if it was previously removed.
    const removed = await this.store.read<Association[]>("swap.demo.marketListingsRemoved", []);
    await this.store.write(
      "swap.demo.marketListingsRemoved",
      removed.filter((r) => !(r.marketId === marketId && r.listingId === listingId)),
    );
  }

  async removeListing(marketId: string, listingId: string): Promise<void> {
    const uid = await currentUser(this.store);
    const assocs = await this.assocs();
    await this.store.write(
      StorageKeys.demoMarketListings,
      assocs.filter((a) => !(a.marketId === marketId && a.listingId === listingId)),
    );
    // Demo-seeded associations can't be deleted from the constant, so record a tombstone.
    const removed = await this.store.read<Association[]>("swap.demo.marketListingsRemoved", []);
    if (!removed.some((r) => r.marketId === marketId && r.listingId === listingId)) {
      await this.store.write("swap.demo.marketListingsRemoved", [{ marketId, listingId, userId: uid }, ...removed]);
    }
  }
}

/* ---------------------------------------------------- campus-market discovery */

export class MockCampusMarketRepository implements CampusMarketRepository {
  constructor(
    private readonly store: JsonStore,
    private readonly stalls: MockStallRepository,
  ) {}

  async shelves(schoolId: string): Promise<DiscoveryShelf[]> {
    const listings = await schoolListings(this.store, schoolId);
    const uid = await currentUser(this.store);
    const mineRaw = await this.store.read<WishlistItem[]>(StorageKeys.demoWishlist, []);
    const myWishlist = [...mineRaw, ...demoWishlist].filter((w) => w.schoolId === schoolId && w.userId === uid && w.status === "active");
    return buildDiscoveryShelves({ schoolId, listings, myWishlist });
  }

  async demand(schoolId: string): Promise<DemandCluster[]> {
    const mineRaw = await this.store.read<WishlistItem[]>(StorageKeys.demoWishlist, []);
    const wishlist = [...mineRaw, ...demoWishlist].filter((w) => w.schoolId === schoolId && w.status === "active");
    return buildDemandClusters(wishlist);
  }

  async recentStalls(schoolId: string, limit = 8): Promise<Stall[]> {
    return (await this.stalls.listForSchool(schoolId)).slice(0, limit);
  }
}

/* ------------------------------------------------------------- DI factory */

/* ---------------------------------------------------------------- membership */

/**
 * Deterministic demo membership. Invitation codes map to outcomes so the onboarding
 * funnel can be exercised without a real backend:
 *   SWAP-VERIFIED → verified · SWAP-PENDING → pending · SWAP-INACTIVE → verified but
 *   the school is inactive · anything else → invalid.
 */
export class MockMembershipRepository implements MembershipRepository {
  constructor(private readonly store: JsonStore) {}

  private stored(): Promise<Membership | null> {
    return this.store.read<Membership | null>(StorageKeys.demoMembership, null);
  }

  async myMembership(): Promise<Membership | null> {
    return this.stored();
  }

  async redeemInvitation(code: string): Promise<Membership> {
    const norm = code.trim().toUpperCase();
    const base = { schoolId: "school-uni", schoolName: "Demo University" };
    let membership: Membership;
    if (norm === "SWAP-VERIFIED") membership = { ...base, status: "verified", schoolActive: true };
    else if (norm === "SWAP-PENDING") membership = { ...base, status: "pending", schoolActive: true };
    else if (norm === "SWAP-INACTIVE") membership = { ...base, status: "verified", schoolActive: false };
    else throw new Error("invitation_invalid");
    await this.store.write(StorageKeys.demoMembership, membership);
    return membership;
  }

  async requestManual(input: { schoolId: string; gradYear?: number | null; explanation?: string | null }): Promise<Membership> {
    const membership: Membership = { schoolId: input.schoolId, schoolName: "Demo University", status: "pending", schoolActive: true };
    await this.store.write(StorageKeys.demoMembership, membership);
    return membership;
  }
}

/* ----------------------------------------------------------- trust & safety */

export class MockReportRepository implements ReportRepository {
  constructor(private readonly store: JsonStore) {}

  async submitReport(input: NewReport): Promise<void> {
    const existing = await this.store.read<NewReport[]>(StorageKeys.demoReports, []);
    await this.store.write(StorageKeys.demoReports, [{ ...input }, ...existing]);
  }

  async listBlockedUsers(): Promise<BlockedUser[]> {
    const ids = await this.store.read<string[]>(StorageKeys.demoBlocks, []);
    return ids.map((id) => {
      const p = demoProfileById(id);
      return { userId: id, displayName: p?.displayName ?? "Student", avatarEmoji: p?.avatarEmoji ?? "🙂" };
    });
  }

  async unblock(userId: string): Promise<void> {
    const ids = await this.store.read<string[]>(StorageKeys.demoBlocks, []);
    await this.store.write(StorageKeys.demoBlocks, ids.filter((id) => id !== userId));
  }
}

/** Build the full set of mock repositories over a key/value store. */
export function createMockRepositories(kv: KeyValueStore): Repositories {
  const store = new JsonStore(kv);
  const stalls = new MockStallRepository(store);
  return {
    session: new MockSessionRepository(store),
    membership: new MockMembershipRepository(store),
    reports: new MockReportRepository(store),
    marketplace: new MockMarketplaceRepository(store),
    community: new MockCommunityRepository(),
    messaging: new MockMessagingRepository(store),
    saved: new MockSavedListingsRepository(store),
    drafts: new MockDraftListingsRepository(store),
    wishlist: new MockWishlistRepository(store),
    stalls,
    markets: new MockMarketRepository(store),
    campusMarket: new MockCampusMarketRepository(store, stalls),
    offers: new MockOfferRepository(store),
  };
}

/** Re-export so tests/screens can enumerate the synthetic cast. */
export { demoProfiles, demoSchools };

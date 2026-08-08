/**
 * Local persistence abstraction.
 *
 * Repositories persist through a tiny key/value interface, not AsyncStorage
 * directly, so the exact same repository logic runs in tests against an in-memory
 * store. The app wires the AsyncStorage-backed store; tests wire the in-memory one.
 */

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** In-memory store for tests (and a safe fallback). */
export class InMemoryKeyValueStore implements KeyValueStore {
  private readonly map = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }
}

/** Typed JSON helpers over a KeyValueStore. */
export class JsonStore {
  constructor(private readonly kv: KeyValueStore) {}

  async read<T>(key: string, fallback: T): Promise<T> {
    const raw = await this.kv.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupt value — fail safe to the fallback rather than crash the app.
      return fallback;
    }
  }

  async write<T>(key: string, value: T): Promise<void> {
    await this.kv.setItem(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    await this.kv.removeItem(key);
  }
}

/** Namespaced storage keys. Demo-scoped state is prefixed `swap.demo.*`; signals
 * that apply in both demo and real mode (browsing history) use `swap.*`. */
export const StorageKeys = {
  selectedProfile: "swap.demo.selectedProfile",
  savedListings: "swap.demo.savedListings",
  drafts: "swap.demo.drafts",
  publishedDemoListings: "swap.demo.publishedListings",
  demoWishlist: "swap.demo.wishlist",
  /** Locally-opened student stalls (demo mode), keyed nowhere — a list. */
  demoStalls: "swap.demo.stalls",
  /** Locally-created temporary markets (demo mode). */
  demoMarkets: "swap.demo.markets",
  /** Local market seller participation: array of {marketId,userId}. */
  demoMarketSellers: "swap.demo.marketSellers",
  /** Local listing↔market associations: array of {marketId,listingId,userId}. */
  demoMarketListings: "swap.demo.marketListings",
  /** Locally-created conversations (demo mode). */
  demoConversations: "swap.demo.conversations",
  /** Locally-sent messages (demo mode): array of message rows. */
  demoMessages: "swap.demo.messages",
  /** Per-conversation read state for the demo user: {conversationId: lastReadAtISO}. */
  demoReadState: "swap.demo.readState",
  /** User ids the demo user has blocked. */
  demoBlocks: "swap.demo.blocks",
  /** Locally-created exchange offers (demo mode). */
  demoOffers: "swap.demo.offers",
  /** Local offer transactions (accepted offers → handoff). */
  demoTransactions: "swap.demo.transactions",
  /** Local listing reservations: {listingId, transactionId, status}. */
  demoReservations: "swap.demo.reservations",
  /** Local handoff completion confirmations: {transactionId, userId}. */
  demoConfirmations: "swap.demo.confirmations",
  /** Offer-driven listing status overrides: {listingId: status}. */
  demoListingStatus: "swap.demo.listingStatus",
  /** Categories the user has recently browsed (a client-side recommendation signal). */
  browsedCategories: "swap.browsedCategories",
  /** Prepared in-app activity events (wishlist match / unavailable / fulfilled / demand response). */
  activityEvents: "swap.activityEvents",
  /** Local, privacy-minimal 13+ age attestation (no date of birth stored). */
  ageAttested13Plus: "swap.ageAttested13Plus",
  /** Demo-mode simulated school membership (mirrors the real enrollment funnel). */
  demoMembership: "swap.demo.membership",
} as const;

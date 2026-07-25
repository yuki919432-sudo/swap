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

/** Namespaced storage keys (all demo-scoped). */
export const StorageKeys = {
  selectedProfile: "swap.demo.selectedProfile",
  savedListings: "swap.demo.savedListings",
  drafts: "swap.demo.drafts",
  publishedDemoListings: "swap.demo.publishedListings",
} as const;

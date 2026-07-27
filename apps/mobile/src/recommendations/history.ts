/**
 * Browsing-history signal for recommendations: the categories a user recently
 * viewed. A lightweight client-side signal (works in demo and real mode), kept in
 * local storage. The Listing detail screen records; the recommendation engine reads.
 */
import { JsonStore, StorageKeys, type KeyValueStore } from "../data/storage";

const MAX = 12;

export async function recordBrowsedCategory(kv: KeyValueStore, category: string): Promise<void> {
  const store = new JsonStore(kv);
  const current = await store.read<string[]>(StorageKeys.browsedCategories, []);
  const next = [category, ...current.filter((c) => c !== category)].slice(0, MAX);
  await store.write(StorageKeys.browsedCategories, next);
}

export async function getBrowsedCategories(kv: KeyValueStore): Promise<string[]> {
  return new JsonStore(kv).read<string[]>(StorageKeys.browsedCategories, []);
}

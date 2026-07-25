/**
 * AsyncStorage-backed KeyValueStore for the running app. Isolated in its own
 * module so the (React-Native-only) dependency never leaks into unit tests, which
 * use InMemoryKeyValueStore instead.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { KeyValueStore } from "./storage";

export const asyncStorageKeyValueStore: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

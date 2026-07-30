/**
 * Data-source selection: a PILOT build must wire the REAL Supabase repositories, not
 * the demo/mock ones — otherwise the app would silently run on synthetic data. This
 * asserts the wiring for the wishlist journey (and that mock mode stays mock).
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InMemoryKeyValueStore } from "../storage";
import { createMockRepositories, MockWishlistRepository } from "./mock";
import { createSupabaseRepositories, SupabaseWishlistRepository } from "./supabase";

// The repo constructors only STORE the client (no calls at construction), so a bare
// object stands in for the client here — we're testing wiring, not queries.
const fakeClient = {} as SupabaseClient;

describe("repository data-source selection", () => {
  it("pilot (Supabase) build uses the real wishlist repository", () => {
    const repos = createSupabaseRepositories(fakeClient, new InMemoryKeyValueStore());
    expect(repos.wishlist).toBeInstanceOf(SupabaseWishlistRepository);
    // and NOT the demo mock
    expect(repos.wishlist).not.toBeInstanceOf(MockWishlistRepository);
  });

  it("demo build uses the mock wishlist repository", () => {
    const repos = createMockRepositories(new InMemoryKeyValueStore());
    expect(repos.wishlist).toBeInstanceOf(MockWishlistRepository);
  });

  it("wishlist and saved are distinct repositories (separate concepts)", () => {
    const repos = createSupabaseRepositories(fakeClient, new InMemoryKeyValueStore());
    expect(repos.wishlist).not.toBe(repos.saved);
  });
});

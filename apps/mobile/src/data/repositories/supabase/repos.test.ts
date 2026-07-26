import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseMarketplaceRepository } from "./marketplace";
import { SupabaseSavedListingsRepository } from "./saved";

/**
 * A tiny fake of the Supabase query builder — enough to exercise the repositories'
 * query shaping + row→domain mapping without a live backend. The real end-to-end
 * behavior is proven by marketplace.integration.test.ts against a booted stack.
 */
type Result = { data: unknown; error: { message: string } | null };
type Resolver = (b: FakeBuilder) => Result;

class FakeBuilder {
  mode: "read" | "insert" | "update" | "delete" = "read";
  payload: unknown;
  filters: [string, string, unknown][] = [];
  constructor(
    readonly table: string,
    private readonly resolve: Resolver,
  ) {}
  select() {
    return this;
  }
  insert(p: unknown) {
    this.mode = "insert";
    this.payload = p;
    return this;
  }
  update(p: unknown) {
    this.mode = "update";
    this.payload = p;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push(["eq", c, v]);
    return this;
  }
  is() {
    return this;
  }
  in() {
    return this;
  }
  or() {
    return this;
  }
  order() {
    return this;
  }
  single() {
    return Promise.resolve(this.resolve(this));
  }
  maybeSingle() {
    return Promise.resolve(this.resolve(this));
  }
  then<T>(onOk: (r: Result) => T) {
    return Promise.resolve(this.resolve(this)).then(onOk);
  }
}

function fakeClient(opts: {
  uid?: string;
  resolve: Resolver;
  signedUrls?: { signedUrl: string }[];
  uploads?: string[];
}): SupabaseClient {
  const client = {
    auth: { getUser: async () => ({ data: { user: opts.uid ? { id: opts.uid } : null } }) },
    from: (table: string) => new FakeBuilder(table, opts.resolve),
    storage: {
      from: () => ({
        createSignedUrls: async () => ({ data: opts.signedUrls ?? [], error: null }),
        upload: async (path: string) => {
          opts.uploads?.push(path);
          return { data: { path }, error: null };
        },
      }),
    },
  };
  return client as unknown as SupabaseClient;
}

const listingRow = {
  id: "l1",
  school_id: "s1",
  owner_id: "u1",
  post_type: "give",
  title: "Lamp",
  description: "A lamp",
  category: "furniture",
  condition: "good",
  desired_item: null,
  handoff_location_id: null,
  status: "active",
  expires_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null,
  listing_images: [{ id: "img1", listing_id: "l1", school_id: "s1", storage_path: "s1/l1/0.jpg", position: 0 }],
  owner: { id: "u1", display_name: "Maya", avatar_url: null },
};

describe("SupabaseMarketplaceRepository (fake client)", () => {
  it("maps a listing row + signs its image", async () => {
    const client = fakeClient({
      resolve: () => ({ data: [listingRow], error: null }),
      signedUrls: [{ signedUrl: "https://signed/0.jpg" }],
    });
    const repo = new SupabaseMarketplaceRepository(client);
    const listings = await repo.list({ schoolId: "s1" });
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({ id: "l1", title: "Lamp", demoLocal: false });
    expect(listings[0]?.images[0]?.value).toBe("https://signed/0.jpg");
    expect(listings[0]?.owner.displayName).toBe("Maya");
  });

  it("dedupes + sorts categories", async () => {
    const client = fakeClient({ resolve: () => ({ data: [{ category: "furniture" }, { category: "textbooks" }, { category: "furniture" }], error: null }) });
    const repo = new SupabaseMarketplaceRepository(client);
    expect(await repo.categoriesForSchool("s1")).toEqual(["furniture", "textbooks"]);
  });

  it("creates a listing and uploads local images to a school/listing path", async () => {
    const uploads: string[] = [];
    const client = fakeClient({
      uid: "u1",
      uploads,
      resolve: (b) => (b.mode === "insert" && b.table === "listings" ? { data: listingRow, error: null } : { data: null, error: null }),
    });
    const repo = new SupabaseMarketplaceRepository(client, { imageReader: async () => new Uint8Array([1, 2, 3]) });
    const created = await repo.createListing(
      {
        schoolId: "s1",
        postType: "give",
        title: "Lamp",
        description: "A lamp",
        category: "furniture",
        condition: "good",
        desiredItem: null,
        images: [{ kind: "local", value: "file://lamp.jpg" }],
        handoffLocation: null,
        expiresAt: null,
      },
      { displayName: "Maya", avatarEmoji: "🌸", verified: true },
    );
    expect(created.id).toBe("l1");
    expect(uploads).toEqual(["s1/l1/0.jpg"]);
  });
});

describe("SupabaseSavedListingsRepository (fake client)", () => {
  it("inserts when not yet saved, deletes when already saved", async () => {
    const savedSet = new Set<string>();
    const resolve: Resolver = (b) => {
      if (b.table === "saved_listings" && b.mode === "read") {
        // isSaved: maybeSingle by listing_id
        const idFilter = b.filters.find((f) => f[1] === "listing_id");
        const id = idFilter?.[2] as string | undefined;
        return { data: id && savedSet.has(id) ? { id: "row" } : null, error: null };
      }
      if (b.table === "saved_listings" && b.mode === "insert") {
        savedSet.add((b.payload as { listing_id: string }).listing_id);
        return { data: null, error: null };
      }
      if (b.table === "saved_listings" && b.mode === "delete") {
        const id = b.filters.find((f) => f[1] === "listing_id")?.[2] as string;
        savedSet.delete(id);
        return { data: null, error: null };
      }
      if (b.table === "listings" && b.mode === "read") return { data: { school_id: "s1" }, error: null };
      return { data: null, error: null };
    };
    const repo = new SupabaseSavedListingsRepository(fakeClient({ uid: "u1", resolve }));

    expect(await repo.isSaved("l1")).toBe(false);
    expect(await repo.toggle("l1")).toBe(true);
    expect(await repo.isSaved("l1")).toBe(true);
    expect(await repo.toggle("l1")).toBe(false);
    expect(await repo.isSaved("l1")).toBe(false);
  });
});

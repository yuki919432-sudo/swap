import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKeyValueStore, JsonStore, StorageKeys, type KeyValueStore } from "../storage";
import { createMockRepositories } from "./mock";

const MAYA = "profile-uni-verified";
const DEVIN = "profile-uni-moderator";
const SCHOOL_UNI = "school-uni";
const SEEDED = "conv-demo-uni"; // Maya <-> Devin about listing l-uni-4

async function asProfile(kv: KeyValueStore, id: string) {
  await new JsonStore(kv).write(StorageKeys.selectedProfile, id);
}

describe("MockMessagingRepository", () => {
  let kv: KeyValueStore;
  beforeEach(async () => {
    kv = new InMemoryKeyValueStore();
    await asProfile(kv, MAYA);
  });

  it("starts a conversation and de-duplicates by pair + context", async () => {
    const repos = createMockRepositories(kv);
    const a = await repos.messaging.startConversation({ otherUserId: DEVIN, listingId: "l-uni-1" });
    const b = await repos.messaging.startConversation({ otherUserId: DEVIN, listingId: "l-uni-1" });
    expect(a).toBe(b); // same pair + same listing → one active conversation
    // A different context is a distinct conversation.
    const c = await repos.messaging.startConversation({ otherUserId: DEVIN, listingId: "l-uni-2" });
    expect(c).not.toBe(a);
  });

  it("refuses to start a conversation with yourself", async () => {
    const repos = createMockRepositories(kv);
    await expect(repos.messaging.startConversation({ otherUserId: MAYA })).rejects.toThrow();
  });

  it("sends a message that reconciles as mine and updates the thread", async () => {
    const repos = createMockRepositories(kv);
    const id = await repos.messaging.startConversation({ otherUserId: DEVIN, listingId: "l-uni-1" });
    const msg = await repos.messaging.sendMessage(id, "Is this still available?");
    expect(msg.mine).toBe(true);
    const detail = await repos.messaging.getConversation(id);
    expect(detail!.messages.some((m) => m.body === "Is this still available?" && m.mine)).toBe(true);
  });

  it("computes per-user unread and clears it on read", async () => {
    const repos = createMockRepositories(kv);
    // The seeded conversation has messages from Devin → unread for Maya.
    const before = await repos.messaging.listConversations(SCHOOL_UNI);
    const seeded = before.find((c) => c.id === SEEDED)!;
    expect(seeded.unread).toBeGreaterThan(0);
    expect(await repos.messaging.unreadTotal()).toBeGreaterThan(0);

    await repos.messaging.markRead(SEEDED);
    const after = await createMockRepositories(kv).messaging.listConversations(SCHOOL_UNI);
    expect(after.find((c) => c.id === SEEDED)!.unread).toBe(0);
  });

  it("read state is persisted and specific to the current user", async () => {
    const repos = createMockRepositories(kv);
    await repos.messaging.markRead(SEEDED);
    // Maya has read it ...
    expect((await createMockRepositories(kv).messaging.listConversations(SCHOOL_UNI)).find((c) => c.id === SEEDED)!.unread).toBe(0);
    // ... but Devin (a different user) still sees Maya's message as unread.
    await asProfile(kv, DEVIN);
    const devinView = await createMockRepositories(kv).messaging.listConversations(SCHOOL_UNI);
    expect(devinView.find((c) => c.id === SEEDED)!.unread).toBeGreaterThan(0);
  });

  it("blocking prevents new conversations and sending", async () => {
    const repos = createMockRepositories(kv);
    const id = await repos.messaging.startConversation({ otherUserId: DEVIN, listingId: "l-uni-1" });
    await repos.messaging.block(DEVIN, SCHOOL_UNI);

    const detail = await repos.messaging.getConversation(id);
    expect(detail!.blockedByMe).toBe(true);
    expect(detail!.canSend).toBe(false);
    await expect(repos.messaging.sendMessage(id, "hello?")).rejects.toThrow();
    await expect(repos.messaging.startConversation({ otherUserId: DEVIN })).rejects.toThrow();

    // Unblocking restores sending.
    await repos.messaging.unblock(DEVIN);
    expect((await repos.messaging.getConversation(id))!.canSend).toBe(true);
  });

  it("marks a conversation's context unavailable when the listing is gone", async () => {
    const repos = createMockRepositories(kv);
    // A conversation about a non-existent listing id resolves to an unavailable context.
    const id = await repos.messaging.startConversation({ otherUserId: DEVIN, listingId: "l-does-not-exist" });
    const detail = await repos.messaging.getConversation(id);
    expect(detail!.conversation.context.unavailable).toBe(true);
  });
});

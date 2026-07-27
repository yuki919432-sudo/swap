/**
 * Supabase-backed MessagingRepository. All reads/writes run under the caller's own
 * session, so RLS is the real authority: only conversation participants read a
 * conversation or its messages, only a verified participant may send, sender_id is
 * pinned to auth.uid(), and cross-school users can't see anything. Conversation
 * creation goes through the app.start_conversation RPC (SECURITY DEFINER) which
 * enforces same-school + block checks + de-dup atomically.
 *
 * Realtime: this uses explicit refresh / polling (watchConversation), NOT fake
 * realtime. A Supabase Realtime channel can replace watchConversation later behind
 * the same signature; reconnection would then be handled by the Realtime client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageType } from "@swap/types";
import type { Conversation, ConversationContext, ConversationDetail, Counterpart, Message } from "../../../domain/models";
import type { MessagingRepository, StartConversationInput, Unsubscribe } from "../types";
import { emojiForKey } from "./map";

interface ConversationRow {
  id: string;
  school_id: string;
  status: string;
  last_message_at: string;
  listing_id: string | null;
  market_id: string | null;
  stall_id: string | null;
}
interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  type: MessageType;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}
interface UserLite {
  id: string;
  display_name: string | null;
}

const counterpartFrom = (u: UserLite | null, userId: string): Counterpart => ({
  userId,
  displayName: u?.display_name ?? "Student",
  avatarEmoji: emojiForKey(userId),
  verified: true,
});

export class SupabaseMessagingRepository implements MessagingRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async uid(): Promise<string> {
    const { data } = await this.client.auth.getUser();
    if (!data.user) throw new Error("not_authenticated");
    return data.user.id;
  }

  private async userLite(id: string): Promise<UserLite | null> {
    const { data } = await this.client.from("users").select("id, display_name").eq("id", id).maybeSingle();
    return (data ?? null) as UserLite | null;
  }

  private async context(row: ConversationRow): Promise<ConversationContext> {
    if (row.listing_id) {
      const { data } = await this.client.from("listings").select("id, title, deleted_at").eq("id", row.listing_id).maybeSingle();
      const l = data as { id: string; title: string; deleted_at: string | null } | null;
      const gone = !l || l.deleted_at !== null;
      return { kind: "listing", id: row.listing_id, label: l?.title ?? "Listing", subtitle: gone ? "Listing no longer available" : "Listing", image: null, unavailable: gone };
    }
    if (row.market_id) {
      const { data } = await this.client.from("markets").select("id, title, status, deleted_at").eq("id", row.market_id).maybeSingle();
      const m = data as { id: string; title: string; status: string; deleted_at: string | null } | null;
      const gone = !m || m.deleted_at !== null;
      return { kind: "market", id: row.market_id, label: m?.title ?? "Market", subtitle: gone ? "Market ended" : "Temporary market", image: null, unavailable: gone };
    }
    if (row.stall_id) {
      const { data } = await this.client.from("stalls").select("id, user_id, deleted_at").eq("id", row.stall_id).maybeSingle();
      const s = data as { id: string; user_id: string; deleted_at: string | null } | null;
      const gone = !s || s.deleted_at !== null;
      const owner = s ? await this.userLite(s.user_id) : null;
      return { kind: "stall", id: row.stall_id, label: owner?.display_name ? `${owner.display_name}'s stall` : "Stall", subtitle: "Student stall", image: null, unavailable: gone };
    }
    return { kind: "none", id: null, label: "Direct message", subtitle: null, image: null, unavailable: false };
  }

  private async otherMember(conversationId: string, me: string): Promise<string | null> {
    const { data } = await this.client.from("conversation_members").select("user_id").eq("conversation_id", conversationId);
    const rows = (data ?? []) as { user_id: string }[];
    return rows.map((r) => r.user_id).find((u) => u !== me) ?? null;
  }

  async listConversations(schoolId: string): Promise<Conversation[]> {
    const me = await this.uid();
    const { data, error } = await this.client
      .from("conversations")
      .select("id, school_id, status, last_message_at, listing_id, market_id, stall_id")
      .eq("school_id", schoolId)
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ConversationRow[];

    const unread = await this.unreadMap();
    const out: Conversation[] = [];
    for (const row of rows) {
      const otherId = await this.otherMember(row.id, me);
      const [ctx, other, lastMsg] = await Promise.all([
        this.context(row),
        otherId ? this.userLite(otherId) : Promise.resolve(null),
        this.lastPreview(row.id),
      ]);
      out.push({
        id: row.id,
        schoolId: row.school_id,
        counterpart: counterpartFrom(other, otherId ?? ""),
        context: ctx,
        lastPreview: lastMsg,
        lastMessageAt: row.last_message_at,
        unread: unread[row.id] ?? 0,
      });
    }
    return out;
  }

  private async lastPreview(conversationId: string): Promise<string> {
    const { data } = await this.client
      .from("messages")
      .select("body, deleted_at")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const rows = (data ?? []) as { body: string }[];
    return rows[0]?.body ?? "";
  }

  private async unreadMap(): Promise<Record<string, number>> {
    const { data, error } = await this.client.rpc("conversation_unread_counts");
    if (error) return {};
    const map: Record<string, number> = {};
    for (const r of (data ?? []) as { conversation_id: string; unread: number }[]) map[r.conversation_id] = Number(r.unread);
    return map;
  }

  async getConversation(id: string): Promise<ConversationDetail | null> {
    const me = await this.uid();
    const { data, error } = await this.client
      .from("conversations")
      .select("id, school_id, status, last_message_at, listing_id, market_id, stall_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as ConversationRow;

    const otherId = await this.otherMember(id, me);
    const [ctx, other, msgRows, blockedByMe] = await Promise.all([
      this.context(row),
      otherId ? this.userLite(otherId) : Promise.resolve(null),
      this.client.from("messages").select("id, conversation_id, sender_id, type, body, created_at, edited_at, deleted_at").eq("conversation_id", id).order("created_at", { ascending: true }),
      otherId ? this.iBlocked(otherId) : Promise.resolve(false),
    ]);
    const messages: Message[] = ((msgRows.data ?? []) as MessageRow[]).map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      type: m.type,
      body: m.deleted_at ? "Message deleted" : m.body,
      createdAt: m.created_at,
      editedAt: m.edited_at,
      deletedAt: m.deleted_at,
      mine: m.sender_id === me,
    }));
    const unread = (await this.unreadMap())[id] ?? 0;
    const conversation: Conversation = {
      id: row.id,
      schoolId: row.school_id,
      counterpart: counterpartFrom(other, otherId ?? ""),
      context: ctx,
      lastPreview: messages[messages.length - 1]?.body ?? "",
      lastMessageAt: row.last_message_at,
      unread,
    };
    const canSend = row.status === "active" && !blockedByMe;
    return { conversation, messages, canSend, blockedByMe };
  }

  private async iBlocked(userId: string): Promise<boolean> {
    const me = await this.uid();
    const { data } = await this.client.from("blocks").select("id").eq("blocker_id", me).eq("blocked_id", userId).limit(1);
    return ((data ?? []) as unknown[]).length > 0;
  }

  async startConversation(input: StartConversationInput): Promise<string> {
    const { data, error } = await this.client.rpc("start_conversation", {
      p_other: input.otherUserId,
      p_listing: input.listingId ?? null,
      p_market: input.marketId ?? null,
      p_stall: input.stallId ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async sendMessage(conversationId: string, body: string): Promise<Message> {
    const me = await this.uid();
    const { data: conv } = await this.client.from("conversations").select("school_id").eq("id", conversationId).maybeSingle();
    if (!conv) throw new Error("conversation_not_found");
    const { data, error } = await this.client
      .from("messages")
      .insert({ conversation_id: conversationId, school_id: (conv as { school_id: string }).school_id, sender_id: me, type: "text", body: body.trim() })
      .select("id, conversation_id, sender_id, type, body, created_at, edited_at, deleted_at")
      .single();
    if (error || !data) throw new Error(error?.message ?? "send_failed");
    const m = data as MessageRow;
    return { id: m.id, conversationId: m.conversation_id, senderId: m.sender_id, type: m.type, body: m.body, createdAt: m.created_at, editedAt: m.edited_at, deletedAt: m.deleted_at, mine: true };
  }

  async markRead(conversationId: string): Promise<void> {
    const me = await this.uid();
    const { data } = await this.client
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1);
    const lastId = ((data ?? []) as { id: string }[])[0]?.id ?? null;
    const { error } = await this.client
      .from("conversation_members")
      .update({ last_read_at: new Date().toISOString(), last_read_message_id: lastId })
      .eq("conversation_id", conversationId)
      .eq("user_id", me);
    if (error) throw new Error(error.message);
  }

  async unreadTotal(): Promise<number> {
    const map = await this.unreadMap();
    return Object.values(map).reduce((a, b) => a + b, 0);
  }

  async block(userId: string, schoolId: string): Promise<void> {
    const me = await this.uid();
    const { error } = await this.client.from("blocks").insert({ school_id: schoolId, blocker_id: me, blocked_id: userId });
    if (error && error.code !== "23505") throw new Error(error.message);
  }

  async unblock(userId: string): Promise<void> {
    const me = await this.uid();
    const { error } = await this.client.from("blocks").delete().eq("blocker_id", me).eq("blocked_id", userId);
    if (error) throw new Error(error.message);
  }

  watchConversation(id: string, onChange: (detail: ConversationDetail) => void): Unsubscribe {
    // Explicit polling (documented limitation — NOT realtime). Reconnection is a
    // no-op: each tick is an independent fetch, so transient failures self-heal on
    // the next interval. Swap for a Supabase Realtime channel behind this signature.
    let alive = true;
    const tick = () => {
      if (!alive) return;
      void this.getConversation(id).then((d) => {
        if (alive && d) onChange(d);
      }).catch(() => {});
    };
    const timer = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }
}

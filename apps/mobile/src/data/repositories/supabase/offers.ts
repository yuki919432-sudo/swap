/**
 * Supabase-backed OfferRepository. Every state transition goes through a
 * SECURITY DEFINER RPC (create/accept/decline/cancel/counter/handoff/return) so
 * all authorization, ownership, cross-school, block, and ATOMIC reservation
 * checks live in the database — the client never asserts ownership or school.
 * Reads are RLS-scoped to the two participants (moderators get nothing).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandoffStage, HandoffStatus, ListingPostType, ListingStatus, OfferKind, OfferStatus } from "@swap/types";
import type { Handoff, ImageRef, Offer, OfferDetail, OfferListingRef } from "../../../domain/models";
import type { CounterOffer, HandoffPlan, NewOffer, OfferRepository } from "../types";

interface OfferRow {
  id: string;
  school_id: string;
  conversation_id: string | null;
  kind: OfferKind;
  status: OfferStatus;
  from_user_id: string;
  to_user_id: string;
  listing_id: string | null;
  offered_listing_id: string | null;
  message: string | null;
  proposed_at: string | null;
  handoff_location_text: string | null;
  return_by: string | null;
  expires_at: string | null;
  parent_offer_id: string | null;
  created_at: string;
  updated_at: string;
}
interface TxnRow {
  id: string;
  offer_id: string;
  kind: OfferKind | null;
  status: string;
  handoff_status: HandoffStatus;
  handoff_stage: HandoffStage;
  handoff_location_text: string | null;
  scheduled_at: string | null;
  return_by: string | null;
  handed_over_at: string | null;
  returned_at: string | null;
  completed_at: string | null;
}
interface ListingLite {
  id: string;
  title: string;
  post_type: ListingPostType;
  status: ListingStatus;
  owner_id: string;
}

const OFFER_COLS =
  "id, school_id, conversation_id, kind, status, from_user_id, to_user_id, listing_id, offered_listing_id, message, proposed_at, handoff_location_text, return_by, expires_at, parent_offer_id, created_at, updated_at";
const TXN_COLS =
  "id, offer_id, kind, status, handoff_status, handoff_stage, handoff_location_text, scheduled_at, return_by, handed_over_at, returned_at, completed_at";

const toRef = (l: ListingLite | undefined, image: ImageRef | null = null): OfferListingRef | null =>
  l ? { id: l.id, title: l.title, image, postType: l.post_type, status: l.status, ownerId: l.owner_id } : null;

export class SupabaseOfferRepository implements OfferRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async uid(): Promise<string> {
    const { data } = await this.client.auth.getUser();
    if (!data.user) throw new Error("not_authenticated");
    return data.user.id;
  }

  private async listingMap(ids: (string | null)[]): Promise<Map<string, ListingLite>> {
    const want = [...new Set(ids.filter((x): x is string => x !== null))];
    if (want.length === 0) return new Map();
    const { data } = await this.client.from("listings").select("id, title, post_type, status, owner_id").in("id", want);
    const map = new Map<string, ListingLite>();
    for (const r of (data ?? []) as ListingLite[]) map.set(r.id, r);
    return map;
  }

  private toOffer(r: OfferRow, me: string, refs: Map<string, ListingLite>): Offer {
    return {
      id: r.id,
      schoolId: r.school_id,
      conversationId: r.conversation_id,
      kind: r.kind,
      status: r.status,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      listing: r.listing_id ? toRef(refs.get(r.listing_id)) : null,
      offeredListing: r.offered_listing_id ? toRef(refs.get(r.offered_listing_id)) : null,
      note: r.message,
      handoffAt: r.proposed_at,
      handoffLocationText: r.handoff_location_text,
      returnBy: r.return_by,
      expiresAt: r.expires_at,
      parentOfferId: r.parent_offer_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      amSender: r.from_user_id === me,
      amRecipient: r.to_user_id === me,
    };
  }

  private async toOffers(rows: OfferRow[], me: string): Promise<Offer[]> {
    const refs = await this.listingMap(rows.flatMap((r) => [r.listing_id, r.offered_listing_id]));
    return rows.map((r) => this.toOffer(r, me, refs));
  }

  private async toHandoff(t: TxnRow): Promise<Handoff> {
    const me = await this.uid();
    const { data } = await this.client.from("handoff_confirmations").select("user_id").eq("transaction_id", t.id);
    const confirmers = ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
    return {
      id: t.id,
      offerId: t.offer_id,
      kind: (t.kind ?? "give") as OfferKind,
      status: t.status,
      handoffStatus: t.handoff_status,
      stage: t.handoff_stage,
      scheduledAt: t.scheduled_at,
      handoffLocationText: t.handoff_location_text,
      returnBy: t.return_by,
      handedOverAt: t.handed_over_at,
      returnedAt: t.returned_at,
      completedAt: t.completed_at,
      iConfirmed: confirmers.includes(me),
      confirmations: new Set(confirmers).size,
    };
  }

  async listForConversation(conversationId: string): Promise<Offer[]> {
    const me = await this.uid();
    const { data, error } = await this.client.from("offers").select(OFFER_COLS).eq("conversation_id", conversationId).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return this.toOffers((data ?? []) as OfferRow[], me);
  }

  async getById(offerId: string): Promise<OfferDetail | null> {
    const me = await this.uid();
    const { data, error } = await this.client.from("offers").select(OFFER_COLS).eq("id", offerId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as OfferRow;

    // Walk the revision chain: to the root, then all descendants.
    let rootId = row.id;
    let parentId: string | null = row.parent_offer_id;
    while (parentId) {
      rootId = parentId;
      const { data: p } = await this.client.from("offers").select("id, parent_offer_id").eq("id", parentId).maybeSingle();
      parentId = (p as { id: string; parent_offer_id: string | null } | null)?.parent_offer_id ?? null;
    }
    const chainRows = await this.collectChain(rootId);
    const chain = await this.toOffers(chainRows, me);
    const offer = chain.find((o) => o.id === offerId) ?? (await this.toOffers([row], me))[0]!;

    const { data: txn } = await this.client.from("transactions").select(TXN_COLS).eq("offer_id", offerId).maybeSingle();
    const handoff = txn ? await this.toHandoff(txn as TxnRow) : null;
    return { offer, handoff, chain };
  }

  private async collectChain(rootId: string): Promise<OfferRow[]> {
    const out: OfferRow[] = [];
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift()!;
      const { data } = await this.client.from("offers").select(OFFER_COLS).eq("id", id).maybeSingle();
      if (data) out.push(data as OfferRow);
      const { data: kids } = await this.client.from("offers").select("id").eq("parent_offer_id", id);
      for (const k of (kids ?? []) as { id: string }[]) queue.push(k.id);
    }
    return out.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  }

  async create(input: NewOffer): Promise<Offer> {
    const me = await this.uid();
    const { data, error } = await this.client.rpc("create_exchange_offer", {
      p_conversation: input.conversationId,
      p_kind: input.kind,
      p_listing: input.listingId,
      p_offered_listing: input.offeredListingId ?? null,
      p_note: input.note ?? null,
      p_handoff_at: input.handoffAt ?? null,
      p_location_text: input.handoffLocationText ?? null,
      p_location_id: input.handoffLocationId ?? null,
      p_return_by: input.returnBy ?? null,
      p_expires_at: input.expiresAt ?? null,
    });
    if (error) throw new Error(error.message);
    return (await this.toOffers([data as OfferRow], me))[0]!;
  }

  async accept(offerId: string): Promise<Handoff> {
    const { data, error } = await this.client.rpc("accept_exchange_offer", { p_offer: offerId });
    if (error) throw new Error(error.message);
    return this.toHandoff(data as TxnRow);
  }

  async decline(offerId: string): Promise<void> {
    const { error } = await this.client.rpc("decline_exchange_offer", { p_offer: offerId });
    if (error) throw new Error(error.message);
  }
  async cancel(offerId: string): Promise<void> {
    const { error } = await this.client.rpc("cancel_exchange_offer", { p_offer: offerId });
    if (error) throw new Error(error.message);
  }

  async counter(input: CounterOffer): Promise<Offer> {
    const me = await this.uid();
    const { data, error } = await this.client.rpc("counter_exchange_offer", {
      p_parent: input.parentOfferId,
      p_offered_listing: input.offeredListingId ?? null,
      p_note: input.note ?? null,
      p_handoff_at: input.handoffAt ?? null,
      p_location_text: input.handoffLocationText ?? null,
      p_location_id: input.handoffLocationId ?? null,
      p_return_by: input.returnBy ?? null,
    });
    if (error) throw new Error(error.message);
    return (await this.toOffers([data as OfferRow], me))[0]!;
  }

  async setHandoffPlan(input: HandoffPlan): Promise<Handoff> {
    const { data, error } = await this.client.rpc("set_handoff_plan", {
      p_transaction: input.transactionId,
      p_handoff_at: input.handoffAt ?? null,
      p_location_text: input.handoffLocationText ?? null,
      p_location_id: input.handoffLocationId ?? null,
      p_ready: input.ready ?? false,
    });
    if (error) throw new Error(error.message);
    return this.toHandoff(data as TxnRow);
  }

  async confirmCompletion(transactionId: string): Promise<Handoff> {
    const { data, error } = await this.client.rpc("confirm_completion", { p_transaction: transactionId });
    if (error) throw new Error(error.message);
    return this.toHandoff(data as TxnRow);
  }
  async markHandedOver(transactionId: string): Promise<Handoff> {
    const { data, error } = await this.client.rpc("mark_handed_over", { p_transaction: transactionId });
    if (error) throw new Error(error.message);
    return this.toHandoff(data as TxnRow);
  }
  async markReturned(transactionId: string): Promise<Handoff> {
    const { data, error } = await this.client.rpc("mark_returned", { p_transaction: transactionId });
    if (error) throw new Error(error.message);
    return this.toHandoff(data as TxnRow);
  }

  async myActiveOffers(schoolId: string): Promise<Offer[]> {
    const me = await this.uid();
    const { data, error } = await this.client
      .from("offers")
      .select(OFFER_COLS)
      .eq("school_id", schoolId)
      .in("status", ["pending", "accepted"])
      .or(`from_user_id.eq.${me},to_user_id.eq.${me}`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return this.toOffers((data ?? []) as OfferRow[], me);
  }

  async myHandoffs(schoolId: string): Promise<OfferDetail[]> {
    const { data, error } = await this.client
      .from("transactions")
      .select(TXN_COLS)
      .eq("school_id", schoolId)
      .eq("status", "handoff_pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const out: OfferDetail[] = [];
    for (const t of (data ?? []) as TxnRow[]) {
      const detail = await this.getById(t.offer_id);
      if (detail) out.push(detail);
    }
    return out;
  }
}

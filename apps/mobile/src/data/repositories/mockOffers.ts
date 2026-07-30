/**
 * Deterministic mock OfferRepository for demo mode. Mirrors the server lifecycle
 * (ownership, block, same-school, ONE active reservation per listing, atomic
 * accept, counter chain, give/swap completion, borrow/lend handoff-vs-return) over
 * the local KV store, and drops system messages into the messaging store so offer
 * cards + status lines appear in the thread. All rules are enforced here — screens
 * stay data-source agnostic.
 */
import type { HandoffStage, HandoffStatus, OfferKind, OfferStatus } from "@swap/types";
import type { Handoff, Offer, OfferDetail, OfferListingRef, Listing } from "../../domain/models";
import { StorageKeys, type JsonStore } from "../storage";
import { demoConversations, demoListings } from "../demo";
import { demoProfileById } from "../demo";
import { newId } from "../../lib/id";
import type { CounterOffer, HandoffPlan, NewOffer, OfferRepository } from "./types";

interface StoredOffer {
  id: string;
  schoolId: string;
  conversationId: string;
  kind: OfferKind;
  status: OfferStatus;
  fromUserId: string;
  toUserId: string;
  listingId: string;
  offeredListingId: string | null;
  note: string | null;
  handoffAt: string | null;
  handoffLocationText: string | null;
  returnBy: string | null;
  expiresAt: string | null;
  parentOfferId: string | null;
  createdAt: string;
  updatedAt: string;
}
interface StoredTxn {
  id: string;
  offerId: string;
  schoolId: string;
  kind: OfferKind;
  status: string;
  handoffStatus: HandoffStatus;
  stage: HandoffStage;
  scheduledAt: string | null;
  handoffLocationText: string | null;
  returnBy: string | null;
  handedOverAt: string | null;
  returnedAt: string | null;
  completedAt: string | null;
}
interface StoredReservation { listingId: string; transactionId: string; status: "active" | "released" | "completed" }
interface StoredMessage { id: string; conversationId: string; senderId: string | null; type: "text" | "system"; body: string; createdAt: string }

type ConvInfo = { id: string; schoolId: string; participants: [string, string] };

export class MockOfferRepository implements OfferRepository {
  constructor(private readonly store: JsonStore) {}

  private me(): Promise<string> {
    return this.store.read<string | null>(StorageKeys.selectedProfile, null).then((v) => v ?? "demo-user");
  }
  private offers(): Promise<StoredOffer[]> { return this.store.read<StoredOffer[]>(StorageKeys.demoOffers, []); }
  private txns(): Promise<StoredTxn[]> { return this.store.read<StoredTxn[]>(StorageKeys.demoTransactions, []); }
  private reservations(): Promise<StoredReservation[]> { return this.store.read<StoredReservation[]>(StorageKeys.demoReservations, []); }
  private confirmations(): Promise<{ transactionId: string; userId: string }[]> {
    return this.store.read<{ transactionId: string; userId: string }[]>(StorageKeys.demoConfirmations, []);
  }
  private statusOverrides(): Promise<Record<string, string>> {
    return this.store.read<Record<string, string>>(StorageKeys.demoListingStatus, {});
  }
  private blocks(): Promise<string[]> { return this.store.read<string[]>(StorageKeys.demoBlocks, []); }

  private async conversation(id: string): Promise<ConvInfo | null> {
    const dyn = await this.store.read<{ id: string; schoolId: string; participants: [string, string] }[]>(StorageKeys.demoConversations, []);
    const d = dyn.find((c) => c.id === id);
    if (d) return { id: d.id, schoolId: d.schoolId, participants: d.participants };
    const seed = demoConversations.find((c) => c.id === id);
    if (seed) return { id: seed.id, schoolId: seed.schoolId, participants: [seed.a, seed.b] };
    return null;
  }

  private async publishedListings(): Promise<Listing[]> {
    return this.store.read<Listing[]>(StorageKeys.publishedDemoListings, []);
  }

  /** Effective listing view: base demo/published + any offer-driven status override. */
  private async listingRef(id: string): Promise<(OfferListingRef & { schoolId: string }) | null> {
    const overrides = await this.statusOverrides();
    const base = [...(await this.publishedListings()), ...demoListings].find((l) => l.id === id);
    if (!base) return null;
    const status = (overrides[id] ?? base.status) as OfferListingRef["status"];
    return { id: base.id, title: base.title, image: base.images[0] ?? null, postType: base.postType, status, ownerId: base.ownerId, schoolId: base.schoolId };
  }

  private async hasActiveReservation(listingId: string): Promise<boolean> {
    return (await this.reservations()).some((r) => r.listingId === listingId && r.status === "active");
  }

  private async postSystem(conversationId: string, schoolId: string, body: string): Promise<void> {
    void schoolId;
    const msgs = await this.store.read<StoredMessage[]>(StorageKeys.demoMessages, []);
    const row: StoredMessage = { id: newId("msg"), conversationId, senderId: null, type: "system", body, createdAt: new Date().toISOString() };
    await this.store.write(StorageKeys.demoMessages, [...msgs, row]);
  }

  private toOffer(o: StoredOffer, me: string, listing: OfferListingRef | null, offered: OfferListingRef | null): Offer {
    return {
      id: o.id, schoolId: o.schoolId, conversationId: o.conversationId, kind: o.kind, status: o.status,
      fromUserId: o.fromUserId, toUserId: o.toUserId, listing, offeredListing: offered,
      note: o.note, handoffAt: o.handoffAt, handoffLocationText: o.handoffLocationText, returnBy: o.returnBy,
      expiresAt: o.expiresAt, parentOfferId: o.parentOfferId, createdAt: o.createdAt, updatedAt: o.updatedAt,
      amSender: o.fromUserId === me, amRecipient: o.toUserId === me,
    };
  }
  private async toOfferAsync(o: StoredOffer, me: string): Promise<Offer> {
    const listing = o.listingId ? await this.listingRef(o.listingId) : null;
    const offered = o.offeredListingId ? await this.listingRef(o.offeredListingId) : null;
    return this.toOffer(o, me, listing, offered);
  }
  private async toHandoff(t: StoredTxn, me: string): Promise<Handoff> {
    const confs = (await this.confirmations()).filter((c) => c.transactionId === t.id);
    return {
      id: t.id, offerId: t.offerId, kind: t.kind, status: t.status, handoffStatus: t.handoffStatus, stage: t.stage,
      scheduledAt: t.scheduledAt, handoffLocationText: t.handoffLocationText, returnBy: t.returnBy,
      handedOverAt: t.handedOverAt, returnedAt: t.returnedAt, completedAt: t.completedAt,
      iConfirmed: confs.some((c) => c.userId === me), confirmations: new Set(confs.map((c) => c.userId)).size,
    };
  }

  async listForConversation(conversationId: string): Promise<Offer[]> {
    const me = await this.me();
    const rows = (await this.offers()).filter((o) => o.conversationId === conversationId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return Promise.all(rows.map((o) => this.toOfferAsync(o, me)));
  }

  async getById(offerId: string): Promise<OfferDetail | null> {
    const me = await this.me();
    const all = await this.offers();
    const o = all.find((x) => x.id === offerId);
    if (!o) return null;
    // Walk to the root, then gather the whole chain.
    let root = o;
    while (root.parentOfferId) {
      const p = all.find((x) => x.id === root.parentOfferId);
      if (!p) break;
      root = p;
    }
    const chainRows: StoredOffer[] = [];
    const queue = [root.id];
    while (queue.length) {
      const id = queue.shift()!;
      const cur = all.find((x) => x.id === id);
      if (cur) chainRows.push(cur);
      for (const kid of all.filter((x) => x.parentOfferId === id)) queue.push(kid.id);
    }
    chainRows.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const chain = await Promise.all(chainRows.map((r) => this.toOfferAsync(r, me)));
    const offer = chain.find((c) => c.id === offerId)!;
    const txn = (await this.txns()).find((t) => t.offerId === offerId) ?? null;
    const handoff = txn ? await this.toHandoff(txn, me) : null;
    return { offer, handoff, chain };
  }

  async create(input: NewOffer): Promise<Offer> {
    const me = await this.me();
    if (input.kind === "sale") throw new Error("sale_not_enabled");
    const conv = await this.conversation(input.conversationId);
    if (!conv) throw new Error("conversation_not_found");
    if (!conv.participants.includes(me)) throw new Error("not_authorized");
    const profile = demoProfileById(me);
    if (profile && profile.membershipStatus !== "verified") throw new Error("not_a_member");
    const other = conv.participants.find((p) => p !== me)!;
    if ((await this.blocks()).includes(other)) throw new Error("blocked");

    if ((await this.offers()).some((o) => o.conversationId === conv.id && o.status === "pending")) throw new Error("offer_already_active");

    const listing = await this.listingRef(input.listingId);
    if (!listing) throw new Error("listing_not_found");
    if (listing.schoolId !== conv.schoolId) throw new Error("cross_school_listing");
    if (listing.status !== "active") throw new Error("listing_not_available");
    if (input.kind === "lend") {
      if (listing.ownerId !== me) throw new Error("not_listing_owner");
    } else {
      if (listing.ownerId === me) throw new Error("cannot_request_own_listing");
      if (listing.ownerId !== other) throw new Error("listing_not_counterpart_owned");
    }
    let offeredId: string | null = null;
    if (input.kind === "swap") {
      if (!input.offeredListingId) throw new Error("swap_requires_offered_listing");
      if (input.offeredListingId === input.listingId) throw new Error("cannot_swap_same_listing");
      const off = await this.listingRef(input.offeredListingId);
      if (!off) throw new Error("offered_listing_not_found");
      if (off.ownerId !== me) throw new Error("not_offered_listing_owner");
      if (off.status !== "active") throw new Error("offered_listing_not_available");
      offeredId = off.id;
    }

    const now = new Date().toISOString();
    const offer: StoredOffer = {
      id: newId("offer"), schoolId: conv.schoolId, conversationId: conv.id, kind: input.kind, status: "pending",
      fromUserId: me, toUserId: other, listingId: input.listingId, offeredListingId: offeredId,
      note: input.note?.trim() || null, handoffAt: input.handoffAt ?? null, handoffLocationText: input.handoffLocationText?.trim() || null,
      returnBy: input.kind === "borrow" || input.kind === "lend" ? input.returnBy ?? null : null,
      expiresAt: input.expiresAt ?? null, parentOfferId: null, createdAt: now, updatedAt: now,
    };
    await this.store.write(StorageKeys.demoOffers, [...(await this.offers()), offer]);
    await this.postSystem(conv.id, conv.schoolId, `📦 Sent a ${input.kind} offer`);
    return this.toOfferAsync(offer, me);
  }

  private async patchOffer(id: string, patch: Partial<StoredOffer>): Promise<void> {
    const all = await this.offers();
    await this.store.write(StorageKeys.demoOffers, all.map((o) => (o.id === id ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o)));
  }
  private async setListingStatus(listingId: string, status: string): Promise<void> {
    const o = await this.statusOverrides();
    await this.store.write(StorageKeys.demoListingStatus, { ...o, [listingId]: status });
  }

  async accept(offerId: string): Promise<Handoff> {
    const me = await this.me();
    const offer = (await this.offers()).find((o) => o.id === offerId);
    if (!offer) throw new Error("offer_not_found");
    if (offer.toUserId !== me) throw new Error("not_authorized");
    if (offer.status !== "pending") throw new Error("invalid_offer_state");
    if ((await this.blocks()).includes(offer.fromUserId)) throw new Error("blocked");

    const listingIds = [offer.listingId, ...(offer.offeredListingId ? [offer.offeredListingId] : [])];
    for (const id of listingIds) {
      const l = await this.listingRef(id);
      if (!l || l.status !== "active") throw new Error("listing_not_available");
      if (await this.hasActiveReservation(id)) throw new Error("listing_not_available");
    }
    const scheduled = offer.handoffAt || offer.handoffLocationText;
    const txn: StoredTxn = {
      id: newId("txn"), offerId: offer.id, schoolId: offer.schoolId, kind: offer.kind, status: "handoff_pending",
      handoffStatus: scheduled ? "scheduled" : "not_scheduled", stage: "none",
      scheduledAt: offer.handoffAt, handoffLocationText: offer.handoffLocationText, returnBy: offer.returnBy,
      handedOverAt: null, returnedAt: null, completedAt: null,
    };
    await this.store.write(StorageKeys.demoTransactions, [...(await this.txns()), txn]);
    const res = await this.reservations();
    const newRes: StoredReservation[] = listingIds.map((id) => ({ listingId: id, transactionId: txn.id, status: "active" }));
    await this.store.write(StorageKeys.demoReservations, [...res, ...newRes]);
    for (const id of listingIds) await this.setListingStatus(id, "reserved");
    await this.patchOffer(offer.id, { status: "accepted" });
    await this.postSystem(offer.conversationId, offer.schoolId, "✅ Accepted the offer — plan the handoff");
    return this.toHandoff(txn, me);
  }

  async decline(offerId: string): Promise<void> {
    const me = await this.me();
    const offer = (await this.offers()).find((o) => o.id === offerId);
    if (!offer) throw new Error("offer_not_found");
    if (offer.toUserId !== me) throw new Error("not_authorized");
    if (offer.status !== "pending") throw new Error("invalid_offer_state");
    await this.patchOffer(offerId, { status: "declined" });
    await this.postSystem(offer.conversationId, offer.schoolId, "❌ Declined the offer");
  }
  async cancel(offerId: string): Promise<void> {
    const me = await this.me();
    const offer = (await this.offers()).find((o) => o.id === offerId);
    if (!offer) throw new Error("offer_not_found");
    if (offer.fromUserId !== me) throw new Error("not_authorized");
    if (offer.status !== "pending") throw new Error("invalid_offer_state");
    await this.patchOffer(offerId, { status: "cancelled" });
    await this.postSystem(offer.conversationId, offer.schoolId, "🚫 Cancelled the offer");
  }

  async counter(input: CounterOffer): Promise<Offer> {
    const me = await this.me();
    const parent = (await this.offers()).find((o) => o.id === input.parentOfferId);
    if (!parent) throw new Error("offer_not_found");
    if (parent.toUserId !== me) throw new Error("not_authorized");
    if (parent.status !== "pending") throw new Error("invalid_offer_state");
    if ((await this.blocks()).includes(parent.fromUserId)) throw new Error("blocked");
    let offeredId = parent.offeredListingId;
    if (input.offeredListingId) {
      const off = await this.listingRef(input.offeredListingId);
      if (!off) throw new Error("offered_listing_not_found");
      if (off.ownerId !== me) throw new Error("not_offered_listing_owner");
      offeredId = off.id;
    }
    await this.patchOffer(parent.id, { status: "countered" });
    const now = new Date().toISOString();
    const counter: StoredOffer = {
      id: newId("offer"), schoolId: parent.schoolId, conversationId: parent.conversationId, kind: parent.kind, status: "pending",
      fromUserId: me, toUserId: parent.fromUserId, listingId: parent.listingId, offeredListingId: offeredId,
      note: input.note?.trim() || null, handoffAt: input.handoffAt ?? parent.handoffAt,
      handoffLocationText: input.handoffLocationText?.trim() ?? parent.handoffLocationText,
      returnBy: parent.kind === "borrow" || parent.kind === "lend" ? input.returnBy ?? parent.returnBy : null,
      expiresAt: parent.expiresAt, parentOfferId: parent.id, createdAt: now, updatedAt: now,
    };
    await this.store.write(StorageKeys.demoOffers, [...(await this.offers()), counter]);
    await this.postSystem(parent.conversationId, parent.schoolId, "🔁 Sent a counteroffer");
    return this.toOfferAsync(counter, me);
  }

  private async txn(id: string): Promise<StoredTxn> {
    const t = (await this.txns()).find((x) => x.id === id);
    if (!t) throw new Error("transaction_not_found");
    return t;
  }
  private async patchTxn(id: string, patch: Partial<StoredTxn>): Promise<StoredTxn> {
    const all = await this.txns();
    const next = all.map((t) => (t.id === id ? { ...t, ...patch } : t));
    await this.store.write(StorageKeys.demoTransactions, next);
    return next.find((t) => t.id === id)!;
  }
  private async offerFor(txnId: string): Promise<StoredOffer> {
    const t = await this.txn(txnId);
    return (await this.offers()).find((o) => o.id === t.offerId)!;
  }
  private async assertParticipant(txnId: string, me: string): Promise<StoredOffer> {
    const o = await this.offerFor(txnId);
    if (me !== o.fromUserId && me !== o.toUserId) throw new Error("not_authorized");
    return o;
  }

  async setHandoffPlan(input: HandoffPlan): Promise<Handoff> {
    const me = await this.me();
    const offer = await this.assertParticipant(input.transactionId, me);
    const t = await this.txn(input.transactionId);
    if (t.status !== "handoff_pending") throw new Error("invalid_transaction_state");
    const next = await this.patchTxn(input.transactionId, {
      scheduledAt: input.handoffAt ?? t.scheduledAt,
      handoffLocationText: input.handoffLocationText ?? t.handoffLocationText,
      handoffStatus: input.ready ? "ready" : "scheduled",
    });
    await this.postSystem(offer.conversationId, offer.schoolId, input.ready ? "📍 Handoff is ready" : "🗓️ Handoff scheduled");
    return this.toHandoff(next, me);
  }

  async confirmCompletion(transactionId: string): Promise<Handoff> {
    const me = await this.me();
    const offer = await this.assertParticipant(transactionId, me);
    const t = await this.txn(transactionId);
    if (t.status !== "handoff_pending") throw new Error("invalid_transaction_state");
    if (t.kind === "borrow" || t.kind === "lend") throw new Error("use_return_flow_for_borrow_lend");
    const confs = await this.confirmations();
    if (!confs.some((c) => c.transactionId === transactionId && c.userId === me)) {
      await this.store.write(StorageKeys.demoConfirmations, [...confs, { transactionId, userId: me }]);
    }
    const now = new Set((await this.confirmations()).filter((c) => c.transactionId === transactionId).map((c) => c.userId));
    if (now.has(offer.fromUserId) && now.has(offer.toUserId)) {
      const nowIso = new Date().toISOString();
      const next = await this.patchTxn(transactionId, { status: "completed", handoffStatus: "completed", completedAt: nowIso });
      await this.patchOffer(offer.id, { status: "completed" });
      for (const r of (await this.reservations()).filter((x) => x.transactionId === transactionId)) await this.setListingStatus(r.listingId, "completed");
      await this.store.write(StorageKeys.demoReservations, (await this.reservations()).map((r) => (r.transactionId === transactionId ? { ...r, status: "completed" as const } : r)));
      await this.postSystem(offer.conversationId, offer.schoolId, "🎉 Handoff complete");
      return this.toHandoff(next, me);
    }
    await this.postSystem(offer.conversationId, offer.schoolId, "👍 Marked the handoff complete — waiting on the other person");
    return this.toHandoff(await this.txn(transactionId), me);
  }

  async markHandedOver(transactionId: string): Promise<Handoff> {
    const me = await this.me();
    const offer = await this.assertParticipant(transactionId, me);
    const t = await this.txn(transactionId);
    if (t.kind !== "borrow" && t.kind !== "lend") throw new Error("not_a_borrow_lend");
    if (t.status !== "handoff_pending") throw new Error("invalid_transaction_state");
    const next = await this.patchTxn(transactionId, { stage: "return_due", handoffStatus: "ready", handedOverAt: new Date().toISOString() });
    await this.postSystem(offer.conversationId, offer.schoolId, "🤝 Item handed over — return expected");
    return this.toHandoff(next, me);
  }

  async markReturned(transactionId: string): Promise<Handoff> {
    const me = await this.me();
    const offer = await this.assertParticipant(transactionId, me);
    const t = await this.txn(transactionId);
    if (t.kind !== "borrow" && t.kind !== "lend") throw new Error("not_a_borrow_lend");
    if (t.stage !== "return_due") throw new Error("item_not_handed_over");
    const nowIso = new Date().toISOString();
    const next = await this.patchTxn(transactionId, { stage: "returned", handoffStatus: "completed", status: "completed", returnedAt: nowIso, completedAt: nowIso });
    await this.patchOffer(offer.id, { status: "completed" });
    for (const r of (await this.reservations()).filter((x) => x.transactionId === transactionId)) await this.setListingStatus(r.listingId, "active");
    await this.store.write(StorageKeys.demoReservations, (await this.reservations()).map((r) => (r.transactionId === transactionId ? { ...r, status: "released" as const } : r)));
    await this.postSystem(offer.conversationId, offer.schoolId, "↩️ Item returned — all done");
    return this.toHandoff(next, me);
  }

  async myActiveOffers(schoolId: string): Promise<Offer[]> {
    const me = await this.me();
    const rows = (await this.offers()).filter(
      (o) => o.schoolId === schoolId && (o.fromUserId === me || o.toUserId === me) && (o.status === "pending" || o.status === "accepted"),
    );
    return Promise.all(rows.map((o) => this.toOfferAsync(o, me)));
  }

  async myHandoffs(schoolId: string): Promise<OfferDetail[]> {
    const me = await this.me();
    const active = (await this.txns()).filter((t) => t.schoolId === schoolId && t.status === "handoff_pending");
    const out: OfferDetail[] = [];
    for (const t of active) {
      const o = (await this.offers()).find((x) => x.id === t.offerId);
      if (o && (o.fromUserId === me || o.toUserId === me)) {
        const detail = await this.getById(o.id);
        if (detail) out.push(detail);
      }
    }
    return out;
  }
}

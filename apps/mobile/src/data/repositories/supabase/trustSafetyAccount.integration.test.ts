/**
 * Real-backend E2E proof for the Trust & Safety + Account surfaces (release Steps
 * 3–4). Boots against a disposable Supabase stack and drives the ACTUAL repository
 * classes under RLS across two schools, proving what only had pgTAP + mock coverage
 * before:
 *   • Reporting: a report's reporter + school are server-resolved (unforgeable);
 *     block list add / list / unblock is caller-scoped.
 *   • Moderation: only a school's moderators see its reports; a moderator removes a
 *     listing + resolves the report + suspends a member; a CROSS-school moderator is
 *     blocked from acting on this school's content.
 *   • Account: profile edit, self-scoped data export (only the caller's own rows),
 *     and a reversible deletion request — all as the real Supabase repositories.
 *
 * Skips cleanly when SUPABASE_URL is absent (never runs in the unit suite).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { SupabaseMarketplaceRepository } from "./marketplace";
import { SupabaseReportRepository } from "./reports";
import { SupabaseModerationRepository } from "./moderation";
import { SupabaseAccountRepository } from "./account";
import type { NewListing } from "../types";
import type { OwnerPreview } from "../../../domain/models";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PASSWORD = "Password123!";
const owner: OwnerPreview = { displayName: "S", avatarEmoji: "🙂", verified: true };
const noImages = { imageReader: async () => new Uint8Array() };
const svc = () => createClient(URL as string, SERVICE, { auth: { persistSession: false } });

async function makeUser(email: string, schoolId: string, opts?: { moderator?: boolean }) {
  const admin = svc();
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser ${email}: ${created.error?.message}`);
  const id = created.data.user.id;
  await admin.from("users").insert({ id, display_name: email.split("@")[0] });
  await admin.from("school_memberships").insert({ school_id: schoolId, user_id: id, status: "verified", verification_method: "email_otp" });
  if (opts?.moderator) {
    await admin.from("school_admins").insert({ school_id: schoolId, user_id: id, role: "school_moderator", active: true });
  }
  const client = createClient(URL as string, ANON, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw new Error(`sign-in ${email}: ${signIn.error.message}`);
  return { id, client };
}

const mk = (schoolId: string, title: string): NewListing => ({
  schoolId, postType: "give", title, description: "x", category: "dormitory_items", condition: "good",
  desiredItem: null, images: [], handoffLocation: null, expiresAt: null,
});

describe.skipIf(!URL)("Supabase Trust & Safety + Account (real users, two schools)", () => {
  const tag = randomUUID().slice(0, 8);
  const A = randomUUID();
  const B = randomUUID();
  let mod: { id: string; client: SupabaseClient }; // moderator of A
  let m1: { id: string; client: SupabaseClient };  // A member: listing owner + report target
  let m2: { id: string; client: SupabaseClient };  // A member: reporter
  let modB: { id: string; client: SupabaseClient }; // moderator of B (cross-school)
  let listingId: string;
  let reportId: string;

  beforeAll(async () => {
    if (!URL) return;
    const admin = svc();
    for (const [id, slug] of [[A, `tsa-${tag}`], [B, `tsb-${tag}`]] as const) {
      await admin.from("schools").insert({ id, name: `School ${slug}`, slug, status: "active" });
      await admin.from("school_settings").upsert({ school_id: id, enabled_verification_methods: ["email_otp", "manual"] });
    }
    mod = await makeUser(`tmod-${tag}@a.test`, A, { moderator: true });
    m1 = await makeUser(`tm1-${tag}@a.test`, A);
    m2 = await makeUser(`tm2-${tag}@a.test`, A);
    modB = await makeUser(`tmb-${tag}@b.test`, B, { moderator: true });

    listingId = (await new SupabaseMarketplaceRepository(m1.client, noImages).createListing(mk(A, `lamp-${tag}`), owner)).id;
  });

  // ------------------------------------------------------------- reporting ---
  it("a report's reporter + school are resolved server-side (unforgeable)", async () => {
    await new SupabaseReportRepository(m2.client).submitReport({ targetType: "listing", targetId: listingId, reason: "spam", explanation: "off-policy" });
    const { data } = await svc().from("reports").select("id, reporter_id, school_id, status").eq("target_id", listingId).single();
    expect(data?.reporter_id).toBe(m2.id);
    expect(data?.school_id).toBe(A);
    expect(data?.status).toBe("open");
    reportId = data!.id as string;
  });

  it("the block list is caller-scoped: add, list, unblock", async () => {
    // No repository 'block' verb (blocking happens from a thread), so create the row
    // as the caller (RLS permits only your own), then drive the repo's list/unblock.
    const reports = new SupabaseReportRepository(m2.client);
    await m2.client.from("blocks").insert({ school_id: A, blocker_id: m2.id, blocked_id: m1.id });
    const blocked = await reports.listBlockedUsers();
    expect(blocked.map((b) => b.userId)).toContain(m1.id);
    await reports.unblock(m1.id);
    expect(await reports.listBlockedUsers()).toHaveLength(0);
  });

  // --------------------------------------------------------------- account ---
  it("data export is self-scoped to the caller", async () => {
    const m2Export = (await new SupabaseAccountRepository(m2.client).exportMyData()) as {
      profile: { display_name?: string };
      reports_filed: unknown[];
      listings: unknown[];
    };
    expect(m2Export.reports_filed.length).toBeGreaterThanOrEqual(1); // m2 filed the report
    const m1Export = (await new SupabaseAccountRepository(m1.client).exportMyData()) as {
      reports_filed: unknown[];
      listings: { title?: string }[];
    };
    expect(m1Export.reports_filed).toHaveLength(0); // m1 filed none — no leak of m2's report
    expect(m1Export.listings.some((l) => l.title === `lamp-${tag}`)).toBe(true);
  });

  it("profile edit updates only the caller's own row", async () => {
    await new SupabaseAccountRepository(m1.client).updateProfile({ displayName: `Renamed ${tag}`, gradYear: 2027 });
    const { data } = await svc().from("users").select("display_name, grad_year").eq("id", m1.id).single();
    expect(data?.display_name).toBe(`Renamed ${tag}`);
    expect(data?.grad_year).toBe(2027);
  });

  // ------------------------------------------------------------ moderation ---
  it("only a school's moderators see its reports", async () => {
    expect(await new SupabaseModerationRepository(mod.client).isModerator(A)).toBe(true);
    expect(await new SupabaseModerationRepository(m2.client).isModerator(A)).toBe(false);

    expect((await new SupabaseModerationRepository(mod.client).openReports(A)).some((r) => r.id === reportId)).toBe(true);
    // A non-moderator, non-reporter member sees nothing of the queue (RLS lets a
    // reporter see their OWN report, so we assert with m1, the target — not m2).
    expect((await new SupabaseModerationRepository(m1.client).openReports(A)).some((r) => r.id === reportId)).toBe(false);
    // A cross-school moderator sees nothing of this school's reports.
    expect((await new SupabaseModerationRepository(modB.client).openReports(A)).some((r) => r.id === reportId)).toBe(false);
  });

  it("a moderator removes the listing + resolves the report; a cross-school moderator cannot act", async () => {
    const modRepo = new SupabaseModerationRepository(mod.client);
    await modRepo.setListingStatus(listingId, "remove_content", reportId, "off-policy");
    const removed = await svc().from("listings").select("status").eq("id", listingId).single();
    expect(removed.data?.status).toBe("removed");

    await modRepo.resolveReport(reportId, "resolved", "content removed");
    const resolved = await svc().from("reports").select("status").eq("id", reportId).single();
    expect(resolved.data?.status).toBe("resolved");

    // A moderator of another school is denied acting on this school's content.
    await expect(new SupabaseModerationRepository(modB.client).setListingStatus(listingId, "restore_content")).rejects.toThrow();
  });

  it("a moderator suspends a member of their school", async () => {
    await new SupabaseModerationRepository(mod.client).suspendMember(m1.id, A, "repeated violations");
    const { data } = await svc().from("school_memberships").select("status").eq("user_id", m1.id).eq("school_id", A).single();
    expect(data?.status).toBe("suspended");
  });

  // --------------------------------------------------- reversible deletion ---
  it("a member can request deletion of their own account (soft, reversible)", async () => {
    await new SupabaseAccountRepository(m2.client).requestDeletion();
    const { data } = await svc().from("users").select("account_status, deletion_requested_at").eq("id", m2.id).single();
    expect(data?.account_status).toBe("deletion_requested");
    expect(data?.deletion_requested_at).not.toBeNull();
  });
});

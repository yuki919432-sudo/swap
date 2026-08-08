/**
 * Supabase-backed MembershipRepository. All enrollment goes through the existing
 * server-authoritative RPCs (`redeem_invitation`, `request_membership`); the caller
 * can only read their OWN membership row (RLS). Never trusts client-side claims of
 * status — the DB is the authority.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembershipStatus } from "@swap/types";
import type { Membership, MembershipRepository } from "../types";

interface MembershipJoinRow {
  school_id: string;
  status: MembershipStatus;
  schools: { id: string; name: string; status: string } | null;
}

export class SupabaseMembershipRepository implements MembershipRepository {
  constructor(private readonly client: SupabaseClient) {}

  async myMembership(): Promise<Membership | null> {
    const { data: userData } = await this.client.auth.getUser();
    if (!userData.user) return null;
    const { data, error } = await this.client
      .from("school_memberships")
      .select("school_id, status, schools(id, name, status)")
      .eq("user_id", userData.user.id);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as MembershipJoinRow[];
    if (rows.length === 0) return null;
    // Prefer a verified membership; otherwise surface the most relevant single row.
    const row = rows.find((r) => r.status === "verified") ?? rows[0]!;
    if (!row.schools) return null;
    return {
      schoolId: row.school_id,
      schoolName: row.schools.name,
      status: row.status,
      schoolActive: row.schools.status === "active",
    };
  }

  async redeemInvitation(code: string): Promise<Membership> {
    const { data, error } = await this.client.rpc("redeem_invitation", { p_code: code.trim() });
    if (error) throw new Error(error.message);
    const result = (data ?? {}) as { ok?: boolean; error?: string };
    if (result.ok === false) throw new Error(result.error ?? "invitation_invalid");
    const membership = await this.myMembership();
    if (!membership) throw new Error("enrollment_failed");
    return membership;
  }

  async requestManual(input: { schoolId: string; gradYear?: number | null; explanation?: string | null }): Promise<Membership> {
    const { data, error } = await this.client.rpc("request_membership", {
      p_school: input.schoolId,
      p_grad_year: input.gradYear ?? null,
      p_explanation: input.explanation ?? null,
    });
    if (error) throw new Error(error.message);
    const result = (data ?? {}) as { ok?: boolean; error?: string };
    if (result.ok === false) throw new Error(result.error ?? "request_failed");
    const membership = await this.myMembership();
    if (!membership) throw new Error("request_failed");
    return membership;
  }
}

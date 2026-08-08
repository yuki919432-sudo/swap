/**
 * Supabase-backed ModerationRepository. All actions go through the role-gated
 * SECURITY DEFINER RPCs from migration 0032 (resolve_report /
 * moderator_set_listing_status / moderator_suspend_member); authorization is
 * enforced in the DB, never trusted from the client. Reads use the reports_select
 * RLS policy (only a school's moderators see its reports). Private-message CONTENT
 * is never bulk-exposed — a moderator reviews the specific reported item.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportReason, ReportStatus, ReportTargetType } from "@swap/types";
import type { ContentAction, ModerationReportView, ModerationRepository } from "../types";

const MOD_ROLES = ["school_owner", "school_admin", "school_moderator"];

interface ReportRow {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  explanation: string | null;
  status: ReportStatus;
  created_at: string;
  reporter: { display_name: string | null } | null;
}

export class SupabaseModerationRepository implements ModerationRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async me(): Promise<string | null> {
    const { data } = await this.client.auth.getUser();
    return data.user?.id ?? null;
  }

  async isModerator(schoolId: string): Promise<boolean> {
    const uid = await this.me();
    if (!uid) return false;
    const { data } = await this.client
      .from("school_admins")
      .select("role")
      .eq("user_id", uid)
      .eq("school_id", schoolId)
      .eq("active", true);
    return ((data ?? []) as { role: string }[]).some((r) => MOD_ROLES.includes(r.role));
  }

  async openReports(schoolId: string): Promise<ModerationReportView[]> {
    const { data, error } = await this.client
      .from("reports")
      .select("id, target_type, target_id, reason, explanation, status, created_at, reporter:reporter_id(display_name)")
      .eq("school_id", schoolId)
      .in("status", ["open", "reviewing"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as ReportRow[]).map((r) => ({
      id: r.id,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      explanation: r.explanation,
      status: r.status,
      createdAt: r.created_at,
      reporterName: r.reporter?.display_name ?? "A student",
    }));
  }

  async resolveReport(reportId: string, status: ReportStatus, resolution?: string | null): Promise<void> {
    const { error } = await this.client.rpc("resolve_report", { p_report: reportId, p_status: status, p_resolution: resolution ?? null });
    if (error) throw new Error(error.message);
  }

  async setListingStatus(listingId: string, action: ContentAction, reportId?: string | null, reason?: string | null): Promise<void> {
    const { error } = await this.client.rpc("moderator_set_listing_status", { p_listing: listingId, p_action: action, p_report: reportId ?? null, p_reason: reason ?? null });
    if (error) throw new Error(error.message);
  }

  async suspendMember(userId: string, schoolId: string, reason?: string | null): Promise<void> {
    const { error } = await this.client.rpc("moderator_suspend_member", { p_user: userId, p_school: schoolId, p_reason: reason ?? null });
    if (error) throw new Error(error.message);
  }
}

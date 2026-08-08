/**
 * Supabase-backed ReportRepository (Trust & Safety, user side). Reports and blocks
 * are written directly under RLS: a report's reporter is always the caller and its
 * school is the caller's verified school; a block is always the caller's own. The
 * DB is the authority — the client cannot forge another user's report or block.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emojiForKey } from "./map";
import type { BlockedUser, NewReport, ReportRepository } from "../types";

export class SupabaseReportRepository implements ReportRepository {
  constructor(private readonly client: SupabaseClient) {}

  private async me(): Promise<string> {
    const { data } = await this.client.auth.getUser();
    if (!data.user) throw new Error("not_authenticated");
    return data.user.id;
  }

  /** The caller's verified school (reports must belong to it). */
  private async schoolId(uid: string): Promise<string> {
    const { data } = await this.client.from("school_memberships").select("school_id, status").eq("user_id", uid);
    const rows = (data ?? []) as { school_id: string; status: string }[];
    const verified = rows.find((r) => r.status === "verified") ?? rows[0];
    if (!verified) throw new Error("no_membership");
    return verified.school_id;
  }

  async submitReport(input: NewReport): Promise<void> {
    const uid = await this.me();
    const school = await this.schoolId(uid);
    const { error } = await this.client.from("reports").insert({
      school_id: school,
      reporter_id: uid,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason,
      explanation: input.explanation ?? null,
      evidence_url: input.evidenceUrl ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async listBlockedUsers(): Promise<BlockedUser[]> {
    const uid = await this.me();
    const { data, error } = await this.client.from("blocks").select("blocked_id").eq("blocker_id", uid);
    if (error) throw new Error(error.message);
    const ids = ((data ?? []) as { blocked_id: string }[]).map((b) => b.blocked_id);
    if (ids.length === 0) return [];
    const { data: users } = await this.client.from("users").select("id, display_name").in("id", ids);
    const nameById = new Map<string, string>();
    for (const u of (users ?? []) as { id: string; display_name: string | null }[]) nameById.set(u.id, u.display_name ?? "Student");
    return ids.map((id) => ({ userId: id, displayName: nameById.get(id) ?? "Student", avatarEmoji: emojiForKey(id) }));
  }

  async unblock(userId: string): Promise<void> {
    const uid = await this.me();
    const { error } = await this.client.from("blocks").delete().eq("blocker_id", uid).eq("blocked_id", userId);
    if (error) throw new Error(error.message);
  }
}

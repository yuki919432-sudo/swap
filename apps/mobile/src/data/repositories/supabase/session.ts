/**
 * Supabase-backed SessionRepository. The session comes from the real authenticated
 * user (not a demo picker): it reads the user's own profile + verified membership +
 * school via RLS-scoped queries and maps them to the app's session shape.
 *
 * Notes / limitations for this checkpoint:
 *  - Institution type is not yet modeled in the DB; real schools default to
 *    "university" for the local moderation context (regulated categories stay off
 *    by default regardless).
 *  - listSchools/listProfiles/select are demo-only affordances; the real flow
 *    signs in instead of picking a synthetic profile.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemoProfile, DemoSchool } from "../../../domain/models";
import type { MembershipRow, SchoolRow, UserRow, VerificationMethodArray } from "../../supabase/database.types";
import type { SessionRepository, SessionState } from "../types";
import { emojiForKey } from "./map";
import type { MembershipStatus, VerificationMethod } from "@swap/types";

export class SupabaseSessionRepository implements SessionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listSchools(): Promise<DemoSchool[]> {
    return [];
  }
  async listProfiles(): Promise<DemoProfile[]> {
    return [];
  }

  async getCurrent(): Promise<SessionState | null> {
    const { data: userData } = await this.client.auth.getUser();
    const authUser = userData.user;
    if (!authUser) return null;
    const uid = authUser.id;

    // The user's memberships (RLS returns only their own). Prefer a verified one.
    const { data: memberships } = await this.client
      .from("school_memberships")
      .select("id, school_id, user_id, status, verification_method, schools(*)")
      .eq("user_id", uid);
    const rows = (memberships ?? []) as unknown as (MembershipRow & { schools: SchoolRow | null })[];
    const membership = rows.find((m) => m.status === "verified") ?? rows[0];
    if (!membership || !membership.schools) return null;

    const { data: profileRow } = await this.client.from("users").select("id, display_name, avatar_url, grad_year").eq("id", uid).maybeSingle();
    const user = (profileRow ?? null) as UserRow | null;

    const { data: settings } = await this.client
      .from("school_settings")
      .select("enabled_verification_methods")
      .eq("school_id", membership.school_id)
      .maybeSingle();
    const methods = ((settings as { enabled_verification_methods: VerificationMethodArray } | null)?.enabled_verification_methods ??
      []) as VerificationMethod[];

    const schoolRow = membership.schools;
    const school: DemoSchool = {
      id: schoolRow.id,
      name: schoolRow.name,
      institutionType: "university", // not yet modeled in the DB
      description: "",
      memberCount: 0,
      verificationMethods: methods,
      accentEmoji: "🏫",
    };
    const profile: DemoProfile = {
      id: uid,
      schoolId: membership.school_id,
      displayName: user?.display_name ?? "Student",
      membershipStatus: membership.status as MembershipStatus,
      verificationMethod: (membership.verification_method as VerificationMethod | null) ?? null,
      gradYear: user?.grad_year ?? null,
      staffRole: null,
      avatarEmoji: emojiForKey(uid),
      impact: { given: 0, swapped: 0, saved: 0 },
    };
    return { school, profile };
  }

  async select(): Promise<SessionState> {
    throw new Error("select is not supported for a real Supabase session; sign in instead");
  }

  async clear(): Promise<void> {
    await this.client.auth.signOut();
  }
}

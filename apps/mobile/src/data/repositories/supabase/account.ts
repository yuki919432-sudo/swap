/**
 * Supabase-backed AccountRepository. Profile edits are constrained by RLS (a user
 * can only update their OWN row); deletion + export go through the self-scoped
 * `public` RPCs from migration 0033 (request_account_deletion / export_my_account),
 * which the DB authorizes against auth.uid(). No client-supplied user id is ever
 * trusted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountRepository, ProfileEdit } from "../types";

export class SupabaseAccountRepository implements AccountRepository {
  constructor(private readonly client: SupabaseClient) {}

  async updateProfile(input: ProfileEdit): Promise<void> {
    const { data: userData } = await this.client.auth.getUser();
    if (!userData.user) throw new Error("not_authenticated");
    const patch: Record<string, unknown> = {};
    if (input.displayName !== undefined) patch.display_name = input.displayName.trim();
    if (input.gradYear !== undefined) patch.grad_year = input.gradYear;
    if (Object.keys(patch).length === 0) return;
    const { error } = await this.client.from("users").update(patch).eq("id", userData.user.id);
    if (error) throw new Error(error.message);
  }

  async requestDeletion(): Promise<void> {
    const { error } = await this.client.rpc("request_account_deletion");
    if (error) throw new Error(error.message);
  }

  async exportMyData(): Promise<unknown> {
    const { data, error } = await this.client.rpc("export_my_account");
    if (error) throw new Error(error.message);
    return data;
  }
}

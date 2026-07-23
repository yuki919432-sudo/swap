/**
 * Supabase database types for the tables and RPCs the server package uses.
 *
 * This mirrors the shape produced by `supabase gen types typescript` and is the
 * single typed contract used by createClient<Database>. Regenerate it (where the
 * Supabase CLI + Docker are available) with `pnpm db:gen-types`; see
 * docs/local-development.md. It is intentionally a focused subset for Phase 1B.1
 * and grows as new tables/RPCs are exposed.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamptz = string;

export interface Database {
  public: {
    Tables: {
      schools: {
        Row: { id: string; name: string; slug: string; status: Database["public"]["Enums"]["school_status"] };
        Insert: { id?: string; name: string; slug: string; status?: Database["public"]["Enums"]["school_status"] };
        Update: Partial<Database["public"]["Tables"]["schools"]["Insert"]>;
        Relationships: [];
      };
      users: {
        Row: { id: string; display_name: string; avatar_url: string | null; grad_year: number | null };
        Insert: { id: string; display_name: string; avatar_url?: string | null; grad_year?: number | null };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      school_memberships: {
        Row: {
          id: string;
          school_id: string;
          user_id: string;
          status: Database["public"]["Enums"]["membership_status"];
          verification_method: Database["public"]["Enums"]["verification_method"] | null;
          verified_at: Timestamptz | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          school_id: string;
          user_id: string;
          status?: Database["public"]["Enums"]["membership_status"];
          verification_method?: Database["public"]["Enums"]["verification_method"] | null;
        };
        Update: Partial<Database["public"]["Tables"]["school_memberships"]["Insert"]>;
        Relationships: [];
      };
      school_admins: {
        Row: { id: string; school_id: string; user_id: string; role: Database["public"]["Enums"]["school_role"]; active: boolean };
        Insert: { id?: string; school_id: string; user_id: string; role: Database["public"]["Enums"]["school_role"]; active?: boolean };
        Update: Partial<Database["public"]["Tables"]["school_admins"]["Insert"]>;
        Relationships: [];
      };
      membership_requests: {
        Row: {
          id: string;
          school_id: string;
          user_id: string;
          method: Database["public"]["Enums"]["verification_method"];
          submitted_data: Json;
          status: Database["public"]["Enums"]["membership_request_status"];
          created_at: Timestamptz;
        };
        Insert: { id?: string; school_id: string; user_id: string; method: Database["public"]["Enums"]["verification_method"]; submitted_data?: Json };
        Update: Partial<Database["public"]["Tables"]["membership_requests"]["Insert"]>;
        Relationships: [];
      };
      student_roster_entries: {
        Row: { id: string; school_id: string; email_normalized: string; email_hash: string; matched_user_id: string | null };
        Insert: { id?: string; school_id: string; email_normalized: string; email_hash: string };
        Update: Partial<Database["public"]["Tables"]["student_roster_entries"]["Insert"]>;
        Relationships: [];
      };
      invitations: {
        Row: { id: string; school_id: string; code_prefix: string; type: Database["public"]["Enums"]["invitation_type"]; max_uses: number; uses_count: number; revoked: boolean; expires_at: Timestamptz | null };
        Insert: { school_id: string; code_prefix: string; code_hash: string; type?: Database["public"]["Enums"]["invitation_type"]; max_uses?: number; requires_approval?: boolean; expires_at?: Timestamptz | null };
        Update: Partial<Database["public"]["Tables"]["invitations"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: { id: string; actor_id: string | null; actor_role: string | null; school_id: string | null; action: string; target_type: string | null; target_id: string | null; metadata: Json; created_at: Timestamptz };
        Insert: { actor_id?: string | null; actor_role?: string | null; school_id?: string | null; action: string; target_type?: string | null; target_id?: string | null; metadata?: Json };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      redeem_invitation: { Args: { p_code: string }; Returns: Json };
      resolve_roster_membership: { Args: { p_school: string }; Returns: Json };
      request_membership: {
        Args: { p_school: string; p_grad_year?: number | null; p_explanation?: string | null };
        Returns: Json;
      };
      review_membership_request: {
        Args: { p_request: string; p_approve: boolean; p_reason?: string | null };
        Returns: Json;
      };
      set_membership_status: {
        Args: { p_membership: string; p_status: Database["public"]["Enums"]["membership_status"]; p_reason?: string | null };
        Returns: Json;
      };
      membership_status: { Args: { p_school: string }; Returns: string | null };
    };
    Enums: {
      school_status: "active" | "disabled" | "pending";
      membership_status: "pending" | "verified" | "rejected" | "suspended" | "left" | "expired";
      membership_request_status: "pending" | "approved" | "rejected";
      verification_method: "google" | "microsoft" | "email_otp" | "roster" | "invite_code" | "manual";
      school_role: "school_owner" | "school_admin" | "school_moderator" | "membership_reviewer" | "event_reviewer";
      invitation_type: "shared" | "single_use";
    };
    CompositeTypes: { [_ in never]: never };
  };
}

/**
 * Focused Supabase row types for the tables the mobile marketplace touches. This
 * is a hand-maintained subset of the generated schema (kept small on purpose);
 * the server package holds the fuller `Database` type. Enums come from @swap/types
 * so the mobile layer never drifts from the database source of truth.
 */
import type { ItemCondition, ListingPostType, ListingStatus, MembershipStatus, VerificationMethod } from "@swap/types";

export type VerificationMethodArray = VerificationMethod[];

export interface ListingRow {
  id: string;
  school_id: string;
  owner_id: string;
  post_type: ListingPostType;
  title: string;
  description: string;
  category: string;
  condition: ItemCondition | null;
  desired_item: string | null;
  handoff_location_id: string | null;
  status: ListingStatus;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ListingImageRow {
  id: string;
  listing_id: string;
  school_id: string;
  storage_path: string;
  position: number;
}

export interface SavedListingRow {
  id: string;
  user_id: string;
  listing_id: string;
  school_id: string;
}

export interface UserRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  grad_year: number | null;
}

export interface MembershipRow {
  id: string;
  school_id: string;
  user_id: string;
  status: MembershipStatus;
  verification_method: string | null;
}

export interface SchoolRow {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface SchoolSettingsRow {
  school_id: string;
  enabled_verification_methods: VerificationMethodArray;
}

export interface Database {
  public: {
    Tables: {
      listings: { Row: ListingRow; Insert: Partial<ListingRow>; Update: Partial<ListingRow>; Relationships: [] };
      listing_images: { Row: ListingImageRow; Insert: Partial<ListingImageRow>; Update: Partial<ListingImageRow>; Relationships: [] };
      saved_listings: { Row: SavedListingRow; Insert: Partial<SavedListingRow>; Update: Partial<SavedListingRow>; Relationships: [] };
      users: { Row: UserRow; Insert: Partial<UserRow>; Update: Partial<UserRow>; Relationships: [] };
      school_memberships: { Row: MembershipRow; Insert: Partial<MembershipRow>; Update: Partial<MembershipRow>; Relationships: [] };
      schools: { Row: SchoolRow; Insert: Partial<SchoolRow>; Update: Partial<SchoolRow>; Relationships: [] };
      school_settings: { Row: SchoolSettingsRow; Insert: Partial<SchoolSettingsRow>; Update: Partial<SchoolSettingsRow>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

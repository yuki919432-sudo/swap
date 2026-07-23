/**
 * Audit-log utilities for application-level events (things not already audited
 * inside a SECURITY DEFINER database function). Writes go through a service-role
 * client because `audit_logs` INSERT is revoked from application roles and the
 * table is append-only. Never call this from browser/mobile code.
 */
import type { Json } from "./db-types.js";
import { mapPostgresError } from "./sqlstate.js";
import type { DbClient } from "./supabase.js";

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  actorRole?: string | null; // "student" | "school_admin" | "platform" | "system"
  schoolId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Json;
}

export async function recordAudit(service: DbClient, entry: AuditEntry): Promise<void> {
  const { error } = await service.from("audit_logs").insert({
    action: entry.action,
    actor_id: entry.actorId ?? null,
    actor_role: entry.actorRole ?? "system",
    school_id: entry.schoolId ?? null,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) throw mapPostgresError(error);
}

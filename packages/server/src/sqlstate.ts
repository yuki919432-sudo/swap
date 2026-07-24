/**
 * Map a PostgreSQL / PostgREST error to a typed AppError.
 *
 * The `retryable` flag is set ONLY for genuinely transient failures (deadlock,
 * serialization). Conflicts such as a lost reservation race (23505 on
 * one_active_reservation_per_listing, or the P0001 `listing_already_reserved`)
 * are terminal and are NOT marked retryable — retrying them would not help.
 */
import { AppError } from "./errors.js";

/** Shape shared by node-postgres errors and supabase-js PostgrestError. */
export interface PostgresLikeError {
  code?: string | null; // SQLSTATE
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  constraint?: string | null;
}

/** Known application errors raised via `RAISE EXCEPTION` (SQLSTATE P0001). */
const RAISE_MAP: Record<string, () => AppError> = {
  not_authenticated: () => new AppError("unauthenticated", "unauthenticated"),
  not_authorized: () => new AppError("forbidden", "forbidden"),
  not_a_member: () => new AppError("membership_required", "membership_required"),
  membership_suspended: () => new AppError("membership_suspended", "membership_suspended"),
  membership_rejected: () => new AppError("membership_rejected", "membership_rejected"),
  invalid_input: () => new AppError("validation_failed", "invalid_input"),
  blocked: () => new AppError("forbidden", "blocked"),
  method_not_enabled: () => new AppError("forbidden", "verification_method_not_enabled"),
  email_not_verified: () => new AppError("forbidden", "email_not_verified"),
  roster_no_match: () => new AppError("not_found", "roster_no_match"),
  membership_not_found: () => new AppError("not_found", "membership_not_found"),
  request_not_found: () => new AppError("not_found", "membership_request_not_found"),
  invalid_or_exhausted_invitation: () =>
    new AppError("invitation_invalid", "invalid_or_exhausted_invitation"),
  invitation_already_used_by_user: () =>
    new AppError("invitation_invalid", "invalid_or_exhausted_invitation"),
  listing_not_available: () => new AppError("conflict", "listing_not_available"),
  listing_already_reserved: () => new AppError("conflict", "listing_already_reserved"),
  invalid_offer_state: () => new AppError("conflict", "invalid_offer_state"),
  invalid_transaction_state: () => new AppError("conflict", "invalid_transaction_state"),
  event_full: () => new AppError("conflict", "event_full"),
  event_not_open: () => new AppError("conflict", "event_not_open"),
  invalid_membership_transition: () => new AppError("conflict", "invalid_membership_transition"),
};

/** Extract the leading token of a raised message (before any ':' argument). */
const raiseKey = (message: string): string => message.split(":")[0]!.trim();

export function mapPostgresError(err: unknown): AppError {
  const e = (err ?? {}) as PostgresLikeError;
  const code = e.code ?? "";
  const message = e.message ?? "";

  switch (code) {
    case "40P01": // deadlock_detected
      return new AppError("transient", "deadlock_detected", { retryable: true, cause: err });
    case "40001": // serialization_failure
      return new AppError("transient", "serialization_failure", { retryable: true, cause: err });

    case "23505": {
      // unique_violation — terminal. Name the reservation race specifically.
      const isReservation =
        (e.constraint ?? "").includes("one_active_reservation_per_listing") ||
        message.includes("one_active_reservation_per_listing");
      return new AppError("conflict", isReservation ? "listing_already_reserved" : "unique_violation", {
        cause: err,
      });
    }

    case "42501": // insufficient_privilege (RLS / revoked EXECUTE)
      return new AppError("forbidden", "forbidden", { cause: err });
    case "23503": // foreign_key_violation
      return new AppError("validation_failed", "foreign_key_violation", { cause: err });
    case "23514": // check_violation
      return new AppError("validation_failed", "check_violation", { cause: err });
    case "22P02": // invalid_text_representation (e.g. bad uuid)
      return new AppError("validation_failed", "invalid_input", { cause: err });

    case "P0001": {
      const factory = RAISE_MAP[raiseKey(message)];
      return factory ? factory() : new AppError("conflict", raiseKey(message) || "operation_failed", { cause: err });
    }

    default:
      return new AppError("internal", "internal_error", { cause: err });
  }
}

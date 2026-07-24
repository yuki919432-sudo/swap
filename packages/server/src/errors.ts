/**
 * Typed application errors. Handlers translate these to transport responses
 * (HTTP status / JSON). `toJSON()` deliberately omits `cause` so internal
 * details (DB messages, stack traces) are never leaked to clients.
 */

export type AppErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "membership_required"
  | "membership_suspended"
  | "membership_rejected"
  | "not_found"
  | "validation_failed"
  | "conflict"
  | "invitation_invalid"
  | "rate_limited"
  | "transient"
  | "internal";

const DEFAULT_STATUS: Record<AppErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  membership_required: 403,
  membership_suspended: 403,
  membership_rejected: 403,
  not_found: 404,
  validation_failed: 400,
  conflict: 409,
  invitation_invalid: 400,
  rate_limited: 429,
  transient: 503,
  internal: 500,
};

export interface AppErrorOptions {
  httpStatus?: number;
  /** True only for genuinely safe-to-retry transient failures (deadlock, serialization). */
  retryable?: boolean;
  /** Safe, client-facing structured detail (e.g. validation issues). Never secrets. */
  details?: unknown;
  /** Underlying error for server-side logging only; never serialized to clients. */
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly details: unknown;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? DEFAULT_STATUS[code];
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }

  /** Client-safe serialization. Excludes `cause`/stack. */
  toJSON(): { error: { code: AppErrorCode; message: string; details?: unknown } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

/* ------------------------------------------------------------- factories -- */

export const unauthenticated = (message = "unauthenticated", o?: AppErrorOptions) =>
  new AppError("unauthenticated", message, o);
export const forbidden = (message = "forbidden", o?: AppErrorOptions) =>
  new AppError("forbidden", message, o);
export const membershipRequired = (message = "membership_required", o?: AppErrorOptions) =>
  new AppError("membership_required", message, o);
export const membershipSuspended = (message = "membership_suspended", o?: AppErrorOptions) =>
  new AppError("membership_suspended", message, o);
export const membershipRejected = (message = "membership_rejected", o?: AppErrorOptions) =>
  new AppError("membership_rejected", message, o);
export const notFound = (message = "not_found", o?: AppErrorOptions) =>
  new AppError("not_found", message, o);
export const validationFailed = (message = "validation_failed", o?: AppErrorOptions) =>
  new AppError("validation_failed", message, o);
export const conflict = (message = "conflict", o?: AppErrorOptions) =>
  new AppError("conflict", message, o);
export const invitationInvalid = (message = "invalid_or_exhausted_invitation", o?: AppErrorOptions) =>
  new AppError("invitation_invalid", message, o);
export const rateLimited = (message = "rate_limited", o?: AppErrorOptions) =>
  new AppError("rate_limited", message, o);
export const transient = (message = "transient", o?: AppErrorOptions) =>
  new AppError("transient", message, { retryable: true, ...o });
export const internal = (message = "internal_error", o?: AppErrorOptions) =>
  new AppError("internal", message, o);

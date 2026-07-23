/**
 * Bounded retry with full jitter, for genuinely transient failures only.
 *
 * By default it retries ONLY errors flagged `retryable` (deadlock 40P01,
 * serialization 40001 — see sqlstate.ts). It never blindly retries unique
 * violations or other conflicts. After the attempt budget is exhausted the last
 * error is rethrown unchanged, so callers see a terminal, typed failure.
 *
 * Wrap an operation in withRetry ONLY when re-executing it is safe (idempotent,
 * or naturally re-attemptable like `accept_offer`, which re-validates state).
 */
import { AppError, isAppError } from "./errors.js";
import { mapPostgresError } from "./sqlstate.js";

export interface RetryOptions {
  maxAttempts?: number; // total attempts including the first (default 3)
  baseDelayMs?: number; // default 25
  maxDelayMs?: number; // default 1000
  /** Decide retryability. Default: mapped AppError.retryable. */
  isRetryable?: (err: AppError) => boolean;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: AppError }) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 25;
  const maxDelayMs = options.maxDelayMs ?? 1000;
  const isRetryable = options.isRetryable ?? ((e: AppError) => e.retryable);
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  let lastError: AppError | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (raw) {
      const err = isAppError(raw) ? raw : mapPostgresError(raw);
      lastError = err;
      if (attempt >= maxAttempts || !isRetryable(err)) throw err;
      const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.floor(random() * ceiling); // full jitter
      options.onRetry?.({ attempt, delayMs, error: err });
      await sleep(delayMs);
    }
  }
  // Unreachable, but keeps the type checker happy.
  throw lastError ?? new AppError("internal", "retry_failed");
}

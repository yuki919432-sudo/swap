/**
 * Rate-limit interface + simple in-memory implementations.
 *
 * The interface is what OTP/invite/report flows depend on. Production should back
 * it with a shared store (e.g. Postgres or Redis) so limits hold across
 * instances; the in-memory limiter is for single-process/dev/tests only.
 */
export interface RateLimitRule {
  limit: number; // max events per window
  windowMs: number; // window length
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface RateLimiter {
  consume(key: string, cost?: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

/** Fixed-window counter. `now` is injectable for deterministic tests. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async consume(key: string, cost = 1): Promise<RateLimitResult> {
    const t = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || t - bucket.windowStart >= this.rule.windowMs) {
      const fresh = { count: 0, windowStart: t };
      this.buckets.set(key, fresh);
      return this.evaluate(fresh, cost);
    }
    return this.evaluate(bucket, cost);
  }

  private evaluate(bucket: { count: number; windowStart: number }, cost: number): RateLimitResult {
    const resetAt = new Date(bucket.windowStart + this.rule.windowMs);
    if (bucket.count + cost > this.rule.limit) {
      return { allowed: false, remaining: Math.max(0, this.rule.limit - bucket.count), resetAt };
    }
    bucket.count += cost;
    return { allowed: true, remaining: this.rule.limit - bucket.count, resetAt };
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}

/** Always-allow limiter (e.g. for tests or trusted internal paths). */
export class NoopRateLimiter implements RateLimiter {
  async consume(_key?: string, _cost?: number): Promise<RateLimitResult> {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, resetAt: new Date(0) };
  }
  async reset(_key?: string): Promise<void> {}
}

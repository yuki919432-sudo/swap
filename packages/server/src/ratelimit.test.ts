import { describe, it, expect } from "vitest";
import { MemoryRateLimiter, NoopRateLimiter } from "./ratelimit.js";

describe("MemoryRateLimiter (fixed window)", () => {
  it("allows up to the limit then blocks within the window", async () => {
    const t = 1000;
    const rl = new MemoryRateLimiter({ limit: 3, windowMs: 1000 }, () => t);
    expect((await rl.consume("k")).allowed).toBe(true);
    expect((await rl.consume("k")).allowed).toBe(true);
    const third = await rl.consume("k");
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect((await rl.consume("k")).allowed).toBe(false);
  });

  it("resets after the window elapses", async () => {
    let t = 0;
    const rl = new MemoryRateLimiter({ limit: 1, windowMs: 1000 }, () => t);
    expect((await rl.consume("k")).allowed).toBe(true);
    expect((await rl.consume("k")).allowed).toBe(false);
    t = 1000; // new window
    expect((await rl.consume("k")).allowed).toBe(true);
  });

  it("tracks keys independently", async () => {
    const rl = new MemoryRateLimiter({ limit: 1, windowMs: 1000 }, () => 0);
    expect((await rl.consume("a")).allowed).toBe(true);
    expect((await rl.consume("b")).allowed).toBe(true);
    expect((await rl.consume("a")).allowed).toBe(false);
  });
});

describe("NoopRateLimiter", () => {
  it("always allows", async () => {
    const rl = new NoopRateLimiter();
    expect((await rl.consume("k")).allowed).toBe(true);
  });
});

import { describe, it, expect, vi } from "vitest";
import { withRetry } from "./retry.js";
import { conflict } from "./errors.js";

const noSleep = () => Promise.resolve();

describe("withRetry", () => {
  it("returns immediately on success", async () => {
    const op = vi.fn(async () => "ok");
    await expect(withRetry(op, { sleep: noSleep, random: () => 0 })).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries retryable transient errors then succeeds", async () => {
    let n = 0;
    const op = vi.fn(async () => {
      n += 1;
      if (n < 3) throw { code: "40P01" }; // deadlock
      return "ok";
    });
    await expect(withRetry(op, { maxAttempts: 5, sleep: noSleep, random: () => 0 })).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a non-retryable conflict", async () => {
    const op = vi.fn(async () => {
      throw conflict("listing_already_reserved");
    });
    await expect(withRetry(op, { sleep: noSleep, random: () => 0 })).rejects.toMatchObject({
      code: "conflict",
      message: "listing_already_reserved",
    });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a generic unique violation", async () => {
    const op = vi.fn(async () => {
      throw { code: "23505", message: "duplicate key" };
    });
    await expect(withRetry(op, { sleep: noSleep, random: () => 0 })).rejects.toMatchObject({ code: "conflict" });
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and throws the mapped terminal error", async () => {
    const op = vi.fn(async () => {
      throw { code: "40001" }; // serialization failure, always
    });
    await expect(withRetry(op, { maxAttempts: 3, sleep: noSleep, random: () => 0 })).rejects.toMatchObject({
      code: "transient",
    });
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("applies bounded full-jitter backoff", async () => {
    const delays: number[] = [];
    let n = 0;
    const op = async () => {
      n += 1;
      if (n < 4) throw { code: "40P01" };
      return "ok";
    };
    await withRetry(op, {
      maxAttempts: 4,
      baseDelayMs: 10,
      maxDelayMs: 100,
      sleep: noSleep,
      random: () => 1, // max jitter
      onRetry: ({ delayMs }) => delays.push(delayMs),
    });
    // ceilings: 10, 20, 40 (base * 2^(attempt-1)), capped at maxDelay.
    expect(delays).toEqual([10, 20, 40]);
  });
});

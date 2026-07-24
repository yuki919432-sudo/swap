import { describe, it, expect } from "vitest";
import { AppError, isAppError, transient, forbidden } from "./errors.js";

describe("AppError", () => {
  it("applies the default HTTP status per code", () => {
    expect(forbidden().httpStatus).toBe(403);
    expect(new AppError("not_found", "x").httpStatus).toBe(404);
    expect(new AppError("rate_limited", "x").httpStatus).toBe(429);
  });

  it("marks transient errors retryable", () => {
    expect(transient().retryable).toBe(true);
    expect(forbidden().retryable).toBe(false);
  });

  it("toJSON is client-safe and omits the cause", () => {
    const err = new AppError("validation_failed", "bad", {
      details: { fieldErrors: { title: ["required"] } },
      cause: new Error("secret internal detail"),
    });
    const json = JSON.stringify(err);
    expect(json).not.toContain("secret internal detail");
    expect(err.toJSON()).toEqual({
      error: { code: "validation_failed", message: "bad", details: { fieldErrors: { title: ["required"] } } },
    });
  });

  it("isAppError narrows", () => {
    expect(isAppError(forbidden())).toBe(true);
    expect(isAppError(new Error("plain"))).toBe(false);
  });
});

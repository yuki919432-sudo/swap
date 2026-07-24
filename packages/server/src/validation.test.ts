import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validate } from "./validation.js";

const schema = z.object({ code: z.string().min(6) });

describe("validate", () => {
  it("returns parsed data on success", () => {
    expect(validate(schema, { code: "abcdef" })).toEqual({ code: "abcdef" });
  });

  it("throws a typed validation error with client-safe details", () => {
    try {
      validate(schema, { code: "x" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toMatchObject({ code: "validation_failed", httpStatus: 400 });
      expect((e as { details: unknown }).details).toBeTruthy();
    }
  });
});

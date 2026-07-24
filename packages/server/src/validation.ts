/**
 * Request validation. Parses untrusted input with a shared Zod schema and throws
 * a typed validation error (with client-safe issue details) on failure.
 */
import type { z } from "zod";
import { AppError } from "./errors.js";

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("validation_failed", "validation_failed", {
      details: result.error.flatten(),
    });
  }
  return result.data;
}

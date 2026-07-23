import { z } from "zod";

export const uuid = z.string().uuid();

/** Trimmed, non-empty, length-bounded free text. */
export const shortText = z.string().trim().min(1).max(120);
export const mediumText = z.string().trim().min(1).max(2000);
export const longText = z.string().trim().min(1).max(10000);

/** A school email is validated as a normal email; domain checks happen server-side. */
export const email = z.string().trim().toLowerCase().email().max(254);

/** IANA timezone string, e.g. "America/New_York". Bounded; validity checked server-side. */
export const timezone = z.string().trim().min(1).max(64);

export const gradYear = z
  .number()
  .int()
  .gte(1950)
  .lte(new Date().getUTCFullYear() + 10);

/** ISO-8601 datetime string in UTC. */
export const isoDateTime = z.string().datetime({ offset: true });

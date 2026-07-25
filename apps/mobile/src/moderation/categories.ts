/**
 * Moderation category model for the LOCAL demo simulator.
 *
 * Two distinct concepts, kept deliberately separate:
 *
 *  1. UNIVERSAL prohibitions — never allowed anywhere (weapons, drugs, stolen
 *     goods, …). Content matching these is BLOCKED.
 *
 *  2. REGULATED categories — tobacco / nicotine / vaping / alcohol. These are NOT
 *     universal prohibitions. They are disabled by default, can NEVER be enabled
 *     for a high-school institution, and are only a *future* university policy
 *     capability that would require legal / age / jurisdiction / campus-policy
 *     review before any real use.
 *
 * NOTE: the backend `@swap/types` PROHIBITED_CATEGORIES currently bundles
 * `alcohol` and `nicotine` in with universal prohibitions. Reconciling that
 * (moving regulated goods into their own policy surface) is a flagged Trust &
 * Safety *backend* follow-up (see docs/trust-and-safety-roadmap.md) and is NOT
 * done here. This mobile simulator models the separation the roadmap describes.
 */
import { PROHIBITED_CATEGORIES } from "@swap/types";

/** Regulated goods — separate from universal prohibitions. */
export const REGULATED_CATEGORIES = ["tobacco", "nicotine", "vaping", "alcohol"] as const;
export type RegulatedCategory = (typeof REGULATED_CATEGORIES)[number];

const regulatedSet = new Set<string>(REGULATED_CATEGORIES);

/**
 * Universal prohibitions = the backend prohibited list MINUS anything we classify
 * as regulated (so regulated goods are never treated as universally prohibited).
 */
export const UNIVERSAL_PROHIBITIONS: readonly string[] = PROHIBITED_CATEGORIES.filter(
  (c) => !regulatedSet.has(c),
);

export const isRegulatedCategory = (value: string): boolean => regulatedSet.has(value.toLowerCase());

export const isUniversallyProhibitedCategory = (value: string): boolean =>
  UNIVERSAL_PROHIBITIONS.includes(value.toLowerCase());

/**
 * Deterministic LOCAL moderation simulator (demo only).
 *
 * This is NOT the production moderation backend and calls no external AI. It runs
 * a small set of deterministic, local rules over a listing draft and returns one
 * of four outcomes — allow / warn / block / escalate — so the demo can show the
 * publish-after-automated-checks model end to end.
 *
 * Guarantees the demo relies on:
 *  - warned / blocked / escalated content stays UNPUBLISHED,
 *  - the user may edit and retry (no automatic suspension ever),
 *  - regulated categories are handled separately from universal prohibitions.
 *
 * Precedence (most severe first): escalate → block(universal) → block(regulated)
 * → warn → allow.
 */
import type { InstitutionType } from "../domain/models";
import { isRegulatedCategory, isUniversallyProhibitedCategory } from "./categories";

export type ModerationOutcome = "allow" | "warn" | "block" | "escalate";

export interface ModerationReason {
  code:
    | "severe_threat"
    | "universal_prohibition"
    | "regulated_disabled"
    | "contact_info"
    | "personal_address";
  label: string;
}

export interface ModerationResult {
  outcome: ModerationOutcome;
  reasons: ModerationReason[];
  /** User-facing, non-punitive explanation. */
  message: string;
  /** Always true in the demo: users may edit and retry. Never an auto-suspension. */
  canEditAndRetry: boolean;
  /** Only "allow" may be published to the local demo feed. */
  publishable: boolean;
}

export interface ModerationInput {
  title: string;
  description: string;
  category: string;
}

export interface ModerationContext {
  institutionType: InstitutionType;
  /**
   * Whether the institution has (in a hypothetical future) enabled regulated
   * categories. Off by default. High schools can NEVER enable — the simulator
   * forces this false for high_school regardless of the value passed in.
   */
  regulatedCategoriesEnabled?: boolean;
}

/* --------------------------------------------------------------- detectors */

// Deterministic test tokens make the four outcomes easy to demonstrate and test,
// alongside realistic phrase/pattern detection.
const SEVERE_THREAT_PATTERNS = [
  /\[\[severe_threat_test\]\]/i,
  /\bi will (hurt|harm|kill)\b/i,
  /\bthreat(en|ening)? to (hurt|harm|kill)\b/i,
];

const UNIVERSAL_PROHIBITION_PATTERNS = [
  /\[\[prohibited_test\]\]/i,
  /\b(handgun|firearm|pistol|ammo|ammunition)\b/i,
  /\b(cocaine|heroin|meth|mdma)\b/i,
  /\bstolen\b/i,
  /\bcounterfeit\b/i,
];

const REGULATED_PATTERNS = [
  /\b(cigarette|cigarettes|tobacco|vape|vaping|e-?cig|nicotine|juul)\b/i,
  /\b(beer|wine|vodka|whiskey|whisky|liquor|alcohol)\b/i,
];

// A phone number: a run of 10+ digits once separators are stripped.
const PHONE_PATTERN = /(?:\+?\d[\s().-]?){10,}/;
// A street address: number + words + a street suffix.
const ADDRESS_PATTERN =
  /\b\d{1,5}\s+([a-z0-9.]+\s){1,4}(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl|terrace|ter|circle|cir|square|sq|trail|trl|parkway|pkwy|highway|hwy|loop|row|crossing)\b/i;

const anyMatch = (text: string, patterns: RegExp[]): boolean => patterns.some((re) => re.test(text));

function looksLikePhone(text: string): boolean {
  const m = text.match(PHONE_PATTERN);
  if (!m) return false;
  const digits = m[0].replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/* ------------------------------------------------------------------ engine */

export function simulateModeration(input: ModerationInput, context: ModerationContext): ModerationResult {
  const text = `${input.title}\n${input.description}`;
  const category = input.category.trim().toLowerCase();

  // High schools can never enable regulated categories, regardless of input.
  const regulatedEnabled =
    context.institutionType === "high_school" ? false : context.regulatedCategoriesEnabled === true;

  // 1. Severe threat → escalate (human review), most severe.
  if (anyMatch(text, SEVERE_THREAT_PATTERNS)) {
    return build("escalate", [{ code: "severe_threat", label: "Possible threat or safety concern" }]);
  }

  // 2. Universal prohibition → block.
  if (isUniversallyProhibitedCategory(category) || anyMatch(text, UNIVERSAL_PROHIBITION_PATTERNS)) {
    return build("block", [{ code: "universal_prohibition", label: "Prohibited item or content" }]);
  }

  // 3. Regulated category, not enabled → block (kept separate from universal).
  const mentionsRegulated = isRegulatedCategory(category) || anyMatch(text, REGULATED_PATTERNS);
  if (mentionsRegulated && !regulatedEnabled) {
    return build("block", [
      { code: "regulated_disabled", label: "Regulated category (tobacco/nicotine/vaping/alcohol) is not enabled" },
    ]);
  }

  // 4. Contact info / personal address → warn.
  const reasons: ModerationReason[] = [];
  if (looksLikePhone(text)) reasons.push({ code: "contact_info", label: "Looks like a phone number" });
  if (ADDRESS_PATTERN.test(text)) reasons.push({ code: "personal_address", label: "Looks like a personal address" });
  if (reasons.length > 0) return build("warn", reasons);

  // 5. Otherwise allow.
  return build("allow", []);
}

function build(outcome: ModerationOutcome, reasons: ModerationReason[]): ModerationResult {
  return {
    outcome,
    reasons,
    message: MESSAGES[outcome],
    canEditAndRetry: true,
    publishable: outcome === "allow",
  };
}

const MESSAGES: Record<ModerationOutcome, string> = {
  allow: "Looks good — this can be published.",
  warn: "Heads up: please remove personal contact details before publishing. You can edit and try again.",
  block: "This can't be published as written. You can edit it and try again.",
  escalate: "This needs a human review before it can be published. You can edit it and try again.",
};

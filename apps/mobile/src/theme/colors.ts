/**
 * Color tokens. A single source of truth — never hard-code hex values in
 * components. Semantic tokens (surface/text/accent/…) resolve per color scheme so
 * the whole app themes light/dark from one place.
 */

/** Raw palette. Referenced only by the semantic maps below. */
const palette = {
  // Fresh campus green — the brand accent.
  green900: "#0E3B2E",
  green700: "#12694B",
  green600: "#159A63",
  green500: "#1FB673",
  green400: "#43CE8C",
  mint300: "#8CE9BE",
  mint200: "#B9F3D6",
  lime400: "#B7E948",

  // Warm neutrals.
  ink900: "#10130F",
  ink800: "#1C211B",
  ink700: "#2C332A",
  gray600: "#5A6357",
  gray500: "#7C8577",
  gray400: "#A7AEA2",
  gray300: "#CDD2C8",
  gray200: "#E4E7DE",
  gray100: "#EFF1EA",
  warmWhite: "#F7F8F5",
  white: "#FFFFFF",

  // Status hues (kept distinct from the brand accent).
  amber500: "#E8A21B",
  amber100: "#FBEEC9",
  red600: "#D8503C",
  red100: "#F7DED7",
  blue500: "#3B7BD8",
  blue100: "#D7E4F7",
} as const;

export type ColorScheme = "light" | "dark";

export interface SemanticColors {
  /** App background. */
  background: string;
  /** Elevated surfaces (cards, sheets). */
  surface: string;
  /** A slightly recessed surface (input wells, skeletons). */
  surfaceMuted: string;
  /** Hairline borders. */
  border: string;
  /** Primary text. */
  text: string;
  /** Secondary text. */
  textMuted: string;
  /** Faint text (timestamps, captions). */
  textFaint: string;
  /** Text/icon on top of the accent. */
  onAccent: string;
  /** Brand accent. */
  accent: string;
  /** Pressed/darker accent. */
  accentStrong: string;
  /** Tinted accent background (chips, badges). */
  accentSoft: string;
  /** Accent text on the soft background. */
  accentOnSoft: string;

  // Moderation / status
  success: string;
  successSoft: string;
  warn: string;
  warnSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
}

const light: SemanticColors = {
  background: palette.warmWhite,
  surface: palette.white,
  surfaceMuted: palette.gray100,
  border: palette.gray200,
  text: palette.ink900,
  textMuted: palette.gray600,
  textFaint: palette.gray500,
  onAccent: palette.white,
  accent: palette.green500,
  accentStrong: palette.green600,
  accentSoft: palette.mint200,
  accentOnSoft: palette.green700,
  success: palette.green600,
  successSoft: palette.mint200,
  warn: palette.amber500,
  warnSoft: palette.amber100,
  danger: palette.red600,
  dangerSoft: palette.red100,
  info: palette.blue500,
  infoSoft: palette.blue100,
};

const dark: SemanticColors = {
  background: palette.ink900,
  surface: palette.ink800,
  surfaceMuted: palette.ink700,
  border: palette.ink700,
  text: palette.gray100,
  textMuted: palette.gray400,
  textFaint: palette.gray500,
  onAccent: palette.ink900,
  accent: palette.green400,
  accentStrong: palette.green500,
  accentSoft: palette.green900,
  accentOnSoft: palette.mint300,
  success: palette.green400,
  successSoft: palette.green900,
  warn: palette.amber500,
  warnSoft: "#3A2F14",
  danger: palette.red600,
  dangerSoft: "#3A211B",
  info: palette.blue500,
  infoSoft: "#1B2A3F",
};

export const colorSchemes: Record<ColorScheme, SemanticColors> = { light, dark };

export { palette };

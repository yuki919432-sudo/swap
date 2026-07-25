/**
 * Non-color design tokens: spacing, radii, typography, shadows, icon sizes, and
 * motion. Components reference these — never literal numbers — so the visual
 * system stays consistent and tunable from one place.
 */
import type { TextStyle } from "react-native";

/** 4-pt spacing scale. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;
export type SpacingToken = keyof typeof spacing;

/** Corner radii. Cards are generously rounded. */
export const radii = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;
export type RadiusToken = keyof typeof radii;

/** Icon sizes. */
export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;
export type IconSizeToken = keyof typeof iconSizes;

/** Typographic scale. Strong, dark, campus-friendly. */
export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.5 },
  title1: { fontSize: 26, lineHeight: 32, fontWeight: "800", letterSpacing: -0.3 },
  title2: { fontSize: 21, lineHeight: 27, fontWeight: "700", letterSpacing: -0.2 },
  title3: { fontSize: 18, lineHeight: 24, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 23, fontWeight: "400" },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: "600" },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: "500" },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "600", letterSpacing: 0.3 },
} as const satisfies Record<string, TextStyle>;
export type TypographyToken = keyof typeof typography;

/** Elevation presets. Consumed by components; colors come from the theme. */
export const shadows = {
  none: { shadowColor: "transparent", shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  sm: { shadowColor: "#10130F", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  md: { shadowColor: "#10130F", shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  lg: { shadowColor: "#10130F", shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
} as const;
export type ShadowToken = keyof typeof shadows;

/** Motion tokens. Restrained, tactile — short durations, gentle easing. */
export const motion = {
  duration: { instant: 90, fast: 160, base: 240, slow: 360 },
  pressScale: 0.97,
  easing: { standard: "ease-out", emphasized: "ease-in-out" },
} as const;

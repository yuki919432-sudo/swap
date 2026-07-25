/**
 * Theme context. Resolves the semantic color set from the device color scheme and
 * exposes it alongside the static tokens via `useTheme()`. Components read colors
 * from here so light/dark and any future re-skin flow from one place.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { colorSchemes, type ColorScheme, type SemanticColors } from "./colors";
import { iconSizes, motion, radii, shadows, spacing, typography } from "./tokens";

export interface Theme {
  scheme: ColorScheme;
  colors: SemanticColors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  shadows: typeof shadows;
  iconSizes: typeof iconSizes;
  motion: typeof motion;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children, forceScheme }: { children: ReactNode; forceScheme?: ColorScheme }) {
  const deviceScheme = useColorScheme();
  const scheme: ColorScheme = forceScheme ?? (deviceScheme === "dark" ? "dark" : "light");
  const value = useMemo<Theme>(
    () => ({
      scheme,
      colors: colorSchemes[scheme],
      spacing,
      radii,
      typography,
      shadows,
      iconSizes,
      motion,
    }),
    [scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { useTheme } from "../theme";
import type { TypographyToken } from "../theme/tokens";

type ColorKey = "text" | "textMuted" | "textFaint" | "onAccent" | "accent" | "accentOnSoft" | "danger" | "warn" | "success";

export interface AppTextProps extends RNTextProps {
  variant?: TypographyToken;
  color?: ColorKey;
  center?: boolean;
}

/** Typed text primitive. Always use this instead of raw <Text> so typography and
 * color come from tokens. */
export function AppText({ variant = "body", color = "text", center, style, ...rest }: AppTextProps) {
  const theme = useTheme();
  const base = theme.typography[variant] as TextStyle;
  return (
    <RNText
      {...rest}
      style={[base, { color: theme.colors[color] }, center ? { textAlign: "center" } : null, style]}
    />
  );
}

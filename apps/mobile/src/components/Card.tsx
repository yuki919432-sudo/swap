import type { ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import type { ShadowToken } from "../theme/tokens";

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  elevation?: ShadowToken;
  padded?: boolean;
  style?: ViewStyle;
}

/** Rounded surface card with soft elevation. Tappable when onPress is provided. */
export function Card({ children, onPress, elevation = "sm", padded = true, style }: CardProps) {
  const theme = useTheme();
  const base: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: padded ? theme.spacing.lg : 0,
    ...theme.shadows[elevation],
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [base, { transform: [{ scale: pressed ? 0.99 : 1 }] }, style]}
    >
      {children}
    </Pressable>
  );
}

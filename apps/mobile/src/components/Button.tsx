import { ActivityIndicator, Pressable, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import { AppText } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

/** Primary action button with tactile press feedback. */
export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled,
  loading,
  fullWidth = true,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const bg: Record<ButtonVariant, string> = {
    primary: theme.colors.accent,
    secondary: theme.colors.surfaceMuted,
    ghost: "transparent",
    danger: theme.colors.dangerSoft,
  };
  const fg: Record<ButtonVariant, "onAccent" | "text" | "accent" | "danger"> = {
    primary: "onAccent",
    secondary: "text",
    ghost: "accent",
    danger: "danger",
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: theme.spacing.sm,
          backgroundColor: bg[variant],
          paddingVertical: theme.spacing.md + 2,
          paddingHorizontal: theme.spacing.xl,
          borderRadius: theme.radii.pill,
          borderWidth: variant === "ghost" ? 1 : 0,
          borderColor: theme.colors.border,
          opacity: isDisabled ? 0.5 : 1,
          transform: [{ scale: pressed && !isDisabled ? theme.motion.pressScale : 1 }],
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? theme.colors.onAccent : theme.colors.accent} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
          {icon ? <Ionicons name={icon} size={theme.iconSizes.md} color={theme.colors[fg[variant]]} /> : null}
          <AppText variant="bodyStrong" color={fg[variant]}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

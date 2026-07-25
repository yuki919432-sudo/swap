import { Pressable } from "react-native";
import { useTheme } from "../theme";
import { AppText } from "./Text";

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  emoji?: string;
}

/** Selectable pill used for filters and post-type selectors. */
export function Chip({ label, selected, onPress, emoji }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.xs,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radii.pill,
        backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {emoji ? <AppText variant="caption">{emoji}</AppText> : null}
      <AppText variant="caption" color={selected ? "accentOnSoft" : "textMuted"}>
        {label}
      </AppText>
    </Pressable>
  );
}

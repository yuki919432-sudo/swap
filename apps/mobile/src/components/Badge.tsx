import { View } from "react-native";
import { useTheme } from "../theme";
import { AppText } from "./Text";

export type BadgeTone = "accent" | "neutral" | "success" | "warn" | "danger" | "info";

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  emoji?: string;
}

/** Small status pill (membership, post type, moderation outcome, …). */
export function Badge({ label, tone = "neutral", emoji }: BadgeProps) {
  const theme = useTheme();
  const map: Record<BadgeTone, { bg: string; fg: string }> = {
    accent: { bg: theme.colors.accentSoft, fg: theme.colors.accentOnSoft },
    neutral: { bg: theme.colors.surfaceMuted, fg: theme.colors.textMuted },
    success: { bg: theme.colors.successSoft, fg: theme.colors.success },
    warn: { bg: theme.colors.warnSoft, fg: theme.colors.warn },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.danger },
    info: { bg: theme.colors.infoSoft, fg: theme.colors.info },
  };
  const c = map[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.xxs,
        alignSelf: "flex-start",
        backgroundColor: c.bg,
        paddingVertical: theme.spacing.xxs + 1,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radii.pill,
      }}
    >
      {emoji ? <AppText variant="micro">{emoji}</AppText> : null}
      <AppText variant="micro" style={{ color: c.fg }}>
        {label.toUpperCase()}
      </AppText>
    </View>
  );
}

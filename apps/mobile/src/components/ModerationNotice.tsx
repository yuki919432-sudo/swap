import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import { AppText } from "./Text";
import type { ModerationResult, ModerationOutcome } from "../moderation/simulator";

const TONE: Record<ModerationOutcome, { color: (t: ReturnType<typeof useTheme>) => string; bg: (t: ReturnType<typeof useTheme>) => string; icon: keyof typeof Ionicons.glyphMap; heading: string }> = {
  allow: { color: (t) => t.colors.success, bg: (t) => t.colors.successSoft, icon: "checkmark-circle", heading: "Ready to publish" },
  warn: { color: (t) => t.colors.warn, bg: (t) => t.colors.warnSoft, icon: "alert-circle", heading: "Please review before publishing" },
  block: { color: (t) => t.colors.danger, bg: (t) => t.colors.dangerSoft, icon: "close-circle", heading: "Can't be published" },
  escalate: { color: (t) => t.colors.info, bg: (t) => t.colors.infoSoft, icon: "shield", heading: "Needs a human review" },
};

/** Renders a local moderation-simulator outcome. Clearly labeled as demo behavior. */
export function ModerationNotice({ result }: { result: ModerationResult }) {
  const theme = useTheme();
  const tone = TONE[result.outcome];
  return (
    <View style={{ backgroundColor: tone.bg(theme), borderRadius: theme.radii.md, padding: theme.spacing.md, gap: theme.spacing.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
        <Ionicons name={tone.icon} size={theme.iconSizes.md} color={tone.color(theme)} />
        <AppText variant="bodyStrong" style={{ color: tone.color(theme) }}>
          {tone.heading}
        </AppText>
      </View>
      <AppText variant="callout" color="textMuted">
        {result.message}
      </AppText>
      {result.reasons.length > 0 ? (
        <View style={{ marginTop: theme.spacing.xxs, gap: theme.spacing.xxs }}>
          {result.reasons.map((r) => (
            <AppText key={r.code} variant="caption" color="textMuted">
              • {r.label}
            </AppText>
          ))}
        </View>
      ) : null}
      <AppText variant="micro" color="textFaint" style={{ marginTop: theme.spacing.xxs }}>
        DEMO MODERATION SIMULATOR · NO ACCOUNT ACTION IS TAKEN
      </AppText>
    </View>
  );
}

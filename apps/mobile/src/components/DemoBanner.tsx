import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import { AppText } from "./Text";

/** A persistent, unmistakable label that the app is running in demo mode. */
export function DemoBanner({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.spacing.xs,
        backgroundColor: theme.colors.warnSoft,
        paddingVertical: compact ? theme.spacing.xxs + 1 : theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radii.pill,
        alignSelf: "center",
      }}
    >
      <Ionicons name="flask" size={theme.iconSizes.sm} color={theme.colors.warn} />
      <AppText variant="micro" style={{ color: theme.colors.warn }}>
        DEMO MODE · SYNTHETIC DATA
      </AppText>
    </View>
  );
}

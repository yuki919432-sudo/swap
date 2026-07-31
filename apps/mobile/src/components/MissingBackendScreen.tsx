import { View } from "react-native";
import { useTheme } from "../theme";
import { AppText } from "./Text";
import { Screen } from "./Screen";

/**
 * Shown when a PILOT / release build has no valid backend configured. This is the
 * deliberate "fail loudly" surface that replaces any silent fallback to demo data:
 * a real build with a broken environment must never quietly serve synthetic
 * listings to students.
 */
export function MissingBackendScreen({ reason }: { reason?: "service_role_key_in_client" | null }) {
  const theme = useTheme();
  const message =
    reason === "service_role_key_in_client"
      ? "This build was configured with a service-role key, which must never ship in the app. Replace it with the public anon key and rebuild."
      : "This pilot build has no backend configured. Set the Supabase URL and public anon key for this build profile and try again.";
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.xl, gap: theme.spacing.md }}>
        <AppText style={{ fontSize: 44 }}>🔌</AppText>
        <AppText variant="title2" center>
          Backend not configured
        </AppText>
        <AppText variant="body" color="textMuted" center>
          {message}
        </AppText>
        <AppText variant="caption" color="textFaint" center style={{ marginTop: theme.spacing.md }}>
          SWAP! pilot builds never fall back to demo data.
        </AppText>
      </View>
    </Screen>
  );
}

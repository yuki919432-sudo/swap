import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Screen, AppText, Button, DemoBanner, ComingSoonSheet } from "../src/components";
import { useTheme } from "../src/theme";
import { useSession } from "../src/session/SessionProvider";
import { useAuth } from "../src/data/supabase/AuthProvider";
import { isDemoModeEnabled } from "../src/config/demo";

export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const { configured } = useAuth();
  const demoEnabled = isDemoModeEnabled();
  const [joinSheet, setJoinSheet] = useState(false);

  return (
    <Screen padded contentStyle={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: "space-between", paddingVertical: theme.spacing.xxl }}>
        <View style={{ alignItems: "center", marginTop: theme.spacing.huge }}>
          {demoEnabled ? <DemoBanner /> : null}
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <AppText style={{ fontSize: 56 }}>♻️</AppText>
          <AppText variant="display">SWAP!</AppText>
          <AppText variant="title2" color="textMuted">
            Your campus has more to share.
          </AppText>
          <AppText variant="body" color="textMuted" style={{ maxWidth: 320 }}>
            Give, swap, lend, and borrow with students at your school — and find what's happening around campus.
          </AppText>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          {session ? (
            <Button
              label={`Continue as ${session.profile.displayName}`}
              icon="arrow-forward"
              onPress={() => router.replace("/(tabs)")}
            />
          ) : null}
          <Button
            label="Join your school"
            variant={session ? "secondary" : "primary"}
            icon="school"
            onPress={() => (configured ? router.push("/sign-in") : setJoinSheet(true))}
          />
          {demoEnabled ? (
            <Button label="Explore the demo" variant="ghost" icon="flask" onPress={() => router.push("/demo-select")} />
          ) : (
            <AppText variant="caption" color="textFaint" center>
              Demo mode is disabled in this build.
            </AppText>
          )}
        </View>
      </View>

      <ComingSoonSheet
        visible={joinSheet}
        onClose={() => setJoinSheet(false)}
        emoji="🔐"
        title="School verification is coming"
        message="Joining with a real school account (invitation code, admin approval, or email OTP) is part of the next milestone. For now, explore the demo to see how SWAP! feels."
      />
    </Screen>
  );
}

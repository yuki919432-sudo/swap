import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter, Redirect } from "expo-router";
import { Screen, AppText, Card, Avatar, Badge, Button, DemoBanner, IconButton, Divider } from "../src/components";
import { useTheme } from "../src/theme";
import { useRepositories } from "../src/data/repositories";
import { useSession } from "../src/session/SessionProvider";
import { isDemoModeEnabled } from "../src/config/demo";
import type { DemoProfile, DemoSchool } from "../src/domain/models";
import { institutionLabel, verificationMethodLabel } from "../src/lib/labels";
import { membershipTone, membershipStatusLabel } from "../src/lib/status";

export default function DemoSelectScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { selectProfile } = useSession();
  const [schools, setSchools] = useState<DemoSchool[]>([]);
  const [profiles, setProfiles] = useState<Record<string, DemoProfile[]>>({});

  useEffect(() => {
    (async () => {
      const s = await repos.session.listSchools();
      setSchools(s);
      const map: Record<string, DemoProfile[]> = {};
      for (const school of s) map[school.id] = await repos.session.listProfiles(school.id);
      setProfiles(map);
    })();
  }, [repos]);

  // Demo mode must be unavailable when disabled.
  if (!isDemoModeEnabled()) return <Redirect href="/" />;

  const enter = async (profileId: string) => {
    await selectProfile(profileId);
    router.replace("/(tabs)");
  };

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <AppText variant="title2">Choose a demo</AppText>
      </View>
      <View style={{ alignItems: "center", marginVertical: theme.spacing.md }}>
        <DemoBanner />
      </View>
      <AppText variant="callout" color="textMuted" style={{ marginBottom: theme.spacing.sm }}>
        Pick a synthetic school and profile. This is a preview — not a real sign-in, and no real accounts or data are involved.
      </AppText>

      {schools.map((school) => (
        <Card key={school.id} style={{ marginTop: theme.spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
            <AppText style={{ fontSize: 34 }}>{school.accentEmoji}</AppText>
            <View style={{ flex: 1 }}>
              <AppText variant="title3">{school.name}</AppText>
              <AppText variant="caption" color="textMuted">
                {institutionLabel[school.institutionType]} · {school.memberCount.toLocaleString()} members
              </AppText>
            </View>
          </View>
          <AppText variant="callout" color="textMuted" style={{ marginTop: theme.spacing.sm }}>
            {school.description}
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
            {school.verificationMethods.map((m) => (
              <Badge key={m} label={verificationMethodLabel[m] ?? m} tone="neutral" />
            ))}
          </View>

          <Divider />
          <AppText variant="caption" color="textFaint" style={{ marginBottom: theme.spacing.sm }}>
            ENTER AS
          </AppText>
          <View style={{ gap: theme.spacing.sm }}>
            {(profiles[school.id] ?? []).map((p) => (
              <Card key={p.id} elevation="none" onPress={() => enter(p.id)} padded={false} style={{ padding: theme.spacing.md }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                  <Avatar emoji={p.avatarEmoji} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong">{p.displayName}</AppText>
                    <View style={{ flexDirection: "row", gap: theme.spacing.xs, marginTop: theme.spacing.xxs, flexWrap: "wrap" }}>
                      <Badge label={membershipStatusLabel[p.membershipStatus]} tone={membershipTone[p.membershipStatus]} />
                      {p.staffRole ? <Badge label="Moderator" tone="info" emoji="🛡️" /> : null}
                    </View>
                  </View>
                  <AppText color="textFaint">›</AppText>
                </View>
              </Card>
            ))}
          </View>
        </Card>
      ))}

      <Button label="Back to welcome" variant="ghost" onPress={() => router.replace("/")} style={{ marginTop: theme.spacing.xl }} />
    </Screen>
  );
}

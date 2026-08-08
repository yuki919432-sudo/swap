import { useCallback, useEffect, useState } from "react";
import { View, Linking } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, AppText, Card, Avatar, Badge, Button, IconButton, Divider, DemoBanner } from "../src/components";
import { useTheme } from "../src/theme";
import { useRepositories } from "../src/data/repositories";
import { useSession } from "../src/session/SessionProvider";
import type { DemoProfile } from "../src/domain/models";
import type { BlockedUser } from "../src/data/repositories/types";
import { membershipStatusLabel, membershipTone } from "../src/lib/status";
import { SUPPORT_URL } from "../src/config/env";

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session, selectProfile, clear } = useSession();
  const [profiles, setProfiles] = useState<DemoProfile[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);

  const loadBlocked = useCallback(async () => {
    try {
      setBlocked(await repos.reports.listBlockedUsers());
    } catch {
      setBlocked([]);
    }
  }, [repos]);

  useFocusEffect(
    useCallback(() => {
      loadBlocked();
    }, [loadBlocked]),
  );

  const openSupport = () => {
    const url = SUPPORT_URL.length > 0 ? SUPPORT_URL : "mailto:";
    Linking.openURL(url).catch(() => {});
  };

  useEffect(() => {
    repos.session.listSchools().then(async (schools) => {
      const all: DemoProfile[] = [];
      for (const s of schools) all.push(...(await repos.session.listProfiles(s.id)));
      setProfiles(all);
    });
  }, [repos]);

  if (!session) return null;

  const exitDemo = async () => {
    await clear();
    router.replace("/");
  };

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <AppText variant="title2">Settings</AppText>
      </View>

      <View style={{ alignItems: "center", marginVertical: theme.spacing.md }}>
        <DemoBanner />
      </View>

      <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.md }}>
        SWITCH DEMO PROFILE
      </AppText>
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
        {profiles.map((p) => {
          const active = p.id === session.profile.id;
          return (
            <Card
              key={p.id}
              elevation="none"
              onPress={active ? undefined : () => selectProfile(p.id)}
              style={active ? { borderColor: theme.colors.accent } : undefined}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                <Avatar emoji={p.avatarEmoji} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{p.displayName}</AppText>
                  <View style={{ flexDirection: "row", gap: theme.spacing.xs, marginTop: theme.spacing.xxs }}>
                    <Badge label={membershipStatusLabel[p.membershipStatus]} tone={membershipTone[p.membershipStatus]} />
                    {p.staffRole ? <Badge label="Moderator" tone="info" emoji="🛡️" /> : null}
                  </View>
                </View>
                {active ? <Ionicons name="checkmark-circle" size={theme.iconSizes.lg} color={theme.colors.accent} /> : <AppText color="textFaint">›</AppText>}
              </View>
            </Card>
          );
        })}
      </View>

      <Divider />

      <AppText variant="caption" color="textMuted">
        SAFETY & SUPPORT
      </AppText>
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
        <AppText variant="micro" color="textFaint">
          BLOCKED STUDENTS
        </AppText>
        {blocked.length === 0 ? (
          <AppText variant="caption" color="textFaint">
            You haven't blocked anyone. Blocking stops new messages and offers between you.
          </AppText>
        ) : (
          blocked.map((b) => (
            <Card key={b.userId} elevation="none">
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                <Avatar emoji={b.avatarEmoji} size={36} />
                <AppText variant="callout" style={{ flex: 1 }}>
                  {b.displayName}
                </AppText>
                <Button
                  label="Unblock"
                  variant="secondary"
                  fullWidth={false}
                  onPress={async () => {
                    await repos.reports.unblock(b.userId);
                    loadBlocked();
                  }}
                />
              </View>
            </Card>
          ))
        )}
        <Button label="Contact support" variant="secondary" icon="help-buoy-outline" onPress={openSupport} style={{ marginTop: theme.spacing.sm }} />
        <AppText variant="micro" color="textFaint">
          Report a listing, message, or person from the ••• menu on that item. Reports go to your school's moderators. If someone is in danger, contact local authorities.
        </AppText>
      </View>

      <Divider />

      <AppText variant="caption" color="textMuted">
        ABOUT
      </AppText>
      <Card elevation="none" style={{ marginTop: theme.spacing.sm }}>
        <AppText variant="callout" color="textMuted">
          SWAP! demo · v0.1.0{"\n"}
          A development preview using only synthetic data on this device. No real accounts, emails, or school data are involved. Demo mode is unavailable in production builds.
        </AppText>
      </Card>

      <Button label="Exit demo" variant="ghost" icon="exit-outline" onPress={exitDemo} style={{ marginTop: theme.spacing.xl }} />
    </Screen>
  );
}

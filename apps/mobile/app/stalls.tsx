import { useCallback, useState } from "react";
import { View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, Avatar, IconButton, Badge, EmptyState, Button } from "../src/components";
import { useTheme } from "../src/theme";
import { useRepositories } from "../src/data/repositories";
import { useSession } from "../src/session/SessionProvider";
import type { Stall, StallDetail } from "../src/domain/models";

export default function BrowseStallsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const schoolId = session?.school.id;

  const [stalls, setStalls] = useState<Stall[]>([]);
  const [mine, setMine] = useState<StallDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!schoolId) return;
      let alive = true;
      (async () => {
        setLoading(true);
        try {
          const [all, m] = await Promise.all([repos.stalls.listForSchool(schoolId), repos.stalls.getMine(schoolId)]);
          if (!alive) return;
          setStalls(all);
          setMine(m);
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, [repos, schoolId]),
  );

  if (!session) return null;
  const verified = session.profile.membershipStatus === "verified";
  const others = stalls.filter((s) => s.userId !== session.profile.id);

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <AppText variant="title2">Browse Stalls</AppText>
      </View>
      <AppText variant="callout" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
        Casual stalls from students at your school. Pop in and see what people are passing along.
      </AppText>

      {/* My Stall / Open Your Stall */}
      <Card onPress={() => router.push("/my-stall")} style={{ marginTop: theme.spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
          <Avatar emoji={session.profile.avatarEmoji} size={48} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{mine ? "My Stall" : "Open Your Stall"}</AppText>
            <AppText variant="caption" color="textMuted">
              {mine
                ? `${mine.stall.activeCount} active item${mine.stall.activeCount === 1 ? "" : "s"}`
                : verified
                  ? "It takes a few seconds — no setup required."
                  : "Get verified to open your stall."}
            </AppText>
          </View>
          <AppText color="textFaint">›</AppText>
        </View>
      </Card>

      {loading ? null : others.length === 0 ? (
        <EmptyState
          emoji="🛍️"
          title="No other stalls yet"
          message="Be the first to open one — your listings get their own little storefront."
          action={verified ? <Button label="Open your stall" icon="add" fullWidth={false} onPress={() => router.push("/my-stall")} /> : undefined}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
          {others.map((s) => (
            <Card key={s.id} onPress={() => router.push(`/stall/${s.id}`)} elevation="none">
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                <Avatar emoji={s.owner.avatarEmoji} size={44} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
                    <AppText variant="bodyStrong">{s.owner.displayName}</AppText>
                    {s.owner.verified ? <Badge label="Verified" tone="success" emoji="✓" /> : null}
                  </View>
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {s.description ?? "A student stall"}
                  </AppText>
                </View>
                <Badge label={`${s.activeCount}`} tone="neutral" />
              </View>
            </Card>
          ))}
        </View>
      )}
      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

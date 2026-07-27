import { useCallback, useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, Avatar, IconButton, SectionHeader, ShelfRail, Badge } from "../src/components";
import { useTheme } from "../src/theme";
import { useRepositories } from "../src/data/repositories";
import { useSession } from "../src/session/SessionProvider";
import type { DiscoveryShelf, DemandCluster } from "../src/data/repositories/types";
import type { Stall } from "../src/domain/models";

/** Honest, deterministic subtitle per signal — never invented popularity. */
const SIGNAL_HINT: Record<DiscoveryShelf["signal"], string> = {
  recency: "By recency",
  wishlist: "From your wishlist",
  demand: "What students want",
  category: "By category",
  free: "Give-aways",
  ending: "Soonest first",
  stalls: "Newly opened",
};

export default function CampusMarketScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const schoolId = session?.school.id;

  const [shelves, setShelves] = useState<DiscoveryShelf[]>([]);
  const [demand, setDemand] = useState<DemandCluster[]>([]);
  const [stalls, setStalls] = useState<Stall[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!schoolId) return;
      let alive = true;
      (async () => {
        setLoading(true);
        try {
          const [sh, dm, st] = await Promise.all([
            repos.campusMarket.shelves(schoolId),
            repos.campusMarket.demand(schoolId),
            repos.campusMarket.recentStalls(schoolId, 8),
          ]);
          if (!alive) return;
          setShelves(sh);
          setDemand(dm);
          setStalls(st);
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
  const { school } = session;

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color="textMuted">
            {school.accentEmoji} {school.name}
          </AppText>
          <AppText variant="title2">Campus Market</AppText>
        </View>
      </View>
      <AppText variant="callout" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
        Your school's always-open flea market. Browse for the joy of it — no goal required.
      </AppText>

      {/* Entry points */}
      <View style={{ flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.lg }}>
        <EntryTile emoji="🛍️" label="Browse Stalls" onPress={() => router.push("/stalls")} />
        <EntryTile emoji="🎪" label="Temporary Markets" onPress={() => router.push("/markets")} />
      </View>

      {/* Students Are Looking For — privacy-safe demand (no student names). */}
      {demand.length > 0 ? (
        <>
          <SectionHeader title="Students Are Looking For" actionLabel="List one" onAction={() => router.push("/create")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
            {demand.slice(0, 10).map((d) => (
              <Card key={d.key} onPress={() => router.push("/create")} elevation="none" style={{ width: 180 }}>
                <AppText variant="bodyStrong" numberOfLines={2}>
                  {d.label}
                </AppText>
                <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
                  {d.studentCount} {d.studentCount === 1 ? "student is" : "students are"} looking
                </AppText>
                <AppText variant="micro" color="accent" style={{ marginTop: theme.spacing.xs }}>
                  Have one? List it →
                </AppText>
              </Card>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Recently Opened Stalls */}
      {stalls.length > 0 ? (
        <>
          <SectionHeader title="New Stalls" actionLabel="See all" onAction={() => router.push("/stalls")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.md }}>
            {stalls.map((s) => (
              <Pressable key={s.id} onPress={() => router.push(`/stall/${s.id}`)} style={{ width: 130, alignItems: "center", gap: theme.spacing.xs }}>
                <Avatar emoji={s.owner.avatarEmoji} size={56} />
                <AppText variant="callout" numberOfLines={1}>
                  {s.owner.displayName}
                </AppText>
                <Badge label={`${s.activeCount} item${s.activeCount === 1 ? "" : "s"}`} tone="neutral" />
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Deterministic discovery shelves */}
      {shelves.map((sh) => (
        <ShelfRail key={sh.key} title={sh.title} subtitle={`${sh.subtitle} · ${SIGNAL_HINT[sh.signal]}`} listings={sh.listings} onOpen={(id) => router.push(`/listing/${id}`)} />
      ))}

      {!loading && shelves.length === 0 && demand.length === 0 && stalls.length === 0 ? (
        <AppText variant="callout" color="textMuted" center style={{ marginTop: theme.spacing.huge }}>
          The market is quiet right now. Be the first to open a stall or list something!
        </AppText>
      ) : null}

      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

function EntryTile({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: theme.colors.accentSoft,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: theme.spacing.xs,
      }}
    >
      <AppText style={{ fontSize: 28 }}>{emoji}</AppText>
      <AppText variant="bodyStrong" style={{ color: theme.colors.accentOnSoft }}>
        {label}
      </AppText>
    </Pressable>
  );
}

import { useCallback, useState } from "react";
import { View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, IconButton, Badge, EmptyState, Button, ListingImage } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { Market } from "../../src/domain/models";
import { marketStatusBadge } from "../../src/lib/marketLabels";
import { shortDate } from "../../src/lib/id";

export default function MarketsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const schoolId = session?.school.id;

  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!schoolId) return;
      let alive = true;
      (async () => {
        setLoading(true);
        try {
          const list = await repos.markets.listForSchool(schoolId);
          if (alive) setMarkets(list);
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
  const active = markets.filter((m) => m.status === "active" || m.status === "upcoming");
  const past = markets.filter((m) => m.status === "ended" || m.status === "cancelled");

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
          <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
          <AppText variant="title2">Temporary Markets</AppText>
        </View>
        {verified ? <IconButton icon="add" accessibilityLabel="Create a market" tone="accent" onPress={() => router.push("/markets/create")} /> : null}
      </View>
      <AppText variant="callout" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
        Themed pop-ups hosted by students and clubs. Fully online or tied to a real spot on campus.
      </AppText>

      {loading ? null : markets.length === 0 ? (
        <EmptyState
          emoji="🎪"
          title="No markets yet"
          message="Kick off the first pop-up — a move-out sale, a sneaker swap, a club fair table."
          action={verified ? <Button label="Create a market" icon="add" fullWidth={false} onPress={() => router.push("/markets/create")} /> : undefined}
        />
      ) : (
        <>
          <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.lg }}>
            {active.map((m) => (
              <MarketRow key={m.id} market={m} onPress={() => router.push(`/markets/${m.id}`)} />
            ))}
          </View>
          {past.length > 0 ? (
            <>
              <AppText variant="title3" style={{ marginTop: theme.spacing.xl }}>
                Past markets
              </AppText>
              <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
                {past.map((m) => (
                  <MarketRow key={m.id} market={m} onPress={() => router.push(`/markets/${m.id}`)} />
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

function MarketRow({ market, onPress }: { market: Market; onPress: () => void }) {
  const theme = useTheme();
  const badge = marketStatusBadge(market.status);
  const when = market.startsAt ? shortDate(market.startsAt) : null;
  return (
    <Card onPress={onPress} elevation="none">
      <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
        <View style={{ width: 64 }}>
          <ListingImage image={market.coverImage ?? undefined} height={64} radius={theme.radii.md} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
            <AppText variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
              {market.title}
            </AppText>
            <Badge label={badge.label} tone={badge.tone} />
          </View>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {market.hostLabel ?? market.host.displayName}
            {when ? ` · ${when}` : ""}
            {market.location ? ` · ${market.location}` : " · Online"}
          </AppText>
          <AppText variant="micro" color="textFaint">
            {market.sellerCount} seller{market.sellerCount === 1 ? "" : "s"} · {market.listingCount} item{market.listingCount === 1 ? "" : "s"}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

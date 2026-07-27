import { useCallback, useState } from "react";
import { View } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, IconButton, Badge, Button, EmptyState, ListingImage } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { Listing, MarketDetail } from "../../src/domain/models";
import type { DemandCluster } from "../../src/data/repositories/types";
import { categoryLabel } from "../../src/lib/labels";

export default function AddListingToMarketScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const { marketId } = useLocalSearchParams<{ marketId: string }>();
  const schoolId = session?.school.id;

  const [detail, setDetail] = useState<MarketDetail | null>(null);
  const [mine, setMine] = useState<Listing[]>([]);
  const [demand, setDemand] = useState<DemandCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!marketId || !schoolId) return;
    const [d, ls, dm] = await Promise.all([
      repos.markets.getById(marketId),
      repos.marketplace.listMine(schoolId),
      repos.campusMarket.demand(schoolId),
    ]);
    setDetail(d);
    setMine(ls);
    setDemand(dm);
  }, [repos, marketId, schoolId]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        try {
          await reload();
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, [reload]),
  );

  if (!session) return null;

  const alreadyIn = new Set((detail?.listings ?? []).map((l) => l.id));
  const allowed = detail?.market.allowedCategories ?? [];
  const wantedCategories = new Set(demand.map((d) => d.category).filter((c): c is string => c !== null));
  const candidates = mine.filter((l) => !alreadyIn.has(l.id));
  // Suggestions first: fits the market's allowed categories, or matches campus demand.
  const ranked = [...candidates].sort((a, b) => rank(b, allowed, wantedCategories) - rank(a, allowed, wantedCategories));

  const add = async (listingId: string) => {
    if (!marketId) return;
    setBusyId(listingId);
    try {
      await repos.markets.addListing(marketId, listingId);
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <AppText variant="title2">Add to market</AppText>
      </View>
      {detail ? (
        <AppText variant="callout" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
          Add your listings to {detail.market.title}. They stay in the Campus Market and on your stall too.
        </AppText>
      ) : null}

      {loading ? null : ranked.length === 0 ? (
        <EmptyState
          emoji="📦"
          title="No listings to add"
          message="Create a listing for this market, or post one first and come back."
          action={<Button label="Create a listing" icon="add" fullWidth={false} onPress={() => router.push({ pathname: "/create", params: { marketId } })} />}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
          {ranked.map((l) => {
            const fits = allowed.length === 0 || allowed.includes(l.category);
            const wanted = wantedCategories.has(l.category);
            return (
              <Card key={l.id} elevation="none">
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                  <View style={{ width: 52 }}>
                    <ListingImage image={l.images[0]} height={52} radius={theme.radii.md} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {l.title}
                    </AppText>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
                      <Badge label={categoryLabel(l.category)} tone="neutral" />
                      {fits && allowed.length > 0 ? <Badge label="Fits this market" tone="success" emoji="✓" /> : null}
                      {wanted ? <Badge label="In demand" tone="accent" emoji="✨" /> : null}
                    </View>
                  </View>
                  <Button label="Add" fullWidth={false} loading={busyId === l.id} onPress={() => add(l.id)} />
                </View>
              </Card>
            );
          })}
          <Button label="Create a new listing instead" variant="ghost" icon="add" onPress={() => router.push({ pathname: "/create", params: { marketId } })} />
        </View>
      )}
      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

function rank(l: Listing, allowed: string[], wanted: Set<string>): number {
  let s = 0;
  if (allowed.length > 0 && allowed.includes(l.category)) s += 2;
  if (wanted.has(l.category)) s += 1;
  return s;
}

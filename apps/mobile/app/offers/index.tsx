import { useCallback, useState } from "react";
import { View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, Badge, IconButton, EmptyState, SectionHeader, ListingImage } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { Offer, OfferDetail } from "../../src/domain/models";
import { offerKindEmoji, offerKindLabel, offerStatusLabel, offerStatusTone, handoffStatusLabel } from "../../src/lib/offerLabels";

export default function MyOffersScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const schoolId = session?.school.id;

  const [active, setActive] = useState<Offer[]>([]);
  const [handoffs, setHandoffs] = useState<OfferDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!schoolId) return;
      let alive = true;
      (async () => {
        setLoading(true);
        try {
          const [a, h] = await Promise.all([repos.offers.myActiveOffers(schoolId), repos.offers.myHandoffs(schoolId)]);
          if (!alive) return;
          setActive(a);
          setHandoffs(h);
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
  const pending = active.filter((o) => o.status === "pending");

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <AppText variant="title2">My Offers & Handoffs</AppText>
      </View>

      {!loading && pending.length === 0 && handoffs.length === 0 ? (
        <EmptyState emoji="🤝" title="No active offers" message="Start a conversation about a listing and make an offer to agree on a swap, give, or borrow." />
      ) : null}

      {pending.length > 0 ? (
        <>
          <SectionHeader title="Active offers" />
          <View style={{ gap: theme.spacing.sm }}>
            {pending.map((o) => (
              <Card key={o.id} onPress={() => router.push(`/offers/${o.id}`)} elevation="none">
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                  <View style={{ width: 44 }}>
                    <ListingImage image={o.listing?.image ?? undefined} height={44} radius={theme.radii.sm} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {offerKindEmoji[o.kind]} {offerKindLabel[o.kind]} · {o.listing?.title ?? "Item"}
                    </AppText>
                    <AppText variant="caption" color="textFaint">
                      {o.amSender ? "You offered" : "Waiting on you"}
                    </AppText>
                  </View>
                  <Badge label={offerStatusLabel[o.status] ?? o.status} tone={offerStatusTone(o.status)} />
                </View>
              </Card>
            ))}
          </View>
        </>
      ) : null}

      {handoffs.length > 0 ? (
        <>
          <SectionHeader title="Handoffs in progress" />
          <View style={{ gap: theme.spacing.sm }}>
            {handoffs.map((d) => (
              <Card key={d.offer.id} onPress={() => router.push(`/offers/${d.offer.id}`)} elevation="none">
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                  <View style={{ width: 44 }}>
                    <ListingImage image={d.offer.listing?.image ?? undefined} height={44} radius={theme.radii.sm} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {offerKindEmoji[d.offer.kind]} {d.offer.listing?.title ?? "Item"}
                    </AppText>
                    <AppText variant="caption" color="textFaint">
                      {d.handoff ? handoffStatusLabel[d.handoff.handoffStatus] : "Handoff"}
                    </AppText>
                  </View>
                  <Badge label="Handoff" tone="accent" />
                </View>
              </Card>
            ))}
          </View>
        </>
      ) : null}
      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

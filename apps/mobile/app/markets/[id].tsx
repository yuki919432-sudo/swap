import { useCallback, useState } from "react";
import { View, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, IconButton, Badge, Button, ListingImage, ListingCard, EmptyState, Divider, Chip } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { MarketDetail } from "../../src/domain/models";
import { marketStatusBadge } from "../../src/lib/marketLabels";
import { categoryLabel } from "../../src/lib/labels";
import { shortDate } from "../../src/lib/id";

export default function MarketDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [detail, setDetail] = useState<MarketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    setDetail(await repos.markets.getById(id));
  }, [repos, id]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        try {
          if (id) setDetail(await repos.markets.getById(id));
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, [repos, id]),
  );

  if (!session) return null;

  if (!loading && !detail) {
    return (
      <Screen scroll>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} style={{ marginTop: theme.spacing.sm }} />
        <EmptyState emoji="🎪" title="Market not found" message="It may have been removed, or it belongs to another school." />
      </Screen>
    );
  }
  if (!detail) return null;

  const { market, listings, amHost, amSeller } = detail;
  const badge = marketStatusBadge(market.status);
  const verified = session.profile.membershipStatus === "verified";
  const open = market.status === "upcoming" || market.status === "active";
  const canParticipate = verified && open;

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <Badge label={badge.label} tone={badge.tone} />
      </View>

      <ListingImage image={market.coverImage ?? undefined} height={160} style={{ marginTop: theme.spacing.md }} />
      <AppText variant="title2" style={{ marginTop: theme.spacing.md }}>
        {market.title}
      </AppText>
      <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
        Hosted by {market.hostLabel ?? market.host.displayName}
      </AppText>
      {market.description ? (
        <AppText variant="body" color="textMuted" style={{ marginTop: theme.spacing.sm }}>
          {market.description}
        </AppText>
      ) : null}
      {!amHost ? (
        <Button
          label={`Message ${market.hostLabel ?? market.host.displayName}`}
          variant="secondary"
          icon="chatbubble-ellipses-outline"
          onPress={async () => {
            const cid = await repos.messaging.startConversation({ otherUserId: market.hostUserId, marketId: market.id });
            router.push(`/messages/${cid}`);
          }}
          style={{ marginTop: theme.spacing.md }}
        />
      ) : null}

      {/* Details */}
      <Card elevation="none" style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xs }}>
        <DetailRow icon="📅" label="When" value={scheduleLabel(market.startsAt, market.endsAt)} />
        <DetailRow icon="📍" label="Where" value={market.location ?? "Online — arrange your own handoff"} />
        {market.handoffInstructions ? <DetailRow icon="🤝" label="Handoff" value={market.handoffInstructions} /> : null}
        <DetailRow icon="👥" label="Participants" value={`${market.sellerCount} seller${market.sellerCount === 1 ? "" : "s"} · ${market.listingCount} item${market.listingCount === 1 ? "" : "s"}`} />
      </Card>

      {market.allowedCategories.length > 0 ? (
        <>
          <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.lg }}>
            ALLOWED CATEGORIES
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm, paddingTop: theme.spacing.sm }}>
            {market.allowedCategories.map((c) => (
              <Chip key={c} label={categoryLabel(c)} onPress={() => {}} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Participation actions */}
      {open ? (
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
          {!amSeller ? (
            <Button label="Join as seller" icon="person-add-outline" disabled={!canParticipate || busy} onPress={() => withBusy(() => repos.markets.join(market.id))} />
          ) : (
            <>
              <Button label="Add existing listing" icon="pricetag-outline" disabled={busy} onPress={() => router.push({ pathname: "/markets/add-listing", params: { marketId: market.id } })} />
              <Button label="Create a listing for this market" variant="secondary" icon="add" onPress={() => router.push({ pathname: "/create", params: { marketId: market.id } })} />
              {!amHost ? <Button label="Leave market" variant="ghost" disabled={busy} onPress={() => withBusy(() => repos.markets.leave(market.id))} /> : null}
            </>
          )}
          {!verified ? (
            <AppText variant="micro" color="textFaint" center>
              Get verified to join markets and add listings.
            </AppText>
          ) : null}
        </View>
      ) : (
        <AppText variant="callout" color="textMuted" center style={{ marginTop: theme.spacing.lg }}>
          This market is {badge.label.toLowerCase()}. Its listings stay live in the Campus Market and on their owners' stalls.
        </AppText>
      )}

      {/* Host controls */}
      {amHost && open ? (
        <Card elevation="none" style={{ marginTop: theme.spacing.lg }}>
          <AppText variant="bodyStrong">Host controls</AppText>
          <AppText variant="caption" color="textMuted" style={{ marginBottom: theme.spacing.sm }}>
            Ending or cancelling never deletes anyone's listings.
          </AppText>
          <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
            <Button label="End market" variant="secondary" disabled={busy} onPress={() => withBusy(() => repos.markets.setStatus(market.id, "ended"))} />
            <Button label="Cancel" variant="ghost" disabled={busy} onPress={() => withBusy(() => repos.markets.setStatus(market.id, "cancelled"))} />
          </View>
        </Card>
      ) : null}

      {/* Participating listings */}
      <Divider />
      <AppText variant="title3">In this market</AppText>
      {listings.length === 0 ? (
        <EmptyState emoji="📦" title="No listings yet" message={amSeller ? "Add one of your listings to get things started." : "Nothing's been added to this market yet."} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md, marginTop: theme.spacing.md }}>
          {listings.map((l) => {
            const mine = l.owner.displayName === session.profile.displayName;
            return (
              <View key={l.id} style={{ width: "47%", gap: theme.spacing.xs }}>
                <ListingCard listing={l} onPress={() => router.push(`/listing/${l.id}`)} />
                {mine && open ? (
                  <Button label="Remove" variant="ghost" fullWidth={false} disabled={busy} onPress={() => withBusy(() => repos.markets.removeListing(market.id, l.id))} />
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
      <AppText>{icon}</AppText>
      <View style={{ flex: 1 }}>
        <AppText variant="micro" color="textFaint">
          {label.toUpperCase()}
        </AppText>
        <AppText variant="callout">{value}</AppText>
      </View>
    </View>
  );
}

function scheduleLabel(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return "Anytime — always open";
  if (startsAt && endsAt) return `${shortDate(startsAt)} → ${shortDate(endsAt)}`;
  if (startsAt) return `Starts ${shortDate(startsAt)}`;
  return `Ends ${shortDate(endsAt as string)}`;
}

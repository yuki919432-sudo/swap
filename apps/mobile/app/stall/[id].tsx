import { useCallback, useState } from "react";
import { View } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, Avatar, IconButton, Badge, Button, ListingCard, EmptyState, WishlistCard, Divider } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { StallDetail } from "../../src/domain/models";
import { LISTING_POST_TYPE } from "@swap/types";
import { postTypeEmoji, postTypeLabel } from "../../src/lib/labels";

export default function StallDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [detail, setDetail] = useState<StallDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let alive = true;
      (async () => {
        setLoading(true);
        try {
          const d = await repos.stalls.getById(id);
          if (alive) setDetail(d);
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
        <EmptyState emoji="🔍" title="Stall not found" message="This stall may have closed, or it belongs to another school." />
      </Screen>
    );
  }
  if (!detail) return null;

  const { stall, listings, breakdown, visibleWishlist } = detail;
  const isMine = stall.userId === session.profile.id;

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        {isMine ? <IconButton icon="create-outline" accessibilityLabel="Edit my stall" tone="accent" onPress={() => router.push("/my-stall")} /> : null}
      </View>

      {/* Owner header */}
      <View style={{ alignItems: "center", gap: theme.spacing.xs, marginTop: theme.spacing.md }}>
        <Avatar emoji={stall.owner.avatarEmoji} size={72} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
          <AppText variant="title2">{isMine ? "My Stall" : `${stall.owner.displayName}'s Stall`}</AppText>
          {stall.owner.verified ? <Badge label="Verified" tone="success" emoji="✓" /> : null}
        </View>
        {stall.description ? (
          <AppText variant="callout" color="textMuted" center style={{ maxWidth: 300 }}>
            {stall.description}
          </AppText>
        ) : null}
        {!isMine ? (
          <Button
            label={`Message ${stall.owner.displayName}`}
            icon="chatbubble-ellipses-outline"
            fullWidth={false}
            onPress={async () => {
              const cid = await repos.messaging.startConversation({ otherUserId: stall.userId, stallId: stall.id });
              router.push(`/messages/${cid}`);
            }}
          />
        ) : null}
      </View>

      {/* Breakdown */}
      <Card elevation="none" style={{ marginTop: theme.spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {LISTING_POST_TYPE.map((pt) => (
            <View key={pt} style={{ alignItems: "center", gap: 2 }}>
              <AppText style={{ fontSize: 18 }}>{postTypeEmoji[pt]}</AppText>
              <AppText variant="bodyStrong">{breakdown[pt]}</AppText>
              <AppText variant="micro" color="textFaint">
                {postTypeLabel[pt]}
              </AppText>
            </View>
          ))}
        </View>
      </Card>

      {/* Listings */}
      <AppText variant="title3" style={{ marginTop: theme.spacing.xl }}>
        {isMine ? "My items" : "Items"}
      </AppText>
      {listings.length === 0 ? (
        <EmptyState emoji="📦" title="Nothing listed yet" message={isMine ? "Post a listing and it will show up on your stall." : "This student hasn't listed anything right now."} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md, marginTop: theme.spacing.md }}>
          {listings.map((l) => (
            <View key={l.id} style={{ width: "47%" }}>
              <ListingCard listing={l} onPress={() => router.push(`/listing/${l.id}`)} />
            </View>
          ))}
        </View>
      )}

      {/* Owner's chosen-visible wishlist */}
      {visibleWishlist.length > 0 ? (
        <>
          <Divider />
          <AppText variant="title3">{isMine ? "My looking-for requests" : "Looking for"}</AppText>
          <AppText variant="caption" color="textMuted" style={{ marginBottom: theme.spacing.sm }}>
            {isMine ? "These are visible on your stall." : "Requests this student chose to show."}
          </AppText>
          <View style={{ gap: theme.spacing.sm }}>
            {visibleWishlist.map((w) => (
              <WishlistCard key={w.id} item={w} />
            ))}
          </View>
        </>
      ) : null}

      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

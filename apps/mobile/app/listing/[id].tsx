import { useCallback, useState } from "react";
import { View, ScrollView, Dimensions } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import {
  Screen,
  AppText,
  Badge,
  Avatar,
  Button,
  IconButton,
  ListingImage,
  Divider,
  ComingSoonSheet,
  ShelfRail,
  ReportSheet,
} from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { Listing } from "../../src/domain/models";
import { postTypeEmoji, postTypeLabel, conditionLabel, categoryLabel } from "../../src/lib/labels";
import { timeAgo } from "../../src/lib/id";
import { DeterministicRecommendationEngine, recordBrowsedCategory } from "../../src/recommendations";
import { asyncStorageKeyValueStore } from "../../src/data/asyncStorage";

const engine = new DeterministicRecommendationEngine();

const { width } = Dimensions.get("window");

export default function ListingDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [saved, setSaved] = useState(false);
  const [similar, setSimilar] = useState<Listing[]>([]);
  const [sheet, setSheet] = useState<null | { title: string; message: string; emoji: string }>(null);
  const [reporting, setReporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      (async () => {
        try {
          const got = await repos.marketplace.getById(id);
          setListing(got);
          setSaved(await repos.saved.isSaved(id));
          if (got) {
            // Record the browsed category (a recommendation signal) + find similar.
            await recordBrowsedCategory(asyncStorageKeyValueStore, got.category);
            const pool = await repos.marketplace.list({ schoolId: got.schoolId });
            setSimilar(engine.similarTo(got, pool, 10));
          }
        } catch {
          setListing(null);
        }
      })();
    }, [repos, id]),
  );

  if (!listing) {
    return (
      <Screen>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
          <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        </View>
        <AppText variant="body" color="textMuted" style={{ marginTop: theme.spacing.xxl }}>
          This listing isn't available.
        </AppText>
      </Screen>
    );
  }

  const toggleSave = async () => {
    // Optimistic: flip immediately, reconcile from the backend on failure.
    setSaved((s) => !s);
    try {
      await repos.saved.toggle(listing.id);
    } catch {
      setSaved(await repos.saved.isSaved(listing.id));
    }
  };

  const isOwn = session?.profile.id === listing.ownerId;

  const messageOwner = async () => {
    if (!listing) return;
    try {
      const cid = await repos.messaging.startConversation({ otherUserId: listing.ownerId, listingId: listing.id });
      router.push(`/messages/${cid}`);
    } catch {
      setSheet({ emoji: "💬", title: "Couldn't start a chat", message: "You can only message verified students at your school. Please try again." });
    }
  };

  return (
    <Screen scroll padded={false} edges={["top"]}>
      {/* Image carousel */}
      <View>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {(listing.images.length ? listing.images : [undefined]).map((img, i) => (
            <ListingImage key={i} image={img} height={300} radius={0} style={{ width }} />
          ))}
        </ScrollView>
        <View style={{ position: "absolute", top: theme.spacing.md, left: theme.spacing.lg }}>
          <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        </View>
        <View style={{ position: "absolute", top: theme.spacing.md, right: theme.spacing.lg, flexDirection: "row", gap: theme.spacing.sm }}>
          <IconButton
            icon={saved ? "bookmark" : "bookmark-outline"}
            tone={saved ? "accent" : "muted"}
            accessibilityLabel={saved ? "Unsave" : "Save"}
            onPress={toggleSave}
          />
          <IconButton
            icon="share-outline"
            accessibilityLabel="Share"
            onPress={() => setSheet({ emoji: "📤", title: "Sharing is coming soon", message: "Sharing listings outside the app is part of a later milestone." })}
          />
        </View>
      </View>

      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
        <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
          <Badge label={postTypeLabel[listing.postType]} tone="accent" emoji={postTypeEmoji[listing.postType]} />
          {listing.condition ? <Badge label={conditionLabel[listing.condition]} tone="neutral" /> : null}
          {listing.demoLocal ? <Badge label="Your demo post" tone="info" emoji="✨" /> : null}
        </View>

        <AppText variant="title1">{listing.title}</AppText>
        <AppText variant="caption" color="textFaint">
          {categoryLabel(listing.category)} · Posted {timeAgo(listing.createdAt)}
        </AppText>

        {listing.postType === "swap" && listing.desiredItem ? (
          <View style={{ backgroundColor: theme.colors.accentSoft, borderRadius: theme.radii.md, padding: theme.spacing.md, marginTop: theme.spacing.xs }}>
            <AppText variant="caption" color="accentOnSoft">
              WANTS IN RETURN
            </AppText>
            <AppText variant="bodyStrong" color="accentOnSoft">
              {listing.desiredItem}
            </AppText>
          </View>
        ) : null}

        <AppText variant="body" color="textMuted" style={{ marginTop: theme.spacing.sm }}>
          {listing.description}
        </AppText>

        <Divider />

        {/* Owner preview — no email, no PII */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
          <Avatar emoji={listing.owner.avatarEmoji} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{listing.owner.displayName}</AppText>
            <AppText variant="caption" color={listing.owner.verified ? "success" : "textFaint"}>
              {listing.owner.verified ? "✓ Verified student" : "Pending verification"}
            </AppText>
          </View>
        </View>

        {listing.handoffLocation ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <AppText>📍</AppText>
            <AppText variant="callout" color="textMuted">
              Safe handoff: {listing.handoffLocation}
            </AppText>
          </View>
        ) : null}

        <Divider />

        <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
          <IconButton icon="flag-outline" accessibilityLabel="Report listing" tone="danger" onPress={() => setReporting(true)} />
          <View style={{ flex: 1 }}>
            {isOwn ? (
              <Button label="This is your listing" variant="secondary" disabled onPress={() => {}} />
            ) : (
              <Button label="Message owner" icon="chatbubble-ellipses-outline" onPress={messageOwner} />
            )}
          </View>
        </View>

        <ShelfRail title="Similar listings" listings={similar} onOpen={(sid) => router.push(`/listing/${sid}`)} />
      </View>

      <ComingSoonSheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        emoji={sheet?.emoji ?? "✨"}
        title={sheet?.title ?? ""}
        message={sheet?.message ?? ""}
      />
      <ReportSheet visible={reporting} onClose={() => setReporting(false)} targetType="listing" targetId={listing.id} targetLabel={listing.title} />
    </Screen>
  );
}

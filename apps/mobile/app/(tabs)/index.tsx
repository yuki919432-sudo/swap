import { useCallback, useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, DemoBanner, ListingImage, SectionHeader, Avatar } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { Listing, CommunityItem } from "../../src/domain/models";
import { LISTING_POST_TYPE } from "@swap/types";
import { postTypeEmoji, postTypeLabel, communityTypeEmoji, categoryLabel } from "../../src/lib/labels";
import { timeAgo } from "../../src/lib/id";

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const [listings, setListings] = useState<Listing[]>([]);
  const [community, setCommunity] = useState<CommunityItem[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const schoolId = session?.school.id;

  useFocusEffect(
    useCallback(() => {
      if (!schoolId) return;
      (async () => {
        try {
          setListings(await repos.marketplace.list({ schoolId, sort: "recent" }));
          setCommunity(await repos.community.list(schoolId));
          setSavedIds(await repos.saved.list());
        } catch {
          // Best-effort home; the Marketplace tab surfaces load errors + retry.
        }
      })();
    }, [repos, schoolId]),
  );

  if (!session) return null;
  const { profile, school } = session;

  const lookingFor = listings.filter((l) => l.postType === "looking_for");
  const recent = listings.filter((l) => l.postType !== "looking_for").slice(0, 8);
  const savedListings = listings.filter((l) => savedIds.includes(l.id)).slice(0, 6);

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color="textMuted">
            {school.accentEmoji} {school.name}
          </AppText>
          <AppText variant="title1">Hi {profile.displayName} 👋</AppText>
        </View>
        <Avatar emoji={profile.avatarEmoji} size={44} />
      </View>

      <View style={{ marginTop: theme.spacing.sm }}>
        <DemoBanner compact />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search the marketplace"
        onPress={() => router.push("/(tabs)/marketplace")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.sm,
          backgroundColor: theme.colors.surfaceMuted,
          borderRadius: theme.radii.pill,
          paddingHorizontal: theme.spacing.lg,
          height: 46,
          marginTop: theme.spacing.lg,
        }}
      >
        <AppText color="textFaint">🔍</AppText>
        <AppText color="textFaint">Search textbooks, dorm gear, cleats…</AppText>
      </Pressable>

      {/* Post-type quick actions */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: theme.spacing.lg }}>
        {LISTING_POST_TYPE.map((pt) => (
          <Pressable
            key={pt}
            accessibilityRole="button"
            accessibilityLabel={postTypeLabel[pt]}
            onPress={() => router.push({ pathname: "/(tabs)/marketplace", params: { postType: pt } })}
            style={{ alignItems: "center", gap: theme.spacing.xs, width: 62 }}
          >
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: theme.radii.lg,
                backgroundColor: theme.colors.accentSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText style={{ fontSize: 24 }}>{postTypeEmoji[pt]}</AppText>
            </View>
            <AppText variant="micro" color="textMuted" center>
              {postTypeLabel[pt]}
            </AppText>
          </Pressable>
        ))}
      </View>

      {/* Recently added */}
      <SectionHeader title="Recently added" actionLabel="See all" onAction={() => router.push("/(tabs)/marketplace")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.md }}>
        {recent.map((l) => (
          <Pressable key={l.id} onPress={() => router.push(`/listing/${l.id}`)} style={{ width: 150 }}>
            <ListingImage image={l.images[0]} height={110} />
            <AppText variant="callout" numberOfLines={1} style={{ marginTop: theme.spacing.xs }}>
              {l.title}
            </AppText>
            <AppText variant="caption" color="textFaint">
              {categoryLabel(l.category)} · {timeAgo(l.createdAt)}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>

      {/* Looking For requests */}
      {lookingFor.length > 0 ? (
        <>
          <SectionHeader title="Looking for" />
          <View style={{ gap: theme.spacing.sm }}>
            {lookingFor.slice(0, 3).map((l) => (
              <Card key={l.id} onPress={() => router.push(`/listing/${l.id}`)} elevation="none">
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                  <AppText style={{ fontSize: 22 }}>🔍</AppText>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {l.title}
                    </AppText>
                    <AppText variant="caption" color="textFaint">
                      {l.owner.displayName} · {timeAgo(l.createdAt)}
                    </AppText>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </>
      ) : null}

      {/* Community activity */}
      <SectionHeader title="Around campus" actionLabel="Community" onAction={() => router.push("/(tabs)/community")} />
      <View style={{ gap: theme.spacing.sm }}>
        {community.slice(0, 3).map((c) => (
          <Card key={c.id} onPress={() => router.push("/(tabs)/community")} elevation="none">
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
              <AppText style={{ fontSize: 22 }}>{communityTypeEmoji[c.type]}</AppText>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {c.title}
                </AppText>
                <AppText variant="caption" color="textFaint" numberOfLines={1}>
                  {c.organizer.displayName}
                </AppText>
              </View>
            </View>
          </Card>
        ))}
      </View>

      {/* Saved */}
      {savedListings.length > 0 ? (
        <>
          <SectionHeader title="Saved for you" actionLabel="Profile" onAction={() => router.push("/(tabs)/profile")} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.md }}>
            {savedListings.map((l) => (
              <Pressable key={l.id} onPress={() => router.push(`/listing/${l.id}`)} style={{ width: 130 }}>
                <ListingImage image={l.images[0]} height={96} />
                <AppText variant="caption" numberOfLines={1} style={{ marginTop: theme.spacing.xs }}>
                  {l.title}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
    </Screen>
  );
}

import { useCallback, useState } from "react";
import { View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, Badge, Button, IconButton, ListingImage, SectionHeader, EmptyState } from "../src/components";
import { useTheme } from "../src/theme";
import { useRepositories } from "../src/data/repositories";
import { useSession } from "../src/session/SessionProvider";
import type { DraftListing } from "../src/data/repositories/types";
import type { Listing } from "../src/domain/models";
import { listingStatusLabel, listingTone } from "../src/lib/status";
import { postTypeLabel, categoryLabel } from "../src/lib/labels";
import { timeAgo } from "../src/lib/id";
import type { ListingStatus } from "@swap/types";

const SECTIONS: { key: ListingStatus; title: string }[] = [
  { key: "draft", title: "Drafts" },
  { key: "active", title: "Active" },
  { key: "reserved", title: "Reserved" },
  { key: "completed", title: "Completed" },
  { key: "expired", title: "Expired" },
];

export default function MyListingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const [drafts, setDrafts] = useState<DraftListing[]>([]);
  const [saved, setSaved] = useState<Listing[]>([]);
  const schoolId = session?.school.id;

  const reload = useCallback(async () => {
    setDrafts(await repos.drafts.list());
    if (schoolId) {
      const ids = await repos.saved.list();
      const all = await repos.marketplace.list({ schoolId });
      setSaved(all.filter((l) => ids.includes(l.id)));
    }
  }, [repos, schoolId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const bucket = (status: ListingStatus): DraftListing[] => {
    if (status === "draft") return drafts.filter((d) => d.publishedListingId === null);
    if (status === "active") return drafts.filter((d) => d.publishedListingId !== null);
    return [];
  };

  const remove = async (id: string) => {
    await repos.drafts.remove(id);
    reload();
  };

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
          <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
          <AppText variant="title2">My listings</AppText>
        </View>
        <IconButton icon="add" accessibilityLabel="Create listing" tone="accent" onPress={() => router.push("/create")} />
      </View>

      {SECTIONS.map((s) => {
        const items = bucket(s.key);
        return (
          <View key={s.key}>
            <SectionHeader title={s.title} />
            {items.length === 0 ? (
              <AppText variant="caption" color="textFaint">
                Nothing here.
              </AppText>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                {items.map((d) => (
                  <Card key={d.id} elevation="none">
                    <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                      <View style={{ width: 64 }}>
                        <ListingImage image={d.images[0]} height={64} radius={theme.radii.md} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyStrong" numberOfLines={1}>
                          {d.title || "Untitled listing"}
                        </AppText>
                        <AppText variant="caption" color="textFaint">
                          {postTypeLabel[d.postType]} · {categoryLabel(d.category)} · {timeAgo(d.updatedAt)}
                        </AppText>
                        <View style={{ flexDirection: "row", gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
                          <Badge label={listingStatusLabel[d.status]} tone={listingTone[d.status]} />
                        </View>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                      {d.publishedListingId ? (
                        <Button label="View" variant="secondary" fullWidth={false} onPress={() => router.push(`/listing/${d.publishedListingId}`)} />
                      ) : (
                        <Button label="Edit" variant="secondary" fullWidth={false} onPress={() => router.push({ pathname: "/create", params: { draftId: d.id } })} />
                      )}
                      <Button label="Delete" variant="ghost" fullWidth={false} onPress={() => remove(d.id)} />
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </View>
        );
      })}

      <SectionHeader title="Saved" />
      {saved.length === 0 ? (
        <EmptyState emoji="🔖" title="No saved listings" message="Tap the bookmark on any listing to save it here." />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {saved.map((l) => (
            <Card key={l.id} elevation="none" onPress={() => router.push(`/listing/${l.id}`)}>
              <View style={{ flexDirection: "row", gap: theme.spacing.md, alignItems: "center" }}>
                <View style={{ width: 56 }}>
                  <ListingImage image={l.images[0]} height={56} radius={theme.radii.md} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {l.title}
                  </AppText>
                  <AppText variant="caption" color="textFaint">
                    {categoryLabel(l.category)}
                  </AppText>
                </View>
                <AppText color="textFaint">›</AppText>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

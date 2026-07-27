import { useCallback, useState } from "react";
import { View, TextInput, Switch } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, Avatar, IconButton, Button, Badge, ListingCard, EmptyState, Divider, SectionHeader } from "../src/components";
import { useTheme } from "../src/theme";
import { useRepositories } from "../src/data/repositories";
import { useSession } from "../src/session/SessionProvider";
import type { StallDetail, WishlistItem } from "../src/domain/models";
import { LISTING_POST_TYPE } from "@swap/types";
import { postTypeEmoji, postTypeLabel } from "../src/lib/labels";

export default function MyStallScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const schoolId = session?.school.id;

  const [detail, setDetail] = useState<StallDetail | null>(null);
  const [mineWishes, setMineWishes] = useState<WishlistItem[]>([]);
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!schoolId) return;
    const [d, wishes] = await Promise.all([repos.stalls.getMine(schoolId), repos.wishlist.listMine()]);
    setDetail(d);
    setMineWishes(wishes.filter((w) => w.status === "active"));
    if (d) setDescription(d.stall.description ?? "");
  }, [repos, schoolId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  if (!session) return null;
  const verified = session.profile.membershipStatus === "verified";

  const openStall = async () => {
    if (!schoolId) return;
    setSaving(true);
    setError(null);
    try {
      await repos.stalls.open(schoolId, description.trim() || null);
      setEditing(false);
      await reload();
    } catch {
      setError("Couldn't save your stall just now. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleWish = async (w: WishlistItem) => {
    await repos.wishlist.setShowOnStall(w.id, !w.showOnStall);
    setMineWishes((prev) => prev.map((x) => (x.id === w.id ? { ...x, showOnStall: !x.showOnStall } : x)));
  };

  const inputStyle = {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
  };

  // Not opened yet → low-friction opener.
  if (!detail && !editing) {
    return (
      <Screen scroll>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
          <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
          <AppText variant="title2">My Stall</AppText>
        </View>
        <EmptyState
          emoji="🛍️"
          title="Open your stall"
          message={
            verified
              ? "Your stall is a casual home for everything you list — no setup, no dashboards. Just you and your stuff."
              : "You'll be able to open a stall once your school membership is verified."
          }
          action={verified ? <Button label="Open my stall" icon="add" fullWidth={false} onPress={() => setEditing(true)} /> : undefined}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
          <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
          <AppText variant="title2">My Stall</AppText>
        </View>
        {detail && !editing ? <IconButton icon="create-outline" accessibilityLabel="Edit stall" tone="accent" onPress={() => setEditing(true)} /> : null}
      </View>

      <View style={{ alignItems: "center", gap: theme.spacing.xs, marginTop: theme.spacing.md }}>
        <Avatar emoji={session.profile.avatarEmoji} size={64} />
        <AppText variant="title3">{session.profile.displayName}</AppText>
      </View>

      {editing ? (
        <Card style={{ marginTop: theme.spacing.lg }}>
          <AppText variant="caption" color="textMuted">
            STALL DESCRIPTION (OPTIONAL)
          </AppText>
          <TextInput
            style={[inputStyle, { minHeight: 64, textAlignVertical: "top", marginTop: theme.spacing.xs }]}
            value={description}
            onChangeText={setDescription}
            placeholder="A friendly line about your stall (optional)"
            placeholderTextColor={theme.colors.textFaint}
            multiline
            maxLength={500}
          />
          {error ? (
            <AppText variant="callout" color="danger" style={{ marginTop: theme.spacing.xs }}>
              {error}
            </AppText>
          ) : null}
          <View style={{ flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.md }}>
            {detail ? <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} /> : null}
            <Button label={detail ? "Save" : "Open my stall"} icon="checkmark" loading={saving} onPress={openStall} />
          </View>
        </Card>
      ) : detail?.stall.description ? (
        <AppText variant="callout" color="textMuted" center style={{ marginTop: theme.spacing.sm, maxWidth: 300, alignSelf: "center" }}>
          {detail.stall.description}
        </AppText>
      ) : null}

      {detail ? (
        <>
          <Card elevation="none" style={{ marginTop: theme.spacing.lg }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              {LISTING_POST_TYPE.map((pt) => (
                <View key={pt} style={{ alignItems: "center", gap: 2 }}>
                  <AppText style={{ fontSize: 18 }}>{postTypeEmoji[pt]}</AppText>
                  <AppText variant="bodyStrong">{detail.breakdown[pt]}</AppText>
                  <AppText variant="micro" color="textFaint">
                    {postTypeLabel[pt]}
                  </AppText>
                </View>
              ))}
            </View>
          </Card>

          <SectionHeader title="My items" actionLabel="New listing" onAction={() => router.push("/create")} />
          {detail.listings.length === 0 ? (
            <EmptyState emoji="📦" title="Nothing listed yet" message="Post a listing and it lands on your stall automatically." />
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md }}>
              {detail.listings.map((l) => (
                <View key={l.id} style={{ width: "47%" }}>
                  <ListingCard listing={l} onPress={() => router.push(`/listing/${l.id}`)} />
                </View>
              ))}
            </View>
          )}

          {/* Wishlist visibility control */}
          <Divider />
          <AppText variant="title3">Show on my stall</AppText>
          <AppText variant="caption" color="textMuted" style={{ marginBottom: theme.spacing.sm }}>
            Choose which "looking for" requests other students can see on your stall.
          </AppText>
          {mineWishes.length === 0 ? (
            <AppText variant="callout" color="textMuted">
              You have no active wishlist requests.{" "}
              <AppText color="accent" onPress={() => router.push("/wishlist")}>
                Add one
              </AppText>
              .
            </AppText>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {mineWishes.map((w) => (
                <Card key={w.id} elevation="none">
                  <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong" numberOfLines={1}>
                        {w.title}
                      </AppText>
                      <Badge label={w.showOnStall ? "Visible" : "Hidden"} tone={w.showOnStall ? "success" : "neutral"} />
                    </View>
                    <Switch value={w.showOnStall} onValueChange={() => toggleWish(w)} trackColor={{ true: theme.colors.accent }} />
                  </View>
                </Card>
              ))}
            </View>
          )}
        </>
      ) : null}
      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

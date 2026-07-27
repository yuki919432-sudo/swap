import { useCallback, useEffect, useMemo, useState } from "react";
import { View, TextInput, ScrollView, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  Screen,
  AppText,
  Chip,
  Button,
  IconButton,
  ListingImage,
  Divider,
  ModerationNotice,
  ComingSoonSheet,
} from "../src/components";
import { useTheme } from "../src/theme";
import { useRepositories } from "../src/data/repositories";
import { useSession } from "../src/session/SessionProvider";
import { DEFAULT_CATEGORIES, ITEM_CONDITION, LISTING_POST_TYPE, type ItemCondition, type ListingPostType } from "@swap/types";
import { postTypeEmoji, postTypeLabel, conditionLabel, categoryLabel } from "../src/lib/labels";
import type { ImageRef } from "../src/domain/models";
import type { DraftListing } from "../src/data/repositories/types";
import { assessListing, publishListing, type ListingFormInput } from "../src/features/createListing";
import { newId } from "../src/lib/id";

const EXPIRY_OPTIONS: { label: string; days: number | null }[] = [
  { label: "No expiry", days: null },
  { label: "1 week", days: 7 },
  { label: "1 month", days: 30 },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.md }}>
      <AppText variant="caption" color="textMuted">
        {label.toUpperCase()}
      </AppText>
      {children}
    </View>
  );
}

export default function CreateListingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const { draftId, marketId } = useLocalSearchParams<{ draftId?: string; marketId?: string }>();

  const [id] = useState(() => draftId ?? newId("draft"));
  const [postType, setPostType] = useState<ListingPostType>("give");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("textbooks");
  const [condition, setCondition] = useState<ItemCondition | null>("good");
  const [desiredItem, setDesiredItem] = useState("");
  const [images, setImages] = useState<ImageRef[]>([]);
  const [handoff, setHandoff] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [publishedSheet, setPublishedSheet] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const inputStyle = {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
  };

  // Load an existing draft when editing.
  useEffect(() => {
    if (!draftId) return;
    (async () => {
      const d = await repos.drafts.getById(draftId);
      if (!d) return;
      setPostType(d.postType);
      setTitle(d.title);
      setDescription(d.description);
      setCategory(d.category);
      setCondition(d.condition);
      setDesiredItem(d.desiredItem ?? "");
      setImages(d.images);
      setHandoff(d.handoffLocation ?? "");
    })();
  }, [draftId, repos]);

  const formInput: ListingFormInput = useMemo(
    () => ({
      schoolId: session?.school.id ?? "",
      postType,
      title,
      description,
      category,
      condition: postType === "looking_for" ? null : condition,
      desiredItem: postType === "swap" ? desiredItem : null,
      images,
      handoffLocation: handoff,
      expiresAt: expiryDays ? new Date(Date.now() + expiryDays * 86_400_000).toISOString() : null,
    }),
    [session, postType, title, description, category, condition, desiredItem, images, handoff, expiryDays],
  );

  const assessment = useMemo(
    () =>
      session
        ? assessListing(formInput, { institutionType: session.school.institutionType })
        : null,
    [formInput, session],
  );

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      setImages((prev) => [...prev, { kind: "local" as const, value: result.assets[0]!.uri }].slice(0, 6));
    }
  }, []);

  const toDraft = (): DraftListing => ({
    id,
    schoolId: formInput.schoolId,
    postType,
    title,
    description,
    category,
    condition: formInput.condition,
    desiredItem: formInput.desiredItem,
    images,
    handoffLocation: handoff || null,
    expiresAt: formInput.expiresAt,
    updatedAt: new Date().toISOString(),
    publishedListingId: null,
    status: "draft",
  });

  const saveDraft = async () => {
    await repos.drafts.save(toDraft());
    router.replace("/my-listings");
  };

  const publish = async () => {
    if (!session) return;
    setPublishing(true);
    setPublishError(null);
    try {
      // Persist the draft first so it always exists in My Listings.
      await repos.drafts.save(toDraft());
      const result = await publishListing(repos.marketplace, formInput, ownerFromSession(session), {
        institutionType: session.school.institutionType,
      });
      if (result.published && result.listing) {
        await repos.drafts.markPublished(id, result.listing.id);
        // If we came from a market, associate the new listing with it.
        if (marketId) {
          try {
            await repos.markets.addListing(marketId, result.listing.id);
          } catch {
            // Non-fatal: the listing published; the user can add it from the market.
          }
        }
        setPublishedSheet(true);
      }
      // If not published, the ModerationNotice below already explains why; the draft
      // remains saved and the user can edit and retry.
    } catch {
      setPublishError("Couldn't publish just now. Please check your connection and try again.");
    } finally {
      setPublishing(false);
    }
  };

  if (!session) return null;

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <IconButton icon="close" accessibilityLabel="Cancel" onPress={() => router.back()} />
        <AppText variant="title2">{preview ? "Preview" : "New listing"}</AppText>
      </View>

      {preview ? (
        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
          <ListingImage image={images[0]} height={220} />
          <AppText variant="title2" style={{ marginTop: theme.spacing.sm }}>
            {title || "Untitled listing"}
          </AppText>
          <AppText variant="caption" color="textFaint">
            {postTypeLabel[postType]} · {categoryLabel(category)}
          </AppText>
          <AppText variant="body" color="textMuted">
            {description || "No description yet."}
          </AppText>
          {postType === "swap" && desiredItem ? (
            <AppText variant="callout" color="accent">
              Wants: {desiredItem}
            </AppText>
          ) : null}
          {assessment ? <ModerationNotice result={assessment.moderation} /> : null}
          {publishError ? (
            <AppText variant="callout" color="danger" style={{ marginTop: theme.spacing.xs }}>
              {publishError}
            </AppText>
          ) : null}
          <View style={{ flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.md }}>
            <Button label="Keep editing" variant="ghost" onPress={() => setPreview(false)} />
            <Button label="Publish" icon="rocket-outline" loading={publishing} disabled={!assessment?.canPublish} onPress={publish} />
          </View>
        </View>
      ) : (
        <>
          <Field label="Type">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
              {LISTING_POST_TYPE.map((pt) => (
                <Chip key={pt} label={postTypeLabel[pt]} emoji={postTypeEmoji[pt]} selected={postType === pt} onPress={() => setPostType(pt)} />
              ))}
            </ScrollView>
          </Field>

          <Field label="Photos">
            <View style={{ flexDirection: "row", gap: theme.spacing.sm, flexWrap: "wrap" }}>
              {images.map((img, i) => (
                <View key={i} style={{ width: 84 }}>
                  <ListingImage image={img} height={84} radius={theme.radii.md} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    onPress={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    style={{ position: "absolute", top: -6, right: -6, backgroundColor: theme.colors.surface, borderRadius: 999 }}
                  >
                    <AppText style={{ fontSize: 18 }}>❌</AppText>
                  </Pressable>
                </View>
              ))}
              {images.length < 6 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add photo"
                  onPress={pickImage}
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: theme.radii.md,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderStyle: "dashed",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.colors.surfaceMuted,
                  }}
                >
                  <AppText style={{ fontSize: 24 }}>＋</AppText>
                </Pressable>
              ) : null}
            </View>
          </Field>

          <Field label="Title">
            <TextInput style={inputStyle} value={title} onChangeText={setTitle} placeholder="What are you offering?" placeholderTextColor={theme.colors.textFaint} maxLength={120} />
          </Field>

          <Field label="Description">
            <TextInput
              style={[inputStyle, { minHeight: 96, textAlignVertical: "top" }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Add details students would want to know…"
              placeholderTextColor={theme.colors.textFaint}
              multiline
              maxLength={2000}
            />
          </Field>

          <Field label="Category">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {DEFAULT_CATEGORIES.map((c) => (
                <Chip key={c} label={categoryLabel(c)} selected={category === c} onPress={() => setCategory(c)} />
              ))}
            </View>
          </Field>

          {postType !== "looking_for" ? (
            <Field label="Condition">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                {ITEM_CONDITION.map((c) => (
                  <Chip key={c} label={conditionLabel[c]} selected={condition === c} onPress={() => setCondition(c)} />
                ))}
              </View>
            </Field>
          ) : null}

          {postType === "swap" ? (
            <Field label="Desired item">
              <TextInput style={inputStyle} value={desiredItem} onChangeText={setDesiredItem} placeholder="What do you want in return?" placeholderTextColor={theme.colors.textFaint} maxLength={120} />
            </Field>
          ) : null}

          <Field label="Safe handoff location">
            <TextInput style={inputStyle} value={handoff} onChangeText={setHandoff} placeholder="e.g. Library Entrance" placeholderTextColor={theme.colors.textFaint} maxLength={120} />
          </Field>

          <Field label="Expiration">
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              {EXPIRY_OPTIONS.map((o) => (
                <Chip key={o.label} label={o.label} selected={expiryDays === o.days} onPress={() => setExpiryDays(o.days)} />
              ))}
            </View>
          </Field>

          <Divider />
          <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
            <Button label="Save draft" variant="secondary" icon="save-outline" onPress={saveDraft} />
            <Button label="Preview" icon="eye-outline" onPress={() => setPreview(true)} />
          </View>
          <AppText variant="micro" color="textFaint" center style={{ marginTop: theme.spacing.md }}>
            Publishing runs the demo moderation simulator before anything appears in the feed.
          </AppText>
        </>
      )}

      <ComingSoonSheet
        visible={publishedSheet}
        onClose={() => {
          setPublishedSheet(false);
          router.replace(marketId ? `/markets/${marketId}` : "/my-listings");
        }}
        emoji="🎉"
        title="Published to your demo feed"
        message="Your listing passed the demo checks and now appears in the marketplace for this demo session. It lives only on this device."
      />
    </Screen>
  );
}

function ownerFromSession(session: { profile: { displayName: string; avatarEmoji: string; membershipStatus: string } }) {
  return {
    displayName: session.profile.displayName,
    avatarEmoji: session.profile.avatarEmoji,
    verified: session.profile.membershipStatus === "verified",
  };
}

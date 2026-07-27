import { useCallback, useState } from "react";
import { View, TextInput, ScrollView, Switch } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  Screen,
  AppText,
  Button,
  Chip,
  IconButton,
  Sheet,
  SectionHeader,
  EmptyState,
  WishlistCard,
  Divider,
} from "../src/components";
import { useTheme } from "../src/theme";
import { useRepositories } from "../src/data/repositories";
import { useSession } from "../src/session/SessionProvider";
import type { WishlistItem, WishlistMatch } from "../src/domain/models";
import { DEFAULT_CATEGORIES, ITEM_CONDITION, WISHLIST_URGENCY, type ItemCondition, type WishlistUrgency } from "@swap/types";
import { categoryLabel, conditionLabel } from "../src/lib/labels";
import { createWishlistItemSchema } from "@swap/validation";

export default function WishlistScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const schoolId = session?.school.id;

  const [mine, setMine] = useState<WishlistItem[]>([]);
  const [schoolWishes, setSchoolWishes] = useState<WishlistItem[]>([]);
  const [matches, setMatches] = useState<WishlistMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [condition, setCondition] = useState<ItemCondition | null>(null);
  const [swapAcceptable, setSwapAcceptable] = useState(true);
  const [urgency, setUrgency] = useState<WishlistUrgency>("normal");

  const reload = useCallback(async () => {
    if (!schoolId) return;
    setMine(await repos.wishlist.listMine());
    setMatches(await repos.wishlist.matchesForMe());
    const all = await repos.wishlist.listForSchool(schoolId);
    setSchoolWishes(all.filter((w) => w.userId !== session?.profile.id));
  }, [repos, schoolId, session]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const matchCountFor = (id: string) => matches.filter((m) => m.wishlistItemId === id).length;

  const submit = async () => {
    if (!schoolId) return;
    const parsed = createWishlistItemSchema.safeParse({
      schoolId,
      title,
      description: description || null,
      preferredCategory: category,
      preferredCondition: condition,
      swapAcceptable,
      urgency,
      visibility: "school",
    });
    if (!parsed.success) {
      setError("Please add a title (2–120 characters).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await repos.wishlist.create({
        schoolId,
        title,
        description: description || null,
        preferredCategory: category,
        preferredCondition: condition,
        budgetCents: null,
        swapAcceptable,
        urgency,
        visibility: "school",
      });
      setOpen(false);
      setTitle("");
      setDescription("");
      setCategory(null);
      setCondition(null);
      setSwapAcceptable(true);
      setUrgency("normal");
      reload();
    } catch {
      setError("Couldn't save just now. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
  };

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
          <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
          <AppText variant="title2">Wishlist</AppText>
        </View>
        <IconButton icon="add" accessibilityLabel="New wishlist item" tone="accent" onPress={() => setOpen(true)} />
      </View>
      <AppText variant="callout" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
        Persistent "I'm looking for…" requests. We'll match new listings to your wishlist.
      </AppText>

      <SectionHeader title="My wishlist" />
      {mine.length === 0 ? (
        <EmptyState
          emoji="🔎"
          title="No wishes yet"
          message="Add what you're looking for and we'll surface matching items as they're listed."
          action={<Button label="Add a wish" icon="add" fullWidth={false} onPress={() => setOpen(true)} />}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {mine.map((w) => (
            <WishlistCard key={w.id} item={w} matchCount={matchCountFor(w.id)} onPress={() => router.push("/(tabs)/marketplace")} />
          ))}
        </View>
      )}

      {schoolWishes.length > 0 ? (
        <>
          <SectionHeader title="Also looking for around campus" />
          <View style={{ gap: theme.spacing.sm }}>
            {schoolWishes.slice(0, 8).map((w) => (
              <WishlistCard key={w.id} item={w} ownerLabel="A student at your school" />
            ))}
          </View>
        </>
      ) : null}

      {/* Create sheet */}
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <AppText variant="title3">New wish</AppText>
        <TextInput style={inputStyle} value={title} onChangeText={setTitle} placeholder="Looking for… (e.g. mini fridge)" placeholderTextColor={theme.colors.textFaint} maxLength={120} />
        <TextInput
          style={[inputStyle, { minHeight: 64, textAlignVertical: "top" }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Any details (optional)"
          placeholderTextColor={theme.colors.textFaint}
          multiline
          maxLength={2000}
        />
        <AppText variant="caption" color="textMuted">
          PREFERRED CATEGORY
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
          {DEFAULT_CATEGORIES.map((c) => (
            <Chip key={c} label={categoryLabel(c)} selected={category === c} onPress={() => setCategory(category === c ? null : c)} />
          ))}
        </ScrollView>
        <AppText variant="caption" color="textMuted">
          PREFERRED CONDITION
        </AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {ITEM_CONDITION.map((c) => (
            <Chip key={c} label={conditionLabel[c]} selected={condition === c} onPress={() => setCondition(condition === c ? null : c)} />
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText variant="callout">Open to a swap</AppText>
          <Switch value={swapAcceptable} onValueChange={setSwapAcceptable} trackColor={{ true: theme.colors.accent }} />
        </View>
        <AppText variant="caption" color="textMuted">
          URGENCY
        </AppText>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          {WISHLIST_URGENCY.map((u) => (
            <Chip key={u} label={u} selected={urgency === u} onPress={() => setUrgency(u)} />
          ))}
        </View>
        <AppText variant="micro" color="textFaint">
          Budget is coming soon. Visibility: your school.
        </AppText>
        {error ? (
          <AppText variant="callout" color="danger">
            {error}
          </AppText>
        ) : null}
        <Divider />
        <Button label="Add to wishlist" icon="checkmark" loading={saving} disabled={title.trim().length < 2} onPress={submit} />
      </Sheet>
    </Screen>
  );
}

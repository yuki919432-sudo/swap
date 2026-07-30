import { useCallback, useMemo, useState } from "react";
import { View, TextInput, ScrollView, Switch, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  Screen,
  AppText,
  Button,
  Card,
  Chip,
  Badge,
  IconButton,
  Sheet,
  SectionHeader,
  EmptyState,
  Skeleton,
  WishlistCard,
  Divider,
} from "../src/components";
import { useTheme } from "../src/theme";
import { useRepositories } from "../src/data/repositories";
import { useSession } from "../src/session/SessionProvider";
import type { WishlistItem, WishlistMatchDetail } from "../src/domain/models";
import { DEFAULT_CATEGORIES, ITEM_CONDITION, WISHLIST_URGENCY, type ItemCondition, type WishlistStatus, type WishlistUrgency } from "@swap/types";
import { categoryLabel, conditionLabel } from "../src/lib/labels";
import { createWishlistItemSchema } from "@swap/validation";
import { JsonStore } from "../src/data/storage";
import { asyncStorageKeyValueStore } from "../src/data/asyncStorage";
import { KvActivityRecorder, wishlistMatchEvents, unavailableMatchEvents, wishlistFulfilledEvent } from "../src/activity";

type StatusFilter = "active" | "fulfilled" | "inactive";
const FILTERS: { key: StatusFilter; label: string; has: (s: WishlistStatus) => boolean }[] = [
  { key: "active", label: "Active", has: (s) => s === "active" },
  { key: "fulfilled", label: "Fulfilled", has: (s) => s === "fulfilled" },
  { key: "inactive", label: "Inactive", has: (s) => s === "cancelled" || s === "expired" },
];

const activity = new KvActivityRecorder(new JsonStore(asyncStorageKeyValueStore));

export default function WishlistScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const schoolId = session?.school.id;

  const [mine, setMine] = useState<WishlistItem[]>([]);
  const [schoolWishes, setSchoolWishes] = useState<WishlistItem[]>([]);
  const [matches, setMatches] = useState<WishlistMatchDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("active");

  // create / edit sheet
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [condition, setCondition] = useState<ItemCondition | null>(null);
  const [swapAcceptable, setSwapAcceptable] = useState(true);
  const [urgency, setUrgency] = useState<WishlistUrgency>("normal");

  // per-item actions sheet
  const [actionsFor, setActionsFor] = useState<WishlistItem | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [mineItems, matchDetails, all] = await Promise.all([
        repos.wishlist.listMine(),
        repos.wishlist.matchDetailsForMe(),
        repos.wishlist.listForSchool(schoolId),
      ]);
      setMine(mineItems);
      setMatches(matchDetails);
      setSchoolWishes(all.filter((w) => w.userId !== session?.profile.id));
      // Prepare (do not send) in-app activity events for new matches + unavailable ones.
      await activity.record([...wishlistMatchEvents(matchDetails), ...unavailableMatchEvents(matchDetails)]);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [repos, schoolId, session]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const visible = useMemo(() => {
    const has = FILTERS.find((f) => f.key === filter)?.has ?? (() => true);
    return mine.filter((w) => has(w.status));
  }, [mine, filter]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { active: 0, fulfilled: 0, inactive: 0 };
    for (const w of mine) for (const f of FILTERS) if (f.has(w.status)) c[f.key] += 1;
    return c;
  }, [mine]);

  const availableMatchesFor = useCallback(
    (id: string) => matches.filter((m) => m.wishlistItemId === id && m.available),
    [matches],
  );

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setCategory(null);
    setCondition(null);
    setSwapAcceptable(true);
    setUrgency("normal");
    setError(null);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (w: WishlistItem) => {
    setEditingId(w.id);
    setTitle(w.title);
    setDescription(w.description ?? "");
    setCategory(w.preferredCategory);
    setCondition(w.preferredCondition);
    setSwapAcceptable(w.swapAcceptable);
    setUrgency(w.urgency);
    setError(null);
    setActionsFor(null);
    setOpen(true);
  };

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
      if (editingId !== null) {
        await repos.wishlist.update(editingId, {
          title,
          description: description || null,
          preferredCategory: category,
          preferredCondition: condition,
          swapAcceptable,
          urgency,
        });
      } else {
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
      }
      setOpen(false);
      resetForm();
      reload();
    } catch {
      setError("Couldn't save just now. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setActionsFor(null);
      reload();
    } catch {
      setError("Couldn't update that request. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const markFulfilled = (w: WishlistItem) =>
    runAction(async () => {
      await repos.wishlist.updateStatus(w.id, "fulfilled");
      await activity.record([wishlistFulfilledEvent(w)]);
    });
  const reopen = (w: WishlistItem) => runAction(() => repos.wishlist.updateStatus(w.id, "active"));
  const cancel = (w: WishlistItem) => runAction(() => repos.wishlist.updateStatus(w.id, "cancelled"));
  const del = (w: WishlistItem) => runAction(() => repos.wishlist.remove(w.id));
  const toggleStall = (w: WishlistItem) => runAction(() => repos.wishlist.setShowOnStall(w.id, !w.showOnStall));

  const messageOwner = async (m: WishlistMatchDetail) => {
    if (m.listing === null) return;
    try {
      const conversationId = await repos.messaging.startConversation({ otherUserId: m.listing.ownerId, listingId: m.listing.id });
      router.push(`/messages/${conversationId}`);
    } catch {
      setError("Couldn't open that conversation. Please try again.");
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
        <IconButton icon="add" accessibilityLabel="New wishlist item" tone="accent" onPress={openCreate} />
      </View>
      <AppText variant="callout" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
        Persistent "I'm looking for…" requests — different from saved items. We'll match new listings to your wishlist.
      </AppText>

      {/* Status filter */}
      <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={`${f.label}${counts[f.key] > 0 ? ` (${counts[f.key]})` : ""}`} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>

      {loadError ? (
        <EmptyState emoji="⚠️" title="Couldn't load your wishlist" message="Check your connection and try again." action={<Button label="Retry" icon="refresh" fullWidth={false} onPress={reload} />} />
      ) : loading && mine.length === 0 ? (
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : visible.length === 0 ? (
        <EmptyState
          emoji={filter === "active" ? "🔎" : "🗂️"}
          title={filter === "active" ? "No active wishes" : filter === "fulfilled" ? "Nothing fulfilled yet" : "Nothing here"}
          message={filter === "active" ? "Add what you're looking for and we'll surface matching items as they're listed." : "Requests you fulfil or cancel will show up here."}
          action={filter === "active" ? <Button label="Add a wish" icon="add" fullWidth={false} onPress={openCreate} /> : undefined}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          {visible.map((w) => (
            <WishlistCard key={w.id} item={w} matchCount={availableMatchesFor(w.id).length} onPress={() => setActionsFor(w)} />
          ))}
        </View>
      )}

      {/* Matched listings for my active wishes */}
      {filter === "active" && visible.length > 0 ? (
        <>
          <SectionHeader title="Matched listings" />
          {matches.length === 0 ? (
            <EmptyState emoji="✨" title="No matches yet" message="When someone lists an item that fits one of your wishes, it'll appear here." />
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {matches.map((m) => (
                <MatchRow key={`${m.wishlistItemId}:${m.listing?.id ?? "gone"}`} match={m} onMessage={() => messageOwner(m)} onView={() => m.listing && router.push(`/listing/${m.listing.id}`)} />
              ))}
            </View>
          )}
        </>
      ) : null}

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

      {/* Per-item actions */}
      <Sheet visible={actionsFor !== null} onClose={() => setActionsFor(null)}>
        {actionsFor ? (
          <>
            <AppText variant="title3" numberOfLines={2}>
              {actionsFor.title}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {actionsFor.status.toUpperCase()}
            </AppText>
            <Divider />
            <Button label="Edit request" icon="create-outline" variant="secondary" onPress={() => openEdit(actionsFor)} />
            {actionsFor.status === "active" ? (
              <Button label="Mark fulfilled" icon="checkmark-circle" loading={busy} onPress={() => markFulfilled(actionsFor)} />
            ) : (
              <Button label="Reopen request" icon="refresh" loading={busy} onPress={() => reopen(actionsFor)} />
            )}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.xs }}>
              <AppText variant="callout">Show on my stall</AppText>
              <Switch value={actionsFor.showOnStall} onValueChange={() => toggleStall(actionsFor)} trackColor={{ true: theme.colors.accent }} />
            </View>
            {actionsFor.status === "active" ? (
              <Button label="Cancel request" icon="close-circle" variant="secondary" loading={busy} onPress={() => cancel(actionsFor)} />
            ) : null}
            <Button label="Delete" icon="trash" variant="danger" loading={busy} onPress={() => del(actionsFor)} />
          </>
        ) : null}
      </Sheet>

      {/* Create / edit sheet */}
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <AppText variant="title3">{editingId !== null ? "Edit wish" : "New wish"}</AppText>
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
        {error !== null ? (
          <AppText variant="callout" color="danger">
            {error}
          </AppText>
        ) : null}
        <Divider />
        <Button label={editingId !== null ? "Save changes" : "Add to wishlist"} icon="checkmark" loading={saving} disabled={title.trim().length < 2} onPress={submit} />
      </Sheet>
    </Screen>
  );
}

function MatchRow({ match, onMessage, onView }: { match: WishlistMatchDetail; onMessage: () => void; onView: () => void }) {
  const theme = useTheme();
  const listing = match.listing;
  return (
    <Card elevation="none">
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
        <AppText style={{ fontSize: 22 }}>{match.available ? "✨" : "🚫"}</AppText>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {listing?.title ?? "A matched item"}
          </AppText>
          <AppText variant="caption" color="textFaint" numberOfLines={1}>
            For "{match.wishlistTitle}"
          </AppText>
        </View>
        {match.available ? (
          <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
            <Pressable accessibilityRole="button" accessibilityLabel="View listing" onPress={onView} hitSlop={8}>
              <Badge label="View" tone="neutral" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Message owner" onPress={onMessage} hitSlop={8}>
              <Badge label="Message" tone="accent" emoji="💬" />
            </Pressable>
          </View>
        ) : (
          <Badge label="No longer available" tone="neutral" />
        )}
      </View>
    </Card>
  );
}

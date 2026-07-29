import { useCallback, useMemo, useState } from "react";
import { View, TextInput, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Screen, AppText, Chip, Button, IconButton, Divider, ModerationNotice, ListingImage } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { Listing } from "../../src/domain/models";
import type { OfferKind } from "@swap/types";
import { offerKindEmoji, offerKindLabel } from "../../src/lib/offerLabels";
import { assessOfferText } from "../../src/features/createOffer";
import type { ModerationResult } from "../../src/moderation/simulator";

const KINDS: OfferKind[] = ["give", "swap", "borrow", "lend"];
const WHEN: { label: string; hours: number | null }[] = [
  { label: "Flexible", hours: null },
  { label: "Today", hours: 6 },
  { label: "Tomorrow", hours: 24 },
  { label: "This weekend", hours: 72 },
];
const RETURN: { label: string; days: number }[] = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
];

export default function CreateOfferScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const { conversationId, listingId } = useLocalSearchParams<{ conversationId: string; listingId: string }>();

  const [listing, setListing] = useState<Listing | null>(null);
  const [mine, setMine] = useState<Listing[]>([]);
  const [kind, setKind] = useState<OfferKind>("give");
  const [offeredId, setOfferedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [locationText, setLocationText] = useState("");
  const [whenHours, setWhenHours] = useState<number | null>(null);
  const [returnDays, setReturnDays] = useState<number>(7);
  const [notice, setNotice] = useState<ModerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!listingId || !session) return;
      (async () => {
        setListing(await repos.marketplace.getById(listingId));
        setMine(await repos.marketplace.listMine(session.school.id));
      })();
    }, [repos, listingId, session]),
  );

  const inputStyle = {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
  };

  const eligibleSwapItems = useMemo(() => mine.filter((l) => l.id !== listingId && l.status === "active"), [mine, listingId]);

  if (!session) return null;

  const submit = async () => {
    if (!conversationId || !listingId) return;
    const text = `${note} ${locationText}`.trim();
    if (text) {
      const a = assessOfferText(text, { institutionType: session.school.institutionType });
      if (!a.ok) {
        setNotice(a.moderation);
        return;
      }
    }
    setNotice(null);
    setSubmitting(true);
    setError(null);
    try {
      const handoffAt = whenHours === null ? null : new Date(Date.now() + whenHours * 3600_000).toISOString();
      const returnBy = kind === "borrow" || kind === "lend" ? new Date(Date.now() + returnDays * 86_400_000).toISOString() : null;
      await repos.offers.create({
        conversationId,
        kind,
        listingId,
        offeredListingId: kind === "swap" ? offeredId : null,
        note: note.trim() || null,
        handoffAt,
        handoffLocationText: locationText.trim() || null,
        returnBy,
      });
      router.replace(`/messages/${conversationId}`);
    } catch (e) {
      setError(friendlyOfferError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!listing && (kind !== "swap" || offeredId !== null);

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <IconButton icon="close" accessibilityLabel="Cancel" onPress={() => router.back()} />
        <AppText variant="title2">Make an offer</AppText>
      </View>

      {/* The item this offer is about */}
      {listing ? (
        <View style={{ flexDirection: "row", gap: theme.spacing.md, alignItems: "center", backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radii.md, padding: theme.spacing.md, marginTop: theme.spacing.md }}>
          <View style={{ width: 48 }}>
            <ListingImage image={listing.images[0]} height={48} radius={theme.radii.sm} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {listing.title}
            </AppText>
            <AppText variant="caption" color="textFaint">
              {listing.owner.displayName}'s item
            </AppText>
          </View>
        </View>
      ) : null}

      <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.lg }}>
        OFFER TYPE
      </AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
        {KINDS.map((k) => (
          <Chip key={k} label={offerKindLabel[k]} emoji={offerKindEmoji[k]} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>

      {kind === "swap" ? (
        <>
          <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.lg }}>
            OFFER ONE OF YOUR ITEMS
          </AppText>
          {eligibleSwapItems.length === 0 ? (
            <AppText variant="callout" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
              You have no active listings to swap. Post one first.
            </AppText>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
              {eligibleSwapItems.map((l) => (
                <View key={l.id} style={{ width: 110 }}>
                  <View style={{ borderWidth: 2, borderColor: offeredId === l.id ? theme.colors.accent : "transparent", borderRadius: theme.radii.md, overflow: "hidden" }}>
                    <ListingImage image={l.images[0]} height={90} radius={theme.radii.md - 2} />
                  </View>
                  <AppText variant="caption" numberOfLines={1} style={{ marginTop: 2 }} onPress={() => setOfferedId(offeredId === l.id ? null : l.id)}>
                    {l.title}
                  </AppText>
                  <Chip label={offeredId === l.id ? "Selected" : "Choose"} selected={offeredId === l.id} onPress={() => setOfferedId(offeredId === l.id ? null : l.id)} />
                </View>
              ))}
            </ScrollView>
          )}
        </>
      ) : null}

      <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.lg }}>
        NOTE (OPTIONAL)
      </AppText>
      <TextInput
        style={[inputStyle, { minHeight: 60, textAlignVertical: "top", marginTop: theme.spacing.xs }]}
        value={note}
        onChangeText={setNote}
        placeholder="Add a friendly note…"
        placeholderTextColor={theme.colors.textFaint}
        multiline
        maxLength={2000}
      />

      <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.lg }}>
        SUGGESTED HANDOFF TIME
      </AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
        {WHEN.map((w) => (
          <Chip key={w.label} label={w.label} selected={whenHours === w.hours} onPress={() => setWhenHours(w.hours)} />
        ))}
      </View>

      <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.lg }}>
        HANDOFF SPOT (OPTIONAL)
      </AppText>
      <TextInput style={[inputStyle, { marginTop: theme.spacing.xs }]} value={locationText} onChangeText={setLocationText} placeholder="e.g. Library entrance" placeholderTextColor={theme.colors.textFaint} maxLength={200} />
      <AppText variant="micro" color="textFaint">
        A general campus spot only — no home addresses or maps.
      </AppText>

      {kind === "borrow" || kind === "lend" ? (
        <>
          <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.lg }}>
            RETURN BY
          </AppText>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
            {RETURN.map((r) => (
              <Chip key={r.label} label={r.label} selected={returnDays === r.days} onPress={() => setReturnDays(r.days)} />
            ))}
          </View>
        </>
      ) : null}

      {notice ? <View style={{ marginTop: theme.spacing.md }}><ModerationNotice result={notice} /></View> : null}
      {error ? (
        <AppText variant="callout" color="danger" style={{ marginTop: theme.spacing.md }}>
          {error}
        </AppText>
      ) : null}

      <Divider />
      <Button label="Send offer" icon="paper-plane-outline" loading={submitting} disabled={!canSubmit} onPress={submit} />
      <AppText variant="micro" color="textFaint" center style={{ marginTop: theme.spacing.md }}>
        No payments — this is a casual agreement between students.
      </AppText>
      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

export function friendlyOfferError(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (m.includes("listing_not_available") || m.includes("not_available")) return "This item is no longer available.";
  if (m.includes("blocked")) return "You can't send an offer in this conversation.";
  if (m.includes("offer_already_active")) return "There's already an active offer here. Resolve it first.";
  if (m.includes("not_listing_owner") || m.includes("counterpart_owned") || m.includes("own_listing")) return "That item can't be offered this way.";
  if (m.includes("invalid_offer_state")) return "This offer was already resolved.";
  return "Couldn't send the offer just now. Please try again.";
}

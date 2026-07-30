import { useCallback, useState } from "react";
import { View, TextInput, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, Badge, Button, IconButton, Divider, ListingImage, Sheet, Chip } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { OfferDetail, OfferListingRef } from "../../src/domain/models";
import { offerKindEmoji, offerKindLabel, offerStatusLabel, offerStatusTone, handoffStatusLabel, handoffStageLabel } from "../../src/lib/offerLabels";
import { shortDate } from "../../src/lib/id";
import { friendlyOfferError } from "./create";

const WHEN: { label: string; hours: number | null }[] = [
  { label: "Flexible", hours: null },
  { label: "Today", hours: 6 },
  { label: "Tomorrow", hours: 24 },
];

export default function OfferDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [detail, setDetail] = useState<OfferDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counter, setCounter] = useState(false);
  const [cNote, setCNote] = useState("");
  const [cWhen, setCWhen] = useState<number | null>(null);
  const [cLocation, setCLocation] = useState("");

  const reload = useCallback(async () => {
    if (!id) return;
    setDetail(await repos.offers.getById(id));
  }, [repos, id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  if (!session || !detail) return null;
  const { offer, handoff, chain } = detail;
  const isBorrowLend = offer.kind === "borrow" || offer.kind === "lend";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(friendlyOfferError(e));
    } finally {
      setBusy(false);
    }
  };

  const submitCounter = async () => {
    await run(async () => {
      const handoffAt = cWhen === null ? null : new Date(Date.now() + cWhen * 3600_000).toISOString();
      await repos.offers.counter({ parentOfferId: offer.id, note: cNote.trim() || null, handoffAt, handoffLocationText: cLocation.trim() || null });
      setCounter(false);
    });
  };

  const ItemRow = ({ label, item }: { label: string; item: OfferListingRef | null }) =>
    item ? (
      <View style={{ flexDirection: "row", gap: theme.spacing.sm, alignItems: "center", marginTop: theme.spacing.xs }}>
        <View style={{ width: 40 }}>
          <ListingImage image={item.image ?? undefined} height={40} radius={theme.radii.sm} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="micro" color="textFaint">
            {label}
          </AppText>
          <AppText variant="callout" numberOfLines={1}>
            {item.title}
          </AppText>
        </View>
        {item.status !== "active" && item.status !== "reserved" ? <Badge label={item.status} tone="neutral" /> : null}
      </View>
    ) : null;

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <Badge label={offerStatusLabel[offer.status] ?? offer.status} tone={offerStatusTone(offer.status)} />
      </View>

      <Card style={{ marginTop: theme.spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
          <AppText style={{ fontSize: 22 }}>{offerKindEmoji[offer.kind]}</AppText>
          <AppText variant="title3">{offerKindLabel[offer.kind]} offer</AppText>
        </View>
        <ItemRow label="ITEM" item={offer.listing} />
        <ItemRow label="OFFERED IN RETURN" item={offer.offeredListing} />
        {offer.note ? (
          <AppText variant="callout" color="textMuted" style={{ marginTop: theme.spacing.sm }}>
            “{offer.note}”
          </AppText>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
          {offer.handoffAt ? <Badge label={`When: ${shortDate(offer.handoffAt)}`} tone="neutral" /> : <Badge label="When: flexible" tone="neutral" />}
          {offer.handoffLocationText ? <Badge label={`📍 ${offer.handoffLocationText}`} tone="neutral" /> : null}
          {offer.returnBy ? <Badge label={`Return by ${shortDate(offer.returnBy)}`} tone="warn" /> : null}
        </View>
      </Card>

      {/* Pending actions */}
      {offer.status === "pending" ? (
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
          {offer.amRecipient ? (
            <>
              <Button label="Accept" icon="checkmark" loading={busy} onPress={() => run(() => repos.offers.accept(offer.id))} />
              <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                <Button label="Counter" variant="secondary" icon="swap-horizontal-outline" onPress={() => setCounter(true)} />
                <Button label="Decline" variant="ghost" disabled={busy} onPress={() => run(() => repos.offers.decline(offer.id))} />
              </View>
            </>
          ) : (
            <Button label="Cancel offer" variant="secondary" disabled={busy} onPress={() => run(() => repos.offers.cancel(offer.id))} />
          )}
        </View>
      ) : null}

      {/* Handoff plan (accepted) */}
      {handoff && offer.status === "accepted" ? (
        <Card elevation="none" style={{ marginTop: theme.spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <AppText variant="title3">Handoff plan</AppText>
            <Badge label={handoffStatusLabel[handoff.handoffStatus]} tone="info" />
          </View>
          {handoff.scheduledAt ? (
            <AppText variant="callout" color="textMuted">
              🗓️ {shortDate(handoff.scheduledAt)}
            </AppText>
          ) : null}
          {handoff.handoffLocationText ? (
            <AppText variant="callout" color="textMuted">
              📍 {handoff.handoffLocationText}
            </AppText>
          ) : null}

          {isBorrowLend ? (
            <>
              <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.sm }}>
                {handoffStageLabel[handoff.stage]}
                {handoff.returnBy ? ` · return by ${shortDate(handoff.returnBy)}` : ""}
              </AppText>
              {handoff.stage === "none" ? (
                <Button label="Mark handed over" icon="hand-left-outline" loading={busy} onPress={() => run(() => repos.offers.markHandedOver(handoff.id))} style={{ marginTop: theme.spacing.sm }} />
              ) : handoff.stage === "return_due" ? (
                <Button label="Mark returned" icon="checkmark-done-outline" loading={busy} onPress={() => run(() => repos.offers.markReturned(handoff.id))} style={{ marginTop: theme.spacing.sm }} />
              ) : null}
            </>
          ) : (
            <View style={{ marginTop: theme.spacing.sm }}>
              <AppText variant="caption" color="textMuted">
                {handoff.confirmations}/2 confirmed
              </AppText>
              <Button
                label={handoff.iConfirmed ? "You confirmed — waiting" : "Mark handoff complete"}
                icon="checkmark-done-outline"
                disabled={busy || handoff.iConfirmed}
                loading={busy}
                onPress={() => run(() => repos.offers.confirmCompletion(handoff.id))}
                style={{ marginTop: theme.spacing.xs }}
              />
            </View>
          )}
        </Card>
      ) : null}

      {offer.status === "completed" ? (
        <Card elevation="none" style={{ marginTop: theme.spacing.lg }}>
          <AppText variant="bodyStrong" color="success">
            🎉 All done
          </AppText>
          <AppText variant="caption" color="textMuted">
            This exchange is complete.
          </AppText>
        </Card>
      ) : null}

      {/* Revision history */}
      {chain.length > 1 ? (
        <>
          <Divider />
          <AppText variant="title3">History</AppText>
          <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
            {chain.map((o, i) => (
              <View key={o.id} style={{ flexDirection: "row", gap: theme.spacing.sm, alignItems: "center" }}>
                <AppText variant="caption" color="textFaint">
                  {i + 1}.
                </AppText>
                <AppText variant="caption" color={o.id === offer.id ? "text" : "textFaint"} style={{ flex: 1 }} numberOfLines={1}>
                  {offerKindLabel[o.kind]} · {offerStatusLabel[o.status] ?? o.status}
                  {o.note ? ` · “${o.note}”` : ""}
                </AppText>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {error ? (
        <AppText variant="callout" color="danger" style={{ marginTop: theme.spacing.md }}>
          {error}
        </AppText>
      ) : null}

      {offer.conversationId ? (
        <Button label="Open conversation" variant="ghost" icon="chatbubble-outline" onPress={() => router.push(`/messages/${offer.conversationId}`)} style={{ marginTop: theme.spacing.lg }} />
      ) : null}

      {/* Counter sheet */}
      <Sheet visible={counter} onClose={() => setCounter(false)}>
        <AppText variant="title3">Counteroffer</AppText>
        <TextInput
          style={{ backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radii.md, padding: theme.spacing.md, color: theme.colors.text, minHeight: 56, textAlignVertical: "top" }}
          value={cNote}
          onChangeText={setCNote}
          placeholder="What would you change?"
          placeholderTextColor={theme.colors.textFaint}
          multiline
          maxLength={2000}
        />
        <AppText variant="caption" color="textMuted">
          SUGGESTED TIME
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
          {WHEN.map((w) => (
            <Chip key={w.label} label={w.label} selected={cWhen === w.hours} onPress={() => setCWhen(w.hours)} />
          ))}
        </ScrollView>
        <TextInput
          style={{ backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radii.md, padding: theme.spacing.md, color: theme.colors.text }}
          value={cLocation}
          onChangeText={setCLocation}
          placeholder="Handoff spot (optional)"
          placeholderTextColor={theme.colors.textFaint}
          maxLength={200}
        />
        <Button label="Send counteroffer" icon="swap-horizontal-outline" loading={busy} onPress={submitCounter} />
      </Sheet>
      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

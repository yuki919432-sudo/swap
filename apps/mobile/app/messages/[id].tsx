import { useCallback, useEffect, useRef, useState } from "react";
import { View, TextInput, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Screen, AppText, Avatar, IconButton, Badge, ModerationNotice, Sheet, Button } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { ConversationDetail, Message, Offer } from "../../src/domain/models";
import { assessMessage } from "../../src/features/sendMessage";
import type { ModerationResult } from "../../src/moderation/simulator";
import { timeAgo } from "../../src/lib/id";
import { newId } from "../../src/lib/id";
import { offerKindEmoji, offerKindLabel, offerStatusLabel, offerStatusTone } from "../../src/lib/offerLabels";

export default function ThreadScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [pending, setPending] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<ModerationResult | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [menu, setMenu] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await repos.messaging.getConversation(id);
      setDetail(d);
      setLoadState("ready");
      try {
        setOffers(await repos.offers.listForConversation(id));
      } catch {
        // offers are non-critical to the thread
      }
      if (d) await repos.messaging.markRead(id);
    } catch {
      setLoadState("error");
    }
  }, [repos, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Poll-based refresh while the thread is open (no fake realtime).
  useEffect(() => {
    if (!id) return;
    const unsub = repos.messaging.watchConversation(id, (d) => setDetail(d));
    return unsub;
  }, [repos, id]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [detail, pending]);

  if (!session) return null;

  const send = async () => {
    const body = draft.trim();
    if (!body || !id || !detail) return;
    const assessment = assessMessage(id, body, { institutionType: session.school.institutionType });
    if (!assessment.canSend) {
      setNotice(assessment.moderation);
      return;
    }
    setNotice(null);
    setDraft("");
    const optimistic: Message = {
      id: newId("msg"),
      conversationId: id,
      senderId: session.profile.id,
      type: "text",
      body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      mine: true,
      pending: true,
    };
    setPending((p) => [...p, optimistic]);
    try {
      await repos.messaging.sendMessage(id, body);
      setPending((p) => p.filter((m) => m.id !== optimistic.id));
      await load();
    } catch {
      // Reconcile on failure: keep the bubble, mark it failed for retry.
      setPending((p) => p.map((m) => (m.id === optimistic.id ? { ...m, pending: false, failed: true } : m)));
    }
  };

  const retry = async (msg: Message) => {
    setPending((p) => p.map((m) => (m.id === msg.id ? { ...m, pending: true, failed: false } : m)));
    try {
      await repos.messaging.sendMessage(msg.conversationId, msg.body);
      setPending((p) => p.filter((m) => m.id !== msg.id));
      await load();
    } catch {
      setPending((p) => p.map((m) => (m.id === msg.id ? { ...m, pending: false, failed: true } : m)));
    }
  };

  const doBlock = async () => {
    if (!detail) return;
    await repos.messaging.block(detail.conversation.counterpart.userId, detail.conversation.schoolId);
    setMenu(false);
    await load();
  };
  const doUnblock = async () => {
    if (!detail) return;
    await repos.messaging.unblock(detail.conversation.counterpart.userId);
    setMenu(false);
    await load();
  };

  const ctx = detail?.conversation.context;
  const messages = [...(detail?.messages ?? []), ...pending];

  return (
    <Screen padded={false}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        {detail ? <Avatar emoji={detail.conversation.counterpart.avatarEmoji} size={36} /> : null}
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {detail?.conversation.counterpart.displayName ?? "Conversation"}
          </AppText>
          {detail?.conversation.counterpart.verified ? (
            <AppText variant="micro" color="success">
              Verified student
            </AppText>
          ) : null}
        </View>
        <IconButton icon="ellipsis-horizontal" accessibilityLabel="Conversation options" onPress={() => setMenu(true)} />
      </View>

      {/* Context card */}
      {ctx && ctx.kind !== "none" ? (
        <Pressable
          onPress={() => {
            if (ctx.unavailable) return;
            if (ctx.kind === "listing" && ctx.id) router.push(`/listing/${ctx.id}`);
            else if (ctx.kind === "market" && ctx.id) router.push(`/markets/${ctx.id}`);
            else if (ctx.kind === "stall" && ctx.id) router.push(`/stall/${ctx.id}`);
          }}
          style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, backgroundColor: theme.colors.surfaceMuted, marginHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radii.md }}
        >
          <AppText>{ctx.kind === "listing" ? "🏷️" : ctx.kind === "market" ? "🎪" : "🛍️"}</AppText>
          <View style={{ flex: 1 }}>
            <AppText variant="callout" numberOfLines={1}>
              {ctx.label}
            </AppText>
            {ctx.subtitle ? (
              <AppText variant="micro" color="textFaint">
                {ctx.subtitle}
              </AppText>
            ) : null}
          </View>
          {ctx.unavailable ? <Badge label="Unavailable" tone="neutral" /> : <AppText color="textFaint">›</AppText>}
        </Pressable>
      ) : null}

      {/* Offer strip */}
      {offers.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
          {offers
            .slice()
            .reverse()
            .map((o) => (
              <Pressable
                key={o.id}
                onPress={() => router.push(`/offers/${o.id}`)}
                style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radii.pill, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.md }}
              >
                <AppText>{offerKindEmoji[o.kind]}</AppText>
                <AppText variant="caption">{offerKindLabel[o.kind]}</AppText>
                <Badge label={offerStatusLabel[o.status] ?? o.status} tone={offerStatusTone(o.status)} />
              </Pressable>
            ))}
        </ScrollView>
      ) : null}

      {/* Messages */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
          {loadState === "error" ? (
            <AppText variant="callout" color="danger" center>
              Couldn't load this conversation.
            </AppText>
          ) : null}
          {messages.map((m) =>
            m.type === "system" ? (
              <AppText key={m.id} variant="micro" color="textFaint" center style={{ marginVertical: theme.spacing.xs }}>
                {m.body}
              </AppText>
            ) : (
              <View key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                <View
                  style={{
                    backgroundColor: m.mine ? theme.colors.accent : theme.colors.surfaceMuted,
                    paddingVertical: theme.spacing.sm,
                    paddingHorizontal: theme.spacing.md,
                    borderRadius: theme.radii.lg,
                    opacity: m.pending ? 0.6 : 1,
                  }}
                >
                  <AppText color={m.mine ? "onAccent" : "text"}>{m.body}</AppText>
                </View>
                <View style={{ flexDirection: "row", gap: theme.spacing.xs, alignSelf: m.mine ? "flex-end" : "flex-start", marginTop: 2 }}>
                  <AppText variant="micro" color="textFaint">
                    {m.pending ? "Sending…" : m.failed ? "Failed" : timeAgo(m.createdAt)}
                  </AppText>
                  {m.failed ? (
                    <AppText variant="micro" color="accent" onPress={() => retry(m)}>
                      Retry
                    </AppText>
                  ) : null}
                </View>
              </View>
            ),
          )}
        </ScrollView>

        {/* Composer / blocked state */}
        {detail && !detail.canSend ? (
          <View style={{ padding: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
            <AppText variant="callout" color="textMuted" center>
              {detail.blockedByMe
                ? "You blocked this student. Unblock from the menu to message again."
                : "You can't send messages in this conversation right now."}
            </AppText>
          </View>
        ) : (
          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, padding: theme.spacing.md, gap: theme.spacing.sm }}>
            {notice ? <ModerationNotice result={notice} /> : null}
            {ctx && ctx.kind === "listing" && ctx.id && !ctx.unavailable ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/offers/create", params: { conversationId: id, listingId: ctx.id } })}
                style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, alignSelf: "flex-start", backgroundColor: theme.colors.accentSoft, borderRadius: theme.radii.pill, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.md }}
              >
                <AppText>🤝</AppText>
                <AppText variant="caption" style={{ color: theme.colors.accentOnSoft }}>
                  Make an offer
                </AppText>
              </Pressable>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: theme.spacing.sm }}>
              <TextInput
                style={{ flex: 1, backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radii.lg, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, color: theme.colors.text, maxHeight: 120 }}
                value={draft}
                onChangeText={setDraft}
                placeholder="Message…"
                placeholderTextColor={theme.colors.textFaint}
                multiline
                maxLength={2000}
              />
              <IconButton icon="send" accessibilityLabel="Send message" tone="accent" onPress={send} />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Options menu */}
      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <AppText variant="title3">Options</AppText>
        {detail?.blockedByMe ? (
          <Button label="Unblock student" variant="secondary" icon="lock-open-outline" onPress={doUnblock} />
        ) : (
          <Button label="Block student" variant="secondary" icon="ban-outline" onPress={doBlock} />
        )}
        <AppText variant="micro" color="textFaint">
          Blocking stops new messages between you. Existing history stays visible to you.
        </AppText>
      </Sheet>
    </Screen>
  );
}

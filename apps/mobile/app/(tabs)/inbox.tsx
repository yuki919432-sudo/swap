import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Screen, AppText, Card, Avatar, DemoBanner, EmptyState, Badge } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { Conversation } from "../../src/domain/models";
import { timeAgo } from "../../src/lib/id";

type LoadState = "loading" | "ready" | "error";

export default function InboxScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const schoolId = session?.school.id;

  const load = useCallback(async () => {
    if (!schoolId) return;
    setState("loading");
    try {
      setThreads(await repos.messaging.listConversations(schoolId));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [repos, schoolId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        <AppText variant="title1">Messages</AppText>
        <DemoBanner compact />
      </View>

      {state === "loading" ? (
        <AppText variant="callout" color="textMuted" style={{ marginTop: theme.spacing.xl }}>
          Loading your conversations…
        </AppText>
      ) : state === "error" ? (
        <EmptyState
          emoji="⚠️"
          title="Couldn't load messages"
          message="Something went wrong. Pull to refresh or try again."
          action={<AppText color="accent" onPress={load}>Retry</AppText>}
        />
      ) : threads.length === 0 ? (
        <EmptyState
          emoji="💬"
          title="No messages yet"
          message="Say hi about a listing, a stall, or a market and your conversations show up here."
        />
      ) : (
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          {threads.map((t) => (
            <Card key={t.id} onPress={() => router.push(`/messages/${t.id}`)} elevation="none">
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                <Avatar emoji={t.counterpart.avatarEmoji} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <AppText variant="bodyStrong">{t.counterpart.displayName}</AppText>
                    <AppText variant="caption" color="textFaint">
                      {timeAgo(t.lastMessageAt)}
                    </AppText>
                  </View>
                  {t.context.kind !== "none" ? (
                    <AppText variant="caption" color={t.context.unavailable ? "textFaint" : "accent"} numberOfLines={1}>
                      {t.context.unavailable ? `${t.context.label} · unavailable` : t.context.label}
                    </AppText>
                  ) : null}
                  <AppText variant="callout" color={t.unread > 0 ? "text" : "textMuted"} numberOfLines={1}>
                    {t.lastPreview}
                  </AppText>
                </View>
                {t.unread > 0 ? <Badge label={`${t.unread}`} tone="accent" /> : null}
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Screen, AppText, Card, Avatar, DemoBanner, EmptyState, ComingSoonSheet } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { InboxThread } from "../../src/domain/models";
import { timeAgo } from "../../src/lib/id";

export default function InboxScreen() {
  const theme = useTheme();
  const repos = useRepositories();
  const { session } = useSession();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [sheet, setSheet] = useState(false);
  const schoolId = session?.school.id;

  useFocusEffect(
    useCallback(() => {
      if (schoolId) repos.inbox.list(schoolId).then(setThreads);
    }, [repos, schoolId]),
  );

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        <AppText variant="title1">Inbox</AppText>
        <DemoBanner compact />
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.sm,
          backgroundColor: theme.colors.infoSoft,
          borderRadius: theme.radii.md,
          padding: theme.spacing.md,
          marginTop: theme.spacing.md,
        }}
      >
        <AppText>💬</AppText>
        <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>
          This is a preview. Messaging is not live in the demo — no real conversations are sent.
        </AppText>
      </View>

      {threads.length === 0 ? (
        <EmptyState emoji="📭" title="No messages yet" message="When messaging launches, your conversations about listings will appear here." />
      ) : (
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          {threads.map((t) => (
            <Card key={t.id} onPress={() => setSheet(true)} elevation="none">
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                <Avatar emoji={t.counterpart.avatarEmoji} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <AppText variant="bodyStrong">{t.counterpart.displayName}</AppText>
                    <AppText variant="caption" color="textFaint">
                      {timeAgo(t.lastAt)}
                    </AppText>
                  </View>
                  <AppText variant="caption" color="accent" numberOfLines={1}>
                    {t.contextLabel}
                  </AppText>
                  <AppText variant="callout" color="textMuted" numberOfLines={1}>
                    {t.preview}
                  </AppText>
                </View>
                {t.unread > 0 ? (
                  <View
                    style={{
                      minWidth: 22,
                      height: 22,
                      borderRadius: 11,
                      paddingHorizontal: 6,
                      backgroundColor: theme.colors.accent,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AppText variant="micro" color="onAccent">
                      {t.unread}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </Card>
          ))}
        </View>
      )}

      <ComingSoonSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        emoji="💬"
        title="Messaging is coming soon"
        message="Real-time conversations arrive in a later milestone. In the demo we never send or store real messages."
      />
    </Screen>
  );
}

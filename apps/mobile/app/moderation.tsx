import { useCallback, useState } from "react";
import { View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, Button, IconButton, Badge, EmptyState, Skeleton, Divider } from "../src/components";
import { useTheme } from "../src/theme";
import { useRepositories } from "../src/data/repositories";
import { useSession } from "../src/session/SessionProvider";
import type { ModerationReportView } from "../src/data/repositories/types";

/**
 * Moderator review queue. Role-gated: only a moderator/admin/owner of the school
 * sees reports (enforced by the DB — this screen just reflects it). Reviewing a
 * reported item is anchored to its report; there is no blanket access to private
 * messages.
 */
export default function ModerationScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const schoolId = session?.school.id;

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [reports, setReports] = useState<ModerationReportView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const ok = await repos.moderation.isModerator(schoolId);
      setAllowed(ok);
      setReports(ok ? await repos.moderation.openReports(schoolId) : []);
    } catch {
      setAllowed(false);
    } finally {
      setLoading(false);
    }
  }, [repos, schoolId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <AppText variant="title2">Moderation</AppText>
        <View style={{ flex: 1 }} />
        <Badge label="🛡️ Moderator" tone="info" />
      </View>

      {loading && allowed === null ? (
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : allowed === false ? (
        <EmptyState emoji="🔒" title="Moderators only" message="This queue is available to your school's SWAP! moderators." />
      ) : reports.length === 0 ? (
        <EmptyState emoji="✅" title="All clear" message="There are no open reports for your school right now." />
      ) : (
        <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
          {reports.map((r) => (
            <Card key={r.id} elevation="none">
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
                <Badge label={r.reason.replace(/_/g, " ")} tone="warn" />
                <Badge label={r.targetType} tone="neutral" />
                <View style={{ flex: 1 }} />
                <AppText variant="micro" color="textFaint">
                  {r.status}
                </AppText>
              </View>
              {r.explanation ? (
                <AppText variant="body" color="textMuted" style={{ marginTop: theme.spacing.sm }}>
                  “{r.explanation}”
                </AppText>
              ) : null}
              <AppText variant="caption" color="textFaint" style={{ marginTop: theme.spacing.xs }}>
                Reported by {r.reporterName}
              </AppText>
              <Divider />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                {r.targetType === "listing" ? (
                  <Button
                    label="Remove listing"
                    variant="danger"
                    fullWidth={false}
                    loading={busyId === r.id}
                    onPress={() => act(r.id, async () => {
                      await repos.moderation.setListingStatus(r.targetId, "remove_content", r.id, "Removed on report");
                      await repos.moderation.resolveReport(r.id, "resolved", "Content removed");
                    })}
                  />
                ) : null}
                {r.targetType === "user" && schoolId ? (
                  <Button
                    label="Suspend user"
                    variant="danger"
                    fullWidth={false}
                    loading={busyId === r.id}
                    onPress={() => act(r.id, async () => {
                      await repos.moderation.suspendMember(r.targetId, schoolId, "Suspended on report");
                      await repos.moderation.resolveReport(r.id, "resolved", "User suspended");
                    })}
                  />
                ) : null}
                <Button label="Resolve" variant="secondary" fullWidth={false} loading={busyId === r.id} onPress={() => act(r.id, () => repos.moderation.resolveReport(r.id, "resolved"))} />
                <Button label="Dismiss" variant="ghost" fullWidth={false} loading={busyId === r.id} onPress={() => act(r.id, () => repos.moderation.resolveReport(r.id, "dismissed"))} />
              </View>
            </Card>
          ))}
        </View>
      )}
      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

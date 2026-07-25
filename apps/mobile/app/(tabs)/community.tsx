import { useCallback, useState } from "react";
import { View, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import { Screen, AppText, Card, Avatar, Badge, Chip, DemoBanner, EmptyState, ComingSoonSheet, Button } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import type { CommunityItem } from "../../src/domain/models";
import { COMMUNITY_POST_TYPE, type CommunityPostType } from "@swap/types";
import { communityTypeEmoji, communityTypeLabel } from "../../src/lib/labels";
import { shortDate, timeAgo } from "../../src/lib/id";

export default function CommunityScreen() {
  const theme = useTheme();
  const repos = useRepositories();
  const { session } = useSession();
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [filter, setFilter] = useState<CommunityPostType | null>(null);
  const [sheet, setSheet] = useState(false);
  const schoolId = session?.school.id;

  useFocusEffect(
    useCallback(() => {
      if (schoolId) repos.community.list(schoolId).then(setItems);
    }, [repos, schoolId]),
  );

  const present = [...new Set(items.map((i) => i.type))];
  const shown = filter ? items.filter((i) => i.type === filter) : items;

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.sm }}>
        <AppText variant="title1">Community</AppText>
        <DemoBanner compact />
      </View>
      <AppText variant="callout" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
        Events, clubs, volunteering, and study groups around campus.
      </AppText>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.md }}>
        <Chip label="All" selected={filter === null} onPress={() => setFilter(null)} />
        {COMMUNITY_POST_TYPE.filter((t) => present.includes(t)).map((t) => (
          <Chip key={t} label={communityTypeLabel[t]} emoji={communityTypeEmoji[t]} selected={filter === t} onPress={() => setFilter(t)} />
        ))}
      </ScrollView>

      {shown.length === 0 ? (
        <EmptyState emoji="📣" title="Nothing posted yet" message="Community posts for this school will appear here." />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {shown.map((c) => (
            <Card key={c.id} onPress={() => setSheet(true)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
                <Badge label={communityTypeLabel[c.type]} tone="accent" emoji={communityTypeEmoji[c.type]} />
                <AppText variant="caption" color="textFaint">
                  {timeAgo(c.createdAt)}
                </AppText>
              </View>
              <AppText variant="title3">{c.title}</AppText>
              <AppText variant="callout" color="textMuted" style={{ marginTop: theme.spacing.xs }}>
                {c.description}
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
                <Avatar emoji={c.organizer.avatarEmoji} size={28} />
                <AppText variant="caption" color="textMuted">
                  {c.organizer.displayName}
                </AppText>
                {c.when ? (
                  <AppText variant="caption" color="textFaint">
                    · 📅 {shortDate(c.when)}
                  </AppText>
                ) : null}
                {c.location ? (
                  <AppText variant="caption" color="textFaint">
                    · 📍 {c.location}
                  </AppText>
                ) : null}
              </View>
            </Card>
          ))}
        </View>
      )}

      <ComingSoonSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        emoji="🎪"
        title="Joining & RSVPs are coming soon"
        message="Signing up for events, clubs, and study groups is part of a later milestone. For now this is a preview of the community feed."
      />
      <View style={{ height: theme.spacing.md }} />
      <Button label="Post to community" variant="ghost" icon="add" onPress={() => setSheet(true)} />
    </Screen>
  );
}

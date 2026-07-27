import { View } from "react-native";
import { useTheme } from "../theme";
import type { WishlistItem } from "../domain/models";
import { categoryLabel } from "../lib/labels";
import { AppText } from "./Text";
import { Badge, type BadgeTone } from "./Badge";
import { Card } from "./Card";

const urgencyTone: Record<WishlistItem["urgency"], BadgeTone> = { low: "neutral", normal: "info", high: "warn" };

/** A wishlist ("looking for") item card. Optionally shows how many listings match. */
export function WishlistCard({
  item,
  matchCount,
  onPress,
  ownerLabel,
}: {
  item: WishlistItem;
  matchCount?: number;
  onPress?: () => void;
  ownerLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} elevation="none">
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
        <AppText style={{ fontSize: 24 }}>🔎</AppText>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {item.title}
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs, marginTop: theme.spacing.xxs }}>
            {item.preferredCategory ? <Badge label={categoryLabel(item.preferredCategory)} tone="neutral" /> : null}
            <Badge label={`${item.urgency} urgency`} tone={urgencyTone[item.urgency]} />
            {item.swapAcceptable ? <Badge label="Swap ok" tone="accent" /> : null}
            {item.status !== "active" ? <Badge label={item.status} tone="neutral" /> : null}
          </View>
          {ownerLabel ? (
            <AppText variant="caption" color="textFaint" style={{ marginTop: theme.spacing.xxs }}>
              {ownerLabel}
            </AppText>
          ) : null}
        </View>
        {matchCount !== undefined && matchCount > 0 ? (
          <Badge label={`${matchCount} match${matchCount === 1 ? "" : "es"}`} tone="success" emoji="✨" />
        ) : null}
      </View>
    </Card>
  );
}

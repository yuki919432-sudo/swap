import { ScrollView, Pressable, View } from "react-native";
import { useTheme } from "../theme";
import type { Listing } from "../domain/models";
import { categoryLabel } from "../lib/labels";
import { AppText } from "./Text";
import { ListingImage } from "./ListingImage";

/** A horizontal recommendation shelf: a titled rail of listing thumbnails. */
export function ShelfRail({
  title,
  subtitle,
  listings,
  onOpen,
}: {
  title: string;
  subtitle?: string;
  listings: Listing[];
  onOpen: (id: string) => void;
}) {
  const theme = useTheme();
  if (listings.length === 0) return null;
  return (
    <View style={{ marginTop: theme.spacing.xl }}>
      <AppText variant="title3">{title}</AppText>
      {subtitle ? (
        <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
          {subtitle}
        </AppText>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.md, paddingTop: theme.spacing.md }}
      >
        {listings.map((l) => (
          <Pressable key={l.id} onPress={() => onOpen(l.id)} style={{ width: 140 }} accessibilityRole="button" accessibilityLabel={l.title}>
            <ListingImage image={l.images[0]} height={104} />
            <AppText variant="callout" numberOfLines={1} style={{ marginTop: theme.spacing.xs }}>
              {l.title}
            </AppText>
            <AppText variant="caption" color="textFaint" numberOfLines={1}>
              {categoryLabel(l.category)}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

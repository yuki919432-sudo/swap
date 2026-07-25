import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import type { Listing } from "../domain/models";
import { categoryLabel, postTypeEmoji, postTypeLabel } from "../lib/labels";
import { timeAgo } from "../lib/id";
import { AppText } from "./Text";
import { Badge } from "./Badge";
import { ListingImage } from "./ListingImage";

export interface ListingCardProps {
  listing: Listing;
  onPress: () => void;
  saved?: boolean;
  onToggleSave?: () => void;
  /** Grid mode renders a narrower card for two-column feeds. */
  layout?: "grid" | "row";
}

/** The marketplace listing card. */
export function ListingCard({ listing, onPress, saved, onToggleSave, layout = "grid" }: ListingCardProps) {
  const theme = useTheme();
  const imageHeight = layout === "grid" ? 130 : 96;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Listing: ${listing.title}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
        transform: [{ scale: pressed ? 0.99 : 1 }],
        ...theme.shadows.sm,
      })}
    >
      <View>
        <ListingImage image={listing.images[0]} height={imageHeight} />
        <View style={{ position: "absolute", top: theme.spacing.sm, left: theme.spacing.sm }}>
          <Badge label={postTypeLabel[listing.postType]} tone="accent" emoji={postTypeEmoji[listing.postType]} />
        </View>
        {onToggleSave ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? "Unsave listing" : "Save listing"}
            onPress={onToggleSave}
            hitSlop={8}
            style={{
              position: "absolute",
              top: theme.spacing.sm,
              right: theme.spacing.sm,
              width: 32,
              height: 32,
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
              ...theme.shadows.sm,
            }}
          >
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={theme.iconSizes.sm}
              color={saved ? theme.colors.accent : theme.colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      <AppText variant="bodyStrong" numberOfLines={2}>
        {listing.title}
      </AppText>
      {listing.postType === "swap" && listing.desiredItem ? (
        <AppText variant="caption" color="accent" numberOfLines={1}>
          Wants: {listing.desiredItem}
        </AppText>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <AppText variant="caption" color="textFaint">
          {categoryLabel(listing.category)}
        </AppText>
        <AppText variant="caption" color="textFaint">
          {timeAgo(listing.createdAt)}
        </AppText>
      </View>
    </Pressable>
  );
}

import type { ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import { AppText } from "./Text";

/* -------------------------------------------------------------- SectionHeader */

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: theme.spacing.xl,
        marginBottom: theme.spacing.md,
      }}
    >
      <AppText variant="title3">{title}</AppText>
      {actionLabel ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <AppText variant="callout" color="accent">
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ----------------------------------------------------------------- EmptyState */

export function EmptyState({ emoji, title, message, action }: { emoji: string; title: string; message: string; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: theme.spacing.huge, gap: theme.spacing.sm }}>
      <AppText style={{ fontSize: 44 }}>{emoji}</AppText>
      <AppText variant="title3" center>
        {title}
      </AppText>
      <AppText variant="callout" color="textMuted" center style={{ maxWidth: 280 }}>
        {message}
      </AppText>
      {action ? <View style={{ marginTop: theme.spacing.md }}>{action}</View> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ Skeleton */

export function Skeleton({ height = 16, width = "100%", radius }: { height?: number; width?: number | `${number}%` | "100%"; radius?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        height,
        width,
        borderRadius: radius ?? theme.radii.sm,
        backgroundColor: theme.colors.surfaceMuted,
      }}
    />
  );
}

/** A skeleton shaped like a listing card, for the loading state. */
export function ListingCardSkeleton() {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
        flex: 1,
      }}
    >
      <Skeleton height={120} radius={theme.radii.md} />
      <Skeleton height={14} width="80%" />
      <Skeleton height={12} width="50%" />
    </View>
  );
}

/* ----------------------------------------------------------------- IconButton */

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = "muted",
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel: string;
  tone?: "muted" | "accent" | "danger";
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const color = tone === "accent" ? theme.colors.accent : tone === "danger" ? theme.colors.danger : theme.colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        {
          width: 40,
          height: 40,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.surfaceMuted,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={theme.iconSizes.md} color={color} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------- Divider */

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.md }} />;
}

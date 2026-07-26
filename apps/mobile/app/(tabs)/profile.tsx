import { useCallback, useState } from "react";
import { View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Screen, AppText, Card, Avatar, Badge, Divider, DemoBanner } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import { institutionLabel, verificationMethodLabel } from "../../src/lib/labels";
import { membershipStatusLabel, membershipTone } from "../../src/lib/status";
import { Ionicons } from "@expo/vector-icons";

function Row({ icon, label, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; onPress?: () => void }) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} elevation="none" style={{ marginTop: theme.spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
        <Ionicons name={icon} size={theme.iconSizes.md} color={theme.colors.accent} />
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {label}
        </AppText>
        {value ? (
          <AppText variant="callout" color="textMuted">
            {value}
          </AppText>
        ) : null}
        {onPress ? <AppText color="textFaint">›</AppText> : null}
      </View>
    </Card>
  );
}

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();
  const [savedCount, setSavedCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const [wishCount, setWishCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setSavedCount((await repos.saved.list()).length);
        setDraftCount((await repos.drafts.list()).length);
        try {
          setWishCount((await repos.wishlist.listMine()).length);
        } catch {
          setWishCount(0);
        }
      })();
    }, [repos]),
  );

  if (!session) return null;
  const { profile, school } = session;

  return (
    <Screen scroll>
      <View style={{ alignItems: "center", marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
        <Avatar emoji={profile.avatarEmoji} size={84} />
        <AppText variant="title1">{profile.displayName}</AppText>
        <AppText variant="callout" color="textMuted">
          {school.accentEmoji} {school.name}
        </AppText>
        <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
          <Badge label={membershipStatusLabel[profile.membershipStatus]} tone={membershipTone[profile.membershipStatus]} />
          <Badge label={institutionLabel[school.institutionType]} tone="neutral" />
          {profile.gradYear ? <Badge label={`Class of ${profile.gradYear}`} tone="neutral" /> : null}
          {profile.staffRole ? <Badge label="Moderator" tone="info" emoji="🛡️" /> : null}
        </View>
        {profile.verificationMethod ? (
          <AppText variant="caption" color="textFaint">
            Verified via {verificationMethodLabel[profile.verificationMethod] ?? profile.verificationMethod}
          </AppText>
        ) : null}
      </View>

      {/* Impact preview */}
      <Card style={{ marginTop: theme.spacing.xl }}>
        <AppText variant="caption" color="textMuted">
          YOUR CAMPUS IMPACT
        </AppText>
        <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: theme.spacing.md }}>
          {[
            { n: profile.impact.given, label: "Given" },
            { n: profile.impact.swapped, label: "Swapped" },
            { n: profile.impact.saved, label: "Saved" },
          ].map((s) => (
            <View key={s.label} style={{ alignItems: "center" }}>
              <AppText variant="title1" color="accent">
                {s.n}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {s.label}
              </AppText>
            </View>
          ))}
        </View>
      </Card>

      <Divider />
      <Row icon="search-outline" label="My wishlist" value={String(wishCount)} onPress={() => router.push("/wishlist")} />
      <Row icon="bookmark-outline" label="Saved listings" value={String(savedCount)} onPress={() => router.push("/my-listings")} />
      <Row icon="pricetags-outline" label="My listings" value={String(draftCount)} onPress={() => router.push("/my-listings")} />
      <Row icon="settings-outline" label="Settings" onPress={() => router.push("/settings")} />

      <View style={{ alignItems: "center", marginTop: theme.spacing.xxl }}>
        <DemoBanner />
        <AppText variant="caption" color="textFaint" center style={{ marginTop: theme.spacing.sm }}>
          Email addresses are never shown publicly. Profiles in the demo are synthetic.
        </AppText>
      </View>
    </Screen>
  );
}

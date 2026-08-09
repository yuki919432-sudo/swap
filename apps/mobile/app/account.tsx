import { useState } from "react";
import { View, TextInput, Alert, Share } from "react-native";
import { useRouter } from "expo-router";
import { Screen, AppText, Card, Button, IconButton, Divider } from "../src/components";
import { useTheme } from "../src/theme";
import { useRepositories } from "../src/data/repositories";
import { useSession } from "../src/session/SessionProvider";

/**
 * Self-service account controls (App Store §5.1.1(v): an app that supports account
 * creation must let the user initiate deletion from within it). Everything here acts
 * only on the caller's OWN account, enforced by the backend:
 *   • Edit profile — display name / graduation year.
 *   • Download my data — a JSON export of the caller's own data (portability).
 *   • Delete account — a soft, reversible deletion request, then sign-out.
 * Deletion is reversible until maintenance purges/anonymizes; history required for
 * transactions/reports/moderation/audit is preserved (see docs/ACCOUNT_DELETION_AND_RETENTION.md).
 */
export default function AccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session, clear } = useSession();

  const [displayName, setDisplayName] = useState(session?.profile.displayName ?? "");
  const [gradYear, setGradYear] = useState(
    session?.profile.gradYear !== null && session?.profile.gradYear !== undefined ? String(session.profile.gradYear) : "",
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const inputStyle = {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
  };

  const saveProfile = async () => {
    const name = displayName.trim();
    if (name.length === 0) {
      Alert.alert("Name required", "Your display name can't be empty.");
      return;
    }
    const parsedYear = gradYear.trim().length > 0 ? Number.parseInt(gradYear.trim(), 10) : null;
    if (parsedYear !== null && (Number.isNaN(parsedYear) || parsedYear < 1950 || parsedYear > 2100)) {
      Alert.alert("Check graduation year", "Enter a year between 1950 and 2100, or leave it blank.");
      return;
    }
    setSavingProfile(true);
    try {
      await repos.account.updateProfile({ displayName: name, gradYear: parsedYear });
      Alert.alert("Saved", "Your profile has been updated.");
    } catch {
      Alert.alert("Couldn't save", "Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const downloadData = async () => {
    setExporting(true);
    try {
      const data = await repos.account.exportMyData();
      await Share.share({ title: "My SWAP! data", message: JSON.stringify(data, null, 2) });
    } catch {
      Alert.alert("Couldn't export", "Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete your account?",
      "This requests deletion of your account. You'll be signed out. Your personal profile is scrubbed and your account is closed; records required for completed exchanges and safety reports are kept. You can contact support to cancel before it's finalized.",
      [
        { text: "Keep my account", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await repos.account.requestDeletion();
              await clear();
              router.replace("/");
            } catch {
              setDeleting(false);
              Alert.alert("Couldn't complete", "Please try again, or contact support.");
            }
          },
        },
      ],
    );
  };

  if (!session) return null;

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <AppText variant="title2">Account & privacy</AppText>
      </View>

      <AppText variant="caption" color="textMuted" style={{ marginTop: theme.spacing.lg }}>
        YOUR PROFILE
      </AppText>
      <Card elevation="none" style={{ marginTop: theme.spacing.sm, gap: theme.spacing.sm }}>
        <AppText variant="micro" color="textFaint">
          DISPLAY NAME
        </AppText>
        <TextInput
          style={inputStyle}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={theme.colors.textFaint}
          maxLength={120}
        />
        <AppText variant="micro" color="textFaint" style={{ marginTop: theme.spacing.xs }}>
          GRADUATION YEAR (OPTIONAL)
        </AppText>
        <TextInput
          style={inputStyle}
          value={gradYear}
          onChangeText={setGradYear}
          placeholder="e.g. 2027"
          placeholderTextColor={theme.colors.textFaint}
          keyboardType="number-pad"
          maxLength={4}
        />
        <Button label="Save profile" icon="save-outline" loading={savingProfile} onPress={saveProfile} style={{ marginTop: theme.spacing.sm }} />
      </Card>

      <Divider />

      <AppText variant="caption" color="textMuted">
        YOUR DATA
      </AppText>
      <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.sm }}>
        <Button label="Download my data" variant="secondary" icon="download-outline" loading={exporting} onPress={downloadData} />
        <AppText variant="micro" color="textFaint">
          Exports a copy of your own SWAP! data (profile, memberships, listings, wishes, offers, and reports you filed) as JSON.
        </AppText>
      </View>

      <Divider />

      <AppText variant="caption" color="textMuted">
        DELETE ACCOUNT
      </AppText>
      <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.sm }}>
        <AppText variant="micro" color="textFaint">
          Deleting closes your account and scrubs your personal profile. Records required for completed exchanges, safety reports, and moderation are kept. Deletion is reversible until it's finalized — contact support to cancel.
        </AppText>
        <Button label="Delete my account" variant="danger" icon="trash-outline" loading={deleting} onPress={confirmDelete} style={{ marginTop: theme.spacing.sm }} />
      </View>

      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

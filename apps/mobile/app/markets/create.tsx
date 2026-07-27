import { useMemo, useState } from "react";
import { View, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Screen, AppText, Chip, Button, IconButton, Divider, ModerationNotice } from "../../src/components";
import { useTheme } from "../../src/theme";
import { useRepositories } from "../../src/data/repositories";
import { useSession } from "../../src/session/SessionProvider";
import { DEFAULT_CATEGORIES } from "@swap/types";
import { categoryLabel } from "../../src/lib/labels";
import { assessMarket, submitMarket, type MarketFormInput } from "../../src/features/createMarket";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.md }}>
      <AppText variant="caption" color="textMuted">
        {label.toUpperCase()}
      </AppText>
      {children}
    </View>
  );
}

const DURATIONS: { label: string; days: number | null }[] = [
  { label: "No end", days: null },
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
];

export default function CreateMarketScreen() {
  const theme = useTheme();
  const router = useRouter();
  const repos = useRepositories();
  const { session } = useSession();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hostLabel, setHostLabel] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [handoff, setHandoff] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [durationDays, setDurationDays] = useState<number | null>(3);
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
  };

  const form: MarketFormInput = useMemo(() => {
    const startsAt = startNow ? new Date().toISOString() : null;
    const base = startNow ? Date.now() : Date.now();
    const endsAt = durationDays !== null ? new Date(base + durationDays * 86_400_000).toISOString() : null;
    return {
      schoolId: session?.school.id ?? "",
      title,
      description: description || null,
      hostLabel: hostLabel || null,
      coverImage: null,
      startsAt,
      endsAt,
      location: location || null,
      handoffInstructions: handoff || null,
      allowedCategories: categories,
      allowsRegulated: false,
      status: startNow ? "active" : "upcoming",
    };
  }, [session, title, description, hostLabel, categories, location, handoff, startNow, durationDays]);

  const assessment = useMemo(
    () => (session ? assessMarket(form, { institutionType: session.school.institutionType }) : null),
    [form, session],
  );

  const toggleCategory = (c: string) => setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const create = async () => {
    if (!session) return;
    setSubmitting(true);
    setError(null);
    try {
      const owner = {
        displayName: session.profile.displayName,
        avatarEmoji: session.profile.avatarEmoji,
        verified: session.profile.membershipStatus === "verified",
      };
      const result = await submitMarket(repos.markets, form, owner, { institutionType: session.school.institutionType });
      if (result.created && result.market) {
        router.replace(`/markets/${result.market.id}`);
      }
      // If not created, the ModerationNotice below explains why; the host can edit.
    } catch {
      setError("Couldn't create the market just now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return null;

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <IconButton icon="close" accessibilityLabel="Cancel" onPress={() => router.back()} />
        <AppText variant="title2">{preview ? "Preview market" : "New market"}</AppText>
      </View>

      {preview ? (
        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
          <AppText variant="title2">{title || "Untitled market"}</AppText>
          <AppText variant="caption" color="textFaint">
            {hostLabel || session.profile.displayName} · {startNow ? "Live now" : "Upcoming"} · {location || "Online"}
          </AppText>
          <AppText variant="body" color="textMuted">
            {description || "No description yet."}
          </AppText>
          {categories.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
              {categories.map((c) => (
                <Chip key={c} label={categoryLabel(c)} onPress={() => {}} />
              ))}
            </View>
          ) : null}
          {assessment ? <ModerationNotice result={assessment.moderation} /> : null}
          {error ? (
            <AppText variant="callout" color="danger" style={{ marginTop: theme.spacing.xs }}>
              {error}
            </AppText>
          ) : null}
          <View style={{ flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.md }}>
            <Button label="Keep editing" variant="ghost" onPress={() => setPreview(false)} />
            <Button label="Create market" icon="rocket-outline" loading={submitting} disabled={!assessment?.canCreate} onPress={create} />
          </View>
        </View>
      ) : (
        <>
          <Field label="Title">
            <TextInput style={inputStyle} value={title} onChangeText={setTitle} placeholder="e.g. Dorm Move-Out Sale" placeholderTextColor={theme.colors.textFaint} maxLength={120} />
          </Field>
          <Field label="Description">
            <TextInput
              style={[inputStyle, { minHeight: 88, textAlignVertical: "top" }]}
              value={description}
              onChangeText={setDescription}
              placeholder="What's the market about?"
              placeholderTextColor={theme.colors.textFaint}
              multiline
              maxLength={2000}
            />
          </Field>
          <Field label="Host label (optional)">
            <TextInput style={inputStyle} value={hostLabel} onChangeText={setHostLabel} placeholder="e.g. Art Club, West Hall RA" placeholderTextColor={theme.colors.textFaint} maxLength={120} />
          </Field>
          <Field label="Allowed categories (optional)">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {DEFAULT_CATEGORIES.map((c) => (
                <Chip key={c} label={categoryLabel(c)} selected={categories.includes(c)} onPress={() => toggleCategory(c)} />
              ))}
            </View>
          </Field>
          <Field label="Timing">
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <Chip label="Live now" selected={startNow} onPress={() => setStartNow(true)} />
              <Chip label="Upcoming" selected={!startNow} onPress={() => setStartNow(false)} />
            </View>
            <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
              {DURATIONS.map((d) => (
                <Chip key={d.label} label={d.label} selected={durationDays === d.days} onPress={() => setDurationDays(d.days)} />
              ))}
            </View>
          </Field>
          <Field label="Physical location (optional)">
            <TextInput style={inputStyle} value={location} onChangeText={setLocation} placeholder="e.g. West Quad lawn — leave blank for online" placeholderTextColor={theme.colors.textFaint} maxLength={120} />
            <AppText variant="micro" color="textFaint">
              No maps and no private addresses — a general campus spot only.
            </AppText>
          </Field>
          <Field label="Handoff instructions (optional)">
            <TextInput style={inputStyle} value={handoff} onChangeText={setHandoff} placeholder="e.g. Meet at the tables during posted hours" placeholderTextColor={theme.colors.textFaint} maxLength={500} />
          </Field>

          <Divider />
          <Button label="Preview" icon="eye-outline" disabled={title.trim().length < 2} onPress={() => setPreview(true)} />
          <AppText variant="micro" color="textFaint" center style={{ marginTop: theme.spacing.md }}>
            Creating a market runs the demo moderation checks first. Prohibited and disabled categories can't be enabled here.
          </AppText>
        </>
      )}
      <View style={{ height: theme.spacing.huge }} />
    </Screen>
  );
}

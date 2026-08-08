/**
 * Reusable "Report" sheet. Files a report against any target (listing / image /
 * user / message / conversation / stall→user). A short reason is required; an
 * optional note runs through the local moderation simulator before it is attached
 * (we never forward text the app itself would block). The report is written under
 * RLS by the ReportRepository — the reporter + school are server-resolved.
 */
import { useState } from "react";
import { View, TextInput, ScrollView } from "react-native";
import type { ReportReason, ReportTargetType } from "@swap/types";
import { REPORT_REASON } from "@swap/types";
import { useTheme } from "../theme";
import { useRepositories } from "../data/repositories";
import { simulateModeration } from "../moderation/simulator";
import { AppText } from "./Text";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { Divider } from "./misc";
import { Sheet } from "./Sheet";

const REASON_LABEL: Record<ReportReason, string> = {
  inappropriate_content: "Inappropriate content",
  harassment: "Harassment or bullying",
  spam: "Spam",
  fraud: "Scam or fraud",
  misleading: "Misleading",
  unsafe_behavior: "Unsafe behavior",
  prohibited_item: "Prohibited item",
  other: "Something else",
};

export function ReportSheet({
  visible,
  onClose,
  targetType,
  targetId,
  targetLabel,
}: {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
}) {
  const theme = useTheme();
  const repos = useRepositories();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    // Withhold a note the app would itself block; the report reason still goes through.
    let explanation: string | null = note.trim() || null;
    if (explanation) {
      const mod = simulateModeration({ title: "", description: explanation, category: "other" }, { institutionType: "high_school" });
      if (mod.outcome === "block") explanation = null;
    }
    try {
      await repos.reports.submitReport({ targetType, targetId, reason, explanation });
      setDone(true);
    } catch {
      setError("Couldn't send your report just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setReason(null);
    setNote("");
    setError(null);
    setDone(false);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close}>
      {done ? (
        <View style={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.md }}>
          <AppText variant="title3">Thanks for the report ✅</AppText>
          <AppText variant="body" color="textMuted">
            Your school's moderators will review it. If someone is in danger, contact local authorities.
          </AppText>
          <Button label="Done" onPress={close} />
        </View>
      ) : (
        <>
          <AppText variant="title3">Report{targetLabel ? ` "${targetLabel}"` : ""}</AppText>
          <AppText variant="caption" color="textMuted">
            WHY ARE YOU REPORTING THIS?
          </AppText>
          <ScrollView style={{ maxHeight: 210 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {REPORT_REASON.map((r) => (
                <Chip key={r} label={REASON_LABEL[r]} selected={reason === r} onPress={() => setReason(r)} />
              ))}
            </View>
          </ScrollView>
          <TextInput
            style={{
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: theme.radii.md,
              padding: theme.spacing.md,
              color: theme.colors.text,
              fontSize: theme.typography.body.fontSize,
              minHeight: 64,
              textAlignVertical: "top",
            }}
            value={note}
            onChangeText={setNote}
            placeholder="Add details (optional)"
            placeholderTextColor={theme.colors.textFaint}
            multiline
            maxLength={2000}
          />
          {error !== null ? (
            <AppText variant="callout" color="danger">
              {error}
            </AppText>
          ) : null}
          <Divider />
          <Button label="Submit report" icon="flag" variant="danger" loading={busy} disabled={reason === null} onPress={submit} />
        </>
      )}
    </Sheet>
  );
}

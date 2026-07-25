import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { useTheme } from "../theme";
import { AppText } from "./Text";
import { Button } from "./Button";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** A simple themed bottom sheet (modal). */
export function Sheet({ visible, onClose, children }: SheetProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(16,19,15,0.45)" }} onPress={onClose} accessibilityLabel="Close sheet" />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: theme.radii.xl,
          borderTopRightRadius: theme.radii.xl,
          padding: theme.spacing.xl,
          paddingBottom: theme.spacing.huge,
          gap: theme.spacing.md,
          ...theme.shadows.lg,
        }}
      >
        <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border }} />
        {children}
      </View>
    </Modal>
  );
}

/** A polished "coming soon" sheet used where a feature is intentionally a
 * placeholder (messaging, offers, sharing, reporting). Never fakes an action. */
export function ComingSoonSheet({
  visible,
  onClose,
  title,
  message,
  emoji = "✨",
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  emoji?: string;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText style={{ fontSize: 40, textAlign: "center" }}>{emoji}</AppText>
      <AppText variant="title2" center>
        {title}
      </AppText>
      <AppText variant="body" color="textMuted" center>
        {message}
      </AppText>
      <Button label="Got it" onPress={onClose} />
    </Sheet>
  );
}

import { View } from "react-native";
import { useTheme } from "../theme";
import { AppText } from "./Text";

export interface AvatarProps {
  emoji: string;
  size?: number;
}

/** Emoji avatar on a soft accent disc. No photos, no PII. */
export function Avatar({ emoji, size = 40 }: AvatarProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.accentSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText style={{ fontSize: size * 0.5 }}>{emoji}</AppText>
    </View>
  );
}

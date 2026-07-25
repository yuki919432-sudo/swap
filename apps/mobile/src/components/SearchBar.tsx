import { Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";

export interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

/** Search input well. */
export function SearchBar({ value, onChangeText, placeholder = "Search", onSubmit, autoFocus }: SearchBarProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.sm,
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: theme.radii.pill,
        paddingHorizontal: theme.spacing.lg,
        height: 46,
      }}
    >
      <Ionicons name="search" size={theme.iconSizes.md} color={theme.colors.textFaint} />
      <TextInput
        style={{ flex: 1, color: theme.colors.text, fontSize: theme.typography.body.fontSize }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textFaint}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        autoCorrect={false}
        accessibilityLabel="Search"
      />
      {value.length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText("")}>
          <Ionicons name="close-circle" size={theme.iconSizes.md} color={theme.colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

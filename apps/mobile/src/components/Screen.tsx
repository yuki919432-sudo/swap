import type { ReactNode } from "react";
import { ScrollView, View, type ViewStyle, RefreshControl } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "../theme";

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  contentStyle?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
}

/** Page shell: safe-area, themed background, optional scroll + pull-to-refresh. */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ["top"],
  contentStyle,
  refreshing,
  onRefresh,
}: ScreenProps) {
  const theme = useTheme();
  const pad: ViewStyle = padded ? { paddingHorizontal: theme.spacing.lg } : {};
  const body =
    scroll ? (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingBottom: theme.spacing.huge }, pad, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={theme.colors.accent} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    ) : (
      <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
    );

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {body}
    </SafeAreaView>
  );
}

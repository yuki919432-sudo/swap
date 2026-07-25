import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../src/theme";
import { useSession } from "../../src/session/SessionProvider";

export default function TabsLayout() {
  const theme = useTheme();
  const { session, loading } = useSession();

  // The tabs require a selected demo session; otherwise return to Welcome.
  if (loading) return null;
  if (!session) return <Redirect href="/" />;

  const icon =
    (name: keyof typeof Ionicons.glyphMap, focusedName: keyof typeof Ionicons.glyphMap) =>
    ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
      <Ionicons name={focused ? focusedName : name} size={size} color={color} />
    );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textFaint,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home-outline", "home") }} />
      <Tabs.Screen name="marketplace" options={{ title: "Market", tabBarIcon: icon("grid-outline", "grid") }} />
      <Tabs.Screen name="community" options={{ title: "Community", tabBarIcon: icon("people-outline", "people") }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox", tabBarIcon: icon("chatbubble-outline", "chatbubble") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person-outline", "person") }} />
    </Tabs>
  );
}

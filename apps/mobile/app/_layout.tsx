import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "../src/theme";
import { RepositoryProvider } from "../src/data/repositories";
import { SessionProvider } from "../src/session/SessionProvider";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <RepositoryProvider>
            <SessionProvider>
              <StatusBar style="auto" />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="demo-select" options={{ presentation: "card" }} />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="listing/[id]" options={{ presentation: "card" }} />
                <Stack.Screen name="create" options={{ presentation: "modal" }} />
                <Stack.Screen name="my-listings" />
                <Stack.Screen name="settings" />
              </Stack>
            </SessionProvider>
          </RepositoryProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

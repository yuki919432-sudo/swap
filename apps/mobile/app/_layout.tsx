import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "../src/theme";
import { AuthProvider } from "../src/data/supabase/AuthProvider";
import { RepositoryProvider } from "../src/data/repositories";
import { SessionProvider } from "../src/session/SessionProvider";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <RepositoryProvider>
              <SessionProvider>
                <StatusBar style="auto" />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="sign-in" options={{ presentation: "card" }} />
                  <Stack.Screen name="demo-select" options={{ presentation: "card" }} />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="listing/[id]" options={{ presentation: "card" }} />
                  <Stack.Screen name="create" options={{ presentation: "modal" }} />
                  <Stack.Screen name="my-listings" />
                  <Stack.Screen name="wishlist" />
                  <Stack.Screen name="settings" />
                </Stack>
              </SessionProvider>
            </RepositoryProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

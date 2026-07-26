import { useState } from "react";
import { View, TextInput } from "react-native";
import { useRouter, Redirect } from "expo-router";
import { Screen, AppText, Button, IconButton } from "../src/components";
import { useTheme } from "../src/theme";
import { useAuth } from "../src/data/supabase/AuthProvider";

/**
 * Development / pilot sign-in against the REAL Supabase backend (email + password).
 * This is genuine Supabase authentication (a real JWT + RLS), not a production
 * verification UX — the OTP / OAuth student-verification flows are a later auth
 * milestone. Only shown when a backend is configured.
 */
export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { configured, signInWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!configured) return <Redirect href="/" />;

  const inputStyle = {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await signInWithPassword(email, password);
    setBusy(false);
    if (err) {
      setError("That didn't work. Check your email and password and try again.");
      return;
    }
    router.replace("/(tabs)");
  };

  return (
    <Screen scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <AppText variant="title2">Sign in</AppText>
      </View>

      <AppText variant="body" color="textMuted" style={{ marginTop: theme.spacing.md }}>
        Sign in to your school account to use the real marketplace.
      </AppText>

      <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
        <TextInput
          style={inputStyle}
          value={email}
          onChangeText={setEmail}
          placeholder="School email"
          placeholderTextColor={theme.colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          accessibilityLabel="Email"
        />
        <TextInput
          style={inputStyle}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={theme.colors.textFaint}
          secureTextEntry
          accessibilityLabel="Password"
        />
        {error ? (
          <AppText variant="callout" color="danger">
            {error}
          </AppText>
        ) : null}
        <Button label="Sign in" icon="log-in-outline" loading={busy} disabled={!email || !password} onPress={submit} />
      </View>

      <AppText variant="micro" color="textFaint" center style={{ marginTop: theme.spacing.xxl }}>
        Development / pilot sign-in. Student verification (invitation code, admin approval, email OTP)
        is the next auth milestone.
      </AppText>
    </Screen>
  );
}

/**
 * Pilot onboarding funnel UI. Rendered by PilotGate whenever a pilot build's user
 * has not yet reached a verified membership in an active school. Each screen owns
 * its own form state; on success it calls `onAdvance` so the gate re-resolves the
 * step. Sign-out is available from every post-auth screen.
 */
import { useState } from "react";
import { View, TextInput, ActivityIndicator } from "react-native";
import { Screen, AppText, Button, Divider } from "../components";
import { useTheme } from "../theme";
import { useAuth } from "../data/supabase/AuthProvider";
import { useRepositories } from "../data/repositories";
import { asyncStorageKeyValueStore } from "../data/asyncStorage";
import { confirm13Plus } from "../config/ageGate";
import { PILOT_SCHOOL_ID } from "../config/env";
import type { Membership } from "../data/repositories/types";
import type { OnboardingStep } from "../features/onboarding";

export function OnboardingSplash() {
  const theme = useTheme();
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md }}>
        <AppText style={{ fontSize: 40 }}>♻️</AppText>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    </Screen>
  );
}

export function OnboardingFlow({
  step,
  membership,
  onAdvance,
}: {
  step: OnboardingStep;
  membership: Membership | null;
  onAdvance: () => Promise<void>;
}) {
  if (step === "age_gate") return <AgeGateScreen onConfirmed={onAdvance} />;
  if (step === "auth") return <AuthScreen onAuthed={onAdvance} />;
  if (step === "enroll") return <EnrollScreen onEnrolled={onAdvance} />;
  return <MembershipStatusScreen step={step} membership={membership} onRetry={onAdvance} />;
}

const useInputStyle = () => {
  const theme = useTheme();
  return {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
  };
};

function Header({ emoji, title, subtitle }: { emoji: string; title: string; subtitle: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.huge }}>
      <AppText style={{ fontSize: 44 }}>{emoji}</AppText>
      <AppText variant="title1">{title}</AppText>
      <AppText variant="body" color="textMuted">
        {subtitle}
      </AppText>
    </View>
  );
}

function SignOutLink({ label = "Sign out" }: { label?: string }) {
  const { signOut } = useAuth();
  return <Button label={label} variant="ghost" icon="log-out-outline" onPress={() => signOut()} />;
}

/* --------------------------------------------------------------- age gate */

function AgeGateScreen({ onConfirmed }: { onConfirmed: () => Promise<void> }) {
  const theme = useTheme();
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  if (blocked) {
    return (
      <Screen padded>
        <Header emoji="🚫" title="You need to be 13 or older" subtitle="SWAP! is only available to students aged 13 and up. Thanks for your interest!" />
      </Screen>
    );
  }
  return (
    <Screen padded>
      <Header emoji="🎂" title="Quick age check" subtitle="SWAP! is for students aged 13 and older. We don't ask for your date of birth — just confirm below." />
      <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
        <Button
          label="I'm 13 or older"
          icon="checkmark-circle"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await confirm13Plus(asyncStorageKeyValueStore, true);
            await onConfirmed();
          }}
        />
        <Button label="I'm under 13" variant="secondary" onPress={() => setBlocked(true)} />
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------- auth */

function AuthScreen({ onAuthed }: { onAuthed: () => Promise<void> }) {
  const theme = useTheme();
  const inputStyle = useInputStyle();
  const { signInWithPassword, signUpWithPassword, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const fn = mode === "sign_in" ? signInWithPassword : signUpWithPassword;
    const { error: err } = await fn(email, password);
    setBusy(false);
    if (err) {
      setError(mode === "sign_in" ? "Couldn't sign in. Check your email and password." : "Couldn't create your account. Try a different email or a stronger password.");
      return;
    }
    if (mode === "sign_up") setNotice("Account created. If asked, confirm your email, then continue.");
    await onAuthed();
  };

  return (
    <Screen padded scroll>
      <Header emoji="🔐" title={mode === "sign_in" ? "Sign in" : "Create your account"} subtitle="Use your school email. Your account is private to your school." />
      <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
        <TextInput style={inputStyle} value={email} onChangeText={setEmail} placeholder="School email" placeholderTextColor={theme.colors.textFaint} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
        <TextInput style={inputStyle} value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={theme.colors.textFaint} secureTextEntry />
        {error !== null ? (
          <AppText variant="callout" color="danger">
            {error}
          </AppText>
        ) : null}
        {notice !== null ? (
          <AppText variant="callout" color="accent">
            {notice}
          </AppText>
        ) : null}
        <Button label={mode === "sign_in" ? "Sign in" : "Create account"} icon="arrow-forward" loading={busy} disabled={email.trim().length < 3 || password.length < 6} onPress={submit} />
        <Divider />
        <Button
          label={mode === "sign_in" ? "New here? Create an account" : "Already have an account? Sign in"}
          variant="ghost"
          onPress={() => {
            setMode(mode === "sign_in" ? "sign_up" : "sign_in");
            setError(null);
            setNotice(null);
          }}
        />
        {mode === "sign_in" ? (
          <Button
            label="Forgot password?"
            variant="ghost"
            onPress={async () => {
              if (email.trim().length < 3) {
                setError("Enter your email first, then tap Forgot password.");
                return;
              }
              const { error: err } = await sendPasswordReset(email);
              setNotice(err ? null : "If that email exists, a reset link is on its way.");
              if (err) setError("Couldn't start a password reset just now.");
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

/* --------------------------------------------------------------- enrollment */

function EnrollScreen({ onEnrolled }: { onEnrolled: () => Promise<void> }) {
  const theme = useTheme();
  const inputStyle = useInputStyle();
  const repos = useRepositories();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const redeem = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await repos.membership.redeemInvitation(code);
      await onEnrolled();
    } catch {
      setError("That invitation code didn't work. Check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  const requestManual = async () => {
    if (PILOT_SCHOOL_ID.length === 0) {
      setNotice("No code? Ask your school's SWAP! coordinator for an invitation, or contact support from the sign-in screen.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await repos.membership.requestManual({ schoolId: PILOT_SCHOOL_ID });
      await onEnrolled();
    } catch {
      setError("Couldn't submit your request just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padded scroll>
      <Header emoji="🎟️" title="Join your school" subtitle="Enter the invitation code your school shared with you. SWAP! is invitation-only." />
      <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
        <TextInput style={inputStyle} value={code} onChangeText={setCode} placeholder="Invitation code" placeholderTextColor={theme.colors.textFaint} autoCapitalize="characters" autoCorrect={false} />
        {error !== null ? (
          <AppText variant="callout" color="danger">
            {error}
          </AppText>
        ) : null}
        {notice !== null ? (
          <AppText variant="callout" color="textMuted">
            {notice}
          </AppText>
        ) : null}
        <Button label="Join" icon="school" loading={busy} disabled={code.trim().length < 3} onPress={redeem} />
        <Divider />
        <Button label="I don't have a code" variant="ghost" onPress={requestManual} />
        <SignOutLink />
      </View>
    </Screen>
  );
}

/* -------------------------------------------------- membership status screens */

const STATUS_COPY: Record<string, { emoji: string; title: string; subtitle: string }> = {
  pending: { emoji: "⏳", title: "Almost there", subtitle: "Your membership is waiting for your school to approve it. We'll let you in as soon as it's verified." },
  rejected: { emoji: "🚫", title: "Membership not approved", subtitle: "Your school didn't approve this membership. If you think this is a mistake, contact your school's SWAP! coordinator." },
  suspended: { emoji: "⛔", title: "Account suspended", subtitle: "Your membership is currently suspended. Reach out to your school's SWAP! coordinator for help." },
  school_inactive: { emoji: "🏫", title: "School not active", subtitle: "Your school isn't active on SWAP! right now. Please check back later." },
};

function MembershipStatusScreen({ step, membership, onRetry }: { step: OnboardingStep; membership: Membership | null; onRetry: () => Promise<void> }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const copy = STATUS_COPY[step] ?? STATUS_COPY.pending!;
  return (
    <Screen padded scroll>
      <Header emoji={copy.emoji} title={copy.title} subtitle={copy.subtitle} />
      {membership ? (
        <AppText variant="caption" color="textFaint" style={{ marginTop: theme.spacing.md }}>
          {membership.schoolName}
        </AppText>
      ) : null}
      <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
        <Button
          label="Check again"
          icon="refresh"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await onRetry();
            setBusy(false);
          }}
        />
        <SignOutLink />
      </View>
    </Screen>
  );
}

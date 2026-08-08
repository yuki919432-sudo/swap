/**
 * Gates a PILOT build behind the onboarding funnel. Demo builds are unaffected.
 *
 * In pilot mode the app tree renders only when the user is 13+, signed in, and a
 * verified member of an active school. Otherwise the matching onboarding screen is
 * shown. This is the single enforcement point for "you must be a verified member to
 * use the app" on the client; the DB's RLS is the real authority behind it.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isPilotMode } from "../config/appMode";
import { hasConfirmed13Plus } from "../config/ageGate";
import { asyncStorageKeyValueStore } from "../data/asyncStorage";
import { useAuth } from "../data/supabase/AuthProvider";
import { useRepositories } from "../data/repositories";
import { useSession } from "../session/SessionProvider";
import type { Membership } from "../data/repositories/types";
import { resolveOnboardingStep } from "../features/onboarding";
import { OnboardingFlow, OnboardingSplash } from "./OnboardingFlow";

export function PilotGate({ children }: { children: ReactNode }) {
  if (!isPilotMode()) return <>{children}</>;
  return <PilotGateInner>{children}</PilotGateInner>;
}

function PilotGateInner({ children }: { children: ReactNode }) {
  const { session: authSession, ready } = useAuth();
  const repos = useRepositories();
  const { refresh: refreshSession } = useSession();
  const [ageOk, setAgeOk] = useState<boolean | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [resolving, setResolving] = useState(true);

  const resolve = useCallback(async () => {
    setResolving(true);
    setAgeOk(await hasConfirmed13Plus(asyncStorageKeyValueStore));
    let m: Membership | null = null;
    if (authSession) {
      try {
        m = await repos.membership.myMembership();
      } catch {
        m = null;
      }
      // Keep the app's session (school + profile) in sync with the real backend.
      await refreshSession();
    }
    setMembership(m);
    setResolving(false);
  }, [authSession, repos, refreshSession]);

  useEffect(() => {
    if (ready) resolve();
  }, [ready, resolve]);

  if (!ready || resolving || ageOk === null) return <OnboardingSplash />;

  const step = resolveOnboardingStep({ ageConfirmed13Plus: ageOk, authed: !!authSession, membership });
  if (step === "ready") return <>{children}</>;

  return <OnboardingFlow step={step} membership={membership} onAdvance={resolve} />;
}

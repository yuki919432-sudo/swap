/**
 * OAuth provider adapters (Verification Methods A & B).
 *
 * Phase 1B ships the ADAPTER SHAPE and safe stubs only — no real Google/Microsoft
 * credentials are configured. A real adapter must read the verified email from
 * the provider identity (never from client-supplied input) and confirm it is
 * verified before the caller compares it to the school's approved domains.
 */
import { forbidden } from "./errors.js";

export type OAuthProviderName = "google" | "microsoft";

export interface OAuthProfile {
  email: string;
  emailVerified: boolean;
  provider: OAuthProviderName;
}

export interface OAuthProvider {
  readonly name: OAuthProviderName;
  /** Exchange/verify a provider token and return the verified profile. */
  verifyIdentity(token: string): Promise<OAuthProfile>;
}

/** Placeholder used until real credentials + configuration are provided. */
export class NotConfiguredOAuthProvider implements OAuthProvider {
  constructor(readonly name: OAuthProviderName) {}
  async verifyIdentity(): Promise<OAuthProfile> {
    throw forbidden(`${this.name}_oauth_not_configured`);
  }
}

export const googleProvider: OAuthProvider = new NotConfiguredOAuthProvider("google");
export const microsoftProvider: OAuthProvider = new NotConfiguredOAuthProvider("microsoft");

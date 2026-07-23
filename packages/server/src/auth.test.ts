import { describe, it, expect } from "vitest";
import { getAuthContext, requireAuth, requireAal2, type AuthCapableClient } from "./auth.js";

function client(user: { id: string; email?: string | null } | null, level: string | null): AuthCapableClient {
  return {
    auth: {
      async getUser() {
        return { data: { user }, error: user ? null : new Error("no session") };
      },
      mfa: {
        async getAuthenticatorAssuranceLevel() {
          return { data: { currentLevel: level }, error: null };
        },
      },
    },
  };
}

describe("auth context", () => {
  it("returns the user id, email, and AAL", async () => {
    const ctx = await getAuthContext(client({ id: "u1", email: "a@example.test" }, "aal2"));
    expect(ctx).toEqual({ userId: "u1", email: "a@example.test", aal: "aal2" });
  });

  it("defaults AAL to aal1 when unavailable", async () => {
    const ctx = await getAuthContext(client({ id: "u1" }, null));
    expect(ctx?.aal).toBe("aal1");
  });

  it("returns null with no session", async () => {
    expect(await getAuthContext(client(null, null))).toBeNull();
  });

  it("requireAuth throws when unauthenticated", () => {
    expect(() => requireAuth(null)).toThrowError();
  });

  it("requireAal2 enforces MFA", () => {
    expect(() => requireAal2({ userId: "u1", email: null, aal: "aal1" })).toThrowError();
    expect(requireAal2({ userId: "u1", email: null, aal: "aal2" }).aal).toBe("aal2");
  });
});

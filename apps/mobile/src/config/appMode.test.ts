import { describe, it, expect } from "vitest";
import { resolveAppMode, resolveDataSource } from "./appMode";
import { looksLikeServiceRoleKey } from "./env";

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: object) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;

describe("resolveAppMode", () => {
  it("defaults to demo unless the flag is exactly 'pilot'", () => {
    expect(resolveAppMode(undefined)).toBe("demo");
    expect(resolveAppMode("")).toBe("demo");
    expect(resolveAppMode("Pilot")).toBe("demo");
    expect(resolveAppMode("production")).toBe("demo");
    expect(resolveAppMode("pilot")).toBe("pilot");
  });
});

describe("resolveDataSource — a pilot build NEVER falls back to mock", () => {
  it("pilot + configured → supabase (even before sign-in)", () => {
    expect(resolveDataSource({ appMode: "pilot", backendConfigured: true, hasSession: false })).toBe("supabase");
    expect(resolveDataSource({ appMode: "pilot", backendConfigured: true, hasSession: true })).toBe("supabase");
  });
  it("pilot + unconfigured → 'unconfigured-pilot', never 'mock'", () => {
    const r = resolveDataSource({ appMode: "pilot", backendConfigured: false, hasSession: false });
    expect(r).toBe("unconfigured-pilot");
    expect(r).not.toBe("mock");
  });
  it("demo → mock unless the backend is configured AND the user is signed in", () => {
    expect(resolveDataSource({ appMode: "demo", backendConfigured: false, hasSession: false })).toBe("mock");
    expect(resolveDataSource({ appMode: "demo", backendConfigured: true, hasSession: false })).toBe("mock");
    expect(resolveDataSource({ appMode: "demo", backendConfigured: true, hasSession: true })).toBe("supabase");
  });
});

describe("looksLikeServiceRoleKey — keep the service-role key out of the client", () => {
  it("flags a service_role JWT", () => {
    expect(looksLikeServiceRoleKey(jwt({ role: "service_role", iss: "supabase" }))).toBe(true);
  });
  it("accepts an anon JWT and ignores non-JWT strings", () => {
    expect(looksLikeServiceRoleKey(jwt({ role: "anon", iss: "supabase" }))).toBe(false);
    expect(looksLikeServiceRoleKey("")).toBe(false);
    expect(looksLikeServiceRoleKey("not-a-jwt")).toBe(false);
    expect(looksLikeServiceRoleKey("a.b")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { evaluateMobileEnv } from "./preflight";

// A syntactically valid anon-role JWT (header.payload.signature) for the guard.
function jwt(role: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role })}.sig`;
}

describe("evaluateMobileEnv", () => {
  it("demo mode is shippable with nothing configured", () => {
    const r = evaluateMobileEnv({ appMode: "demo" });
    expect(r.mode).toBe("demo");
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
  });

  it("a fully configured pilot build passes with no problems", () => {
    const r = evaluateMobileEnv({
      appMode: "pilot",
      supabaseUrl: "https://abc.supabase.co",
      supabaseAnonKey: jwt("anon"),
      supportUrl: "mailto:help@school.test",
      pilotSchoolId: "00000000-0000-0000-0000-000000000001",
    });
    expect(r.mode).toBe("pilot");
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("a pilot build with nothing configured reports every hard problem", () => {
    const r = evaluateMobileEnv({ appMode: "pilot" });
    expect(r.ok).toBe(false);
    // url + anon key + support url all required.
    expect(r.problems.length).toBe(3);
  });

  it("rejects a service-role key in a pilot build", () => {
    const r = evaluateMobileEnv({
      appMode: "pilot",
      supabaseUrl: "https://abc.supabase.co",
      supabaseAnonKey: jwt("service_role"),
      supportUrl: "https://school.test/support",
    });
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("service-role"))).toBe(true);
  });

  it("rejects a non-https Supabase URL and a bad support URL", () => {
    const r = evaluateMobileEnv({
      appMode: "pilot",
      supabaseUrl: "http://insecure.example",
      supabaseAnonKey: jwt("anon"),
      supportUrl: "tel:12345",
    });
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("https://"))).toBe(true);
    expect(r.problems.some((p) => p.includes("EXPO_PUBLIC_SUPPORT_URL"))).toBe(true);
  });

  it("warns (but does not block) when the pilot school id is missing", () => {
    const r = evaluateMobileEnv({
      appMode: "pilot",
      supabaseUrl: "https://abc.supabase.co",
      supabaseAnonKey: jwt("anon"),
      supportUrl: "https://school.test/support",
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes("PILOT_SCHOOL_ID"))).toBe(true);
  });

  it("rejects a service-role key even in demo mode", () => {
    const r = evaluateMobileEnv({ appMode: "demo", supabaseAnonKey: jwt("service_role") });
    expect(r.ok).toBe(false);
  });
});

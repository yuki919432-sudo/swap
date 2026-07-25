import { describe, it, expect } from "vitest";
import { resolveDemoMode } from "./demo";

describe("resolveDemoMode (demo-mode gating)", () => {
  it("is enabled only when the flag is 'true' AND the runtime is dev", () => {
    expect(resolveDemoMode("true", true)).toBe(true);
  });

  it("is disabled when the flag is not 'true'", () => {
    expect(resolveDemoMode("false", true)).toBe(false);
    expect(resolveDemoMode("1", true)).toBe(false);
    expect(resolveDemoMode("TRUE", true)).toBe(false);
    expect(resolveDemoMode(undefined, true)).toBe(false);
    expect(resolveDemoMode("", true)).toBe(false);
  });

  it("is disabled in a production (non-dev) runtime even if the flag is 'true'", () => {
    expect(resolveDemoMode("true", false)).toBe(false);
  });
});

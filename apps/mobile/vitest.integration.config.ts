import { defineConfig } from "vitest/config";

// Integration tests run against a REAL, disposable Supabase stack (`supabase
// start`), exercising the actual Supabase-backed repository classes over the real
// PostgREST + Auth + Storage services under RLS. They are gated on SUPABASE_URL
// and skip cleanly when it is absent, so they never run in the plain unit suite.
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

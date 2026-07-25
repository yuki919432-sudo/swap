import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

// Unit tests cover the framework-agnostic logic (repositories, demo-mode gating,
// moderation simulator, marketplace query, create-listing flow) in Node — no
// React Native runtime required. Screen components are intentionally thin over
// this tested logic. Integration tests (*.integration.test.ts) run separately
// against a booted Supabase stack (see vitest.integration.config.ts).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
    environment: "node",
  },
});

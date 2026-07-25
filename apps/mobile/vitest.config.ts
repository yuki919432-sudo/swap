import { defineConfig } from "vitest/config";

// Unit tests cover the framework-agnostic logic (repositories, demo-mode gating,
// moderation simulator, marketplace query, create-listing flow) in Node — no
// React Native runtime required. Screen components are intentionally thin over
// this tested logic.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

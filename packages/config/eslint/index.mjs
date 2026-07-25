// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Shared flat ESLint config for the SWAP! monorepo.
 * Consumers extend this in their own eslint.config.mjs.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/*.generated.ts",
      // Operational glue (node/bash scripts, SQL test harness) is exercised by
      // the DB test suites and CI directly, not by the TS linter.
      "scripts/**",
      "supabase/**",
      // Expo/Metro/Babel config are CommonJS boilerplate run by the bundler,
      // and .expo is generated. They are not app logic for the TS linter.
      "**/babel.config.js",
      "**/metro.config.js",
      "**/.expo/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Security- and correctness-oriented defaults.
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);

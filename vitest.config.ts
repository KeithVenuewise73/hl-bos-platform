import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Workspace projects are discovered from the pnpm workspace. Each package
    // owns its own tests; this root config sets shared policy.
    projects: ["packages/*", "apps/*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Coverage thresholds are deliberately NOT set to a vanity number here.
      // They are set per-package as each package lands, so that a high
      // aggregate cannot hide an untested security-critical module.
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.config.*",
        "**/*.test.ts",
        "supabase/**",
      ],
    },
  },
});

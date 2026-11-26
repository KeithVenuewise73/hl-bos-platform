import { defineConfig } from "vitest/config";

// Its own config: without one, vitest walks up and finds the root config, whose
// project globs ("packages/*", "apps/*") do not resolve from inside this app.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // update.test.ts builds several real git repositories and runs the updater against each. On a
    // loaded Windows runner that took over vitest's 5-second default (twice in one day, in
    // different tests of that file), so a slow machine failed a correct test.
    testTimeout: 30_000,
  },
});

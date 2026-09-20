import { defineConfig } from "vitest/config";

// Its own config: without one, vitest walks up and finds the root config, whose
// project globs ("packages/*", "apps/*") do not resolve from inside this app.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

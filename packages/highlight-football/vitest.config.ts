import { defineConfig } from "vitest/config";

// Its own config: without one, vitest walks up to the root config, whose
// project globs do not resolve from inside this package.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

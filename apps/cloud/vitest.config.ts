import { defineConfig } from "vitest/config";

// Its own config so vitest does not walk up to the root project globs.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

import { defineConfig } from "vitest/config";

// Its own config: without one, vitest walks up to the root config, whose
// project globs do not resolve from inside this package.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Real picture work (sharp) runs in these tests, three copies per photo for review;
    // the 5 s default is too tight on a busy build machine.
    testTimeout: 30_000,
  },
});

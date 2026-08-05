import { defineConfig } from "vitest/config";

// Own config so `pnpm test` resolves from inside this package (the root config's
// project globs do not resolve from here), and so the package is a discoverable
// vitest project from the root.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

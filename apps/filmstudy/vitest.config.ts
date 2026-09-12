import { defineConfig } from "vitest/config";

// Own config so `pnpm test` resolves from inside this app and the app is a
// discoverable vitest project from the root. Only the pure modules under
// src/lib are tested here; rendering is covered by the build.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

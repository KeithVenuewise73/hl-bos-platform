import { defineConfig } from "vitest/config";

// Own config so `pnpm test` resolves from inside this app and the app is a
// discoverable vitest project from the root. Tests are pure Node unit tests over
// the content model and the navigation state logic — no DOM environment is
// required, matching the other apps in this workspace.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

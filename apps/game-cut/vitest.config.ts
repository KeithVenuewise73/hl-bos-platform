import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Its own config: without one, vitest walks up to the root config, whose
// project globs do not resolve from inside this app.
export default defineConfig({
  resolve: {
    // The app's "@/" imports, so API routes can be tested as they are.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));

// Its own config: without one, vitest walks up and finds the root config, whose
// project globs ("packages/*", "apps/*") do not resolve from inside this app.
export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws on import outside a Next build, so a server module
      // could not otherwise be unit tested. See src/test/server-only.ts.
      "server-only": `${src}/test/server-only.ts`,
      "@": src,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

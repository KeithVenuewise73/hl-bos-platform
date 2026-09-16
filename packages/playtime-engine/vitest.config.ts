import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "playtime-engine",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

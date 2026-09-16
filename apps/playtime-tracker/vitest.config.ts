import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "playtime-tracker",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

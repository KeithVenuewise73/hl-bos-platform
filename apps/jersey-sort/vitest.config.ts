import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // These tests GENERATE their photos with sharp, drawing jersey numbers as
    // SVG text. On Windows the first text drawn makes the font library scan
    // C:\Windows\Fonts, which takes several seconds once: the first upload
    // test timed out at the 5 s default on a Windows runner while doing
    // nothing wrong. JerseySort's own upload path draws no text.
    testTimeout: 30_000,
  },
});

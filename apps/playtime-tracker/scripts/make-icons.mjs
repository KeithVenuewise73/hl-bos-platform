#!/usr/bin/env node
/**
 * Generate the WEB app icons (the PWA manifest and the browser tab).
 *
 * Committed as a script rather than as binaries dropped in by hand, so the
 * icons can be regenerated, reviewed as code, and changed without anybody
 * needing a design tool.
 *
 *   node scripts/make-icons.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { draw } from "./icon.mjs";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

mkdirSync(OUT, { recursive: true });
const written = [];
for (const size of [180, 192, 512]) {
  writeFileSync(path.join(OUT, `icon-${size}.png`), draw(size));
  written.push(`icon-${size}.png`);
}
for (const size of [192, 512]) {
  writeFileSync(
    path.join(OUT, `icon-maskable-${size}.png`),
    draw(size, { maskable: true }),
  );
  written.push(`icon-maskable-${size}.png`);
}
// The 1024 icon App Store Connect wants is a LISTING asset, not something the
// app loads, so it goes to store/ rather than into every user's download.
const store = path.resolve(OUT, "../store");
mkdirSync(store, { recursive: true });
writeFileSync(path.join(store, "icon-1024.png"), draw(1024, { maskable: true }));
written.push("../store/icon-1024.png");
console.log(`wrote ${written.length} web icons: ${written.join(", ")}`);

#!/usr/bin/env node
/**
 * Bake a precache manifest into the exported service worker.
 *
 * Runtime caching alone made the offline promise conditional: a route the
 * coach had never opened while online would not open at the field. Since this
 * app's entire premise is that it works where there is no signal, "offline,
 * but only the pages you happened to visit" is not good enough.
 *
 * So every file the export produced is listed here and fetched at install
 * time. The list is generated from the real build output, never hand-written,
 * so it cannot drift from what actually shipped.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(APP, "out");

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else found.push(full);
  }
  return found;
}

const files = walk(OUT)
  .map((f) => "/" + path.relative(OUT, f).split(path.sep).join("/"))
  .filter((url) => url !== "/sw.js")
  // Build-time route payloads and the 1024px store icon are never requested by
  // the running app; shipping them to every device's cache is dead weight.
  .filter((url) => !url.startsWith("/__next."))
  .filter((url) => url !== "/icon-store-1024.png")
  // A directory index is requested as its directory, not as index.html.
  .map((url) =>
    url.endsWith("/index.html") ? url.slice(0, -"index.html".length) : url,
  )
  .sort();

const MARKER = '["/"]; // __PRECACHE__';

const source = readFileSync(path.join(APP, "public", "sw.js"), "utf8");
if (!source.includes(MARKER)) {
  console.error(
    `public/sw.js no longer contains the precache marker (${MARKER}).\n` +
      "Without it the shipped worker would cache only the shell, and a route " +
      "the coach had never opened would not open at the field.",
  );
  process.exit(1);
}

writeFileSync(
  path.join(OUT, "sw.js"),
  source.replace(MARKER, `${JSON.stringify(files, null, 2)};`),
);
console.log(`sw.js: precaching ${files.length} files`);

/*
 * A health file, so the Development Control Center can ask this app whether it
 * is actually serving rather than assume it from a process id. A static export
 * has no route handlers, so the answer is a file -- and it carries the real
 * version from store/release.json rather than a hardcoded "ok".
 */
const release = JSON.parse(readFileSync(path.join(APP, "store/release.json"), "utf8"));
writeFileSync(
  path.join(OUT, "health.json"),
  `${JSON.stringify(
    {
      app: "playtime-tracker",
      status: "ok",
      version: release.version,
      build: release.build,
      builtAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);
console.log(`health.json: ${release.version} (${release.build})`);

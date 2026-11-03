import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The instrumentation hook must stay free of Node-only APIs.
 *
 * Next analyses that file for every runtime the hook can run in, the edge
 * runtime included. A Node API named there fails the analysis even when a
 * runtime guard means it is never reached, because the guard decides at run
 * time and the complaint is about what the bundle contains. The result was a
 * build that printed
 *
 *     A Node.js API is used (process.platform at line: 14) ...
 *     Ecmascript file had an error
 *
 * on every run while still exiting zero -- noise on a green build, which is
 * the kind of thing that teaches people to stop reading build output.
 *
 * Read off the file rather than by importing it: the point is what the text
 * contains, which is exactly what the bundler sees.
 */
const SOURCE = readFileSync(
  join(import.meta.dirname, "..", "instrumentation.ts"),
  "utf-8",
);

/**
 * The same file with its comments removed.
 *
 * Needed because the file explains this very rule, and naming
 * `process.platform` in the sentence that forbids it would otherwise fail
 * the check. The bundler reads code, not prose, so the check should too --
 * and the alternative, wording the comment around the word, would make the
 * explanation worse to protect a test from itself.
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** `process.env` is available in the edge runtime. These are not. */
const NODE_ONLY = [
  "process.platform",
  "process.cwd",
  "process.versions",
  "process.arch",
  "process.pid",
];

describe("instrumentation.ts", () => {
  it("names no Node-only process API", () => {
    for (const api of NODE_ONLY) {
      expect(CODE).not.toContain(api);
    }
  });

  it("strips comments before checking, and not the code with them", () => {
    // Guards the guard: a stripper that removed everything would make the
    // test above pass on any file at all.
    expect(CODE).toContain("process.env");
    expect(CODE).toContain("register");
  });

  it("imports nothing from node: at the top level", () => {
    // A static `import ... from "node:..."` would put it in the edge bundle
    // for the same reason. Dynamic imports inside register() are fine, and
    // are how the machine-touching half is reached.
    expect(CODE).not.toMatch(/^\s*import\s[^;]*["']node:/m);
  });

  it("still reaches the icon step, so this cannot pass by doing nothing", () => {
    // Without this, deleting the body of register() would satisfy every
    // assertion above.
    expect(CODE).toContain("desktop-icons");
    expect(CODE).toMatch(/await import\(/);
  });
});

/**
 * DateSort Step 1 writes nothing, anywhere. The app's own code must not
 * touch the filesystem at all: all disk access is the engine's read-only
 * module. (Steps 2-3 will add copying, in one module with its own guards.)
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("the DateSort app", () => {
  const files = sources(join(import.meta.dirname, ".."));

  it("never imports the filesystem", () => {
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      expect(
        /from\s+["'](node:)?fs(\/promises)?["']/.test(readFileSync(f, "utf8")),
        f,
      ).toBe(false);
    }
  });

  it("runs no program but PowerShell's folder window", () => {
    const spawners = files.filter((f) => /child_process/.test(readFileSync(f, "utf8")));
    expect(spawners.map((f) => f.replace(/\\/g, "/").split("/src/")[1])).toEqual([
      "lib/browse.ts",
    ]);
    const browse = readFileSync(spawners[0]!, "utf8");
    expect([...browse.matchAll(/execFile\(\s*"([^"]+)"/g)].map((m) => m[1])).toEqual([
      "powershell.exe",
    ]);
  });

  it("makes no request to the internet", () => {
    for (const f of files) {
      expect(
        /https?:\/\/(?!localhost|127\.0\.0\.1)/.test(readFileSync(f, "utf8")),
        f,
      ).toBe(false);
    }
  });
});

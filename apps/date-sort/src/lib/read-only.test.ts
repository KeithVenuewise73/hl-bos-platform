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

  it("runs only PowerShell (folder window, keeping Windows awake, reading an iPhone) and JerseySort's starter", () => {
    const spawners = files.filter((f) => /child_process/.test(readFileSync(f, "utf8")));
    expect(spawners.map((f) => f.replace(/\\/g, "/").split("/src/")[1]).sort()).toEqual(
      ["lib/browse.ts", "lib/iphone.ts", "lib/jersey-sort.ts", "lib/keep-awake.ts"],
    );
    // Starting JerseySort runs node, with only its starter script.
    const js = readFileSync(
      spawners.find((f) => f.endsWith("jersey-sort.ts"))!,
      "utf8",
    );
    expect([...js.matchAll(/spawn\(\s*([^,]+),/g)].map((m) => m[1]!.trim())).toEqual([
      "process.execPath",
    ]);
    expect(js).toMatch(/"scripts",\s*"jersey-sort\.mjs"/);
    for (const f of spawners.filter((f) => !f.endsWith("jersey-sort.ts"))) {
      const src = readFileSync(f, "utf8");
      expect(
        [...src.matchAll(/(?:execFile|spawn)\(\s*"([^"]+)"/g)].map((m) => m[1]),
        f,
      ).toEqual(["powershell.exe"]);
    }
  });

  it("reaches the internet only through the sport routes (Claude, when asked)", () => {
    const rel = (f: string) => f.replace(/\\/g, "/").split("/src/")[1];
    const online = files.filter((f) =>
      /from\s+["']@hl-bos\/date-sort\/sport["']|@anthropic-ai\/sdk/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(online.map(rel).sort()).toEqual([
      "app/api/claude-key/route.ts",
      "app/api/sport/route.ts",
    ]);
    // The page gets the plain rules only, never the code that calls Claude.
    for (const f of files.filter((f) => /components\//.test(rel(f) ?? ""))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/@hl-bos\/date-sort\/sport["']/);
    }
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

/**
 * The scanner can only read. Checked from the source, so adding a write
 * anywhere in it fails the build before it can ever run on a photo folder.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = import.meta.dirname;
const sources = readdirSync(SRC)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => ({ file: f, text: readFileSync(join(SRC, f), "utf8") }));

/** Every filesystem call that can change something. */
const WRITES =
  /\b(writeFile|appendFile|createWriteStream|copyFile|cp|rename|unlink|rm|rmdir|mkdir|mkdtemp|utimes|lutimes|futimes|chmod|lchmod|fchmod|chown|lchown|fchown|truncate|ftruncate|symlink|link|write|writev|fsync)(Sync)?\s*\(/;

describe("DateSort's scanner is read-only", () => {
  it("has source files to check", () => {
    expect(sources.map((s) => s.file)).toContain("scan.ts");
    expect(sources.map((s) => s.file)).toContain("read-only-file.ts");
  });

  it("touches the filesystem in exactly one file", () => {
    const fsUsers = sources
      .filter((s) =>
        /from\s+["'](node:)?fs(\/promises)?["']|require\(["'](node:)?fs/.test(s.text),
      )
      .map((s) => s.file);
    expect(fsUsers).toEqual(["read-only-file.ts"]);
  });

  it("imports only reading functions there", () => {
    const text = sources.find((s) => s.file === "read-only-file.ts")!.text;
    const imports = [
      ...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']node:fs\/promises["']/g),
    ]
      .flatMap((m) => m[1]!.split(","))
      .map((s) => s.trim())
      .filter(Boolean)
      .sort();
    expect(imports).toEqual(["lstat", "open", "readdir"]);
  });

  it("opens files with mode 'r' and nothing else", () => {
    const text = sources.find((s) => s.file === "read-only-file.ts")!.text;
    const opens = [...text.matchAll(/\bopen\(([^)]*)\)/g)].map((m) => m[1]);
    expect(opens).toEqual(['path, "r"']);
  });

  it("calls no function that writes, moves, renames, deletes or re-dates", () => {
    for (const { file, text } of sources) {
      const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // comments may say "write"
      expect(WRITES.exec(code)?.[0] ?? null, file).toBeNull();
    }
  });

  it("never hands the EXIF library a path it could open", () => {
    const scan = sources.find((s) => s.file === "scan.ts")!.text;
    const calls = [...scan.matchAll(/exifr\.\w+\(\s*([^,)]*)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const arg of calls) expect(arg).toMatch(/^Buffer\.from\(/);
  });

  it("never reads EXIF DateTime (ModifyDate) as a capture date", () => {
    for (const { file, text } of sources) {
      const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(/["']ModifyDate["']|["']DateTime["']|0x0132/.test(code), file).toBe(false);
    }
  });
});

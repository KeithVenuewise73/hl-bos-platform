import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { crc32, uniqueName, zipStore } from "./zip.ts";

async function collect(gen: AsyncGenerator<Uint8Array>): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  for await (const p of gen) parts.push(p);
  return Buffer.concat(parts);
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("zipStore", () => {
  it("writes an archive that a real unzip tool reads back byte for byte", async () => {
    const a = new Uint8Array([1, 2, 3, 255]);
    const b = new TextEncoder().encode("hello jersey #24");
    const zip = await collect(
      zipStore([
        { name: "IMG_4492.jpg", data: a, modified: new Date(2026, 9, 3, 19, 30) },
        { name: "notes ü.txt", data: b, modified: new Date(2026, 9, 3) },
      ]),
    );
    const dir = mkdtempSync(join(tmpdir(), "jszip-"));
    writeFileSync(join(dir, "out.zip"), zip);
    // Python's zipfile is a strict, independent reader present on CI runners.
    execFileSync("python3", [
      "-c",
      "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])",
      join(dir, "out.zip"),
      dir,
    ]);
    expect(new Uint8Array(readFileSync(join(dir, "IMG_4492.jpg")))).toEqual(a);
    expect(readFileSync(join(dir, "notes ü.txt"), "utf8")).toBe("hello jersey #24");
    void inflateRawSync; // STORE only: nothing is deflated
  });

  it("writes a valid empty archive", async () => {
    const zip = await collect(zipStore([]));
    expect(zip.length).toBe(22);
    expect(zip.readUInt32LE(0)).toBe(0x06054b50);
  });
});

describe("uniqueName", () => {
  it("never lets two photos overwrite each other in one archive", () => {
    const used = new Set<string>();
    expect(uniqueName("IMG_1.jpg", used)).toBe("IMG_1.jpg");
    expect(uniqueName("img_1.JPG", used)).toBe("img_1 (2).JPG");
    expect(uniqueName("../../etc/passwd", used)).toBe("_.._etc_passwd");
  });
});

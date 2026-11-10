import { mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { freeBytes } from "./free-space";

describe("free space on a folder's drive", () => {
  it("reads a real number for a folder that exists", async () => {
    const free = await freeBytes(tmpdir());
    expect(free).not.toBeNull();
    expect(free!).toBeGreaterThan(0);
  });

  it("asks the nearest folder above when the folder is not made yet, and makes nothing", async () => {
    const base = await mkdtemp(join(tmpdir(), "freespace-"));
    const notYet = join(base, "Iphone Videos", "deeper");
    const free = await freeBytes(notYet);
    expect(free).not.toBeNull();
    expect(existsSync(notYet)).toBe(false);
  });
});

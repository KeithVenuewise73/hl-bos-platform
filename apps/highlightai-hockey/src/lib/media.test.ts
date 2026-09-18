import { describe, expect, it } from "vitest";

import { UnsafeStorageKey, keyForPath, originalKeyFor, pathForKey } from "./media.ts";

const ROOT = "/srv/hockey/media";

describe("storage keys", () => {
  it("names a project's upload predictably", () => {
    expect(originalKeyFor("p-1", ".MOV")).toBe("originals/p-1.mov");
    expect(originalKeyFor("p-1", ".mp4")).toBe("originals/p-1.mp4");
    // Anything unexpected becomes .mp4 rather than being trusted as an
    // extension the shell will later see.
    expect(originalKeyFor("p-1", ".sh")).toBe("originals/p-1.mp4");
  });

  it("resolves a key inside the root", () => {
    expect(pathForKey(ROOT, "originals/p-1.mp4")).toBe(`${ROOT}/originals/p-1.mp4`);
  });

  // The failure that broke the first real upload: the app sent an absolute
  // path and the vision service refused it. Both sides now agree that a key is
  // relative, and this is the test that keeps them agreeing.
  it("refuses an absolute key, which is what the two services disagreed about", () => {
    expect(() => pathForKey(ROOT, "/srv/hockey/media/originals/p-1.mp4")).toThrow(
      UnsafeStorageKey,
    );
  });

  it("refuses traversal, including the forms a string check misses", () => {
    for (const hostile of [
      "../../etc/passwd",
      "originals/../../../etc/passwd",
      "originals/../..",
      "",
      "a\0b",
    ]) {
      expect(() => pathForKey(ROOT, hostile)).toThrow(UnsafeStorageKey);
    }
  });

  it("refuses a key that resolves to the root itself", () => {
    expect(() => pathForKey(ROOT, "originals/..")).toThrow(UnsafeStorageKey);
  });

  it("allows a path that merely looks like traversal but stays inside", () => {
    expect(pathForKey(ROOT, "originals/../proxies/p-1.mp4")).toBe(
      `${ROOT}/proxies/p-1.mp4`,
    );
  });

  it("round-trips a path back to its key", () => {
    expect(keyForPath(ROOT, `${ROOT}/originals/p-1.mp4`)).toBe("originals/p-1.mp4");
  });

  it("refuses to make a key from a path outside the root", () => {
    expect(() => keyForPath(ROOT, "/etc/passwd")).toThrow(UnsafeStorageKey);
  });
});

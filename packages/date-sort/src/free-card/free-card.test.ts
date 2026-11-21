/**
 * Freeing up a card, against real folders on disk. This is the one code path that
 * deletes originals, so most of these tests are about what must NOT be deleted.
 */
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { copyDays } from "../copy/copy-day";
import type { ScannedFile, ScannedPhoto } from "../report";
import { scanFolder } from "../scan";
import { checkCard, freeCard, FreeCardError, type CardRequest } from "./free-card";

let work: string;
let card: string;
let dest: string;
let logs: string;

const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

async function jpeg(file: string, when: string, colour: string) {
  const buf = await sharp({
    create: { width: 48, height: 32, channels: 3, background: colour },
  })
    .jpeg()
    .withExif({ IFD2: { DateTimeOriginal: when.replace(/-/g, ":").replace("T", " ") } })
    .toBuffer();
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, buf);
  const old = new Date("2026-01-02T03:04:05Z");
  utimesSync(file, old, old);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const snapshot = (dir: string) =>
  Object.fromEntries(walk(dir).map((f) => [f.slice(dir.length), sha(f)]));

/** The card and the drive are different drives (the tests' folders share one real disk). */
const drives = { deviceOf: (p: string) => Promise.resolve(p.startsWith(card) ? 1 : 2) };

let scanned: readonly ScannedFile[];

async function scanAndCopy(copy = true) {
  scanned = (await scanFolder(card, { includeSubfolders: true })).files;
  if (copy)
    await copyDays({
      root: card,
      files: scanned,
      destination: dest,
      days: [{ day: "2026-10-24" }],
    });
}

const allKnown = () =>
  Promise.resolve(
    new Set(
      walk(dest)
        .filter((f) => /\.jpe?g$/i.test(f))
        .map(sha),
    ),
  );

function request(over: Partial<CardRequest> = {}): CardRequest {
  return {
    root: card,
    files: scanned,
    destination: dest,
    onSite: () => allKnown(),
    fs: drives,
    logDir: logs,
    ...over,
  };
}

beforeEach(async () => {
  work = mkdtempSync(join(tmpdir(), "free-card-"));
  card = join(work, "card");
  dest = join(work, "drive");
  logs = join(work, "logs");
  mkdirSync(card);
  mkdirSync(dest);
  await jpeg(
    join(card, "DCIM", "100CANON", "IMG_0001.JPG"),
    "2026-10-24T18:01:00",
    "red",
  );
  await jpeg(
    join(card, "DCIM", "100CANON", "IMG_0002.JPG"),
    "2026-10-24T18:02:00",
    "green",
  );
  await jpeg(
    join(card, "DCIM", "100CANON", "IMG_0003.JPG"),
    "2026-10-24T18:03:00",
    "blue",
  );
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

const cardFiles = () =>
  walk(card)
    .map((f) => f.slice(card.length).replace(/\\/g, "/"))
    .sort();
const driveFolder = () => join(dest, readdirSync(dest)[0]!);

describe("checking a card (reads only)", () => {
  it("finds every copied, identical, on-5Star photo safe, and deletes nothing", async () => {
    await scanAndCopy();
    const before = snapshot(card);
    const r = await checkCard(request());
    expect(r.safe.map((s) => s.path.replace(/\\/g, "/")).sort()).toEqual([
      "DCIM/100CANON/IMG_0001.JPG",
      "DCIM/100CANON/IMG_0002.JPG",
      "DCIM/100CANON/IMG_0003.JPG",
    ]);
    expect(r.kept).toEqual([]);
    expect(r.bytesSafe).toBeGreaterThan(0);
    expect(snapshot(card)).toEqual(before);
  });

  it("keeps a photo that was never copied (no folder for its date, or not in the folder)", async () => {
    await scanAndCopy();
    await jpeg(join(card, "DCIM", "IMG_9999.JPG"), "2026-10-24T20:00:00", "black");
    await jpeg(join(card, "DCIM", "IMG_8888.JPG"), "2026-11-02T20:00:00", "white");
    scanned = (await scanFolder(card, { includeSubfolders: true })).files;
    const r = await checkCard(request());
    const reasons = Object.fromEntries(
      r.kept.map((k) => [k.path.replace(/\\/g, "/"), k.reason]),
    );
    expect(reasons).toEqual({
      "DCIM/IMG_9999.JPG": "no-copy",
      "DCIM/IMG_8888.JPG": "no-folder",
    });
    expect(r.safe).toHaveLength(3);
  });

  it("keeps a photo whose copy is different, whether cut short or the same size with other bytes", async () => {
    await scanAndCopy();
    const [a, b] = readdirSync(driveFolder()).sort();
    const fa = join(driveFolder(), a!);
    const fb = join(driveFolder(), b!);
    writeFileSync(fa, readFileSync(fa).subarray(0, 100)); // cut short
    const bytes = readFileSync(fb);
    bytes[bytes.length - 3] = bytes[bytes.length - 3]! ^ 0xff; // one byte, same size
    writeFileSync(fb, bytes);
    const r = await checkCard(request());
    expect(r.kept.map((k) => k.reason)).toEqual(["copy-differs", "copy-differs"]);
    expect(r.safe).toHaveLength(1);
  });

  it("keeps photos that are not on 5Star, and keeps all photos when 5Star cannot be asked", async () => {
    await scanAndCopy();
    const known = await allKnown();
    const missing = sha(join(card, "DCIM", "100CANON", "IMG_0002.JPG"));
    const r1 = await checkCard(
      request({
        onSite: () => Promise.resolve(new Set([...known].filter((h) => h !== missing))),
      }),
    );
    expect(r1.kept).toEqual([
      {
        path: "DCIM\\100CANON\\IMG_0002.JPG".replace(/\\/g, join("a", "b")[1]!),
        reason: "not-on-5star",
      },
    ]);
    const r2 = await checkCard(
      request({ onSite: () => Promise.reject(new Error("down")) }),
    );
    expect(r2.safe).toEqual([]);
    expect(new Set(r2.kept.map((k) => k.reason))).toEqual(
      new Set(["5star-unavailable"]),
    );
    const r3 = await checkCard(request({ onSite: null }));
    expect(r3.safe).toEqual([]);
  });

  it("never counts the original as its own copy: a hard link, or the card's own drive", async () => {
    await scanAndCopy(false);
    mkdirSync(join(dest, "2026-10-24"));
    linkSync(
      join(card, "DCIM", "100CANON", "IMG_0001.JPG"),
      join(dest, "2026-10-24", "IMG_0001.JPG"),
    );
    const r = await checkCard(request());
    expect(r.kept.find((k) => k.path.endsWith("IMG_0001.JPG"))?.reason).toBe(
      "same-file",
    );
    expect(r.safe).toEqual([]);
    // Two folders on one real drive are not a backup either.
    rmSync(join(dest, "2026-10-24"), { recursive: true });
    await copyDays({
      root: card,
      files: scanned,
      destination: dest,
      days: [{ day: "2026-10-24" }],
    });
    const same = await checkCard(request({ fs: {} })); // the real device check
    expect(same.safe).toEqual([]);
    expect(new Set(same.kept.map((k) => k.reason))).toEqual(new Set(["same-drive"]));
  });

  it("refuses when the hard-drive folder is missing, is the card, or is inside it", async () => {
    await scanAndCopy();
    await expect(
      checkCard(request({ destination: join(work, "nope") })),
    ).rejects.toThrow(FreeCardError);
    await expect(checkCard(request({ destination: card }))).rejects.toThrow(
      FreeCardError,
    );
    mkdirSync(join(card, "backup"));
    await expect(
      checkCard(request({ destination: join(card, "backup") })),
    ).rejects.toThrow(FreeCardError);
    await expect(checkCard(request({ destination: "" }))).rejects.toThrow(
      FreeCardError,
    );
  });

  it("maps same-named photos in different card folders to their own copies", async () => {
    await jpeg(
      join(card, "DCIM", "101CANON", "IMG_0001.JPG"),
      "2026-10-24T19:00:00",
      "yellow",
    );
    await scanAndCopy();
    expect(readdirSync(driveFolder())).toContain("IMG_0001 (2).JPG");
    const r = await checkCard(request());
    expect(r.safe).toHaveLength(4);
    expect(r.kept).toEqual([]);
  });

  it("treats videos as safe on the drive copy alone, and leaves other files out of it", async () => {
    await scanAndCopy();
    const day = readdirSync(dest)[0]!;
    mkdirSync(join(card, "PRIVATE"), { recursive: true });
    writeFileSync(join(card, "PRIVATE", "C0001.MP4"), "video bytes");
    writeFileSync(join(dest, day, "C0001.MP4"), "video bytes");
    writeFileSync(join(card, "notes.txt"), "not media");
    const video: ScannedPhoto = {
      kind: "photo",
      path: "PRIVATE/C0001.MP4",
      size: 11,
      format: "mp4",
      takenAt: "2026-10-24T18:30:00",
      dateSource: "DateTimeOriginal",
    };
    scanned = [
      ...scanned,
      video,
      { kind: "unsupported", path: "notes.txt", size: 9, reason: "x" },
    ];
    const r = await checkCard(
      request({ onSite: () => Promise.resolve(new Set<string>()) }),
    );
    // The photos are not on 5Star (it knows nothing), the video needs only the drive.
    expect(r.safe.map((s) => s.path)).toEqual(["PRIVATE/C0001.MP4"]);
    expect(r.safe[0]!.video).toBe(true);
    expect(r.notMedia).toBe(1);
  });
});

describe("freeing the card (the deleting step)", () => {
  it("will not delete anything without the confirmation", async () => {
    await scanAndCopy();
    const check = await checkCard(request());
    const before = cardFiles();
    await expect(freeCard(request(), check, false)).rejects.toThrow(FreeCardError);
    expect(cardFiles()).toEqual(before);
  });

  it("deletes exactly the proven originals, leaves the copies untouched, and writes a record", async () => {
    await scanAndCopy();
    writeFileSync(join(card, "notes.txt"), "keep me");
    mkdirSync(join(card, "EMPTY"));
    const drive = snapshot(dest);
    const check = await checkCard(request());
    const r = await freeCard(request(), check, true);
    expect(r.removed).toBe(3);
    expect(r.bytesFreed).toBe(check.bytesSafe);
    expect(r.kept).toEqual([]);
    expect(r.failed).toEqual([]);
    // the card: photos gone, everything else exactly as it was
    expect(cardFiles()).toEqual(["/notes.txt"]);
    expect(existsSync(join(card, "EMPTY"))).toBe(true);
    // the drive: untouched
    expect(snapshot(dest)).toEqual(drive);
    // the record: removing + removed for each, with the fingerprint
    const lines = readFileSync(join(logs, "freed-from-card.log"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { action: string; sha256: string });
    expect(lines.filter((l) => l.action === "removing")).toHaveLength(3);
    expect(lines.filter((l) => l.action === "removed")).toHaveLength(3);
    expect(new Set(lines.map((l) => l.sha256)).size).toBe(3);
  });

  it("keeps a file that changed after the check", async () => {
    await scanAndCopy();
    const check = await checkCard(request());
    appendFileSync(join(card, "DCIM", "100CANON", "IMG_0002.JPG"), "x");
    const r = await freeCard(request(), check, true);
    expect(r.removed).toBe(2);
    expect(r.kept.map((k) => k.reason)).toEqual(["changed"]);
    expect(existsSync(join(card, "DCIM", "100CANON", "IMG_0002.JPG"))).toBe(true);
  });

  it("re-reads the copy: one that went bad or vanished after the check keeps its original", async () => {
    await scanAndCopy();
    const check = await checkCard(request());
    const names = readdirSync(driveFolder()).sort();
    const bad = join(driveFolder(), names[0]!);
    const bytes = readFileSync(bad);
    const stat = statSync(bad);
    bytes[bytes.length - 3] = bytes[bytes.length - 3]! ^ 0xff;
    writeFileSync(bad, bytes);
    utimesSync(bad, stat.atime, stat.mtime); // same size, same date, different bytes
    rmSync(join(driveFolder(), names[1]!));
    const r = await freeCard(request(), check, true);
    expect(r.removed).toBe(1);
    expect(r.kept.map((k) => k.reason).sort()).toEqual(["copy-differs", "no-copy"]);
    expect(cardFiles()).toHaveLength(2);
  });

  it("asks 5Star again: if it cannot be asked, or has lost a photo, the original stays", async () => {
    await scanAndCopy();
    const check = await checkCard(request());
    const down = await freeCard(
      request({ onSite: () => Promise.reject(new Error("down")) }),
      check,
      true,
    );
    expect(down.removed).toBe(0);
    expect(new Set(down.kept.map((k) => k.reason))).toEqual(
      new Set(["5star-unavailable"]),
    );
    expect(cardFiles()).toHaveLength(3);
    const lost = sha(join(card, "DCIM", "100CANON", "IMG_0003.JPG"));
    const known = await allKnown();
    known.delete(lost);
    const r = await freeCard(
      request({ onSite: () => Promise.resolve(known) }),
      check,
      true,
    );
    expect(r.removed).toBe(2);
    expect(r.kept.map((k) => k.reason)).toEqual(["not-on-5star"]);
    expect(existsSync(join(card, "DCIM", "100CANON", "IMG_0003.JPG"))).toBe(true);
  });

  it("reports a file the card will not let go of, and carries on with the rest", async () => {
    await scanAndCopy();
    const check = await checkCard(request());
    const r = await freeCard(
      request({
        fs: {
          ...drives,
          unlink: (p: string) =>
            p.endsWith("IMG_0002.JPG")
              ? Promise.reject(new Error("EPERM: the card is write-protected"))
              : import("node:fs/promises").then((m) => m.unlink(p)),
        },
      }),
      check,
      true,
    );
    expect(r.removed).toBe(2);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]!.message).toMatch(/write-protected/);
    expect(r.kept.map((k) => k.reason)).toEqual(["not-removed"]);
    expect(existsSync(join(card, "DCIM", "100CANON", "IMG_0002.JPG"))).toBe(true);
    const log = readFileSync(join(logs, "freed-from-card.log"), "utf8");
    expect(log).toMatch(/"action":"failed"/);
  });

  it("stops when asked, having deleted only what was proven, and keeps the rest", async () => {
    await scanAndCopy();
    const check = await checkCard(request());
    const stop = new AbortController();
    const r = await freeCard(
      request({
        signal: stop.signal,
        onProgress: (p) => {
          if (p.phase === "removing" && p.done === 2) stop.abort();
        },
      }),
      check,
      true,
    );
    expect(r.stopped).toBe(true);
    expect(r.removed).toBe(1);
    expect(cardFiles()).toHaveLength(2);
  });
});

describe("the only code that deletes", () => {
  const src = join(import.meta.dirname, "..");
  const read = (f: string) => readFileSync(join(src, f), "utf8");

  it("is remove.ts: free-card.ts cannot import or call a delete", () => {
    expect(read("free-card/remove.ts")).toMatch(/from "node:fs\/promises"/);
    const importsFs = [
      ...read("free-card/free-card.ts").matchAll(
        /import \{([^}]*)\} from "node:fs\/promises"/g,
      ),
    ];
    const names = importsFs.flatMap((m) => m[1]!.split(",").map((s) => s.trim()));
    expect(names.sort()).toEqual(["lstat", "open", "realpath", "stat"]);
    expect(read("free-card/free-card.ts")).not.toMatch(/\b(unlink|rm|rmdir|rename)\(/);
    expect(read("free-card/log.ts")).not.toMatch(/\b(unlink|rm|rmdir|rename)\(/);
  });

  it("is never used by the scanner or the copier", () => {
    for (const f of [
      "scan.ts",
      "read-only-file.ts",
      "copy/copy-day.ts",
      "copy/write-file.ts",
    ])
      expect(read(f), f).not.toMatch(/free-card/);
  });

  it("is also guarded against a symlinked 'copy'", async () => {
    await scanAndCopy(false);
    mkdirSync(join(dest, "2026-10-24"));
    try {
      symlinkSync(
        join(card, "DCIM", "100CANON", "IMG_0001.JPG"),
        join(dest, "2026-10-24", "IMG_0001.JPG"),
      );
    } catch {
      return; // Windows without the right to make symbolic links: nothing to test here
    }
    const r = await checkCard(request());
    expect(r.safe).toEqual([]);
  });
});

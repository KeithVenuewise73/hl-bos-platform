/**
 * Copying into date folders, against real folders on disk.
 *
 * The originals are fingerprinted (path, size, modified time, SHA-256)
 * before and after every copy: any change to the source folder fails.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
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
import { join, relative } from "node:path";

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ScannedPhoto } from "../report";
import { scanFolder } from "../scan";
import { copyDays, CopyError, folderPlanForDay } from "./copy-day";
import { cleanEventName, folderName, isInside, planDay } from "./plan";
import { cleanEventNames, loadSettings, saveSettings } from "./settings";
import { copyOneFile, PARTIAL_SUFFIX } from "./write-file";

let work: string;
let card: string;
let dest: string;

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

function fingerprint(dir: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of walk(dir)) {
    const st = statSync(f);
    m.set(
      relative(dir, f),
      `${st.size}|${st.mtimeMs}|${createHash("sha256").update(readFileSync(f)).digest("hex")}`,
    );
  }
  return m;
}

const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

beforeEach(async () => {
  work = mkdtempSync(join(tmpdir(), "datesort-copy-"));
  card = join(work, "card");
  dest = join(work, "Games");
  mkdirSync(dest);
  // Oct 3: two photos. Oct 4: three, two of them both named IMG_0001.JPG
  // (the camera's numbering wrapped, in another folder).
  await jpeg(join(card, "100CANON", "IMG_0001.JPG"), "2026-10-03T19:00:00", "#7f1d1d");
  await jpeg(join(card, "100CANON", "IMG_0002.JPG"), "2026-10-03T19:30:00", "#1e3a8a");
  await jpeg(join(card, "100CANON", "IMG_0003.JPG"), "2026-10-04T13:03:00", "#14532d");
  await jpeg(join(card, "101CANON", "IMG_0001.JPG"), "2026-10-04T14:00:00", "#713f12");
  await jpeg(join(card, "101CANON", "IMG_0004.JPG"), "2026-10-04T15:47:00", "#581c87");
  writeFileSync(join(card, "Thumbs.db"), "not a photo");
});

afterEach(() => rmSync(work, { recursive: true, force: true }));

async function scan() {
  return scanFolder(card, { includeSubfolders: true });
}

describe("folder names", () => {
  it("is the date, or the date and the event name", () => {
    expect(folderName("2026-10-04")).toBe("2026-10-04");
    expect(folderName("2026-10-04", "Caz vs Wheatfield")).toBe(
      "2026-10-04 - Caz vs Wheatfield",
    );
    expect(folderName("2026-10-04", "   ")).toBe("2026-10-04");
  });

  it("makes any event name safe for Windows", () => {
    expect(cleanEventName('JV: "Home" / Away?*')).toBe("JV Home Away");
    expect(cleanEventName("Senior Night...  ")).toBe("Senior Night");
    expect(cleanEventName("CON")).toBe("CON_");
    expect(cleanEventName("a".repeat(200)).length).toBe(80);
    expect(() => folderName("../../Windows")).toThrow();
  });

  it("knows when one folder is inside another", () => {
    expect(isInside("D:\\Camera Photos\\DCIM\\Games", "D:\\Camera Photos\\DCIM")).toBe(
      true,
    );
    expect(isInside("d:\\camera photos\\dcim\\", "D:\\Camera Photos\\DCIM")).toBe(true);
    expect(isInside("D:\\Camera Photos\\DCIM2", "D:\\Camera Photos\\DCIM")).toBe(false);
    expect(isInside("D:\\Games", "D:\\Camera Photos\\DCIM")).toBe(false);
    expect(isInside("/home/k/card/sub", "/home/k/card")).toBe(true);
  });
});

describe("planning a date", () => {
  it("gives two different photos with the same name different copy names, the same way every time", async () => {
    const { files } = await scan();
    const photos = files.filter((f): f is ScannedPhoto => f.kind === "photo");
    const plan = planDay(photos, "2026-10-04");
    expect(plan.map((p) => [p.source.replace(/\\/g, "/"), p.name])).toEqual([
      ["100CANON/IMG_0003.JPG", "IMG_0003.JPG"],
      ["101CANON/IMG_0001.JPG", "IMG_0001.JPG"],
      ["101CANON/IMG_0004.JPG", "IMG_0004.JPG"],
    ]);
    // Oct 3 has only one IMG_0001; on a day with both, the later path gets (2).
    const both = planDay(
      [
        {
          kind: "photo",
          path: "101CANON/IMG_0001.JPG",
          size: 1,
          format: "jpeg",
          takenAt: "2026-10-04T10:00:00",
          dateSource: "DateTimeOriginal",
        },
        {
          kind: "photo",
          path: "100CANON/img_0001.jpg",
          size: 1,
          format: "jpeg",
          takenAt: "2026-10-04T09:00:00",
          dateSource: "DateTimeOriginal",
        },
      ],
      "2026-10-04",
    );
    expect(both.map((p) => p.name)).toEqual(["img_0001.jpg", "IMG_0001 (2).JPG"]);
  });
});

describe("which folder a date goes in", () => {
  const use = (name: string) => ({ kind: "use", name });

  it("makes the named folder when the date has none", () => {
    expect(folderPlanForDay("2025-11-08", "Zac K", [])).toEqual(
      use("2025-11-08 - Zac K"),
    );
    expect(folderPlanForDay("2025-11-08", "", ["2025-11-09 - Other day"])).toEqual(
      use("2025-11-08"),
    );
  });

  it("uses the folder that already has the wanted name (any capitals)", () => {
    expect(folderPlanForDay("2025-11-08", "zac k", ["2025-11-08 - Zac K"])).toEqual(
      use("2025-11-08 - Zac K"),
    );
    expect(
      folderPlanForDay("2025-11-08", "", ["2025-11-08", "2025-11-08 - Zac K"]),
    ).toEqual(use("2025-11-08"));
  });

  it("with no name, uses the one folder already named for that date", () => {
    expect(
      folderPlanForDay("2025-11-08", "", ["2025-11-08 - Zac K", "2025-12-16"]),
    ).toEqual(use("2025-11-08 - Zac K"));
  });

  it("when a name or sport is added after copying, renames the date's folder instead of making another", () => {
    expect(folderPlanForDay("2026-01-13", "Basketball", ["2026-01-13"])).toEqual({
      kind: "rename",
      from: "2026-01-13",
      name: "2026-01-13 - Basketball",
    });
    expect(
      folderPlanForDay("2025-11-08", "Basketball - Zac K", ["2025-11-08 - Zac K"]),
    ).toEqual({
      kind: "rename",
      from: "2025-11-08 - Zac K",
      name: "2025-11-08 - Basketball - Zac K",
    });
  });

  it("refuses to guess when a date already has two folders", () => {
    const plan = folderPlanForDay("2025-11-08", "Basketball - Zac K", [
      "2025-11-08",
      "2025-11-08 - Zac K",
    ]);
    expect(plan.kind).toBe("refuse");
    expect(plan.kind === "refuse" && plan.reason).toMatch(/already has 2 folders/);
    expect(
      folderPlanForDay("2025-11-08", "", ["2025-11-08 - Zac K", "2025-11-08 - Game 2"])
        .kind,
    ).toBe("refuse");
  });
});

describe("copying dates into folders", () => {
  it("copies each date into its own folder, and changes nothing in the source", async () => {
    const before = fingerprint(card);
    const scanned = await scan();
    const results = await copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [
        { day: "2026-10-03" },
        { day: "2026-10-04", eventName: "Caz vs Wheatfield" },
      ],
    });
    expect(fingerprint(card)).toEqual(before);

    expect(readdirSync(dest).sort()).toEqual([
      "2026-10-03",
      "2026-10-04 - Caz vs Wheatfield",
    ]);
    expect(readdirSync(join(dest, "2026-10-03")).sort()).toEqual([
      "IMG_0001.JPG",
      "IMG_0002.JPG",
    ]);
    expect(readdirSync(join(dest, "2026-10-04 - Caz vs Wheatfield")).sort()).toEqual([
      "IMG_0001.JPG",
      "IMG_0003.JPG",
      "IMG_0004.JPG",
    ]);
    expect(
      results.map((r) => [
        r.day,
        r.photos,
        r.copied,
        r.alreadyThere,
        r.conflicts.length,
        r.failed.length,
      ]),
    ).toEqual([
      ["2026-10-03", 2, 2, 0, 0, 0],
      ["2026-10-04", 3, 3, 0, 0, 0],
    ]);
  });

  it("makes exact copies, with the original's modified date", async () => {
    const scanned = await scan();
    await copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day: "2026-10-04" }],
    });
    const original = join(card, "101CANON", "IMG_0001.JPG");
    const copy = join(dest, "2026-10-04", "IMG_0001.JPG");
    expect(sha(copy)).toBe(sha(original));
    expect(statSync(copy).mtimeMs).toBe(statSync(original).mtimeMs);
    expect(walk(dest).some((f) => f.endsWith(PARTIAL_SUFFIX))).toBe(false);
  });

  it("copying again finds everything already there and changes nothing", async () => {
    const scanned = await scan();
    const req = {
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day: "2026-10-03" }, { day: "2026-10-04" }],
    };
    await copyDays(req);
    const after1 = fingerprint(dest);
    const again = await copyDays(req);
    expect(fingerprint(dest)).toEqual(after1);
    expect(again.map((r) => [r.copied, r.alreadyThere])).toEqual([
      [0, 2],
      [0, 3],
    ]);
  });

  it("copying again without the event name (a refreshed page forgot it) makes no second folder", async () => {
    const scanned = await scan();
    await copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day: "2026-10-04", eventName: "Caz vs Wheatfield" }],
    });
    const again = await copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day: "2026-10-03" }, { day: "2026-10-04" }],
    });
    expect(readdirSync(dest).sort()).toEqual([
      "2026-10-03",
      "2026-10-04 - Caz vs Wheatfield",
    ]);
    expect(again.map((r) => [r.day, r.copied, r.alreadyThere])).toEqual([
      ["2026-10-03", 2, 0],
      ["2026-10-04", 0, 3],
    ]);
  });

  it("adding a sport after copying renames the folder and copies nothing twice", async () => {
    const scanned = await scan();
    await copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day: "2026-10-04" }],
    });
    const again = await copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day: "2026-10-04", eventName: "Basketball" }],
    });
    expect(readdirSync(dest)).toEqual(["2026-10-04 - Basketball"]);
    expect(readdirSync(join(dest, "2026-10-04 - Basketball")).sort()).toEqual([
      "IMG_0001.JPG",
      "IMG_0003.JPG",
      "IMG_0004.JPG",
    ]);
    expect(again[0]).toMatchObject({
      copied: 0,
      alreadyThere: 3,
      renamedFrom: "2026-10-04",
      problem: null,
    });
  });

  it("copies only the videos, or only the photos, when asked", async () => {
    // An iPhone-style video filmed on Oct 4 at 23:41 (its own clock).
    const video = join(import.meta.dirname, "..", "..", "fixtures", "iphone-style.mov");
    const mov = readFileSync(video);
    writeFileSync(join(card, "101CANON", "IMG_0005.MOV"), mov);
    // The fixture says Oct 24; re-date nothing: just copy the bytes and use its day.
    const scanned = await scan();
    const videoDay = scanned.files.find((f) => f.path.endsWith("IMG_0005.MOV"));
    expect(videoDay).toMatchObject({ kind: "photo", format: "mov" });
    const day = (videoDay as ScannedPhoto).takenAt!.slice(0, 10);

    const videosDest = join(work, "Hockey Videos");
    mkdirSync(videosDest);
    await copyDays({
      root: card,
      files: scanned.files,
      destination: videosDest,
      days: [{ day }, { day: "2026-10-04" }],
      only: "videos",
    });
    expect(
      walk(videosDest).map((f) => relative(videosDest, f).replace(/\\/g, "/")),
    ).toEqual([`${day}/IMG_0005.MOV`]);
    // Date folders are made only where something was copied.
    expect(readdirSync(videosDest)).toEqual([day]);

    await copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day }, { day: "2026-10-04" }],
      only: "photos",
    });
    expect(walk(dest).some((f) => f.endsWith(".MOV"))).toBe(false);
    expect(readdirSync(join(dest, "2026-10-04")).length).toBe(3);
  });

  it("copies nothing for a date that already has two folders, and says why", async () => {
    const scanned = await scan();
    mkdirSync(join(dest, "2026-10-04"));
    mkdirSync(join(dest, "2026-10-04 - Zac K"));
    const results = await copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day: "2026-10-04", eventName: "Basketball" }, { day: "2026-10-03" }],
    });
    expect(readdirSync(dest).sort()).toEqual([
      "2026-10-03",
      "2026-10-04",
      "2026-10-04 - Zac K",
    ]);
    expect(readdirSync(join(dest, "2026-10-04"))).toEqual([]);
    expect(results[0]).toMatchObject({ copied: 0, renamedFrom: null });
    expect(results[0]!.problem).toMatch(/already has 2 folders/);
    expect(results[1]).toMatchObject({ copied: 2, problem: null });
  });

  it("never overwrites a different file that has the same name: it is left as it is and reported", async () => {
    mkdirSync(join(dest, "2026-10-03"));
    writeFileSync(join(dest, "2026-10-03", "IMG_0002.JPG"), "someone else's file");
    const scanned = await scan();
    const [r] = await copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day: "2026-10-03" }],
    });
    expect(readFileSync(join(dest, "2026-10-03", "IMG_0002.JPG"), "utf8")).toBe(
      "someone else's file",
    );
    expect(r!.copied).toBe(1);
    expect(r!.conflicts.map((c) => c.name)).toEqual(["IMG_0002.JPG"]);
  });

  it("cleans up after a copy that was cut short, and finishes it next time", async () => {
    mkdirSync(join(dest, "2026-10-03"));
    writeFileSync(
      join(dest, "2026-10-03", `IMG_0001.JPG${PARTIAL_SUFFIX}`),
      "half a photo",
    );
    const scanned = await scan();
    const [r] = await copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day: "2026-10-03" }],
    });
    expect(r!.copied).toBe(2);
    expect(readdirSync(join(dest, "2026-10-03")).sort()).toEqual([
      "IMG_0001.JPG",
      "IMG_0002.JPG",
    ]);
  });

  it("works on drives without hard links (exFAT), still never overwriting", async () => {
    const noLinks = {
      link: () =>
        Promise.reject(Object.assign(new Error("no links"), { code: "EPERM" })),
    };
    const scanned = await scan();
    const [r] = await copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day: "2026-10-03" }],
      fs: noLinks,
    });
    expect(r!.copied).toBe(2);
    expect(sha(join(dest, "2026-10-03", "IMG_0001.JPG"))).toBe(
      sha(join(card, "100CANON", "IMG_0001.JPG")),
    );
    expect(walk(dest).some((f) => f.endsWith(PARTIAL_SUFFIX))).toBe(false);
  });

  it("if the name appears while copying, does not overwrite it", async () => {
    const target = join(dest, "x.JPG");
    const racer = {
      link: () => {
        writeFileSync(target, "arrived first");
        return Promise.reject(Object.assign(new Error("exists"), { code: "EEXIST" }));
      },
    };
    const out = await copyOneFile(join(card, "100CANON", "IMG_0001.JPG"), target, {
      fs: racer,
    });
    expect(out.result).toBe("conflict");
    expect(readFileSync(target, "utf8")).toBe("arrived first");
    expect(existsSync(target + PARTIAL_SUFFIX)).toBe(false);
  });

  it("refuses a destination inside the scanned folder, a missing one, or a file", async () => {
    const scanned = await scan();
    const base = { root: card, files: scanned.files, days: [{ day: "2026-10-03" }] };
    await expect(
      copyDays({ ...base, destination: join(card, "Sorted") }),
    ).rejects.toThrow(CopyError);
    mkdirSync(join(card, "Sorted"));
    await expect(
      copyDays({ ...base, destination: join(card, "Sorted") }),
    ).rejects.toThrow(/inside the folder you scanned/);
    await expect(
      copyDays({ ...base, destination: join(work, "nope") }),
    ).rejects.toThrow(/does not exist/);
    await expect(
      copyDays({ ...base, destination: join(card, "Thumbs.db") }),
    ).rejects.toThrow(/is a file/);
    rmSync(join(card, "Sorted"), { recursive: true });
  });

  it("is not fooled by a second name for the scanned folder (a link, or a Windows short name)", async () => {
    const scanned = await scan();
    mkdirSync(join(card, "Sorted"));
    const alias = join(work, "same-card");
    symlinkSync(card, alias, "junction");
    await expect(
      copyDays({
        root: card,
        files: scanned.files,
        days: [{ day: "2026-10-03" }],
        destination: join(alias, "Sorted"),
      }),
    ).rejects.toThrow(/inside the folder you scanned/);
    expect(readdirSync(join(card, "Sorted"))).toEqual([]);
    rmSync(join(card, "Sorted"), { recursive: true });
  });

  it("stops when cancelled, leaving no half-written files", async () => {
    const scanned = await scan();
    const controller = new AbortController();
    const run = copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day: "2026-10-03" }, { day: "2026-10-04" }],
      signal: controller.signal,
      onProgress: (p) => {
        if (p.done === 1) controller.abort();
      },
    });
    await expect(run).rejects.toThrow();
    expect(walk(dest).some((f) => f.endsWith(PARTIAL_SUFFIX))).toBe(false);
  });

  it("reports progress across all the dates", async () => {
    const scanned = await scan();
    const seen: string[] = [];
    await copyDays({
      root: card,
      files: scanned.files,
      destination: dest,
      days: [{ day: "2026-10-03" }, { day: "2026-10-04" }],
      onProgress: (p) => seen.push(`${p.done}/${p.total}`),
    });
    expect(seen.at(-1)).toBe("5/5");
  });
});

describe("remembering the destination and event names", () => {
  it("saves and loads them from DateSort's own settings folder", async () => {
    const dir = join(work, "settings");
    expect(await loadSettings(dir)).toEqual({
      destination: null,
      eventNames: {},
      iphoneFolder: null,
    });
    await saveSettings(
      {
        destination: "D:\\5-Star Sports Media\\Games",
        eventNames: { "2025-11-08": "Zac K" },
      },
      dir,
    );
    expect(await loadSettings(dir)).toEqual({
      destination: "D:\\5-Star Sports Media\\Games",
      eventNames: { "2025-11-08": "Zac K" },
      iphoneFolder: null,
    });
  });

  it("keeps only real dates and names from the file", () => {
    expect(
      cleanEventNames({
        "2025-11-08": "Zac K",
        nonsense: "x",
        "2025-11-09": "",
        "2025-11-10": 7,
      }),
    ).toEqual({ "2025-11-08": "Zac K" });
    expect(cleanEventNames(null)).toEqual({});
  });
});

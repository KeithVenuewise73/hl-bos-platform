/**
 * Sport suggestions. Claude is replaced by a fake here (no key, no cost, no
 * network); everything around it is real: real JPEGs on disk, real previews,
 * the real request DateSort builds, the real tally rules.
 */
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type Anthropic from "@anthropic-ai/sdk";
import exifr from "exifr";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ScannedPhoto } from "../report";
import { checkAnswer, claudeAsker, SPORT_MODEL } from "./claude";
import { PREVIEW_EDGE, previewOf } from "./preview";
import { pickSamples, tallyGuess, withSport, type PhotoVerdict } from "./sports";
import {
  forgetKey,
  loadKey,
  looksLikeKey,
  savedGuess,
  saveGuess,
  saveKey,
} from "./store";
import { sampleKey, suggestSport } from "./suggest";

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "datesort-sport-"));
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

const photo = (
  path: string,
  takenAt: string,
  format: ScannedPhoto["format"] = "jpeg",
): ScannedPhoto => ({
  kind: "photo",
  path,
  size: 100,
  format,
  takenAt,
  dateSource: "DateTimeOriginal",
});

const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";

describe("choosing sample photos", () => {
  it("takes JPGs from that date only, spread across the day", () => {
    const photos: ScannedPhoto[] = [];
    for (let i = 0; i < 40; i++) {
      const t = `2026-01-13T${String(10 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}:00`;
      photos.push(photo(`IMG_${1000 + i}.JPG`, t));
      photos.push(photo(`IMG_${1000 + i}.CR2`, t, "cr2"));
    }
    photos.push(photo("OTHER_DAY.JPG", "2026-01-14T10:00:00"));
    const picked = pickSamples(photos, "2026-01-13");
    expect(picked).toHaveLength(8);
    expect(
      picked.every((p) => p.format === "jpeg" && p.takenAt!.startsWith("2026-01-13")),
    ).toBe(true);
    // Evenly spread: first pick from the first hour, last from the last.
    expect(picked[0]!.path).toBe("IMG_1002.JPG");
    expect(picked[7]!.path).toBe("IMG_1037.JPG");
    expect(new Set(picked.map((p) => p.path)).size).toBe(8);
  });

  it("takes every JPG when there are only a few", () => {
    const photos = [
      photo("A.JPG", "2026-01-13T10:00:00"),
      photo("B.JPG", "2026-01-13T11:00:00"),
    ];
    expect(pickSamples(photos, "2026-01-13").map((p) => p.path)).toEqual([
      "A.JPG",
      "B.JPG",
    ]);
    expect(
      pickSamples([photo("A.CR2", "2026-01-13T10:00:00", "cr2")], "2026-01-13"),
    ).toEqual([]);
  });
});

describe("deciding a date's sport", () => {
  const v = (...xs: PhotoVerdict[]) => xs;

  it("suggests a sport only when more than half of the photos agree", () => {
    const g = tallyGuess(
      "2026-01-13",
      v(
        "basketball",
        "basketball",
        "basketball",
        "basketball",
        "basketball",
        "unclear",
        "volleyball",
        "basketball",
      ),
      "",
    );
    expect(g).toMatchObject({ sport: "basketball", agreeing: 6, looked: 8 });
    expect(g.tally[0]).toEqual({ verdict: "basketball", count: 6 });
  });

  it("does not suggest anything on a split, or when half is not more than half", () => {
    expect(
      tallyGuess("d", v("basketball", "basketball", "volleyball", "volleyball"), "")
        .sport,
    ).toBeNull();
    expect(
      tallyGuess("d", v("basketball", "basketball", "unclear", "unclear"), "").sport,
    ).toBeNull();
  });

  it("never suggests 'unclear' or 'other' as a sport", () => {
    expect(tallyGuess("d", v("unclear", "unclear", "unclear"), "").sport).toBeNull();
    expect(tallyGuess("d", v("other", "other", "basketball"), "").sport).toBeNull();
  });

  it("puts the sport in front of the event name, once", () => {
    expect(withSport("", "basketball")).toBe("Basketball");
    expect(withSport("Zac K", "basketball")).toBe("Basketball - Zac K");
    expect(withSport("Basketball - Zac K", "basketball")).toBe("Basketball - Zac K");
    expect(withSport("basketball", "basketball")).toBe("basketball");
  });
});

describe("checking Claude's answer", () => {
  it("accepts one verdict per photo, in photo order", () => {
    expect(
      checkAnswer(
        {
          photos: [
            { photo: 2, sport: "hockey" },
            { photo: 1, sport: "unclear" },
          ],
          notes: "n",
        },
        2,
      ),
    ).toEqual({ verdicts: ["unclear", "hockey"], notes: "n" });
  });

  it("refuses a missing, repeated or made-up photo rather than guess", () => {
    expect(() =>
      checkAnswer({ photos: [{ photo: 1, sport: "hockey" }], notes: "" }, 2),
    ).toThrow();
    expect(() =>
      checkAnswer(
        {
          photos: [
            { photo: 1, sport: "hockey" },
            { photo: 1, sport: "soccer" },
          ],
          notes: "",
        },
        2,
      ),
    ).toThrow();
    expect(() =>
      checkAnswer(
        {
          photos: [
            { photo: 1, sport: "hockey" },
            { photo: 3, sport: "soccer" },
          ],
          notes: "",
        },
        2,
      ),
    ).toThrow();
  });
});

async function cameraJpeg(file: string, width = 3000, height = 2000) {
  const buf = await sharp({
    create: { width, height, channels: 3, background: "#c2410c" },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: "Canon", Model: "Canon EOS Rebel" },
      IFD2: { DateTimeOriginal: "2026:01:13 10:00:00" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "40/1 26/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "79/1 58/1 0/1",
      },
    })
    .toBuffer();
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, buf);
}

const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

describe("the previews sent to Claude", () => {
  it("are small, carry no camera details or location, and leave the original untouched", async () => {
    const file = join(work, "IMG_0001.JPG");
    await cameraJpeg(file);
    expect((await exifr.gps(readFileSync(file)))?.latitude).toBeGreaterThan(40);
    const before = { hash: sha(file), mtime: statSync(file).mtimeMs };

    const preview = await previewOf(file);
    const meta = await sharp(preview).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width, meta.height)).toBe(PREVIEW_EDGE);
    expect(meta.exif).toBeUndefined();
    expect(await exifr.parse(preview).catch(() => undefined)).toBeUndefined();

    expect({ hash: sha(file), mtime: statSync(file).mtimeMs }).toEqual(before);
    expect(readdirSync(work)).toEqual(["IMG_0001.JPG"]);
  });
});

describe("suggesting a date's sport", () => {
  it("shows Claude small previews of the samples and tallies its answer", async () => {
    const photos: ScannedPhoto[] = [];
    for (let i = 0; i < 10; i++) {
      const name = `IMG_${8000 + i}.JPG`;
      await cameraJpeg(join(work, "card", name), 900, 600);
      photos.push(photo(name, `2026-01-13T10:${String(i).padStart(2, "0")}:00`));
    }
    const seen: number[] = [];
    const guess = await suggestSport({
      root: join(work, "card"),
      photos,
      day: "2026-01-13",
      ask: async (images) => {
        for (const img of images)
          seen.push(Math.max((await sharp(img).metadata()).width, 0));
        return {
          verdicts: images.map((_, i) => (i < 7 ? "basketball" : "unclear")),
          notes: "Two warm-up shots.",
        };
      },
    });
    expect(seen).toHaveLength(8);
    expect(guess).toMatchObject({
      day: "2026-01-13",
      sport: "basketball",
      agreeing: 7,
      looked: 8,
    });
  });

  it("says so when a date has no JPG to look at, without asking Claude", async () => {
    let asked = false;
    const guess = await suggestSport({
      root: work,
      photos: [photo("A.CR2", "2026-01-13T10:00:00", "cr2")],
      day: "2026-01-13",
      ask: () => {
        asked = true;
        return Promise.resolve({ verdicts: [], notes: "" });
      },
    });
    expect(asked).toBe(false);
    expect(guess).toMatchObject({ sport: null, looked: 0 });
    expect(guess.notes).toMatch(/No JPG/);
  });
});

describe("the request DateSort sends to Claude", () => {
  it("is one structured request with every image numbered, refusal fallback on", async () => {
    let sent: Record<string, unknown> | undefined;
    const client = {
      beta: {
        messages: {
          parse: (params: Record<string, unknown>) => {
            sent = params;
            return Promise.resolve({
              stop_reason: "end_turn",
              parsed_output: {
                photos: [
                  { photo: 1, sport: "volleyball" },
                  { photo: 2, sport: "volleyball" },
                ],
                notes: "",
              },
            });
          },
        },
      },
    } as unknown as Anthropic;
    const ask = claudeAsker({ apiKey: KEY, client });
    const answer = await ask([Buffer.from("a"), Buffer.from("b")]);
    expect(answer.verdicts).toEqual(["volleyball", "volleyball"]);
    expect(sent).toMatchObject({
      model: SPORT_MODEL,
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
      output_config: { effort: "low" },
    });
    const content = (sent!["messages"] as { content: { type: string }[] }[])[0]!
      .content;
    expect(content.filter((c) => c.type === "image")).toHaveLength(2);
  });

  it("treats a refusal or a cut-off answer as an error, never as a guess", async () => {
    for (const stop_reason of ["refusal", "max_tokens"]) {
      const client = {
        beta: {
          messages: {
            parse: () => Promise.resolve({ stop_reason, parsed_output: null }),
          },
        },
      } as unknown as Anthropic;
      await expect(
        claudeAsker({ apiKey: KEY, client })([Buffer.from("a")]),
      ).rejects.toThrow();
    }
  });
});

describe("what is kept on this computer", () => {
  it("saves, reads and forgets the key; refuses anything that is not a key", async () => {
    const dir = join(work, "settings");
    expect(await loadKey(dir)).toBeNull();
    expect(looksLikeKey("hello")).toBe(false);
    await expect(saveKey("hello", dir)).rejects.toThrow();
    await saveKey(` ${KEY} `, dir);
    expect(await loadKey(dir)).toBe(KEY);
    await forgetKey(dir);
    expect(await loadKey(dir)).toBeNull();
  });

  it("reuses a saved guess only for the same photos", async () => {
    const dir = join(work, "settings");
    const photos = [photo("A.JPG", "2026-01-13T10:00:00")];
    const g = tallyGuess("2026-01-13", ["hockey"], "");
    await saveGuess(g, sampleKey(photos, "2026-01-13"), dir);
    expect(
      await savedGuess("2026-01-13", sampleKey(photos, "2026-01-13"), dir),
    ).toEqual(g);
    const other = [photo("B.JPG", "2026-01-13T10:00:00")];
    expect(
      await savedGuess("2026-01-13", sampleKey(other, "2026-01-13"), dir),
    ).toBeNull();
  });
});

describe("the sport code's own safety rules", () => {
  const dir = join(import.meta.dirname);
  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
  );
  const text = (f: string) => readFileSync(join(dir, f), "utf8");

  it("reads photos only through the scanner's read-only module", () => {
    for (const f of files) {
      const usesFs = /from\s+["'](node:)?fs(\/promises)?["']/.test(text(f));
      // store.ts writes the key and the guesses into DateSort's settings folder, nothing else.
      expect(usesFs, f).toBe(f === "store.ts");
    }
    expect(text("preview.ts")).toMatch(/from "\.\.\/read-only-file"/);
  });

  it("only store.ts writes, and only into DateSort's settings folder", () => {
    const store = text("store.ts");
    expect([...store.matchAll(/join\(dir, ([A-Z_]+)\)/g)].map((m) => m[1])).toEqual(
      expect.arrayContaining(["KEY_FILE", "GUESS_FILE"]),
    );
    expect(store).not.toMatch(/\b(rename|copyFile|rm|rmdir)\s*\(/);
  });
});

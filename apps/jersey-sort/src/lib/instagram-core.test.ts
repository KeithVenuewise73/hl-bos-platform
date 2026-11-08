/**
 * Instagram posts from a game's photos: the caption rules, and the pictures.
 * Real JPEGs through the real image library. The important claim is the last
 * one: a photo that carries camera data and a GPS location comes out with
 * none of it, because the result is meant to be public.
 */
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  captionFile,
  captionProblems,
  FORMATS,
  hashtagCount,
  makeFrame,
  MAX_CAPTION,
  MAX_HASHTAGS,
  suggestCaption,
} from "./instagram-core.ts";

/** Stored landscape (600x400) with the camera's "rotated" tag: shown as 400x600 portrait. */
const tall0 = () =>
  sharp({ create: { width: 600, height: 400, channels: 3, background: "#cc3333" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

/** A landscape photo with EXIF: camera, time, and a GPS location. */
async function landscapeWithGps(w = 3000, h = 2000): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#1d4ed8"/>
    <rect x="${w / 2 - 150}" y="${h / 2 - 250}" width="300" height="500" fill="#fff"/></svg>`;
  return new Uint8Array(
    await sharp(Buffer.from(svg))
      .jpeg({ quality: 90 })
      .withExif({
        IFD0: { Make: "Canon", Model: "EOS R6" },
        IFD2: { DateTimeOriginal: "2026:10:24 18:00:00" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "42/1 59/1 0/1",
          GPSLongitudeRef: "W",
          GPSLongitude: "78/1 51/1 0/1",
        },
      })
      .toBuffer(),
  );
}

describe("the caption", () => {
  it("is fine when short, empty, or at the limit", () => {
    expect(captionProblems("")).toEqual([]);
    expect(captionProblems("Varsity vs Wheatfield\n📸 5 Star Sports Media")).toEqual(
      [],
    );
    expect(captionProblems("x".repeat(MAX_CAPTION))).toEqual([]);
  });

  it("is refused past Instagram's 2,200 characters, saying how many", () => {
    const p = captionProblems("x".repeat(MAX_CAPTION + 1));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("2,201 characters");
    expect(p[0]).toContain("2,200");
  });

  it("counts an emoji as one character, as Instagram does", () => {
    expect(captionProblems("📸".repeat(MAX_CAPTION))).toEqual([]);
    expect(captionProblems("📸".repeat(MAX_CAPTION + 1))).toHaveLength(1);
  });

  it("is refused past 30 hashtags", () => {
    const tags = (n: number) =>
      Array.from({ length: n }, (_, i) => `#tag${i}`).join(" ");
    expect(hashtagCount(tags(MAX_HASHTAGS))).toBe(MAX_HASHTAGS);
    expect(captionProblems(tags(MAX_HASHTAGS))).toEqual([]);
    expect(captionProblems(tags(MAX_HASHTAGS + 1))[0]).toContain("31 hashtags");
    expect(hashtagCount("not a#tag, but #real and #WNYHockey!")).toBe(2);
  });

  it("is suggested from the game, with no names or numbers in it", () => {
    const base = {
      name: "Varsity vs Wheatfield",
      team_name: "Varsity",
      opponent: "Wheatfield",
      event_date: "2026-10-24",
      location: "Cazenovia Ice Rink",
      brand: "5 Star Sports Media",
      dateText: "October 24, 2026",
    };
    expect(suggestCaption(base)).toBe(
      "Varsity vs Wheatfield\nOctober 24, 2026 · Cazenovia Ice Rink\n📸 5 Star Sports Media",
    );
    expect(
      suggestCaption({ ...base, opponent: null, location: null, name: "Zac K" }),
    ).toBe("Zac K\nOctober 24, 2026\n📸 5 Star Sports Media");
    expect(captionProblems(suggestCaption(base))).toEqual([]);
  });

  it("goes in the pack's text file with one clean line ending", () => {
    expect(captionFile("a\r\nb  \n\n")).toBe("a\nb\n");
  });
});

describe("the pictures", () => {
  it("come out exactly the chosen size, as a JPEG, for each shape and fit", async () => {
    const photo = await landscapeWithGps();
    for (const format of ["portrait", "square"] as const) {
      for (const fit of ["fill", "bars"] as const) {
        const f = await makeFrame(photo, "jpeg", { format, fit });
        const m = await sharp(f.data).metadata();
        expect([m.format, m.width, m.height]).toEqual([
          "jpeg",
          FORMATS[format].width,
          FORMATS[format].height,
        ]);
        expect([f.width, f.height]).toEqual([
          FORMATS[format].width,
          FORMATS[format].height,
        ]);
        expect(f.data.length).toBeLessThan(8 * 1024 * 1024);
      }
    }
  });

  it("'fill' crops to the shape; 'bars' keeps the whole photo with dark bars", async () => {
    const photo = await landscapeWithGps(); // 3:2 landscape, blue with a white block
    const fill = await sharp(
      (await makeFrame(photo, "jpeg", { format: "portrait", fit: "fill" })).data,
    )
      .raw()
      .toBuffer({ resolveWithObject: true });
    const bars = await sharp(
      (await makeFrame(photo, "jpeg", { format: "portrait", fit: "bars" })).data,
    )
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = (
      img: { data: Buffer; info: { width: number; channels: number } },
      x: number,
      y: number,
    ) => {
      const i = (y * img.info.width + x) * img.info.channels;
      return [img.data[i], img.data[i + 1], img.data[i + 2]] as const;
    };
    // Top-left corner: blue photo when it fills; a dark bar when it is kept whole.
    const fillCorner = px(fill, 5, 5);
    const barsCorner = px(bars, 5, 5);
    expect(fillCorner[2]!).toBeGreaterThan(150); // blue
    expect(barsCorner[0]! + barsCorner[1]! + barsCorner[2]!).toBeLessThan(60); // dark bar
    // The middle of the frame is the photo either way.
    expect(px(bars, 540, 675)[2]!).toBeGreaterThan(150);
  });

  it("carry NO camera data and NO GPS location, though the original does", async () => {
    const photo = await landscapeWithGps();
    const before = await sharp(photo).metadata();
    expect(before.exif).toBeDefined(); // the test photo really has EXIF
    const f = await makeFrame(photo, "jpeg", { format: "portrait", fit: "fill" });
    const after = await sharp(f.data).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    // Belt and braces: none of the original's identifying strings are in the bytes.
    const text = f.data.toString("latin1");
    for (const needle of ["Canon", "EOS R6", "GPS", "Exif", "2026:10:24"]) {
      expect(text).not.toContain(needle);
    }
  });

  it("are upright when the camera stored the photo sideways", async () => {
    const tall = await tall0();
    expect((await sharp(tall).metadata()).orientation).toBe(6); // it really is stored sideways
    const f = await makeFrame(new Uint8Array(tall), "jpeg", {
      format: "portrait",
      fit: "bars",
    });
    // Rotated: 400 wide x 600 tall, so it fits the 4:5 frame with bars at the sides, not the top.
    const raw = await sharp(f.data).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) =>
      raw.data[(y * raw.info.width + x) * raw.info.channels]!;
    expect(at(540, 20)).toBeGreaterThan(150); // red reaches the top edge: portrait, upright
    expect(at(5, 675)).toBeLessThan(40); // dark bar at the left
  });

  it("say when a small photo had to be enlarged", async () => {
    const small = await landscapeWithGps(800, 600);
    const big = await landscapeWithGps(4000, 3000);
    expect(
      (await makeFrame(small, "jpeg", { format: "portrait", fit: "fill" })).enlarged,
    ).toBe(true);
    expect(
      (await makeFrame(big, "jpeg", { format: "portrait", fit: "fill" })).enlarged,
    ).toBe(false);
  });

  it("refuse a file that is not a picture instead of making a blank one", async () => {
    await expect(
      makeFrame(new Uint8Array([1, 2, 3, 4]), "jpeg", {
        format: "square",
        fit: "fill",
      }),
    ).rejects.toThrow();
  });
});

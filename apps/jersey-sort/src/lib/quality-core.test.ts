import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { flagsFor, measure, SOFT_BELOW, tileDetail } from "./quality-core.ts";

const W = 1200;
const H = 800;

/** A busy, high-detail picture (noise stands in for texture and edges). */
const detailed = (mean = 128) =>
  sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
      noise: { type: "gaussian", mean, sigma: 55 },
    },
  })
    .jpeg({ quality: 92 })
    .toBuffer();

const flat = (value: number) =>
  sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: value, g: value, b: value },
    },
  })
    .jpeg()
    .toBuffer();

describe("the pure part: detail in a tile", () => {
  it("a flat picture has no detail; a checkerboard has a lot", () => {
    const flatGrey = new Uint8Array(64 * 64).fill(100);
    expect(Math.max(...tileDetail(flatGrey, 64, 64))).toBe(0);
    const checker = new Uint8Array(64 * 64).map((_, i) =>
      ((i % 64) + Math.floor(i / 64)) % 2 === 0 ? 0 : 255,
    );
    expect(Math.max(...tileDetail(checker, 64, 64))).toBeGreaterThan(10_000);
  });

  it("gives one reading per tile, 16 by default", () => {
    expect(tileDetail(new Uint8Array(64 * 64), 64, 64)).toHaveLength(16);
  });
});

describe("sharpness", () => {
  it("a detailed picture is not soft, and the same picture blurred is", async () => {
    const sharpImage = await detailed();
    const blurred = await sharp(sharpImage).blur(9).jpeg().toBuffer();
    const a = await measure(sharpImage);
    const b = await measure(blurred);
    expect(a.sharpness).toBeGreaterThan(SOFT_BELOW * 5);
    expect(b.sharpness).toBeLessThan(SOFT_BELOW);
    expect(flagsFor(a, W)).not.toContain("soft");
    expect(flagsFor(b, W)).toContain("soft");
  });

  it("a sharp player against a deliberately blurred background is NOT called soft", async () => {
    // Whole picture smooth, except one tile-sized patch of real detail: the sharpest tile decides.
    const patch = await sharp({
      create: {
        width: 260,
        height: 190,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
        noise: { type: "gaussian", mean: 128, sigma: 60 },
      },
    })
      .png()
      .toBuffer();
    const scene = await sharp({
      create: {
        width: W,
        height: H,
        channels: 3,
        background: { r: 90, g: 120, b: 160 },
      },
    })
      .composite([{ input: patch, left: 500, top: 300 }])
      .jpeg({ quality: 92 })
      .toBuffer();
    const r = await measure(scene);
    expect(flagsFor(r, W)).not.toContain("soft");
  });

  it("sharpness is judged at one scale: the same picture at a different size gets the same verdict", async () => {
    const big = await detailed();
    const small = await sharp(big).resize({ width: 500 }).jpeg().toBuffer();
    expect(flagsFor(await measure(big), W)).toEqual(flagsFor(await measure(small), W));
  });
});

describe("brightness and size", () => {
  it("a very dark picture and a very bright one are flagged; a normal one is not", async () => {
    expect(flagsFor(await measure(await flat(10)), W)).toContain("dark");
    expect(flagsFor(await measure(await flat(250)), W)).toContain("bright");
    const normal = await measure(await detailed(128));
    expect(flagsFor(normal, W)).not.toContain("dark");
    expect(flagsFor(normal, W)).not.toContain("bright");
  });

  it("a night game that is simply dim is not flagged as very dark", async () => {
    expect(flagsFor(await measure(await detailed(80)), W)).not.toContain("dark");
  });

  it("a photo whose long side is under 1600 px is flagged low resolution; unknown size is not", async () => {
    const r = await measure(await detailed());
    expect(flagsFor(r, 1599)).toContain("small");
    expect(flagsFor(r, 1600)).not.toContain("small");
    expect(flagsFor(r, null)).not.toContain("small");
  });

  it("a photo can have several flags at once", async () => {
    const dim = await measure(
      await sharp(await flat(10))
        .blur(3)
        .jpeg()
        .toBuffer(),
    );
    expect(flagsFor(dim, 800).sort()).toEqual(["dark", "small", "soft"]);
  });

  it("reads an upright and a sideways photo the same way (it honours the camera's rotation)", async () => {
    const base = await detailed();
    const sideways = await sharp(base)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const a = await measure(base);
    const b = await measure(sideways);
    expect(Math.abs(a.brightness - b.brightness)).toBeLessThan(3);
  });
});

import { DEFAULT_THRESHOLDS, analyzePhoto } from "@hl-bos/jersey-sort";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import { createLocalOcrProvider, shutdownLocalOcr } from "./ocr.ts";

async function scene(): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1067">
    <rect width="1600" height="1067" fill="#2e7d32"/>
    <rect width="1600" height="200" fill="#90a4ae"/>
    <rect x="1150" y="20" width="420" height="140" fill="#111"/>
    <text x="1180" y="125" font-family="DejaVu Sans" font-weight="bold" font-size="100" fill="#ffcc00">14 21</text>
    <rect x="600" y="380" width="230" height="330" rx="30" fill="#c62828"/>
    <text x="715" y="610" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="170" fill="#fff">24</text>
  </svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).jpeg().toBuffer());
}

describe("local OCR provider (real tesseract, real image)", () => {
  afterAll(async () => {
    await shutdownLocalOcr();
  });

  it("reads the jersey number, does not file the scoreboard, and sends it to review", async () => {
    const out = await analyzePhoto(
      createLocalOcrProvider(),
      { bytes: await scene(), mimeType: "image/jpeg", width: 1600, height: 1067 },
      DEFAULT_THRESHOLDS,
    );
    const filed = out.detections
      .filter((d) => d.confidence >= DEFAULT_THRESHOLDS.medium)
      .map((d) => d.value);
    expect(filed).toContain("24");
    expect(filed).not.toContain("14");
    expect(filed).not.toContain("21");
    expect(Math.max(...out.detections.map((d) => d.confidence))).toBeLessThanOrEqual(
      0.8,
    );
    expect(out.status).toBe("needs_review");
    expect(out.athletesPresent).toBeNull();
  }, 30_000);
});

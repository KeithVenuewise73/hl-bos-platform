import { describe, expect, it } from "vitest";

import { interpretReadings } from "./context.ts";
import type { ProviderReading } from "./types.ts";

const r = (
  text: string,
  confidence: number,
  location: ProviderReading["location"],
  box: ProviderReading["box"] = null,
): ProviderReading => ({
  text,
  confidence,
  location,
  box,
});

describe("interpretReadings with a provider that sees context", () => {
  it("keeps jersey numbers and refuses the scoreboard, yard line and clock", () => {
    const out = interpretReadings(
      [
        r("24", 0.94, "jersey_back"),
        r("18", 0.78, "jersey_front"),
        r("14", 0.99, "scoreboard"),
        r("30", 0.97, "yard_marker"),
        r("12", 0.9, "clock"),
        r("50", 0.9, "field_marking"),
        r("716", 0.9, "advertising"),
      ],
      { method: "vision_model" },
    );
    expect(out.detections.map((d) => d.value)).toEqual(["24", "18"]);
    expect(out.rejected.map((x) => x.text)).toEqual(["14", "30", "12", "50", "716"]);
    expect(out.rejected[0]?.reason).toContain("scoreboard");
  });

  it("files a photo with three athletes under all three numbers", () => {
    const out = interpretReadings(
      [
        r("#24", 0.94, "jersey_back"),
        r("18", 0.78, "shoulder"),
        r("52", 0.62, "helmet"),
      ],
      { method: "vision_model" },
    );
    expect(out.detections.map((d) => [d.value, d.confidence])).toEqual([
      ["24", 0.94],
      ["18", 0.78],
      ["52", 0.62],
    ]);
  });

  it("counts the same number seen twice once, at the stronger reading", () => {
    const out = interpretReadings(
      [r("24", 0.7, "jersey_front"), r("24", 0.91, "jersey_back")],
      { method: "vision_model" },
    );
    expect(out.detections).toHaveLength(1);
    expect(out.detections[0]?.confidence).toBe(0.91);
  });

  it("refuses three-digit numbers even on a uniform", () => {
    const out = interpretReadings([r("100", 0.95, "jersey_front")], {
      method: "vision_model",
    });
    expect(out.detections).toHaveLength(0);
    expect(out.rejected[0]?.reason).toContain("one or two digits");
  });

  it("clamps confidence a provider reports outside 0..1", () => {
    const out = interpretReadings([r("7", 1.7, "jersey_front")], {
      method: "vision_model",
    });
    expect(out.detections[0]?.confidence).toBe(1);
  });

  it("drops readings too faint to be useful", () => {
    const out = interpretReadings([r("7", 0.05, "jersey_front")], {
      method: "vision_model",
    });
    expect(out.detections).toHaveLength(0);
  });
});

describe("interpretReadings with plain OCR (location unknown)", () => {
  it("never auto-files: crisp OCR digits are capped inside the review band", () => {
    const out = interpretReadings(
      [r("24", 0.99, "unknown", { x: 0.3, y: 0.4, width: 0.1, height: 0.1 })],
      {
        method: "ocr",
      },
    );
    expect(out.detections[0]?.confidence).toBe(0.8);
  });

  it("halves digits along the top edge, where scoreboards are", () => {
    const out = interpretReadings(
      [r("21", 0.9, "unknown", { x: 0.75, y: 0.04, width: 0.1, height: 0.07 })],
      {
        method: "ocr",
      },
    );
    expect(out.detections[0]?.confidence).toBe(0.45);
  });

  it("discounts a low 30 as a probable yard marker, without discarding a real #30", () => {
    const out = interpretReadings(
      [r("30", 0.95, "unknown", { x: 0.1, y: 0.85, width: 0.07, height: 0.07 })],
      {
        method: "ocr",
      },
    );
    expect(out.detections[0]?.value).toBe("30");
    expect(out.detections[0]?.confidence).toBeCloseTo(0.57, 2);
  });

  it("discounts tiny digits", () => {
    const out = interpretReadings(
      [r("8", 0.9, "unknown", { x: 0.5, y: 0.5, width: 0.01, height: 0.01 })],
      {
        method: "ocr",
      },
    );
    expect(out.detections[0]?.confidence).toBeCloseTo(0.54, 2);
  });

  it("a provider that understands context can lift the cap", () => {
    const out = interpretReadings([r("24", 0.99, "unknown")], {
      method: "vision_model",
      unknownLocationCap: 1,
    });
    expect(out.detections[0]?.confidence).toBe(0.99);
  });
});

/**
 * Panel detection against a REAL image file.
 *
 * The rest of the suite uses synthetic grids, which prove the algorithm but not
 * that it survives artwork — soft edges, textured gutters, lettering, shadows.
 * This runs the same detector against a file on disk when one is pointed at it,
 * and is skipped otherwise so CI never depends on a binary in the repository.
 *
 *   HLBOS_VIDEO_FIXTURE=/path/to/page.png pnpm --filter @hl-bos/video-studio test
 *
 * Set HLBOS_VIDEO_EXPECT_PANELS to assert an exact panel count.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { detectPanels } from "./panels";
import { decodePng } from "./png";
import { buildStoryboard } from "./storyboard";
import { composeFrame, totalDurationMs } from "./timeline";

const fixture = process.env["HLBOS_VIDEO_FIXTURE"];
const expected = process.env["HLBOS_VIDEO_EXPECT_PANELS"];

describe.skipIf(!fixture)("detection against a real image", () => {
  it("finds panels and produces a valid storyboard", () => {
    const image = decodePng(readFileSync(fixture as string));
    const detection = detectPanels(image);
    const storyboard = buildStoryboard(detection);
    const duration = totalDurationMs(storyboard);

    // Printed on purpose: this test exists to be read by a human.
    console.log(
      [
        `image      ${image.width} x ${image.height}`,
        `detection  ${detection.note}`,
        ...detection.panels.map(
          (p) =>
            `  panel ${p.index + 1}  row ${p.row} col ${p.column}  ` +
            `x=${p.bounds.x} y=${p.bounds.y} w=${p.bounds.width} h=${p.bounds.height}`,
        ),
        `storyboard ${storyboard.shots.length} shots, ${(duration / 1000).toFixed(1)}s`,
      ].join("\n"),
    );

    expect(detection.panels.length).toBeGreaterThan(0);
    if (expected) expect(detection.panels.length).toBe(Number(expected));
    expect(duration).toBeGreaterThan(0);

    // Every frame must reference pixels that exist.
    for (let i = 0; i <= 200; i += 1) {
      const frame = composeFrame(storyboard, (duration * i) / 200);
      expect(frame.layers.length).toBeGreaterThan(0);
      for (const layer of frame.layers) {
        expect(layer.source.x).toBeGreaterThanOrEqual(0);
        expect(layer.source.y).toBeGreaterThanOrEqual(0);
        expect(layer.source.x + layer.source.width).toBeLessThanOrEqual(
          image.width + 1e-6,
        );
        expect(layer.source.y + layer.source.height).toBeLessThanOrEqual(
          image.height + 1e-6,
        );
      }
    }
  });
});

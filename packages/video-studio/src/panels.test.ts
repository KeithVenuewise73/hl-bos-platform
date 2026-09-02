import { describe, expect, it } from "vitest";

import {
  DEFAULT_PANEL_OPTIONS,
  contentStrips,
  detectPanels,
  separatorBands,
} from "./panels";
import { makeGridImage, makeNoiseImage } from "./test-images";

describe("separatorBands", () => {
  it("merges runs that are only a pixel or two apart", () => {
    // border | anti-aliased pixel | gutter | anti-aliased pixel | border
    const profile = [0, 0, 1, 1, 0.2, 1, 1, 1, 0.2, 1, 1, 0, 0];
    expect(
      separatorBands(profile, { ...DEFAULT_PANEL_OPTIONS, minBandThickness: 3 }),
    ).toEqual([{ start: 2, end: 10 }]);
  });

  it("drops runs thinner than the minimum", () => {
    const profile = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(separatorBands(profile, { ...DEFAULT_PANEL_OPTIONS, mergeGap: 0 })).toEqual(
      [],
    );
  });
});

describe("contentStrips", () => {
  it("returns the gaps between separator bands", () => {
    const strips = contentStrips(
      [
        { start: 0, end: 4 },
        { start: 55, end: 60 },
      ],
      100,
      {
        ...DEFAULT_PANEL_OPTIONS,
        minPanelFraction: 0.1,
      },
    );
    expect(strips).toEqual([
      { start: 5, end: 55 },
      { start: 61, end: 100 },
    ]);
  });

  it("discards strips too thin to be a panel", () => {
    const strips = contentStrips([{ start: 2, end: 4 }], 100, {
      ...DEFAULT_PANEL_OPTIONS,
      minPanelFraction: 0.1,
    });
    // The 2px strip before the band is noise; the 95px strip after it is a panel.
    expect(strips).toEqual([{ start: 5, end: 100 }]);
  });
});

describe("detectPanels", () => {
  it("finds a 3 x 2 grid and numbers it in reading order", () => {
    const image = makeGridImage({
      columns: 3,
      rows: 2,
      panelWidth: 160,
      panelHeight: 120,
      gutter: 10,
      seed: 42,
    });
    const detection = detectPanels(image);

    expect(detection.method).toBe("grid");
    expect(detection.columns).toBe(3);
    expect(detection.rows).toBe(2);
    expect(detection.panels).toHaveLength(6);
    expect(detection.panels.map((p) => [p.row, p.column])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
  });

  it("puts each panel's bounds where the panel actually is", () => {
    const spec = {
      columns: 3,
      rows: 2,
      panelWidth: 160,
      panelHeight: 120,
      gutter: 10,
      seed: 42,
    } as const;
    const detection = detectPanels(makeGridImage(spec));
    const first = detection.panels[0];
    const last = detection.panels[5];

    // Detection reads the boundary from pixels, so allow the gutter's width of
    // slack rather than demanding an exact pixel.
    expect(first?.bounds.x).toBeGreaterThanOrEqual(0);
    expect(first?.bounds.x).toBeLessThanOrEqual(spec.gutter);
    expect(first?.bounds.width).toBeGreaterThanOrEqual(spec.panelWidth - spec.gutter);
    expect(first?.bounds.width).toBeLessThanOrEqual(spec.panelWidth + spec.gutter);
    expect(last?.bounds.y).toBeGreaterThan(spec.panelHeight);
  });

  it("does not invent panels in an image that has none", () => {
    const detection = detectPanels(makeNoiseImage(200, 200));
    expect(detection.method).toBe("whole-image");
    expect(detection.panels).toHaveLength(1);
    expect(detection.note).toContain("No panel grid found");
  });

  it("refuses to guess on an image too small to analyse", () => {
    const detection = detectPanels(makeNoiseImage(4, 4));
    expect(detection.method).toBe("whole-image");
    expect(detection.note).toContain("too small");
  });

  it("handles a single column strip (a vertical strip cartoon)", () => {
    const detection = detectPanels(
      makeGridImage({
        columns: 1,
        rows: 4,
        panelWidth: 200,
        panelHeight: 100,
        gutter: 8,
        seed: 3,
      }),
    );
    expect(detection.method).toBe("grid");
    expect(detection.columns).toBe(1);
    expect(detection.rows).toBe(4);
  });
});

import type { Panel, PanelDetection, RasterImage, Rect, SeparatorBand } from "./types";

export interface PanelDetectionOptions {
  /**
   * How uniform a row or column must be before it counts as a separator.
   * 0.92 means: 92% of its sampled pixels sit within `tolerance` of that
   * line's own mean colour.
   */
  readonly uniformity: number;
  /** Per-channel distance from the line mean that still counts as "the same". */
  readonly tolerance: number;
  /** Sample every Nth pixel along a line. 2 is plenty and roughly halves the work. */
  readonly sampleStep: number;
  /**
   * Separator runs closer together than this are treated as one separator.
   * A drawn border is usually dark line + light gutter + dark line, with an
   * anti-aliased pixel between each; without merging, that reads as three.
   */
  readonly mergeGap: number;
  /** Ignore separator runs thinner than this. Kills single-line noise. */
  readonly minBandThickness: number;
  /**
   * Content strips thinner than this fraction of the image are not panels.
   * Stops a decorative border from being promoted to a row of its own.
   */
  readonly minPanelFraction: number;
}

export const DEFAULT_PANEL_OPTIONS: PanelDetectionOptions = {
  uniformity: 0.92,
  tolerance: 34,
  sampleStep: 2,
  mergeGap: 4,
  minBandThickness: 3,
  minPanelFraction: 0.06,
};

/**
 * How uniform each row (axis "row") or column (axis "column") of the image is.
 *
 * A separator between panels — a white gutter, a black rule, a coloured frame —
 * is uniform along its whole length. Artwork is not. Measuring uniformity
 * rather than "is it white" is what lets this work on a dark comic, a light
 * one, or a screenshot grid, without a per-image threshold.
 */
export function uniformityProfile(
  image: RasterImage,
  axis: "row" | "column",
  options: PanelDetectionOptions = DEFAULT_PANEL_OPTIONS,
): number[] {
  const { width, height, data } = image;
  const lines = axis === "row" ? height : width;
  const alongLength = axis === "row" ? width : height;
  const step = Math.max(1, Math.floor(options.sampleStep));
  const profile: number[] = new Array<number>(lines).fill(0);

  for (let line = 0; line < lines; line += 1) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let samples = 0;
    for (let along = 0; along < alongLength; along += step) {
      const x = axis === "row" ? along : line;
      const y = axis === "row" ? line : along;
      const offset = (y * width + x) * 4;
      sumR += data[offset] ?? 0;
      sumG += data[offset + 1] ?? 0;
      sumB += data[offset + 2] ?? 0;
      samples += 1;
    }
    if (samples === 0) continue;
    const meanR = sumR / samples;
    const meanG = sumG / samples;
    const meanB = sumB / samples;

    let near = 0;
    for (let along = 0; along < alongLength; along += step) {
      const x = axis === "row" ? along : line;
      const y = axis === "row" ? line : along;
      const offset = (y * width + x) * 4;
      if (
        Math.abs((data[offset] ?? 0) - meanR) <= options.tolerance &&
        Math.abs((data[offset + 1] ?? 0) - meanG) <= options.tolerance &&
        Math.abs((data[offset + 2] ?? 0) - meanB) <= options.tolerance
      ) {
        near += 1;
      }
    }
    profile[line] = near / samples;
  }
  return profile;
}

/** Collapse a uniformity profile into merged separator bands. */
export function separatorBands(
  profile: readonly number[],
  options: PanelDetectionOptions = DEFAULT_PANEL_OPTIONS,
): SeparatorBand[] {
  const raw: Array<{ start: number; end: number }> = [];
  let open: number | null = null;
  for (let i = 0; i < profile.length; i += 1) {
    const uniform = (profile[i] ?? 0) >= options.uniformity;
    if (uniform && open === null) open = i;
    else if (!uniform && open !== null) {
      raw.push({ start: open, end: i - 1 });
      open = null;
    }
  }
  if (open !== null) raw.push({ start: open, end: profile.length - 1 });

  const merged: Array<{ start: number; end: number }> = [];
  for (const band of raw) {
    const last = merged[merged.length - 1];
    if (last && band.start - last.end - 1 <= options.mergeGap) last.end = band.end;
    else merged.push({ ...band });
  }
  return merged.filter((b) => b.end - b.start + 1 >= options.minBandThickness);
}

/**
 * The content strips left between separator bands, as [start, endExclusive).
 * Strips thinner than `minPanelFraction` of the extent are discarded.
 */
export function contentStrips(
  bands: readonly SeparatorBand[],
  extent: number,
  options: PanelDetectionOptions = DEFAULT_PANEL_OPTIONS,
): Array<{ start: number; end: number }> {
  const minimum = extent * options.minPanelFraction;
  const strips: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const band of bands) {
    if (band.start > cursor) strips.push({ start: cursor, end: band.start });
    cursor = Math.max(cursor, band.end + 1);
  }
  if (cursor < extent) strips.push({ start: cursor, end: extent });
  return strips.filter((s) => s.end - s.start >= minimum);
}

/**
 * Find the panels in a composite image.
 *
 * When no grid can be found this does NOT guess. It returns the whole image as
 * a single panel and says so in `note`, so the operator sees the truth instead
 * of six invented rectangles.
 */
export function detectPanels(
  image: RasterImage,
  options: PanelDetectionOptions = DEFAULT_PANEL_OPTIONS,
): PanelDetection {
  const source = { width: image.width, height: image.height };
  const whole = (note: string): PanelDetection => ({
    panels: [
      {
        id: "panel-1",
        index: 0,
        row: 0,
        column: 0,
        bounds: { x: 0, y: 0, width: image.width, height: image.height },
      },
    ],
    rows: 1,
    columns: 1,
    method: "whole-image",
    note,
    source,
    rowBands: [],
    columnBands: [],
  });

  if (image.width < 8 || image.height < 8) {
    return whole(
      "The image is too small to look for panels in. Treating it as one shot.",
    );
  }

  const rowBands = separatorBands(uniformityProfile(image, "row", options), options);
  const columnBands = separatorBands(
    uniformityProfile(image, "column", options),
    options,
  );
  const rowStrips = contentStrips(rowBands, image.height, options);
  const columnStrips = contentStrips(columnBands, image.width, options);

  if (rowStrips.length * columnStrips.length < 2) {
    return whole(
      "No panel grid found — no gutters run the full width or height. Treating the whole image as one shot.",
    );
  }

  const panels: Panel[] = [];
  let index = 0;
  for (let r = 0; r < rowStrips.length; r += 1) {
    for (let c = 0; c < columnStrips.length; c += 1) {
      const rowStrip = rowStrips[r];
      const columnStrip = columnStrips[c];
      if (!rowStrip || !columnStrip) continue;
      const bounds: Rect = {
        x: columnStrip.start,
        y: rowStrip.start,
        width: columnStrip.end - columnStrip.start,
        height: rowStrip.end - rowStrip.start,
      };
      panels.push({ id: `panel-${index + 1}`, index, row: r, column: c, bounds });
      index += 1;
    }
  }

  const rows = rowStrips.length;
  const columns = columnStrips.length;
  return {
    panels,
    rows,
    columns,
    method: "grid",
    note: `Found ${panels.length} panels in a ${columns} x ${rows} grid (${columns} across, ${rows} down).`,
    source,
    rowBands,
    columnBands,
  };
}

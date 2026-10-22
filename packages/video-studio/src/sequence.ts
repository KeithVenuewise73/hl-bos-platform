import type { Panel, PanelDetection, Rect } from "./types";

/**
 * Several separate photos played in order, as one video.
 *
 * The rest of this package works on ONE source image cut into panels. Rather
 * than teach every stage about many images, the host paints the photos onto a
 * single contact sheet laid out here, and this module hands back a detection
 * whose panels are exactly where each photo was painted. Panel detection is not
 * run at all: we already know where every photo is, and guessing it from pixels
 * could only get it wrong.
 */

export interface SequenceOptions {
  /**
   * Each photo is scaled so its long edge is at most this. Big enough that a
   * 1080p push-in stays sharp, small enough that a dozen camera-size photos
   * still fit on one canvas without exhausting the browser.
   */
  readonly maxEdge: number;
  /** Empty pixels between photos, so smoothing never bleeds one into the next. */
  readonly gap: number;
  readonly maxPhotos: number;
}

export const DEFAULT_SEQUENCE_OPTIONS: SequenceOptions = {
  maxEdge: 1920,
  gap: 16,
  maxPhotos: 12,
};

export interface PhotoSize {
  readonly width: number;
  readonly height: number;
}

export interface SequenceLayout {
  readonly width: number;
  readonly height: number;
  /** Where each photo is painted on the sheet, in the order given. */
  readonly placements: readonly Rect[];
}

/** Lay photos out on a grid, each scaled down (never up) to `maxEdge`. */
export function layoutSequence(
  photos: readonly PhotoSize[],
  options: Partial<SequenceOptions> = {},
): SequenceLayout {
  const o: SequenceOptions = { ...DEFAULT_SEQUENCE_OPTIONS, ...options };
  if (photos.length === 0) throw new Error("No photos were given.");
  if (photos.length > o.maxPhotos)
    throw new Error(
      `That is ${photos.length} photos. Up to ${o.maxPhotos} can go into one video.`,
    );

  const sizes = photos.map((photo) => {
    if (!(photo.width > 0 && photo.height > 0))
      throw new Error("One of the photos has no size.");
    const scale = Math.min(1, o.maxEdge / Math.max(photo.width, photo.height));
    return {
      width: Math.max(1, Math.round(photo.width * scale)),
      height: Math.max(1, Math.round(photo.height * scale)),
    };
  });

  const columns = Math.ceil(Math.sqrt(sizes.length));
  const rows = Math.ceil(sizes.length / columns);
  const cellWidth = Math.max(...sizes.map((s) => s.width));
  const cellHeight = Math.max(...sizes.map((s) => s.height));

  const placements = sizes.map((size, i) => ({
    x: (i % columns) * (cellWidth + o.gap),
    y: Math.floor(i / columns) * (cellHeight + o.gap),
    width: size.width,
    height: size.height,
  }));

  return {
    width: columns * cellWidth + (columns - 1) * o.gap,
    height: rows * cellHeight + (rows - 1) * o.gap,
    placements,
  };
}

/**
 * The detection for a laid-out sequence, with the photos in `order`.
 *
 * `order` lists photo positions (indexes into the layout) in the order they
 * should play. Reordering the photos only reorders the panels; the sheet is not
 * repainted. Panel ids follow the PHOTO, not its slot, so a caption or camera
 * move stays with the photo it was written for when the photo is moved.
 */
export function sequenceDetection(
  layout: SequenceLayout,
  order: readonly number[] = layout.placements.map((_, i) => i),
): PanelDetection {
  const seen = new Set<number>();
  const panels: Panel[] = order.map((photo, index) => {
    const bounds = layout.placements[photo];
    if (!bounds || seen.has(photo))
      throw new Error(`The play order names photo ${photo + 1} twice or not at all.`);
    seen.add(photo);
    return { id: `panel-photo-${photo + 1}`, index, row: 0, column: index, bounds };
  });

  const count = panels.length;
  return {
    panels,
    rows: 1,
    columns: count,
    method: "sequence",
    note:
      count === 1
        ? "1 photo. Add more to play several in a row."
        : `${count} photos, played in the order shown. Use the arrows to change the order. The camera moves over each photo; the people in them do not move.`,
    source: { width: layout.width, height: layout.height },
    rowBands: [],
    columnBands: [],
  };
}

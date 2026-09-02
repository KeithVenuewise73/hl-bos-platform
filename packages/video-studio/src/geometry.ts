import type { Rect } from "./types";

/** Clamp `v` into [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

/** Linear interpolation between two rectangles. */
export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  const l = (from: number, to: number): number => from + (to - from) * t;
  return {
    x: l(a.x, b.x),
    y: l(a.y, b.y),
    width: l(a.width, b.width),
    height: l(a.height, b.height),
  };
}

/**
 * The largest rectangle of the given aspect ratio that fits inside `outer`,
 * centred on `outer`.
 *
 * This is how a panel becomes a shot: the panel is whatever shape the artist
 * drew, the video is 16:9, and something has to give. We crop rather than
 * letterbox — black bars around a comic panel look like a bug, not a choice.
 */
export function cropToAspect(outer: Rect, aspect: number): Rect {
  const outerAspect = outer.width / outer.height;
  if (outerAspect > aspect) {
    const width = outer.height * aspect;
    return {
      x: outer.x + (outer.width - width) / 2,
      y: outer.y,
      width,
      height: outer.height,
    };
  }
  const height = outer.width / aspect;
  return {
    x: outer.x,
    y: outer.y + (outer.height - height) / 2,
    width: outer.width,
    height,
  };
}

/**
 * The smallest rectangle of the given aspect ratio that CONTAINS `outer`,
 * centred on it and then pushed back inside `bounds`.
 *
 * Used for the establishing shot, where the whole image must be visible; the
 * caller pads `bounds` so the result can legitimately exceed the image.
 */
export function coverToAspect(outer: Rect, aspect: number): Rect {
  const outerAspect = outer.width / outer.height;
  if (outerAspect < aspect) {
    const width = outer.height * aspect;
    return {
      x: outer.x + (outer.width - width) / 2,
      y: outer.y,
      width,
      height: outer.height,
    };
  }
  const height = outer.width / aspect;
  return {
    x: outer.x,
    y: outer.y + (outer.height - height) / 2,
    width: outer.width,
    height,
  };
}

/** Scale a rectangle about a point expressed in 0..1 of its own extent. */
export function scaleRect(r: Rect, factor: number, anchorX = 0.5, anchorY = 0.5): Rect {
  const width = r.width * factor;
  const height = r.height * factor;
  return {
    x: r.x + (r.width - width) * anchorX,
    y: r.y + (r.height - height) * anchorY,
    width,
    height,
  };
}

/**
 * Slide `inner` back inside `bounds` without resizing it.
 *
 * If it is genuinely too big to fit it is centred instead, because a camera
 * move that clips off the edge of the artwork is worse than one that shows a
 * little more than intended.
 */
export function containRect(inner: Rect, bounds: Rect): Rect {
  if (inner.width > bounds.width || inner.height > bounds.height) {
    return {
      x: bounds.x + (bounds.width - inner.width) / 2,
      y: bounds.y + (bounds.height - inner.height) / 2,
      width: inner.width,
      height: inner.height,
    };
  }
  return {
    x: clamp(inner.x, bounds.x, bounds.x + bounds.width - inner.width),
    y: clamp(inner.y, bounds.y, bounds.y + bounds.height - inner.height),
    width: inner.width,
    height: inner.height,
  };
}

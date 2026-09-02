import type { EasingName } from "./types";

/** Named easing curves. Each maps 0..1 to 0..1 with f(0)=0 and f(1)=1. */
export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  "ease-in": (t) => t * t,
  "ease-out": (t) => 1 - (1 - t) * (1 - t),
  "ease-in-out": (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
};

export function ease(name: EasingName, t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return EASINGS[name](clamped);
}

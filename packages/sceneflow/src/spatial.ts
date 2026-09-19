// The spatial map (section 14).
//
// Semantic, not geometric. Seven foreground slots and three background slots,
// which is enough to stop a cast of eight teleporting between scenes and not so
// much that it pretends to a 3D reconstruction the MVP does not do.

import {
  BACKGROUND_SLOTS,
  FOREGROUND_SLOTS,
  type CastMemberId,
  type SpatialMap,
  type SpatialSlot,
} from "./types.js";

const FOREGROUND_ORDER: Readonly<Record<SpatialSlot, number>> = {
  "far-left": 0,
  left: 1,
  "center-left": 2,
  center: 3,
  "center-right": 4,
  right: 5,
  "far-right": 6,
  "background-left": 0,
  "background-center": 1,
  "background-right": 2,
};

export function isBackground(slot: SpatialSlot): boolean {
  return BACKGROUND_SLOTS.includes(slot);
}

/**
 * Spread a cast across the frame, centre-outwards.
 *
 * Centre-outwards rather than left-to-right so a cast of two lands on
 * center-left / center-right — a couple standing together — instead of at
 * opposite edges of the frame with a hole between them.
 */
export function defaultSpatialMap(cast: readonly CastMemberId[]): SpatialMap {
  const order: readonly SpatialSlot[] = [
    "center",
    "center-left",
    "center-right",
    "left",
    "right",
    "far-left",
    "far-right",
  ];
  const twoUp: readonly SpatialSlot[] = ["center-left", "center-right"];
  const slots = cast.length === 2 ? twoUp : order;

  const map: Record<string, SpatialSlot> = {};
  cast.forEach((id, index) => {
    const slot = slots[index] ?? BACKGROUND_SLOTS[(index - slots.length) % 3];
    /* c8 ignore next -- the modulo always lands inside BACKGROUND_SLOTS */
    if (!slot) return;
    map[id] = slot;
  });
  return map;
}

export interface SpatialIssue {
  readonly code: "unknown_member" | "slot_overcrowded" | "missing_placement";
  readonly detail: string;
}

/**
 * Check a map against the cast it claims to place.
 *
 * Overcrowding is a warning, not an error: three people can genuinely share
 * "background-center" in a wide shot. More than three in one slot is where a
 * spatial map stops describing a photograph.
 */
export function validateSpatialMap(
  map: SpatialMap,
  cast: readonly CastMemberId[],
): readonly SpatialIssue[] {
  const issues: SpatialIssue[] = [];
  const castSet = new Set(cast);
  const occupancy = new Map<SpatialSlot, number>();

  for (const [id, slot] of Object.entries(map) as [CastMemberId, SpatialSlot][]) {
    if (!castSet.has(id)) {
      issues.push({ code: "unknown_member", detail: id });
      continue;
    }
    occupancy.set(slot, (occupancy.get(slot) ?? 0) + 1);
  }

  for (const id of cast) {
    if (map[id] === undefined) issues.push({ code: "missing_placement", detail: id });
  }

  for (const [slot, count] of occupancy) {
    if (count > 3) {
      issues.push({ code: "slot_overcrowded", detail: `${slot}:${count}` });
    }
  }

  return issues;
}

/**
 * Render the map the way the prompt states it (section 14's BACK/FRONT sketch).
 * Ordered left to right within each row so the generator reads a layout rather
 * than an unordered set.
 */
export function renderSpatialMap(
  map: SpatialMap,
  labelOf: (id: CastMemberId) => string,
): string {
  const entries = Object.entries(map) as [CastMemberId, SpatialSlot][];
  const back = entries.filter(([, slot]) => isBackground(slot));
  const front = entries.filter(([, slot]) => !isBackground(slot));

  const sort = (rows: [CastMemberId, SpatialSlot][]) =>
    [...rows].sort((a, b) => FOREGROUND_ORDER[a[1]] - FOREGROUND_ORDER[b[1]]);

  const line = (rows: [CastMemberId, SpatialSlot][]) =>
    sort(rows)
      .map(([id, slot]) => `${labelOf(id)} ${slot}`)
      .join(", ");

  const out: string[] = [];
  if (back.length > 0) out.push(`BACK: ${line(back)}`);
  if (front.length > 0) out.push(`FRONT: ${line(front)}`);
  return out.join("\n");
}

/** Move one subject, leaving everyone else where they are. */
export function place(
  map: SpatialMap,
  id: CastMemberId,
  slot: SpatialSlot,
): SpatialMap {
  return { ...map, [id]: slot };
}

/** Bring the focus characters together towards the centre (GROUP CLOSENESS). */
export function closeDistance(
  map: SpatialMap,
  focus: readonly CastMemberId[],
): SpatialMap {
  const next: Record<string, SpatialSlot> = { ...map };
  const targets: readonly SpatialSlot[] = ["center-left", "center", "center-right"];
  focus.forEach((id, index) => {
    const slot = targets[index % targets.length];
    /* c8 ignore next -- the modulo always lands inside targets */
    if (!slot) return;
    next[id] = slot;
  });
  return next;
}

export const ALL_SLOTS: readonly SpatialSlot[] = [
  ...FOREGROUND_SLOTS,
  ...BACKGROUND_SLOTS,
];

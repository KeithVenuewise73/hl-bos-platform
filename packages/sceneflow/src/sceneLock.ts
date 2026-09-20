// SceneLock (section 13) and the inheritance rule that makes continuity real.
//
// Defaults KEEP everything. That is the product: "the result should appear to
// have been photographed minutes after the previous scene." A user unlocks the
// one attribute they want to change, and everything else is carried forward
// from the parent scene rather than re-invented.

import type {
  CameraState,
  CastMemberId,
  EnvironmentState,
  SceneChangeRequest,
  SceneLock,
  SceneState,
  SpatialMap,
  WardrobeMap,
} from "./types";

/** Everything locked. The state a new story starts in. */
export const DEFAULT_SCENE_LOCK: SceneLock = {
  characters: true,
  room: true,
  wardrobe: true,
  lighting: true,
  timeOfDay: true,
  visualStyle: true,
  camera: true,
  positions: true,
};

/** Which attributes the user may unlock. `characters` is absent on purpose. */
export type UnlockableAttribute = Exclude<keyof SceneLock, "characters">;

/**
 * Identity is not unlockable.
 *
 * Section 30: "Character identity should have highest preservation priority."
 * If a user could unlock `characters`, the one guarantee separating this product
 * from a generic image generator would be a checkbox — and unlocking identity on
 * a photograph of a real person is how you end up with a different real person.
 */
export function unlock(lock: SceneLock, attribute: UnlockableAttribute): SceneLock {
  return { ...lock, [attribute]: false };
}

export function relock(lock: SceneLock, attribute: UnlockableAttribute): SceneLock {
  return { ...lock, [attribute]: true };
}

/**
 * A user's explicit change implies an unlock. Asking for a new location while
 * "Room" is still ticked is a contradiction, and resolving it in favour of the
 * lock would silently discard what they asked for.
 */
export function lockFromChanges(
  lock: SceneLock,
  changes: SceneChangeRequest,
): SceneLock {
  let next = lock;
  if (changes.environment !== undefined) {
    next = { ...next, room: false };
    if (changes.environment.lighting !== undefined) next = { ...next, lighting: false };
    if (changes.environment.timeOfDay !== undefined)
      next = { ...next, timeOfDay: false };
  }
  if (changes.wardrobe !== undefined) next = { ...next, wardrobe: false };
  if (changes.camera !== undefined) next = { ...next, camera: false };
  if (changes.positions !== undefined) next = { ...next, positions: false };
  return next;
}

/**
 * Resolve the next scene's attributes from the parent scene, the lock and the
 * user's explicit changes.
 *
 * The precedence, in order:
 *   1. Explicit user change wins over everything except identity.
 *   2. A locked attribute is inherited verbatim from the parent.
 *   3. An unlocked attribute with no explicit change is left to the generator.
 */
export interface ResolvedAttributes {
  readonly environment: EnvironmentState;
  readonly wardrobe: WardrobeMap;
  readonly camera: CameraState;
  readonly positions: SpatialMap;
  readonly mood: string;
  readonly photoStyle: string;
  /** Attributes the generator is free to vary, for the prompt to say so. */
  readonly free: readonly UnlockableAttribute[];
}

export function resolveAttributes(
  parent: SceneState,
  lock: SceneLock,
  changes: SceneChangeRequest,
): ResolvedAttributes {
  const effective = lockFromChanges(lock, changes);
  const free: UnlockableAttribute[] = [];

  const environment: EnvironmentState = {
    type: changes.environment?.type ?? parent.environment.type,
    lighting:
      changes.environment?.lighting ??
      (effective.lighting ? parent.environment.lighting : parent.environment.lighting),
    timeOfDay:
      changes.environment?.timeOfDay ??
      (effective.timeOfDay
        ? parent.environment.timeOfDay
        : parent.environment.timeOfDay),
    features: changes.environment?.features ?? parent.environment.features,
  };
  if (!effective.room && changes.environment?.type === undefined) free.push("room");
  if (!effective.lighting && changes.environment?.lighting === undefined) {
    free.push("lighting");
  }
  if (!effective.timeOfDay && changes.environment?.timeOfDay === undefined) {
    free.push("timeOfDay");
  }

  const wardrobe: WardrobeMap = changes.wardrobe
    ? { ...parent.wardrobe, ...changes.wardrobe }
    : parent.wardrobe;
  if (!effective.wardrobe && changes.wardrobe === undefined) free.push("wardrobe");

  const camera: CameraState = { ...parent.camera, ...changes.camera };
  if (!effective.camera && changes.camera === undefined) free.push("camera");

  const parentPositions: SpatialMap = Object.fromEntries(
    parent.characters.map((c) => [c.id, c.position]),
  );
  const positions: SpatialMap = changes.positions
    ? { ...parentPositions, ...changes.positions }
    : parentPositions;
  if (!effective.positions && changes.positions === undefined) free.push("positions");

  if (!effective.visualStyle) free.push("visualStyle");

  return {
    environment,
    wardrobe,
    camera,
    positions,
    mood: changes.mood ?? parent.mood,
    photoStyle: parent.photoStyle,
    free,
  };
}

/**
 * Cast members carried into the next scene.
 *
 * A focus list narrows who the scene is ABOUT, never who exists in it: section
 * 19 keeps the rest of the cast "naturally involved". So focus does not appear
 * here, and a focus branch cannot quietly delete four people from a photograph.
 */
export function inheritCast(parent: SceneState): readonly CastMemberId[] {
  return parent.characters.map((c) => c.id);
}

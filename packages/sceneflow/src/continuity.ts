// The continuity engine (section 30) — the most important thing in the package.
//
// buildContinuityContext assembles what the next scene inherits. The whole
// product rests on getting the PRECEDENCE right, so it is stated once, here,
// and every caller gets the same answer:
//
//   1. IDENTITY is absolute. Who these people are is inherited from the cast
//      and cannot be overridden by a change request, a preset or a branch.
//   2. An EXPLICIT USER CHANGE beats an inherited environment attribute.
//   3. A LOCKED attribute is inherited verbatim from the parent scene.
//   4. An UNLOCKED attribute with no explicit change is left free.
//
// Rule 1 is what separates a continuation from a new image. Rules 2-4 are what
// make the room and the clothes stay the same when nobody asked them to change.

import { describeForPrompt, referenceMap } from "./cast";
import { resolveAttributes, type ResolvedAttributes } from "./sceneLock";
import type {
  Cast,
  CastMemberId,
  CharacterDescriptor,
  ContinuityContext,
  SceneChangeRequest,
  SceneInteractionGraph,
  SceneLock,
  SceneState,
} from "./types";

export interface ContinuityInput {
  readonly storyId: string;
  readonly cast: Cast;
  readonly parentScene: SceneState;
  readonly parentSceneId: string | null;
  readonly previousSceneDescription: string;
  readonly narrativePosition: number;
  readonly lock: SceneLock;
  readonly changes: SceneChangeRequest;
  /** The graph for the NEW scene, already validated and reciprocated. */
  readonly interactions: SceneInteractionGraph;
}

export function buildContinuityContext(input: ContinuityInput): ContinuityContext {
  const resolved: ResolvedAttributes = resolveAttributes(
    input.parentScene,
    input.lock,
    input.changes,
  );

  const castIds = input.cast.members.map((m) => m.id);
  const descriptors: Partial<Record<CastMemberId, CharacterDescriptor>> = {};
  for (const member of input.cast.members) descriptors[member.id] = member.appearance;

  // A focus list is intersected with the cast, never trusted as given. A stale
  // focus id — from a branch taken before someone was removed — would otherwise
  // put a person in the prompt who is no longer in the story.
  const focus = (input.changes.focusCharacterIds ?? []).filter((id) =>
    castIds.includes(id),
  );

  return {
    storyId: input.storyId,
    cast: castIds,
    characterReferences: referenceMap(input.cast),
    characterDescriptors: descriptors,
    currentSpatialMap: resolved.positions,
    currentInteractionGraph: input.interactions,
    environment: resolved.environment,
    wardrobeMap: resolved.wardrobe,
    lighting: resolved.environment.lighting,
    photoStyle: resolved.photoStyle,
    timeOfDay: resolved.environment.timeOfDay,
    mood: resolved.mood,
    camera: resolved.camera,
    parentSceneId: input.parentSceneId,
    previousSceneDescription: input.previousSceneDescription,
    narrativePosition: input.narrativePosition,
    focusCharacterIds: focus,
  };
}

/**
 * The scene state a completed generation leaves behind, for the NEXT scene to
 * inherit. Persisting this is what makes "Continue From Here" work from any
 * scene, including a scene reached down a branch.
 */
export function nextSceneState(
  context: ContinuityContext,
  parent: SceneState,
): SceneState {
  const poseOf = new Map(parent.characters.map((c) => [c.id, c.pose]));
  return {
    characters: context.cast.map((id) => ({
      id,
      position: context.currentSpatialMap[id] ?? "center",
      pose: poseOf.get(id) ?? "standing",
    })),
    wardrobe: context.wardrobeMap,
    environment: context.environment,
    camera: context.camera,
    interactions: context.currentInteractionGraph,
    mood: context.mood,
    photoStyle: context.photoStyle,
  };
}

/** The identity block, one line per character. Highest-priority prompt content. */
export function castDescriptions(cast: Cast): string {
  return cast.members.map(describeForPrompt).join("\n");
}

/**
 * What changed between two scenes, in plain English, for the metadata drawer
 * (section 52). Derived, never stored: a stored summary goes stale the moment a
 * scene is regenerated, and a stale summary is an invented one.
 */
export function describeChanges(
  previous: SceneState,
  context: ContinuityContext,
): readonly string[] {
  const notes: string[] = [];
  if (previous.environment.type !== context.environment.type) {
    notes.push(`Location: ${previous.environment.type} → ${context.environment.type}`);
  }
  if (previous.environment.lighting !== context.lighting) {
    notes.push(`Lighting: ${previous.environment.lighting} → ${context.lighting}`);
  }
  if (previous.camera.shot !== context.camera.shot) {
    notes.push(`Camera: ${previous.camera.shot} → ${context.camera.shot}`);
  }
  for (const id of context.cast) {
    const before = previous.wardrobe[id];
    const after = context.wardrobeMap[id];
    if (before !== after && after !== undefined) {
      notes.push(`${id} wardrobe: ${before ?? "as photographed"} → ${after}`);
    }
  }
  if (notes.length === 0)
    notes.push("Cast, room, wardrobe and lighting all carried over.");
  return notes;
}

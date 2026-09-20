// Sample data for tests. A four-adult lounge scene — enough people that group
// behaviour, focus branching and bystander handling are actually exercised,
// rather than a two-person case that hides every group bug.

import { buildCast } from "../cast";
import { DEFAULT_SCENE_LOCK } from "../sceneLock";
import { DEFAULT_ASPECT_RATIO } from "../types";
import type { Cast, SceneState } from "../types";
import type { SceneRequest } from "../pipeline";

export function sampleCast(size = 4): Cast {
  const detected = Array.from({ length: size }, (_, i) => ({
    referencePath: `user-1/cast-1/subject-${i}.jpg`,
    sortOrder: i,
    appearance: {
      build: i % 2 === 0 ? "slim" : "average",
      hair: i % 2 === 0 ? "dark shoulder-length hair" : "short dark hair",
      apparentAgeBand: "30s",
    },
  }));
  return buildCast("cast-1", detected, {
    adultConfirmed: true,
    permissionConfirmed: true,
  });
}

export function sampleScene(cast: Cast): SceneState {
  return {
    characters: cast.members.map((m, i) => ({
      id: m.id,
      position:
        (["center-left", "center", "center-right", "left"] as const)[i % 4] ?? "center",
      pose: i % 2 === 0 ? "seated" : "standing",
    })),
    wardrobe: Object.fromEntries(
      cast.members.map((m, i) => [
        m.id,
        i % 2 === 0 ? "dark evening dress" : "dark suit",
      ]),
    ),
    environment: {
      type: "luxury nighttime suite",
      lighting: "warm amber",
      timeOfDay: "night",
      features: ["sofa", "coffee table", "city skyline windows"],
    },
    camera: { shot: "same", orientation: "portrait", height: "eye-level" },
    interactions: [
      { actors: [cast.members[0]!.id, cast.members[1]!.id], type: "talk" },
    ],
    mood: "romantic social evening",
    photoStyle: "cinematic available-light photography",
  };
}

/** A complete, valid request. Tests override the one field under examination. */
export function sampleSceneRequest(
  overrides: Partial<SceneRequest> = {},
): SceneRequest {
  const cast = overrides.cast ?? sampleCast();
  const parentScene = overrides.parentScene ?? sampleScene(cast);
  return {
    jobId: "job-1",
    storyId: "story-1",
    type: "single",
    cast,
    entitlement: "story_pro",
    ledger: [
      {
        amount: 20,
        eventType: "grant",
        generationJobId: null,
        description: "test grant",
      },
    ],
    parentScene,
    parentSceneId: null,
    previousSceneDescription: "",
    narrativePosition: 1,
    lock: DEFAULT_SCENE_LOCK,
    changes: {},
    interactions: [
      { actors: [cast.members[0]!.id, cast.members[1]!.id], type: "embrace" },
    ],
    intimacyCeiling: "romantic",
    sceneDescription: "They embrace by the window.",
    aspectRatio: DEFAULT_ASPECT_RATIO,
    sourceImage: "user-1/cast-1/source.jpg",
    ...overrides,
  };
}

/**
 * A whole story, not one scene.
 *
 * The engine already plans 3- and 6-scene stories with continuity carried from
 * one panel to the next; none of it was reachable from the console, so the
 * product's actual promise — turn one moment into an entire story — was
 * invisible. This is the bridge.
 *
 * Pure, like lib/direct: no I/O, no model. The server action is a thin
 * wrapper so each panel's composition is testable without a browser.
 */

import {
  PRESETS,
  applyReciprocal,
  buildCast,
  buildContinuityContext,
  castDescriptions,
  composePrompt,
  defaultSpatialMap,
  evaluateFields,
  includeBystanders,
  interactionSpec,
  isInteractionType,
  labelFor,
  nextSceneState,
  planStory,
  validateGraph,
  type CastMemberId,
  type IntimacyLevel,
  type SceneCount,
  type SceneInteractionGraph,
  type SceneLock,
  type SceneState,
} from "@hl-bos/sceneflow";

export interface StoryInput {
  readonly castSize: number;
  readonly adultConfirmed: boolean;
  readonly permissionConfirmed: boolean;
  readonly presetSlug: string;
  readonly scenes: SceneCount;
  readonly intimacy: IntimacyLevel;
  readonly reciprocal: boolean;
  readonly setting: string;
  readonly wardrobe: string;
  readonly customDirection: string;
  /**
   * The photographs, first one being the scene continued from and the rest
   * extra views of the same people (brief section 34). Paths relative to the
   * repo root, as the worker will be given them.
   */
  readonly photoPaths?: readonly string[];
}

export interface StoryPanel {
  readonly number: number;
  readonly title: string;
  /** What the cast is doing, in the prompt's own words. */
  readonly interactions: readonly string[];
  readonly placements: readonly string[];
  readonly intimacy: IntimacyLevel;
  readonly prompt: string;
  /** The photograph this panel continues from. Empty when none was supplied. */
  readonly sourceImage: string;
  /** Extra views of the same people, for identity. */
  readonly referenceImages: readonly string[];
}

export type StoryResult =
  | {
      readonly kind: "refused";
      readonly stage: "attestation" | "policy" | "structure";
      readonly message: string;
      readonly alternative: string | null;
      readonly reasonCodes: readonly string[];
    }
  | {
      readonly kind: "planned";
      readonly title: string;
      readonly panels: readonly StoryPanel[];
      /** How many photographs the whole story was built from. */
      readonly photoCount: number;
      /** Literal false: no image model is connected to this repository. */
      readonly modelConnected: false;
    };

export const STORY_PRESETS = PRESETS.map((p) => ({
  slug: p.slug,
  title: p.title,
  group: p.group,
}));

const LOCK: SceneLock = {
  characters: true,
  room: true,
  wardrobe: true,
  lighting: true,
  timeOfDay: true,
  visualStyle: true,
  camera: true,
  positions: true,
};

function openingScene(cast: readonly CastMemberId[], input: StoryInput): SceneState {
  const map = defaultSpatialMap(cast);
  return {
    characters: cast.map((id) => ({
      id,
      position: map[id] ?? "center",
      pose: "standing",
    })),
    wardrobe: Object.fromEntries(cast.map((id) => [id, input.wardrobe])),
    environment: {
      type: input.setting,
      lighting: "warm available light",
      timeOfDay: "evening",
      features: [],
    },
    camera: { shot: "same", orientation: "portrait", height: "eye-level" },
    interactions: [],
    mood: "romantic",
    photoStyle: "photorealistic available-light photography",
  };
}

/**
 * Plan every panel, carrying continuity forward.
 *
 * Sequential on purpose: panel 4 inherits panel 3's resolved state, so each one
 * continues from the scene before it rather than from the opening. Running them
 * independently would produce variations of one moment, not a story.
 */
export function planStoryScenes(input: StoryInput): StoryResult {
  if (!input.adultConfirmed || !input.permissionConfirmed) {
    return {
      kind: "refused",
      stage: "attestation",
      message:
        "Confirm that everyone shown is 18 or older and that you have permission to use these photographs.",
      alternative: null,
      reasonCodes: ["attestation_missing"],
    };
  }

  const policy = evaluateFields({
    direction: input.customDirection,
    setting: input.setting,
    wardrobe: input.wardrobe,
  });
  if (!policy.verdict.allowed) {
    return {
      kind: "refused",
      stage: "policy",
      message: policy.verdict.message,
      alternative: policy.verdict.alternative,
      reasonCodes: policy.verdict.reasonCodes,
    };
  }

  const cast = buildCast(
    "local-cast",
    Array.from({ length: input.castSize }, (_, i) => ({
      referencePath: "",
      sortOrder: i,
    })),
    {
      adultConfirmed: input.adultConfirmed,
      permissionConfirmed: input.permissionConfirmed,
    },
  );
  const castIds = cast.members.map((m) => m.id);

  const plan = planStory(input.presetSlug, castIds, input.scenes, {
    ceiling: input.intimacy,
  });

  const photos = input.photoPaths ?? [];
  const source = photos[0] ?? "";
  const references = photos.slice(1);

  const pair = castIds.slice(0, 2);
  const panels: StoryPanel[] = [];
  let parent = openingScene(castIds, input);
  let previous = "";

  for (const beat of plan.scenes) {
    if (!isInteractionType(beat.interaction)) {
      return {
        kind: "refused",
        stage: "structure",
        message: "This story contains a moment SceneFlow cannot stage.",
        alternative: null,
        reasonCodes: ["unknown_interaction"],
      };
    }
    const spec = interactionSpec(beat.interaction);
    // A beat needing two people uses the first pair; a group beat takes
    // everyone it can hold.
    const actors =
      spec.maxActors === null ? castIds : castIds.slice(0, spec.maxActors ?? 2);
    const base: SceneInteractionGraph = [
      {
        actors: spec.minActors === 1 && actors.length === 0 ? pair : actors,
        type: beat.interaction,
      },
    ];

    const issues = validateGraph(base, castIds, input.intimacy);
    if (issues.length > 0) {
      return {
        kind: "refused",
        stage: "structure",
        message:
          "That combination of people and actions is not one SceneFlow can stage.",
        alternative: null,
        reasonCodes: issues.map((i) => i.code),
      };
    }

    const withReciprocal = input.reciprocal
      ? applyReciprocal(base, input.intimacy)
      : base;
    const graph = includeBystanders(withReciprocal, castIds);

    const context = buildContinuityContext({
      storyId: "local-story",
      cast,
      parentScene: parent,
      parentSceneId: null,
      previousSceneDescription: previous,
      narrativePosition: beat.number,
      lock: LOCK,
      changes: {},
      interactions: graph,
    });

    const prompt = composePrompt({
      context,
      characterDescriptions: castDescriptions(cast),
      sceneDescription: `${beat.title} — ${spec.phrasing}`,
      lock: LOCK,
      aspectRatio: "4:5",
    });

    panels.push({
      number: beat.number,
      title: beat.title,
      intimacy: beat.intimacy,
      interactions: graph.map((edge) => {
        const s = isInteractionType(edge.type) ? interactionSpec(edge.type) : null;
        const who = edge.actors.map(labelFor).join(" and ");
        return `${who}: ${s?.phrasing ?? edge.type}${edge.reciprocal === true ? " (returned)" : ""}`;
      }),
      placements: castIds.map(
        (id) => `${labelFor(id)} — ${context.currentSpatialMap[id] ?? "center"}`,
      ),
      prompt: prompt.text,
      // EVERY panel carries the photographs, not just the first. Panel six is
      // still meant to be these people; handing the source only to panel one
      // and letting the rest chain off each other is how a cast drifts into
      // strangers by the end of a story.
      sourceImage: source,
      referenceImages: references,
    });

    parent = nextSceneState(context, parent);
    previous = beat.title;
  }

  return {
    kind: "planned",
    title: plan.title,
    panels,
    photoCount: photos.length,
    modelConnected: false,
  };
}

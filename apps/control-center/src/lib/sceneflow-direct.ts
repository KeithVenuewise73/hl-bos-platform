/**
 * The director's chair: structured choices in, a composed scene out.
 *
 * Pure. No I/O, no model, no `server-only` — the server action in
 * `actions/sceneflow.ts` is a thin wrapper so every decision here is testable
 * without a browser, a card or a network.
 *
 * WHY THIS RUNS ON THE SERVER AT ALL, IN A LOCAL TOOL
 *
 * Brief section 31: prompts are composed server-side, never taken raw from the
 * client. That still holds when the "server" is the operator's own laptop. It
 * is not about trust boundaries here; it is about there being exactly ONE place
 * a prompt string is built, from structure, so nothing a user types is ever
 * concatenated into it. Move that to the browser and the safety clause becomes
 * something a form field can displace.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not generate an image, and it never pretends to. No image model is
 * connected to this repository. The result carries `modelConnected: false` as
 * a literal so it cannot drift, and the page says so in words.
 */

import {
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
  validateGraph,
  type CastMemberId,
  type IntimacyLevel,
  type InteractionType,
  type PolicyVerdict,
  type SceneInteractionGraph,
  type SceneState,
} from "@hl-bos/sceneflow";

export interface DirectorInput {
  /** How many clearly adult people are in the photograph. 2-8. */
  readonly castSize: number;
  readonly adultConfirmed: boolean;
  readonly permissionConfirmed: boolean;
  /** Which two are the focus of the moment. */
  readonly actors: readonly CastMemberId[];
  readonly interaction: string;
  readonly intimacy: IntimacyLevel;
  readonly reciprocal: boolean;
  readonly setting: string;
  readonly wardrobe: string;
  readonly mood: string;
  /** Free text the user typed. Evaluated, never concatenated. */
  readonly customDirection: string;
}

export type DirectorResult =
  | {
      readonly kind: "refused";
      readonly stage: "attestation" | "policy" | "structure";
      readonly message: string;
      /** The nearest permitted romantic alternative, when one may be offered. */
      readonly alternative: string | null;
      readonly reasonCodes: readonly string[];
    }
  | {
      readonly kind: "directed";
      /** One line per interaction edge, in the prompt's own language. */
      readonly interactions: readonly string[];
      readonly placements: readonly string[];
      readonly prompt: string;
      readonly referenceCount: number;
      /** Literal false: no image model is connected to this repository. */
      readonly modelConnected: false;
    };

const CONSENT_TEXT_VERSION = "v1.0";

/** A neutral starting scene. Stands in for what scene analysis would read. */
function blankScene(cast: readonly CastMemberId[], input: DirectorInput): SceneState {
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
    mood: input.mood,
    photoStyle: "photorealistic available-light photography",
  };
}

export function direct(input: DirectorInput): DirectorResult {
  // 1. Attestation, before anything else is looked at.
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

  // 2. The deterministic policy gate, over every field the user typed.
  const policy = evaluateFields({
    direction: input.customDirection,
    setting: input.setting,
    wardrobe: input.wardrobe,
    mood: input.mood,
  });
  if (!policy.verdict.allowed) {
    return refusalFrom(policy.verdict);
  }

  // 3. Build the cast. Reference paths are empty: nothing has been uploaded to
  //    this tool yet, and inventing a path would be inventing a photograph.
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

  // 4. Structural validation against the closed vocabulary and the ceiling.
  if (!isInteractionType(input.interaction)) {
    return {
      kind: "refused",
      stage: "structure",
      message: "That is not something SceneFlow knows how to stage.",
      alternative: null,
      reasonCodes: ["unknown_interaction"],
    };
  }
  const type: InteractionType = input.interaction;
  const base: SceneInteractionGraph = [{ actors: input.actors, type }];
  const issues = validateGraph(base, castIds, input.intimacy);
  if (issues.length > 0) {
    const ceiling = issues.some((i) => i.code === "above_intimacy_ceiling");
    return {
      kind: "refused",
      stage: "structure",
      message: ceiling
        ? `"${interactionSpec(type).label}" is above the intimacy level you chose. Raise the level, or pick something gentler.`
        : "That combination of people and actions is not one SceneFlow can stage.",
      alternative: null,
      reasonCodes: issues.map((i) => i.code),
    };
  }

  // 5. Reciprocity, bystanders, continuity, prompt.
  const withReciprocal = input.reciprocal
    ? applyReciprocal(base, input.intimacy)
    : base;
  const graph = includeBystanders(withReciprocal, castIds);
  const parent = blankScene(castIds, input);

  const context = buildContinuityContext({
    storyId: "local-story",
    cast,
    parentScene: parent,
    parentSceneId: null,
    previousSceneDescription: "",
    narrativePosition: 1,
    lock: {
      characters: true,
      room: true,
      wardrobe: true,
      lighting: true,
      timeOfDay: true,
      visualStyle: true,
      camera: true,
      positions: true,
    },
    changes: { focusCharacterIds: input.actors },
    interactions: graph,
  });

  const prompt = composePrompt({
    context,
    characterDescriptions: castDescriptions(cast),
    sceneDescription: interactionSpec(type).phrasing,
    lock: {
      characters: true,
      room: true,
      wardrobe: true,
      lighting: true,
      timeOfDay: true,
      visualStyle: true,
      camera: true,
      positions: true,
    },
    aspectRatio: "4:5",
  });

  return {
    kind: "directed",
    interactions: graph.map((edge) => {
      const spec = isInteractionType(edge.type) ? interactionSpec(edge.type) : null;
      const who = edge.actors.map(labelFor).join(" and ");
      const what = spec?.phrasing ?? edge.type;
      return `${who}: ${what}${edge.reciprocal === true ? " (returned)" : ""}`;
    }),
    placements: castIds.map(
      (id) => `${labelFor(id)} — ${context.currentSpatialMap[id]}`,
    ),
    prompt: prompt.text,
    referenceCount: prompt.referencePaths.length,
    modelConnected: false,
  };
}

function refusalFrom(verdict: PolicyVerdict): DirectorResult {
  return {
    kind: "refused",
    stage: "policy",
    message: verdict.message,
    alternative: verdict.alternative,
    reasonCodes: verdict.reasonCodes,
  };
}

export { CONSENT_TEXT_VERSION };

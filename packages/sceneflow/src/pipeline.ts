// The generation pipeline (sections 43 and 56).
//
// The order of the gates IS the safety design. Written once, here, so no caller
// gets to reorder it:
//
//   attestation -> entitlement -> credits -> policy pre-gate -> moderation
//   -> structural validation -> prompt composition -> generate
//   -> output moderation -> quality check -> settle
//
// Two properties worth stating plainly:
//
//  * IT FAILS CLOSED. No ModerationProvider configured means nothing generates.
//    Not "generate with a warning" — nothing. Section 44 requires more than a
//    keyword filter, and a pipeline that quietly runs without one is a product
//    claiming a safeguard it does not have.
//
//  * A BLOCK COSTS NOTHING. Every refusal path returns the hold, so a user is
//    never charged for a request we declined to make.

import { attestationSatisfied, evaluateFields, type PolicyVerdict } from "./policy";
import {
  canAfford,
  entitlementAllows,
  settle,
  type CreditEntry,
  type Entitlement,
  type Settlement,
} from "./credits";
import { applyReciprocal, includeBystanders, validateGraph } from "./graph";
import { buildContinuityContext, castDescriptions } from "./continuity";
import { composePrompt, composeVariationPrompt } from "./prompt";
import {
  checkGeneration,
  isTransientFailure,
  shouldRetry,
  type QualityCheck,
} from "./qa";
import type {
  ImageGenerationProvider,
  ImageGenerationRequest,
  ModerationProvider,
  GenerationResult,
} from "./providers";
import type {
  AspectRatio,
  Cast,
  GenerationType,
  IntimacyLevel,
  SceneChangeRequest,
  SceneInteractionGraph,
  SceneLock,
  SceneState,
} from "./types";

export interface SceneRequest {
  readonly jobId: string;
  readonly storyId: string;
  readonly type: GenerationType;
  readonly cast: Cast;
  readonly entitlement: Entitlement;
  readonly ledger: readonly CreditEntry[];
  readonly parentScene: SceneState;
  readonly parentSceneId: string | null;
  readonly previousSceneDescription: string;
  readonly narrativePosition: number;
  readonly lock: SceneLock;
  readonly changes: SceneChangeRequest;
  readonly interactions: SceneInteractionGraph;
  readonly intimacyCeiling: IntimacyLevel;
  readonly sceneDescription: string;
  readonly aspectRatio: AspectRatio;
  readonly sourceImage: string;
  /** Free text the user typed, if any. Evaluated; never concatenated. */
  readonly customFields?: Readonly<Record<string, string | undefined>>;
  readonly seed?: number;
}

export type RefusalStage =
  | "attestation"
  | "entitlement"
  | "credits"
  | "policy"
  | "moderation"
  | "structure"
  | "configuration";

export interface Refusal {
  readonly outcome: "refused";
  readonly stage: RefusalStage;
  readonly message: string;
  readonly reasonCodes: readonly string[];
  /** The nearest permitted alternative, when one may be offered. */
  readonly alternative: string | null;
  readonly settlement: Settlement;
}

export interface Success {
  readonly outcome: "generated";
  readonly result: GenerationResult;
  readonly quality: QualityCheck;
  readonly attempts: number;
  readonly promptSnapshot: string;
  readonly settlement: Settlement;
}

export interface Failure {
  readonly outcome: "failed";
  readonly errorCode: string;
  readonly message: string;
  readonly attempts: number;
  readonly settlement: Settlement;
}

export type SceneOutcome = Refusal | Success | Failure;

export interface PipelineDeps {
  readonly image: ImageGenerationProvider;
  /**
   * Required. Typed as non-optional deliberately: a caller cannot forget to
   * pass one, and there is no "moderation off" path to accidentally deploy.
   */
  readonly moderation: ModerationProvider;
}

function refuse(
  stage: RefusalStage,
  message: string,
  reasonCodes: readonly string[],
  alternative: string | null,
  request: SceneRequest,
): Refusal {
  return {
    outcome: "refused",
    stage,
    message,
    reasonCodes,
    alternative,
    settlement: settle({
      type: request.type,
      outcome: "blocked",
      jobId: request.jobId,
    }),
  };
}

/**
 * Run one scene through every gate.
 *
 * Returns rather than throws: a refusal is a normal, expected outcome of this
 * product and the caller needs its reason codes to record a moderation event.
 */
export async function generateScene(
  request: SceneRequest,
  deps: PipelineDeps,
): Promise<SceneOutcome> {
  // 1. Attestation — both boxes, every time, before anything else.
  if (!attestationSatisfied(request.cast)) {
    return refuse(
      "attestation",
      "Confirm that everyone shown is 18 or older and that you have permission to use these photographs.",
      ["attestation_missing"],
      null,
      request,
    );
  }

  // 2. Entitlement, server-side.
  const scenes = request.type === "story-6" ? 6 : request.type === "story-3" ? 3 : 1;
  const entitlement = entitlementAllows(request.entitlement, {
    type: request.type,
    scenes,
  });
  if (!entitlement.allowed) {
    return refuse(
      "entitlement",
      entitlement.message,
      [entitlement.reason],
      null,
      request,
    );
  }

  // 3. Credits.
  const affordability = canAfford(request.ledger, request.type);
  if (!affordability.affordable) {
    return refuse(
      "credits",
      `This needs ${affordability.required} credits and you have ${affordability.available}.`,
      ["insufficient_credits"],
      null,
      request,
    );
  }

  // 4. The deterministic policy pre-gate, over everything the user typed.
  const fields = request.customFields ?? {};
  const policy = evaluateFields(fields);
  if (!policy.verdict.allowed) {
    return refuse(
      "policy",
      policy.verdict.message,
      policy.verdict.reasonCodes,
      policy.verdict.alternative,
      request,
    );
  }

  // 5. Moderation, on the same text. Independent of the gate above, because
  //    section 44 is explicit that a keyword filter is not sufficient alone.
  const moderated = await moderateAll(deps.moderation, fields);
  if (!moderated.allowed) {
    return refuse(
      "moderation",
      "SceneFlow could not create that scene. Try one of the romantic options instead.",
      moderated.categories,
      "a close kiss, an embrace, cuddling together, or a goodnight moment",
      request,
    );
  }

  // 6. Structural validation against the closed vocabulary and the ceiling.
  const castIds = request.cast.members.map((m) => m.id);
  const issues = validateGraph(request.interactions, castIds, request.intimacyCeiling);
  if (issues.length > 0) {
    return refuse(
      "structure",
      "That combination of people and actions is not one SceneFlow can stage.",
      issues.map((i) => i.code),
      null,
      request,
    );
  }

  // 7. Reciprocity and bystanders, then continuity, then the prompt.
  const withReciprocal =
    request.changes.reciprocalAffection === true
      ? applyReciprocal(request.interactions, request.intimacyCeiling)
      : request.interactions;
  const graph = includeBystanders(withReciprocal, castIds);

  const context = buildContinuityContext({
    storyId: request.storyId,
    cast: request.cast,
    parentScene: request.parentScene,
    parentSceneId: request.parentSceneId,
    previousSceneDescription: request.previousSceneDescription,
    narrativePosition: request.narrativePosition,
    lock: request.lock,
    changes: request.changes,
    interactions: graph,
  });

  const compose = request.type === "variation" ? composeVariationPrompt : composePrompt;
  const prompt = compose({
    context,
    characterDescriptions: castDescriptions(request.cast),
    sceneDescription: request.sceneDescription,
    lock: request.lock,
    aspectRatio: request.aspectRatio,
  });

  // 8. Generate, with at most one retry.
  const base: Omit<ImageGenerationRequest, "idempotencyKey"> = {
    sourceImage: request.sourceImage,
    referenceImages: prompt.referencePaths,
    prompt: prompt.text,
    aspectRatio: prompt.aspectRatio,
    quality: request.entitlement === "story_pro" ? "high" : "standard",
    ...(request.seed !== undefined ? { seed: request.seed } : {}),
    metadata: {
      storyId: request.storyId,
      jobId: request.jobId,
      narrativePosition: String(request.narrativePosition),
    },
  };

  let attempts = 0;
  let lastResult: GenerationResult | null = null;
  let lastQuality: QualityCheck | null = null;

  while (attempts < 2) {
    attempts += 1;
    // The key includes the attempt, so a deliberate retry is a new request while
    // a network-level replay of the same attempt is de-duplicated.
    const result = await deps.image.generate({
      ...base,
      idempotencyKey: `${request.jobId}:${attempts}`,
    });
    lastResult = result;

    if (result.status === "blocked") {
      return refuse(
        "moderation",
        "SceneFlow could not create that scene. Try one of the romantic options instead.",
        ["provider_blocked"],
        "a close kiss, an embrace, cuddling together, or a goodnight moment",
        request,
      );
    }

    if (result.status === "failed") {
      if (isTransientFailure(result) && attempts < 2) continue;
      return {
        outcome: "failed",
        errorCode: result.errorCode ?? "provider_failure",
        message: "The scene could not be generated. Your credits have not been used.",
        attempts,
        settlement: settle({
          type: request.type,
          outcome: "provider-failure",
          jobId: request.jobId,
        }),
      };
    }

    if (result.status !== "complete" || result.imagePath === undefined) {
      return {
        outcome: "failed",
        errorCode: "incomplete_result",
        message: "The scene could not be generated. Your credits have not been used.",
        attempts,
        settlement: settle({
          type: request.type,
          outcome: "server-failure",
          jobId: request.jobId,
        }),
      };
    }

    // 9. Moderate the OUTPUT. A safe request can still produce an unsafe image,
    //    and the user must never be charged for one we then refuse to show.
    const outputVerdict = await deps.moderation.moderateImage(result.imagePath);
    if (!outputVerdict.allowed) {
      return {
        outcome: "failed",
        errorCode: "output_rejected",
        message:
          "The generated image did not meet SceneFlow's content rules and was discarded. Your credits have not been used.",
        attempts,
        settlement: settle({
          type: request.type,
          outcome: "output-rejected",
          jobId: request.jobId,
        }),
      };
    }

    // 10. Quality.
    const quality = checkGeneration(
      {
        expectedCharacterCount: castIds.length,
        requiredCharacters:
          context.focusCharacterIds.length > 0 ? context.focusCharacterIds : castIds,
      },
      {
        ...(result.observedCharacterCount !== undefined
          ? { observedCharacterCount: result.observedCharacterCount }
          : {}),
      },
    );
    lastQuality = quality;

    const decision = shouldRetry(quality, attempts);
    if (decision.retry) continue;

    return {
      outcome: "generated",
      result,
      quality,
      attempts,
      promptSnapshot: prompt.text,
      settlement: settle({
        type: request.type,
        outcome: "complete",
        jobId: request.jobId,
      }),
    };
  }

  /* c8 ignore start -- reached only if the loop exits without returning */
  return {
    outcome: "generated",
    result: lastResult as GenerationResult,
    quality: lastQuality as QualityCheck,
    attempts,
    promptSnapshot: prompt.text,
    settlement: settle({
      type: request.type,
      outcome: "complete",
      jobId: request.jobId,
    }),
  };
  /* c8 ignore stop */
}

async function moderateAll(
  provider: ModerationProvider,
  fields: Readonly<Record<string, string | undefined>>,
): Promise<{ allowed: boolean; categories: readonly string[] }> {
  const categories: string[] = [];
  for (const value of Object.values(fields)) {
    if (value === undefined || value.trim() === "") continue;
    const verdict = await provider.moderateText(value);
    if (!verdict.allowed) categories.push(...verdict.categories);
  }
  return { allowed: categories.length === 0, categories };
}

export type { PolicyVerdict };

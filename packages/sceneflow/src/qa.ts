// Post-generation quality checks (section 35).
//
// "Retry once. Never retry indefinitely." An unbounded retry loop on a paid
// provider is a way to spend money at machine speed, and a way to keep a user
// staring at a spinner while it happens.

import type { CastMemberId } from "./types";
import type { GenerationResult } from "./providers";

export interface QualityExpectation {
  readonly expectedCharacterCount: number;
  readonly requiredCharacters: readonly CastMemberId[];
}

export interface QualityObservation {
  /** From the provider or a downstream detector. undefined = could not tell. */
  readonly observedCharacterCount?: number;
  /** Characters a detector confirmed present. undefined = could not tell. */
  readonly presentCharacters?: readonly CastMemberId[];
}

export type QualityCode =
  "character_count_mismatch" | "required_character_missing" | "not_verifiable";

export interface QualityCheck {
  readonly ok: boolean;
  readonly codes: readonly QualityCode[];
  readonly detail: readonly string[];
  /**
   * True when the defect is worth one retry. A defect we cannot even observe is
   * NOT retryable — retrying on "we could not tell" is retrying on nothing.
   */
  readonly retryable: boolean;
}

/**
 * Compare what was asked for against what came back.
 *
 * Where the pipeline cannot verify (no detector wired up, provider reports no
 * count), this says so with `not_verifiable` rather than returning a pass. A
 * green check that means "we did not look" is the kind of lie this platform
 * does not ship.
 */
export function checkGeneration(
  expected: QualityExpectation,
  observed: QualityObservation,
): QualityCheck {
  const codes: QualityCode[] = [];
  const detail: string[] = [];

  if (observed.observedCharacterCount === undefined) {
    codes.push("not_verifiable");
    detail.push("No character count was reported, so the output was not verified.");
  } else if (observed.observedCharacterCount !== expected.expectedCharacterCount) {
    codes.push("character_count_mismatch");
    detail.push(
      `Expected ${expected.expectedCharacterCount} people, output has ${observed.observedCharacterCount}.`,
    );
  }

  if (observed.presentCharacters !== undefined) {
    const present = new Set(observed.presentCharacters);
    const missing = expected.requiredCharacters.filter((id) => !present.has(id));
    if (missing.length > 0) {
      codes.push("required_character_missing");
      detail.push(`Missing from the output: ${missing.join(", ")}.`);
    }
  }

  const hasRealDefect = codes.some((c) => c !== "not_verifiable");
  return {
    ok: codes.length === 0,
    codes,
    detail,
    retryable: hasRealDefect,
  };
}

export interface RetryDecision {
  readonly retry: boolean;
  readonly reason: string;
}

/** One retry, and only for a defect we actually observed. */
export function shouldRetry(check: QualityCheck, attemptsSoFar: number): RetryDecision {
  if (check.ok) return { retry: false, reason: "passed" };
  if (attemptsSoFar >= 2) return { retry: false, reason: "retry_budget_spent" };
  if (!check.retryable) return { retry: false, reason: "defect_not_observable" };
  return { retry: true, reason: check.codes[0] ?? "quality_defect" };
}

/** Errors that are worth one more attempt; everything else fails the job. */
const TRANSIENT: ReadonlySet<string> = new Set([
  "timeout",
  "rate_limited",
  "provider_unavailable",
  "internal_error",
]);

export function isTransientFailure(result: GenerationResult): boolean {
  return result.status === "failed" && TRANSIENT.has(result.errorCode ?? "");
}

/**
 * What happens between a submitted form and a told-the-truth answer.
 *
 * Split out from the server action so the decisions — refuse, retry, accept —
 * are testable without Next.js, a browser, or a database. The action itself is
 * a four-line wrapper around `handleRequest`.
 */

import {
  fromFormData,
  looksAutomated,
  validate,
  type FieldErrors,
  type RawRequest,
} from "./assessment-request";
import {
  readIntakeConfig,
  submitToIntake,
  type IntakeConfig,
  type SubmitOutcome,
} from "./intake";
import type { IntakePayload } from "./assessment-request";

export type SubmitState =
  /** Nothing has been submitted yet. */
  | { readonly status: "idle" }
  /** Refused. `values` carries the operator's typing back so nothing is retyped. */
  | {
      readonly status: "error";
      readonly errors: FieldErrors;
      readonly formError?: string;
      readonly values: RawRequest;
    }
  /** Accepted, and the database said so. */
  | { readonly status: "ok"; readonly reference: string };

export const NOT_CONFIGURED =
  "The assessment intake isn't connected on this deployment, so nothing you typed would have " +
  "been saved. Rather than pretend otherwise, we're telling you plainly.";

export interface Deps {
  readonly config?: IntakeConfig | null;
  readonly submit?: (
    payload: IntakePayload,
    config: IntakeConfig,
  ) => Promise<SubmitOutcome>;
}

export async function handleRequest(
  raw: RawRequest,
  deps: Deps = {},
): Promise<SubmitState> {
  const config = deps.config !== undefined ? deps.config : readIntakeConfig();
  const submit = deps.submit ?? ((p, c) => submitToIntake(p, c));

  // An automated filler gets the same civil refusal as anyone whose submission
  // we did not store. We do not pretend to accept it: silently discarding a
  // submission while showing a thank-you is the exact lie this file prevents,
  // and a person who somehow trips the trap deserves to know nothing was saved.
  if (looksAutomated(raw)) {
    return {
      status: "error",
      errors: {},
      formError:
        "That submission looked automated, so it wasn't saved. If you're a person, " +
        "please send it again.",
      values: raw,
    };
  }

  const checked = validate(raw);
  if (!checked.ok) {
    return { status: "error", errors: checked.errors, values: raw };
  }

  // Configuration is checked AFTER validation so a misconfigured deployment
  // still tells a person about their typos rather than hiding them behind an
  // infrastructure message they can do nothing about.
  if (!config) {
    return { status: "error", errors: {}, formError: NOT_CONFIGURED, values: raw };
  }

  const outcome = await submit(checked.payload, config);
  if (outcome.ok) return { status: "ok", reference: outcome.reference };

  return { status: "error", errors: {}, formError: outcome.message, values: raw };
}

/** The shape a server action receives. Kept narrow so tests can pass a FormData. */
export function readForm(form: Parameters<typeof fromFormData>[0]): RawRequest {
  return fromFormData(form);
}

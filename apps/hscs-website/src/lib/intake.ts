/**
 * Server-side delivery of an assessment request to the HL-BOS database.
 *
 * SERVER ONLY. The publishable key is read from the server environment and
 * never reaches the browser, so the site's Content-Security-Policy keeps
 * `connect-src 'self'` — the visitor's browser talks only to this site.
 *
 * There is no Supabase SDK here on purpose. This is one POST to one PostgREST
 * RPC; a dependency for that would be weight the dependency policy would have
 * to justify (docs/architecture/dependency-policy.md).
 *
 * THE RULE THIS MODULE EXISTS TO KEEP: a visitor is told their request was
 * received ONLY when the database returned a real reference. Every other
 * outcome — unreachable, refused, a shape we did not expect — is reported as a
 * failure. A marketing site that says "thank you" over a dropped request is
 * lying to the one person who bothered to ask for help.
 */

import { readOptionalServerEnv } from "@hl-bos/config";
import type { IntakePayload } from "./assessment-request";

/** The RPC added by migration 0048. */
const RPC = "submit_operations_assessment_request";

/** A reference the database minted. Anything else is not a success. */
const REFERENCE_RE = /^HSCS-OA-[0-9A-F]{8}$/;

export interface IntakeConfig {
  readonly url: string;
  readonly key: string;
}

export type SubmitOutcome =
  | { readonly ok: true; readonly reference: string }
  | {
      readonly ok: false;
      /**
       * `rejected`  — the database refused it and the person can fix it.
       * `throttled` — the same address submitted seconds ago.
       * `unavailable` — our end is broken. Never the visitor's fault.
       */
      readonly reason: "rejected" | "throttled" | "unavailable";
      readonly message: string;
    };

/**
 * The intake is configured only when BOTH values are present. Half-configured
 * is treated as unconfigured: a form that posts into a void is the "control
 * that controls nothing" the operating contract forbids, so the page renders
 * no form at all rather than a broken one.
 */
export function readIntakeConfig(
  source?: Record<string, string | undefined>,
): IntakeConfig | null {
  // Read through @hl-bos/config, the only sanctioned reader of process.env. The
  // *optional* reader is the right one here: this site has no service-role key
  // and no browser Supabase URL, and demanding them would make a correct
  // deployment fail to boot.
  const options = source ? { source } : {};
  const rawUrl = readOptionalServerEnv("SUPABASE_URL", options);
  const rawKey = readOptionalServerEnv("SUPABASE_PUBLISHABLE_KEY", options);

  const url = typeof rawUrl === "string" ? rawUrl.trim().replace(/\/+$/, "") : "";
  const key = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!url || !key) return null;
  return { url, key };
}

/**
 * Whether this deployment can actually take a request, for the page to branch on.
 *
 * A MALFORMED value (a typo in SUPABASE_URL) is a deployment fault, and there
 * are two bad ways to handle it: crash the page in a visitor's face, or degrade
 * quietly so nobody ever notices the front door is shut. This does neither —
 * the visitor gets the same honest "not connected" notice, and the fault is
 * written to the server log where an operator will see it.
 */
export type IntakeStatus =
  | { readonly connected: true; readonly config: IntakeConfig }
  | { readonly connected: false; readonly misconfigured: boolean };

export function intakeStatus(
  source?: Record<string, string | undefined>,
  log: (message: string) => void = console.error,
): IntakeStatus {
  try {
    const config = readIntakeConfig(source);
    return config
      ? { connected: true, config }
      : { connected: false, misconfigured: false };
  } catch (e) {
    log(
      "[hscs] assessment intake is MISCONFIGURED, so the request form is not being shown: " +
        (e instanceof Error ? e.message : String(e)),
    );
    return { connected: false, misconfigured: true };
  }
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** What PostgREST returns in the body when a function raises. */
interface PostgrestError {
  code?: string;
  message?: string;
}

export async function submitToIntake(
  payload: IntakePayload,
  config: IntakeConfig,
  fetchImpl: FetchLike = fetch,
): Promise<SubmitOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${config.url}/rest/v1/rpc/${RPC}`, {
      method: "POST",
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      // The function takes one named argument, `payload`.
      body: JSON.stringify({ payload }),
      cache: "no-store",
    });
  } catch {
    // Network failure, DNS, TLS, timeout. Ours, not theirs.
    return { ok: false, reason: "unavailable", message: UNAVAILABLE };
  }

  if (res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, reason: "unavailable", message: UNAVAILABLE };
    }
    // A scalar-returning RPC gives the bare value. Accept nothing else: an
    // unexpected shape means we do not know whether the row was written, and
    // "we don't know" must never render as "received".
    if (typeof body === "string" && REFERENCE_RE.test(body)) {
      return { ok: true, reference: body };
    }
    return { ok: false, reason: "unavailable", message: UNAVAILABLE };
  }

  let err: PostgrestError = {};
  try {
    err = (await res.json()) as PostgrestError;
  } catch {
    /* a non-JSON error body tells us nothing; fall through to status handling */
  }

  // 23514 is check_violation — every deliberate refusal the RPC raises.
  if (err.code === "23514" && typeof err.message === "string") {
    if (/wait a moment/i.test(err.message)) {
      return {
        ok: false,
        reason: "throttled",
        message:
          "We've just received a request from this address. Give it a minute before sending another.",
      };
    }
    return { ok: false, reason: "rejected", message: err.message };
  }

  // 404 means the RPC is not there — the migration has not been applied to this
  // project. That is a deployment fault, and the visitor must not be blamed for
  // it or told a request was stored when none was.
  return { ok: false, reason: "unavailable", message: UNAVAILABLE };
}

export const UNAVAILABLE =
  "We couldn't record your request just now — that's a fault at our end, not yours. " +
  "Nothing was saved, so please try again in a few minutes.";

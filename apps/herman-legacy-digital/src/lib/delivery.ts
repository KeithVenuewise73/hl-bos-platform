/**
 * Inquiry delivery — PURE transport to the configured destination
 * (`HLD_INTAKE_WEBHOOK_URL`, read by the server wrapper in `persist.ts`).
 *
 * An inquiry counts as delivered ONLY when the destination accepts it (a 2xx
 * answer that does not say `{"ok": false}`). Anything else is reported as not
 * delivered, so the visitor is never told a request was received when it was
 * not (Principle 10).
 *
 * Retries: at most one retry, and only for failures that may be temporary
 * (network error, timeout, 408, 429, 5xx). Every attempt carries the same
 * `Idempotency-Key` (the submission id, also in the body) so the destination
 * can recognise a repeat of the same inquiry instead of storing it twice.
 */

export type DeliveryFailure = "not_configured" | "rejected" | "unreachable";

export type DeliveryResult =
  | { delivered: true; attempts: number }
  | {
      delivered: false;
      reason: DeliveryFailure;
      httpStatus?: number;
      attempts: number;
    };

export interface DeliveryOptions {
  url: string | undefined;
  submissionId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_ATTEMPTS = 2;

function retryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** A 2xx answer whose JSON body says `ok: false` is a refusal, not a delivery. */
async function refusedInBody(res: Response): Promise<boolean> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return false;
  try {
    const body = (await res.json()) as unknown;
    return (
      typeof body === "object" &&
      body !== null &&
      (body as { ok?: unknown }).ok === false
    );
  } catch {
    return false;
  }
}

export async function deliverInquiry(
  payload: unknown,
  opts: DeliveryOptions,
): Promise<DeliveryResult> {
  const url = opts.url?.trim();
  if (!url) return { delivered: false, reason: "not_configured", attempts: 0 };

  const doFetch = opts.fetchImpl ?? fetch;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const body = JSON.stringify(payload);
  let last: DeliveryResult = {
    delivered: false,
    reason: "unreachable",
    attempts: 0,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": opts.submissionId,
        },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (res.ok) {
        if (await refusedInBody(res)) {
          return {
            delivered: false,
            reason: "rejected",
            httpStatus: res.status,
            attempts: attempt,
          };
        }
        return { delivered: true, attempts: attempt };
      }
      last = {
        delivered: false,
        reason: "rejected",
        httpStatus: res.status,
        attempts: attempt,
      };
      if (!retryable(res.status)) return last;
    } catch {
      last = { delivered: false, reason: "unreachable", attempts: attempt };
    }
  }
  return last;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The submission id. A browser retry of the same form sends the same id, so the
 * destination can de-duplicate; anything that is not a UUID is replaced.
 */
export function submissionIdFrom(candidate: unknown): string {
  return typeof candidate === "string" && UUID_RE.test(candidate)
    ? candidate.toLowerCase()
    : crypto.randomUUID();
}

// HL Social publishing adapter abstraction (Phase 1).
//
// One interface in front of every channel. The publish worker selects an
// adapter by social.accounts.platform and never imports a vendor SDK anywhere
// else. Credentials are resolved from Vault BY REFERENCE
// (social.credentials.credential_ref, e.g. "vault:social_fb_page_1") — never
// read from a table, never hard-coded.
//
// Adapters do not touch the database. They take a target and return an
// outcome plus the full list of attempts they made, and the worker writes
// those rows. That keeps every adapter a pure function of (target, HTTP), so
// the whole publish path is unit-testable offline against a stubbed fetch —
// which is the only way to test this without publishing to a real audience.

export type SocialPlatform =
  "facebook_page" | "instagram" | "linkedin_member" | "tiktok_inbox";

export type SecretResolver = (vaultRef: string) => Promise<string>;

/** Injected so tests can stub the network. Defaults to global fetch. */
export type Fetcher = typeof fetch;

export interface MediaAsset {
  kind: "image" | "video";
  public_url: string;
  mime_type: string;
  position: number;
}

/** Exactly what social.claim_targets() hands the worker. */
export interface PublishTarget {
  targetId: string;
  postId: string;
  tenantId: string;
  platform: SocialPlatform;
  externalAccountId: string;
  accountConfig: Record<string, unknown>;
  credentialRef: string;
  body: string;
  caption: string;
  attemptNo: number;
  idempotencyKey: string;
  media: MediaAsset[];
}

/** One request/response pair, written verbatim to social.publish_attempts. */
export interface AttemptRecord {
  phase: string;
  ok: boolean;
  startedAt: string;
  httpStatus?: number;
  request?: unknown;
  response?: unknown;
  error?: string;
}

export interface PublishOutcome {
  /**
   * `delivered_to_inbox` is TikTok's terminal success and is NOT a
   * publication: the video sits in the account's inbox until a human opens the
   * app and posts it. No adapter may return `published` for TikTok, and the
   * database refuses it as well.
   */
  status: "published" | "delivered_to_inbox" | "failed";
  externalPostId?: string;
  permalink?: string;
  error?: string;
  /**
   * True = do not retry. Set for 4xx (retrying a rejected request just repeats
   * it) and, critically, for AMBIGUOUS outcomes — a request that timed out
   * after being sent may or may not have created a live post. None of these
   * four APIs offers an idempotency key on its publish endpoint, so a retry
   * after an ambiguous failure is how one scheduled item becomes two live
   * ones. Failing visibly is the correct trade.
   */
  terminal: boolean;
  attempts: AttemptRecord[];
}

export interface SocialAdapter {
  readonly platform: SocialPlatform;
  publish(target: PublishTarget, resolve: SecretResolver): Promise<PublishOutcome>;
}

export const GRAPH_VERSION = "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Per-request ceiling. Instagram container polling has its own budget. */
export const REQUEST_TIMEOUT_MS = 20_000;

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * A fetch that never throws. It returns a discriminated result so the caller
 * can tell "the platform said no" (a real answer) from "we never got an
 * answer" (ambiguous), because those two demand opposite retry decisions.
 */
export async function safeFetch(
  fetcher: Fetcher,
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<
  | { kind: "response"; status: number; body: unknown }
  | { kind: "ambiguous"; error: string }
> {
  try {
    const resp = await fetcher(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await resp.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      // Non-JSON bodies are kept as text rather than discarded: an HTML error
      // page from a proxy is evidence too.
    }
    return { kind: "response", status: resp.status, body };
  } catch (e) {
    // The request left; no answer came back. We cannot know whether it landed.
    return { kind: "ambiguous", error: String(e) };
  }
}

/** 429 and 5xx are worth another go; everything else in 4xx is not. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Pulls the platform's own error text out of a response body, for the log. */
export function errorText(status: number, body: unknown): string {
  const b = body as { error?: { message?: string; code?: unknown } } | null;
  const msg = b?.error?.message;
  return msg ? `http_${status}: ${msg}` : `http_${status}`;
}

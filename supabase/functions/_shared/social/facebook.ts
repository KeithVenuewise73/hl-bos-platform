// Facebook Page adapter — direct publish.
//
// The simplest of the four, which is why the build order puts it first: it
// proves the worker loop end to end before the harder container and inbox
// models are added.
//
// Text-only  -> POST /{page-id}/feed    { message }
// With image -> POST /{page-id}/photos  { url, caption }
//
// The Page access token is resolved from Vault at call time. It is sent in the
// Authorization header rather than the query string so it does not end up in
// an intermediary's URL logs.
import {
  type AttemptRecord,
  errorText,
  type Fetcher,
  GRAPH_BASE,
  isRetryableStatus,
  nowIso,
  type PublishOutcome,
  type PublishTarget,
  safeFetch,
  type SecretResolver,
  type SocialAdapter,
} from "./provider.ts";
import { redactPayload } from "./redact.ts";

export class FacebookPageAdapter implements SocialAdapter {
  readonly platform = "facebook_page" as const;
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async publish(
    target: PublishTarget,
    resolve: SecretResolver,
  ): Promise<PublishOutcome> {
    const attempts: AttemptRecord[] = [];
    const token = await resolve(target.credentialRef);
    const image = target.media.find((m) => m.kind === "image");

    const url = image
      ? `${GRAPH_BASE}/${target.externalAccountId}/photos`
      : `${GRAPH_BASE}/${target.externalAccountId}/feed`;
    const payload = image
      ? { url: image.public_url, caption: target.caption }
      : { message: target.caption };

    const startedAt = nowIso();
    const res = await safeFetch(this.fetcher, url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.kind === "ambiguous") {
      attempts.push({
        phase: "publish",
        ok: false,
        startedAt,
        request: redactPayload(payload, [token]),
        error: `ambiguous: ${res.error}`,
      });
      return {
        status: "failed",
        terminal: true,
        error: `ambiguous: no response from Facebook; the post may or may not be live. Check the Page before retrying. (${res.error})`,
        attempts,
      };
    }

    const ok = res.status >= 200 && res.status < 300;
    attempts.push({
      phase: "publish",
      ok,
      startedAt,
      httpStatus: res.status,
      request: redactPayload(payload, [token]),
      response: redactPayload(res.body, [token]),
      error: ok ? undefined : errorText(res.status, res.body),
    });

    if (!ok) {
      return {
        status: "failed",
        terminal: !isRetryableStatus(res.status),
        error: errorText(res.status, res.body),
        attempts,
      };
    }

    // /photos returns both the photo id and the resulting post id; the post id
    // is the thing a human can actually open.
    const body = res.body as { id?: string; post_id?: string };
    const externalPostId = body.post_id ?? body.id;
    if (!externalPostId) {
      // A 200 with no id is not a success. Recording one would be inventing a
      // published post, which the database refuses anyway.
      return {
        status: "failed",
        terminal: true,
        error: "facebook returned 2xx with no post id",
        attempts,
      };
    }
    return {
      status: "published",
      externalPostId,
      permalink: `https://www.facebook.com/${externalPostId}`,
      terminal: false,
      attempts,
    };
  }
}

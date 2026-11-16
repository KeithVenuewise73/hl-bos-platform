// Facebook Page adapter — direct publish.
//
// The simplest of the four, which is why the build order puts it first: it
// proves the worker loop end to end before the harder container and inbox
// models are added.
//
// Text-only  -> POST /{page-id}/feed    { message }
// With image -> POST /{page-id}/photos  { url, caption }
// Several    -> each picture is uploaded UNPUBLISHED (POST /{page-id}/photos
//               { url, published: false }), then ONE post is made that attaches
//               them all (POST /{page-id}/feed { message, attached_media }).
//               Only that last request can make anything live, so an unanswered
//               upload is safe to retry and an unanswered final request is not.
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
    const images = target.media
      .filter((m) => m.kind === "image")
      .sort((a, b) => a.position - b.position);
    if (images.length > 1) return await this.several(target, images, token);
    const image = images[0];

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

  // --- several pictures in one post ----------------------------------------

  private async several(
    target: PublishTarget,
    images: PublishTarget["media"],
    token: string,
  ): Promise<PublishOutcome> {
    const attempts: AttemptRecord[] = [];
    const auth = {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    };
    const mediaIds: string[] = [];

    // Step 1: every picture, unpublished. None of these is a post.
    for (const [i, image] of images.entries()) {
      const payload = { url: image.public_url, published: false };
      const startedAt = nowIso();
      const res = await safeFetch(
        this.fetcher,
        `${GRAPH_BASE}/${target.externalAccountId}/photos`,
        {
          method: "POST",
          headers: auth,
          body: JSON.stringify(payload),
        },
      );
      if (res.kind === "ambiguous") {
        attempts.push({
          phase: `upload_${i + 1}`,
          ok: false,
          startedAt,
          request: redactPayload(payload, [token]),
          error: `ambiguous: ${res.error}`,
        });
        // Nothing is live yet, so trying again is safe.
        return {
          status: "failed",
          terminal: false,
          error: `no response from Facebook while uploading picture ${i + 1}; nothing was posted (${res.error})`,
          attempts,
        };
      }
      const ok = res.status >= 200 && res.status < 300;
      const id = (res.body as { id?: string } | null)?.id;
      attempts.push({
        phase: `upload_${i + 1}`,
        ok: ok && !!id,
        startedAt,
        httpStatus: res.status,
        request: redactPayload(payload, [token]),
        response: redactPayload(res.body, [token]),
        error: ok && id ? undefined : errorText(res.status, res.body),
      });
      if (!ok || !id) {
        return {
          status: "failed",
          terminal: !isRetryableStatus(res.status),
          error: ok
            ? `facebook returned 2xx with no id for picture ${i + 1}`
            : errorText(res.status, res.body),
          attempts,
        };
      }
      mediaIds.push(id);
    }

    // Step 2: the one request that makes it live.
    const payload = {
      message: target.caption,
      attached_media: mediaIds.map((media_fbid) => ({ media_fbid })),
    };
    const startedAt = nowIso();
    const res = await safeFetch(
      this.fetcher,
      `${GRAPH_BASE}/${target.externalAccountId}/feed`,
      {
        method: "POST",
        headers: auth,
        body: JSON.stringify(payload),
      },
    );
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
    const externalPostId = (res.body as { id?: string } | null)?.id;
    if (!externalPostId) {
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

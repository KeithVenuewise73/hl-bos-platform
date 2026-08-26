// Instagram adapter — the two-step container model.
//
//   1. POST /{ig-user-id}/media          -> creation_id
//   2. GET  /{creation_id}?fields=status_code  (poll until FINISHED)
//   3. POST /{ig-user-id}/media_publish  -> the published media id
//
// Two hard requirements that are NOT negotiable and NOT detectable at publish
// time if you get them wrong:
//
//   * The account must be an Instagram PROFESSIONAL account (Business or
//     Creator) LINKED to a Facebook Page. A personal account cannot publish
//     through the API at all. The link is enforced structurally in migration
//     0046 (social.accounts CHECK), so an unlinked account cannot even be
//     registered as a channel.
//
//   * The image must be JPEG and served from a PUBLIC https URL. Instagram
//     fetches the bytes itself from its own servers, so a private bucket URL
//     or a signed URL that expires will fail at container creation. Also
//     enforced in the migration.
//
// Instagram cannot post text alone. A target with no image fails immediately
// and says why, rather than burning five retries on something that can never
// succeed.
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

/** Container processing is usually seconds; the ceiling stops a stuck poll. */
export const CONTAINER_POLL_ATTEMPTS = 10;
export const CONTAINER_POLL_INTERVAL_MS = 3_000;

export class InstagramAdapter implements SocialAdapter {
  readonly platform = "instagram" as const;
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  async publish(
    target: PublishTarget,
    resolve: SecretResolver,
  ): Promise<PublishOutcome> {
    const attempts: AttemptRecord[] = [];
    const image = target.media.find((m) => m.kind === "image");
    if (!image) {
      return {
        status: "failed",
        terminal: true,
        error:
          "instagram requires an image; a text-only post cannot be published via the API",
        attempts,
      };
    }

    const token = await resolve(target.credentialRef);
    const auth = {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    };

    // --- 1. create the container ---------------------------------------
    const createPayload = {
      image_url: image.public_url,
      caption: target.caption,
    };
    let startedAt = nowIso();
    const created = await safeFetch(
      this.fetcher,
      `${GRAPH_BASE}/${target.externalAccountId}/media`,
      { method: "POST", headers: auth, body: JSON.stringify(createPayload) },
    );
    if (created.kind === "ambiguous") {
      // A container is not a post. An unanswered container creation is safe to
      // retry: at worst it leaves an unpublished container behind.
      attempts.push({
        phase: "create_container",
        ok: false,
        startedAt,
        request: redactPayload(createPayload, [token]),
        error: created.error,
      });
      return {
        status: "failed",
        terminal: false,
        error: `container creation got no response: ${created.error}`,
        attempts,
      };
    }
    const createdOk = created.status >= 200 && created.status < 300;
    const creationId = (created.body as { id?: string })?.id;
    attempts.push({
      phase: "create_container",
      ok: createdOk && !!creationId,
      startedAt,
      httpStatus: created.status,
      request: redactPayload(createPayload, [token]),
      response: redactPayload(created.body, [token]),
      error: createdOk ? undefined : errorText(created.status, created.body),
    });
    if (!createdOk || !creationId) {
      return {
        status: "failed",
        terminal: createdOk ? true : !isRetryableStatus(created.status),
        error: createdOk
          ? "instagram returned 2xx with no creation id"
          : errorText(created.status, created.body),
        attempts,
      };
    }

    // --- 2. poll the container ------------------------------------------
    let ready = false;
    for (let i = 0; i < CONTAINER_POLL_ATTEMPTS; i++) {
      await this.sleep(CONTAINER_POLL_INTERVAL_MS);
      startedAt = nowIso();
      const poll = await safeFetch(
        this.fetcher,
        `${GRAPH_BASE}/${creationId}?fields=status_code,status`,
        { method: "GET", headers: auth },
      );
      if (poll.kind === "ambiguous") {
        attempts.push({
          phase: "poll",
          ok: false,
          startedAt,
          error: poll.error,
        });
        continue; // a failed poll tells us nothing; try again within budget
      }
      const code = (poll.body as { status_code?: string })?.status_code;
      attempts.push({
        phase: "poll",
        ok: poll.status < 300,
        startedAt,
        httpStatus: poll.status,
        response: redactPayload(poll.body, [token]),
      });
      if (code === "FINISHED") {
        ready = true;
        break;
      }
      if (code === "ERROR" || code === "EXPIRED") {
        return {
          status: "failed",
          terminal: true,
          error: `instagram container ${code}`,
          attempts,
        };
      }
    }
    if (!ready) {
      // Never published, so retrying is safe and correct.
      return {
        status: "failed",
        terminal: false,
        error: "instagram container did not finish processing within the poll budget",
        attempts,
      };
    }

    // --- 3. publish -------------------------------------------------------
    const publishPayload = { creation_id: creationId };
    startedAt = nowIso();
    const published = await safeFetch(
      this.fetcher,
      `${GRAPH_BASE}/${target.externalAccountId}/media_publish`,
      { method: "POST", headers: auth, body: JSON.stringify(publishPayload) },
    );
    if (published.kind === "ambiguous") {
      attempts.push({
        phase: "publish",
        ok: false,
        startedAt,
        request: redactPayload(publishPayload, [token]),
        error: `ambiguous: ${published.error}`,
      });
      return {
        status: "failed",
        terminal: true,
        error: `ambiguous: no response from Instagram media_publish; the post may or may not be live. Check the account before retrying. (${published.error})`,
        attempts,
      };
    }
    const pubOk = published.status >= 200 && published.status < 300;
    const mediaId = (published.body as { id?: string })?.id;
    attempts.push({
      phase: "publish",
      ok: pubOk && !!mediaId,
      startedAt,
      httpStatus: published.status,
      request: redactPayload(publishPayload, [token]),
      response: redactPayload(published.body, [token]),
      error: pubOk ? undefined : errorText(published.status, published.body),
    });
    if (!pubOk || !mediaId) {
      return {
        status: "failed",
        terminal: pubOk ? true : !isRetryableStatus(published.status),
        error: pubOk
          ? "instagram returned 2xx with no media id"
          : errorText(published.status, published.body),
        attempts,
      };
    }
    return {
      status: "published",
      externalPostId: mediaId,
      terminal: false,
      attempts,
    };
  }
}

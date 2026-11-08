// Instagram adapter — the container model, for one picture or a carousel.
//
// One picture:
//   1. POST /{ig-user-id}/media          -> creation_id
//   2. GET  /{creation_id}?fields=status_code  (poll until FINISHED)
//   3. POST /{ig-user-id}/media_publish  -> the published media id
//
// A carousel (2 to 10 pictures) adds one container per picture first:
//   1. POST /{ig-user-id}/media  {image_url, is_carousel_item}  per picture
//   2. poll each picture's container until FINISHED
//   3. POST /{ig-user-id}/media  {media_type: CAROUSEL, children, caption}
//   4. poll that container, then POST /{ig-user-id}/media_publish
// The caption belongs to the carousel, never to a picture inside it.
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
//
// The one rule that matters most: only media_publish can make something live.
// Everything before it creates containers, which are not posts, so an
// unanswered container request is safe to retry. An unanswered media_publish
// is NOT: the post may be live, and a retry could make it live twice.
import {
  type AttemptRecord,
  errorText,
  type Fetcher,
  GRAPH_BASE,
  isRetryableStatus,
  type MediaAsset,
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

/** What Instagram accepts in one carousel. */
export const CAROUSEL_MIN = 2;
export const CAROUSEL_MAX = 10;

type Step<T> = { ok: true; value: T } | { ok: false; outcome: PublishOutcome };

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
    const images = target.media
      .filter((m) => m.kind === "image")
      .sort((a, b) => a.position - b.position);
    if (images.length === 0) {
      return {
        status: "failed",
        terminal: true,
        error:
          "instagram requires an image; a text-only post cannot be published via the API",
        attempts,
      };
    }
    if (images.length > CAROUSEL_MAX) {
      return {
        status: "failed",
        terminal: true,
        error: `an instagram carousel holds at most ${CAROUSEL_MAX} pictures; this post has ${images.length}`,
        attempts,
      };
    }
    if (images.length >= CAROUSEL_MIN && target.media.some((m) => m.kind === "video")) {
      return {
        status: "failed",
        terminal: true,
        error:
          "an instagram carousel here holds pictures only; a video inside a carousel is not supported yet",
        attempts,
      };
    }

    const token = await resolve(target.credentialRef);
    const auth = {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    };

    return images.length === 1
      ? await this.single(target, images[0]!, auth, token, attempts)
      : await this.carousel(target, images, auth, token, attempts);
  }

  // --- one picture --------------------------------------------------------

  private async single(
    target: PublishTarget,
    image: MediaAsset,
    auth: Record<string, string>,
    token: string,
    attempts: AttemptRecord[],
  ): Promise<PublishOutcome> {
    const created = await this.create(
      target,
      auth,
      token,
      { image_url: image.public_url, caption: target.caption },
      "create_container",
      "container creation",
      attempts,
    );
    if (!created.ok) return created.outcome;
    const failed = await this.waitUntilFinished(
      created.value,
      auth,
      token,
      "container",
      attempts,
    );
    if (failed !== null) return failed;
    return await this.publishContainer(target, created.value, auth, token, attempts);
  }

  // --- a carousel -----------------------------------------------------------

  private async carousel(
    target: PublishTarget,
    images: MediaAsset[],
    auth: Record<string, string>,
    token: string,
    attempts: AttemptRecord[],
  ): Promise<PublishOutcome> {
    const children: string[] = [];
    for (const [i, image] of images.entries()) {
      const child = await this.create(
        target,
        auth,
        token,
        { image_url: image.public_url, is_carousel_item: true },
        "create_child",
        `carousel picture ${i + 1} of ${images.length}`,
        attempts,
      );
      if (!child.ok) return child.outcome;
      children.push(child.value);
    }
    for (const [i, id] of children.entries()) {
      const failed = await this.waitUntilFinished(
        id,
        auth,
        token,
        `carousel picture ${i + 1}`,
        attempts,
        "poll_child",
      );
      if (failed !== null) return failed;
    }
    const parent = await this.create(
      target,
      auth,
      token,
      { media_type: "CAROUSEL", children: children.join(","), caption: target.caption },
      "create_container",
      "carousel creation",
      attempts,
    );
    if (!parent.ok) return parent.outcome;
    const failed = await this.waitUntilFinished(
      parent.value,
      auth,
      token,
      "carousel",
      attempts,
    );
    if (failed !== null) return failed;
    return await this.publishContainer(target, parent.value, auth, token, attempts);
  }

  // --- the shared steps ----------------------------------------------------

  /** Create one container. A container is not a post: an unanswered request is safe to retry. */
  private async create(
    target: PublishTarget,
    auth: Record<string, string>,
    token: string,
    payload: Record<string, unknown>,
    phase: string,
    label: string,
    attempts: AttemptRecord[],
  ): Promise<Step<string>> {
    const startedAt = nowIso();
    const created = await safeFetch(
      this.fetcher,
      `${GRAPH_BASE}/${target.externalAccountId}/media`,
      { method: "POST", headers: auth, body: JSON.stringify(payload) },
    );
    if (created.kind === "ambiguous") {
      attempts.push({
        phase,
        ok: false,
        startedAt,
        request: redactPayload(payload, [token]),
        error: created.error,
      });
      return {
        ok: false,
        outcome: {
          status: "failed",
          terminal: false,
          error: `${label} got no response: ${created.error}`,
          attempts,
        },
      };
    }
    const createdOk = created.status >= 200 && created.status < 300;
    const id = (created.body as { id?: string })?.id;
    attempts.push({
      phase,
      ok: createdOk && !!id,
      startedAt,
      httpStatus: created.status,
      request: redactPayload(payload, [token]),
      response: redactPayload(created.body, [token]),
      error: createdOk ? undefined : errorText(created.status, created.body),
    });
    if (!createdOk || !id) {
      return {
        ok: false,
        outcome: {
          status: "failed",
          terminal: createdOk ? true : !isRetryableStatus(created.status),
          error: createdOk
            ? "instagram returned 2xx with no creation id"
            : errorText(created.status, created.body),
          attempts,
        },
      };
    }
    return { ok: true, value: id };
  }

  /** Poll one container until Instagram has finished with it. null = ready. */
  private async waitUntilFinished(
    id: string,
    auth: Record<string, string>,
    token: string,
    label: string,
    attempts: AttemptRecord[],
    phase = "poll",
  ): Promise<PublishOutcome | null> {
    for (let i = 0; i < CONTAINER_POLL_ATTEMPTS; i++) {
      await this.sleep(CONTAINER_POLL_INTERVAL_MS);
      const startedAt = nowIso();
      const poll = await safeFetch(
        this.fetcher,
        `${GRAPH_BASE}/${id}?fields=status_code,status`,
        { method: "GET", headers: auth },
      );
      if (poll.kind === "ambiguous") {
        attempts.push({ phase, ok: false, startedAt, error: poll.error });
        continue; // a failed poll tells us nothing; try again within budget
      }
      const code = (poll.body as { status_code?: string })?.status_code;
      attempts.push({
        phase,
        ok: poll.status < 300,
        startedAt,
        httpStatus: poll.status,
        response: redactPayload(poll.body, [token]),
      });
      if (code === "FINISHED") return null;
      if (code === "ERROR" || code === "EXPIRED") {
        return {
          status: "failed",
          terminal: true,
          error: `instagram ${label} ${code}`,
          attempts,
        };
      }
    }
    // Never published, so retrying is safe and correct.
    return {
      status: "failed",
      terminal: false,
      error: `instagram ${label} did not finish processing within the poll budget`,
      attempts,
    };
  }

  /** The only step that makes anything live, so the only one never retried when unanswered. */
  private async publishContainer(
    target: PublishTarget,
    creationId: string,
    auth: Record<string, string>,
    token: string,
    attempts: AttemptRecord[],
  ): Promise<PublishOutcome> {
    const publishPayload = { creation_id: creationId };
    const startedAt = nowIso();
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

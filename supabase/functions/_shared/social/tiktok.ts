// TikTok adapter — UPLOAD TO INBOX ONLY. This never makes a post public.
//
// POST /v2/post/publish/inbox/video/init/  { source_info: PULL_FROM_URL }
//
// The video lands in the account's TikTok inbox as a draft. The account owner
// opens the app and publishes it. That is the whole Phase 1 scope, on purpose:
//
//   Direct Post is deliberately NOT implemented. An unaudited client is forced
//   to SELF_ONLY visibility server-side, so the posts are invisible to
//   everyone, and passing the audit later does NOT retroactively publish them.
//   Building it would produce a feature that looks like it works and does not.
//
// So this adapter can only ever return `delivered_to_inbox`, never
// `published`. The database enforces the same rule from the other side.
//
// PULL_FROM_URL requires the serving domain to be verified in the TikTok
// developer portal. An unverified domain fails here with url_ownership_unverified,
// which is a setup task, not a bug.
import {
  type AttemptRecord,
  type Fetcher,
  isRetryableStatus,
  nowIso,
  type PublishOutcome,
  type PublishTarget,
  safeFetch,
  type SecretResolver,
  type SocialAdapter,
} from "./provider.ts";
import { redactPayload } from "./redact.ts";

const INBOX_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";

export class TikTokInboxAdapter implements SocialAdapter {
  readonly platform = "tiktok_inbox" as const;
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async publish(
    target: PublishTarget,
    resolve: SecretResolver,
  ): Promise<PublishOutcome> {
    const attempts: AttemptRecord[] = [];
    const video = target.media.find((m) => m.kind === "video");
    if (!video) {
      return {
        status: "failed",
        terminal: true,
        error: "tiktok inbox upload requires a video asset",
        attempts,
      };
    }

    const token = await resolve(target.credentialRef);
    const payload = {
      source_info: { source: "PULL_FROM_URL", video_url: video.public_url },
    };

    const startedAt = nowIso();
    const res = await safeFetch(this.fetcher, INBOX_INIT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=UTF-8",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.kind === "ambiguous") {
      attempts.push({
        phase: "upload",
        ok: false,
        startedAt,
        request: redactPayload(payload, [token]),
        error: `ambiguous: ${res.error}`,
      });
      return {
        status: "failed",
        terminal: true,
        error: `ambiguous: no response from TikTok; the video may or may not be in the inbox. Check the account before retrying. (${res.error})`,
        attempts,
      };
    }

    const body = res.body as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string };
    };
    // TikTok returns 200 with error.code = "ok" on success, so the HTTP status
    // alone is not the answer.
    const apiCode = body?.error?.code;
    const publishId = body?.data?.publish_id;
    const ok =
      res.status < 300 && (apiCode === "ok" || apiCode === undefined) && !!publishId;

    attempts.push({
      phase: "upload",
      ok,
      startedAt,
      httpStatus: res.status,
      request: redactPayload(payload, [token]),
      response: redactPayload(res.body, [token]),
      error: ok
        ? undefined
        : `tiktok_${apiCode ?? res.status}: ${body?.error?.message ?? ""}`.trim(),
    });

    if (!ok) {
      return {
        status: "failed",
        terminal: !isRetryableStatus(res.status),
        error: `tiktok_${apiCode ?? res.status}: ${body?.error?.message ?? ""}`.trim(),
        attempts,
      };
    }

    return {
      // NOT `published`. The video is in the inbox; a human still has to post it.
      status: "delivered_to_inbox",
      externalPostId: publishId,
      terminal: false,
      attempts,
    };
  }
}

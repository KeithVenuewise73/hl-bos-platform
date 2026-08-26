// LinkedIn adapter — PERSONAL PROFILE ONLY (w_member_social).
//
// The author URN is the member, never an organization. Publishing to a company
// page needs w_organization_social, which requires Community Management API
// partner review — weeks to months, and generic-scheduler use cases are
// routinely rejected. That is Phase 1's stated boundary, and this adapter
// refuses an organization URN rather than failing obscurely at the API.
//
// LinkedIn has no native scheduling. The worker owns timing entirely.
// Rate ceiling is roughly 100 calls per day per member.
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

const UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";

export class LinkedInMemberAdapter implements SocialAdapter {
  readonly platform = "linkedin_member" as const;
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async publish(
    target: PublishTarget,
    resolve: SecretResolver,
  ): Promise<PublishOutcome> {
    const attempts: AttemptRecord[] = [];
    const author = target.externalAccountId;

    if (!author.startsWith("urn:li:person:")) {
      return {
        status: "failed",
        terminal: true,
        error:
          "linkedin_member publishes as a person URN only; an organization URN needs w_organization_social, which is out of scope for Phase 1",
        attempts,
      };
    }

    const token = await resolve(target.credentialRef);
    // Media is deliberately not attached here: registering an image asset is a
    // separate multi-call upload flow, and shipping a half-working version of
    // it would be worse than not having it. Text shares work; images on
    // LinkedIn are Phase 1b.
    const payload = {
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: target.caption },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const startedAt = nowIso();
    const res = await safeFetch(this.fetcher, UGC_POSTS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "X-Restli-Protocol-Version": "2.0.0",
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
        error: `ambiguous: no response from LinkedIn; the share may or may not be live. Check the profile before retrying. (${res.error})`,
        attempts,
      };
    }

    const ok = res.status >= 200 && res.status < 300;
    const shareUrn = (res.body as { id?: string })?.id;
    attempts.push({
      phase: "publish",
      ok: ok && !!shareUrn,
      startedAt,
      httpStatus: res.status,
      request: redactPayload(payload, [token]),
      response: redactPayload(res.body, [token]),
      error: ok ? undefined : `http_${res.status}`,
    });

    if (!ok) {
      return {
        status: "failed",
        terminal: !isRetryableStatus(res.status),
        error: `http_${res.status}`,
        attempts,
      };
    }
    if (!shareUrn) {
      return {
        status: "failed",
        terminal: true,
        error: "linkedin returned 2xx with no share urn",
        attempts,
      };
    }
    return {
      status: "published",
      externalPostId: shareUrn,
      permalink: `https://www.linkedin.com/feed/update/${shareUrn}/`,
      terminal: false,
      attempts,
    };
  }
}

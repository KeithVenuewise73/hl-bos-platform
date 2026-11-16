// The publisher for the review area's "Post to social": it turns a claimed target and its
// photos' public addresses into a call to the existing, tested Instagram / Facebook
// adapters (../social), with the login token read from the secret NAMED on the account.
// A token is never stored in the database and never appears in what is logged.

import { FacebookPageAdapter } from "../social/facebook.ts";
import { InstagramAdapter } from "../social/instagram.ts";
import type { PublishTarget, SocialAdapter } from "../social/provider.ts";
import type { ClaimedTarget, SocialOutcome, SocialPublisher } from "./core.ts";

export interface SocialOptions {
  /** Reads a secret by its name (Deno.env.get in the deployed function). */
  secret(name: string): string | undefined;
  fetcher?: typeof fetch;
  /** Instagram checks a picture is ready by polling; tests pass a no-wait sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export function makeSocialPublisher(opts: SocialOptions): SocialPublisher {
  const fetcher = opts.fetcher ?? fetch;
  return {
    async publish(t: ClaimedTarget, photos): Promise<SocialOutcome> {
      const token = opts.secret(t.token_secret_name);
      if (!token) {
        return {
          status: "failed",
          error: `The login for ${t.display_name} is not set up yet, so nothing was posted.`,
          attempts: [],
        };
      }
      const target: PublishTarget = {
        targetId: t.target_id,
        postId: "",
        tenantId: "",
        platform: t.platform,
        externalAccountId: t.external_account_id,
        accountConfig: { facebook_page_id: t.facebook_page_id },
        credentialRef: t.token_secret_name,
        body: t.caption,
        caption: t.caption,
        attemptNo: t.attempt_no,
        idempotencyKey: `target_${t.target_id}`,
        media: photos.map((p, i) => ({
          kind: "image" as const,
          public_url: p.public_url,
          mime_type: "image/jpeg",
          position: i,
        })),
      };
      const adapter: SocialAdapter =
        t.platform === "instagram"
          ? new InstagramAdapter(fetcher, opts.sleep)
          : new FacebookPageAdapter(fetcher);
      const out = await adapter.publish(target, () => Promise.resolve(token));
      return {
        status: out.status === "published" ? "published" : "failed",
        externalPostId: out.externalPostId,
        permalink: out.permalink,
        error: out.error,
        attempts: out.attempts.map((a) => ({
          phase: a.phase,
          ok: a.ok,
          httpStatus: a.httpStatus,
          request: a.request,
          response: a.response,
          error: a.error,
        })),
      };
    },
  };
}

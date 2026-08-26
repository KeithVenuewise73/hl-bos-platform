// HL Social publishing — edge-layer unit tests (Deno).
//
// Covers the half of the module that lives in the edge functions, not the DB:
// the four adapters against a stubbed fetch, secret redaction of the attempt
// log, the ambiguous-outcome safeguard, the worker's per-target independence,
// and the token-refresh job's loud-failure behaviour.
//
// Self-contained: no remote imports, so it runs offline
// (`deno test --no-check supabase/functions/tests/`).
//
// The DB half (RLS, the approval gate, claim/complete, the append-only attempt
// log, the post rollup) is covered by supabase/tests/46_social_publishing.sql.

import { FacebookPageAdapter } from "../_shared/social/facebook.ts";
import { InstagramAdapter } from "../_shared/social/instagram.ts";
import { LinkedInMemberAdapter } from "../_shared/social/linkedin.ts";
import { TikTokInboxAdapter } from "../_shared/social/tiktok.ts";
import { MockSocialAdapter } from "../_shared/social/mock.ts";
import { redactPayload, redactSocial } from "../_shared/social/redact.ts";
import { runPublishWorker } from "../_shared/social/worker.ts";
import { runTokenRefresh } from "../_shared/social/token-refresh.ts";
import type { PublishTarget } from "../_shared/social/provider.ts";

// --- tiny inline assertions (no std import, so no network needed) -----------
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`assertion failed: ${msg} (got ${a}, want ${b})`);
}

const TOKEN = "EAAGabcdefghijklmnopqrstuvwxyz0123456789";
const resolve = () => Promise.resolve(TOKEN);

function target(over: Partial<PublishTarget> = {}): PublishTarget {
  return {
    targetId: "t-1",
    postId: "p-1",
    tenantId: "tn-1",
    platform: "facebook_page",
    externalAccountId: "fb-page-1",
    accountConfig: {},
    credentialRef: "vault:social_fb_page_1",
    body: "Morning Chaos",
    caption: "Morning Chaos",
    attemptNo: 1,
    idempotencyKey: "post_p-1_acct_a-1",
    media: [],
    ...over,
  };
}

const JPEG = {
  kind: "image" as const,
  public_url: "https://cdn.test/a.jpg",
  mime_type: "image/jpeg",
  position: 0,
};
const MP4 = {
  kind: "video" as const,
  public_url: "https://cdn.test/v.mp4",
  mime_type: "video/mp4",
  position: 0,
};

/** A fetch stub that replays a queue of responses and records the requests. */
function stubFetch(
  queue: Array<{ status: number; body: unknown } | { throws: string }>,
) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = ((url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const next = queue.shift();
    if (!next) return Promise.reject(new Error("stubFetch: no queued response"));
    if ("throws" in next) return Promise.reject(new Error(next.throws));
    return Promise.resolve(
      new Response(JSON.stringify(next.body), { status: next.status }),
    );
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

// --- Facebook ---------------------------------------------------------------
Deno.test("facebook: text post returns the post id and a permalink", async () => {
  const { fetcher, calls } = stubFetch([{ status: 200, body: { id: "fb_9001" } }]);
  const out = await new FacebookPageAdapter(fetcher).publish(target(), resolve);
  assertEquals(out.status, "published", "published");
  assertEquals(out.externalPostId, "fb_9001", "post id");
  assert(out.permalink?.includes("fb_9001"), "permalink points at the post");
  assert(calls[0].url.endsWith("/feed"), "text posts go to /feed");
});

Deno.test("facebook: an image post goes to /photos and prefers post_id", async () => {
  const { fetcher, calls } = stubFetch([
    { status: 200, body: { id: "ph_1", post_id: "fb_9002" } },
  ]);
  const out = await new FacebookPageAdapter(fetcher).publish(
    target({ media: [JPEG] }),
    resolve,
  );
  assert(calls[0].url.endsWith("/photos"), "image posts go to /photos");
  // /photos returns both ids; the post id is the one a human can open.
  assertEquals(out.externalPostId, "fb_9002", "prefers post_id over photo id");
});

Deno.test(
  "facebook: a 2xx with no id is a failure, not an invented success",
  async () => {
    const { fetcher } = stubFetch([{ status: 200, body: {} }]);
    const out = await new FacebookPageAdapter(fetcher).publish(target(), resolve);
    assertEquals(out.status, "failed", "failed");
    assert(out.terminal, "not retried");
    assertEquals(out.externalPostId, undefined, "no fabricated id");
  },
);

Deno.test("facebook: 4xx is terminal, 5xx is retryable", async () => {
  const bad = stubFetch([{ status: 400, body: { error: { message: "nope" } } }]);
  const a = await new FacebookPageAdapter(bad.fetcher).publish(target(), resolve);
  assert(a.terminal, "4xx not retried");
  const server = stubFetch([{ status: 503, body: {} }]);
  const b = await new FacebookPageAdapter(server.fetcher).publish(target(), resolve);
  assert(!b.terminal, "5xx is retried");
});

Deno.test("facebook: an unanswered publish is TERMINAL, never retried", async () => {
  // The single most important behaviour in the module: retrying a request that
  // may already have created a live post is how one item becomes two.
  const { fetcher } = stubFetch([{ throws: "network timeout" }]);
  const out = await new FacebookPageAdapter(fetcher).publish(target(), resolve);
  assertEquals(out.status, "failed", "failed");
  assert(out.terminal, "ambiguous outcomes are never retried");
  assert(out.error?.startsWith("ambiguous:"), "labelled ambiguous");
  assert(out.error?.includes("may or may not be live"), "says so plainly");
});

Deno.test("facebook: the access token never reaches the attempt log", async () => {
  const { fetcher } = stubFetch([{ status: 200, body: { id: "fb_1", token: TOKEN } }]);
  const out = await new FacebookPageAdapter(fetcher).publish(target(), resolve);
  const dump = JSON.stringify(out.attempts);
  assert(!dump.includes(TOKEN), "token absent from the attempt log");
  assert(dump.includes("[REDACTED]"), "and visibly masked");
});

// --- Instagram --------------------------------------------------------------
const noSleep = () => Promise.resolve();

Deno.test("instagram: container -> poll -> publish", async () => {
  const { fetcher, calls } = stubFetch([
    { status: 200, body: { id: "ig_container_1" } },
    { status: 200, body: { status_code: "IN_PROGRESS" } },
    { status: 200, body: { status_code: "FINISHED" } },
    { status: 200, body: { id: "ig_7002" } },
  ]);
  const out = await new InstagramAdapter(fetcher, noSleep).publish(
    target({ platform: "instagram", externalAccountId: "ig-user-1", media: [JPEG] }),
    resolve,
  );
  assertEquals(out.status, "published", "published");
  assertEquals(out.externalPostId, "ig_7002", "media id");
  assertEquals(calls.length, 4, "create, two polls, publish");
  assert(calls[3].url.endsWith("/media_publish"), "final call publishes");
  assertEquals(out.attempts.length, 4, "every step logged");
});

Deno.test("instagram: a text-only post fails immediately and says why", async () => {
  const { fetcher, calls } = stubFetch([]);
  const out = await new InstagramAdapter(fetcher, noSleep).publish(
    target({ platform: "instagram" }),
    resolve,
  );
  assertEquals(out.status, "failed", "failed");
  assert(out.terminal, "never retried - it can never succeed");
  assert(out.error?.includes("requires an image"), "explains the reason");
  assertEquals(calls.length, 0, "no pointless network call");
});

Deno.test("instagram: a container ERROR is terminal", async () => {
  const { fetcher } = stubFetch([
    { status: 200, body: { id: "c1" } },
    { status: 200, body: { status_code: "ERROR" } },
  ]);
  const out = await new InstagramAdapter(fetcher, noSleep).publish(
    target({ platform: "instagram", media: [JPEG] }),
    resolve,
  );
  assertEquals(out.status, "failed", "failed");
  assert(out.terminal, "terminal");
});

Deno.test("instagram: an unanswered CONTAINER creation is retryable", async () => {
  // A container is not a post. Unlike media_publish, nothing can be live yet,
  // so this one is safe to retry - and must be, or a blip loses the post.
  const { fetcher } = stubFetch([{ throws: "timeout" }]);
  const out = await new InstagramAdapter(fetcher, noSleep).publish(
    target({ platform: "instagram", media: [JPEG] }),
    resolve,
  );
  assert(!out.terminal, "container creation is safe to retry");
});

// --- LinkedIn ---------------------------------------------------------------
Deno.test("linkedin: publishes as a person urn", async () => {
  const { fetcher, calls } = stubFetch([
    { status: 201, body: { id: "urn:li:share:5003" } },
  ]);
  const out = await new LinkedInMemberAdapter(fetcher).publish(
    target({ platform: "linkedin_member", externalAccountId: "urn:li:person:xyz" }),
    resolve,
  );
  assertEquals(out.status, "published", "published");
  assertEquals(out.externalPostId, "urn:li:share:5003", "share urn");
  const body = JSON.parse(String(calls[0].init.body));
  assertEquals(body.author, "urn:li:person:xyz", "author is the member");
});

Deno.test("linkedin: an organization urn is refused, not attempted", async () => {
  // w_organization_social needs Community Management API partner review, which
  // Phase 1 explicitly does not pursue. Failing here beats a cryptic 403.
  const { fetcher, calls } = stubFetch([]);
  const out = await new LinkedInMemberAdapter(fetcher).publish(
    target({
      platform: "linkedin_member",
      externalAccountId: "urn:li:organization:99",
    }),
    resolve,
  );
  assertEquals(out.status, "failed", "failed");
  assert(out.terminal, "terminal");
  assert(out.error?.includes("w_organization_social"), "names the real reason");
  assertEquals(calls.length, 0, "no call made");
});

// --- TikTok -----------------------------------------------------------------
Deno.test(
  "tiktok: an inbox upload is delivered_to_inbox, never published",
  async () => {
    const { fetcher, calls } = stubFetch([
      {
        status: 200,
        body: { data: { publish_id: "tt_pub_1" }, error: { code: "ok" } },
      },
    ]);
    const out = await new TikTokInboxAdapter(fetcher).publish(
      target({
        platform: "tiktok_inbox",
        externalAccountId: "tt-open-1",
        media: [MP4],
      }),
      resolve,
    );
    // The video is in the inbox. A human still has to open the app and post it.
    assertEquals(out.status, "delivered_to_inbox", "inbox, not published");
    assertEquals(out.externalPostId, "tt_pub_1", "publish id");
    assert(calls[0].url.includes("/inbox/video/init/"), "inbox endpoint only");
    assert(!calls[0].url.includes("direct"), "never the direct-post endpoint");
  },
);

Deno.test("tiktok: a video is required", async () => {
  const { fetcher, calls } = stubFetch([]);
  const out = await new TikTokInboxAdapter(fetcher).publish(
    target({ platform: "tiktok_inbox" }),
    resolve,
  );
  assertEquals(out.status, "failed", "failed");
  assert(out.terminal, "terminal");
  assertEquals(calls.length, 0, "no call made");
});

Deno.test("tiktok: a 200 carrying an error code is a failure", async () => {
  // TikTok returns HTTP 200 with error.code set, so status alone lies.
  const { fetcher } = stubFetch([
    {
      status: 200,
      body: {
        error: { code: "url_ownership_unverified", message: "verify the domain" },
      },
    },
  ]);
  const out = await new TikTokInboxAdapter(fetcher).publish(
    target({ platform: "tiktok_inbox", media: [MP4] }),
    resolve,
  );
  assertEquals(out.status, "failed", "failed despite HTTP 200");
  assert(out.error?.includes("url_ownership_unverified"), "carries the real code");
});

// --- Redaction --------------------------------------------------------------
Deno.test("redaction masks social token shapes and query-string secrets", () => {
  assert(!redactSocial(`Bearer ${TOKEN}`).includes(TOKEN), "meta token");
  assert(
    !redactSocial("AQVabcdefghijklmnopqrstuvwxyz01").includes("AQVabcdefghij"),
    "linkedin token",
  );
  assert(
    !redactSocial("act.abcdefghijklmnopqrstuvwxyz01").includes("act.abcdefghij"),
    "tiktok token",
  );
  assert(
    !redactSocial("...client_secret=hunter2hunter2...").includes("hunter2"),
    "app secret in a query string",
  );
});

Deno.test("redactPayload fails closed on an unserialisable payload", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const out = redactPayload(cyclic) as { redaction?: string };
  assertEquals(out.redaction, "payload_not_serialisable", "marker, not raw");
});

// --- Worker -----------------------------------------------------------------
/** A stub database that records every RPC the worker makes. */
function stubAdmin(claimRows: Array<Record<string, unknown>>) {
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const admin = {
    schema() {
      return {
        rpc(fn: string, args: Record<string, unknown>) {
          rpcs.push({ fn, args });
          if (fn === "claim_targets") {
            return Promise.resolve({ data: claimRows, error: null });
          }
          if (fn === "release_stale_claims") {
            return Promise.resolve({ data: 0, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  return { admin, rpcs };
}

const vaultStub = {
  schema() {
    return {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { decrypted_secret: TOKEN },
                      error: null,
                    }),
                };
              },
            };
          },
        };
      },
    };
  },
  rpc: () => Promise.resolve({ error: null }),
};

function claimRow(platform: string, id: string): Record<string, unknown> {
  return {
    target_id: id,
    post_id: "p-1",
    tenant_id: "tn-1",
    platform,
    external_account_id: "acct-" + id,
    account_config: {},
    credential_ref: "vault:social_" + id,
    body: "Morning Chaos",
    caption: "Morning Chaos",
    attempt_no: 1,
    idempotency_key: "k-" + id,
    media: [],
  };
}

Deno.test("worker: one platform failing does not block the other three", async () => {
  // This is the acceptance test from the brief, at the edge layer.
  const rows = [
    claimRow("facebook_page", "t-fb"),
    claimRow("instagram", "t-ig"),
    claimRow("linkedin_member", "t-li"),
    claimRow("tiktok_inbox", "t-tt"),
  ];
  const { admin, rpcs } = stubAdmin(rows);
  const summary = await runPublishWorker(
    admin as never,
    vaultStub as never,
    fetch,
    (p) => new MockSocialAdapter(p, p === "instagram" ? "failure" : "success"),
  );
  assertEquals(summary.claimed, 4, "claimed all four");
  assertEquals(summary.published, 2, "facebook and linkedin published");
  assertEquals(summary.deliveredToInbox, 1, "tiktok delivered to inbox");
  assertEquals(summary.failed, 1, "instagram failed");
  // every target got its own completion, so none blocked another
  const completions = rpcs.filter((r) => r.fn === "complete_target");
  assertEquals(completions.length, 4, "four independent completions");
});

Deno.test("worker: an adapter that throws does not take the batch down", async () => {
  const { admin, rpcs } = stubAdmin([
    claimRow("facebook_page", "t-fb"),
    claimRow("linkedin_member", "t-li"),
  ]);
  const summary = await runPublishWorker(
    admin as never,
    vaultStub as never,
    fetch,
    (p) => {
      if (p === "facebook_page") {
        return {
          platform: p,
          publish: () => Promise.reject(new Error("adapter exploded")),
        };
      }
      return new MockSocialAdapter(p, "success");
    },
  );
  assertEquals(summary.claimed, 2, "claimed both");
  assertEquals(summary.published, 1, "the healthy target still published");
  assertEquals(summary.failed, 1, "the exploding one failed");
  const completions = rpcs.filter((r) => r.fn === "complete_target");
  assertEquals(completions.length, 2, "both targets completed");
});

Deno.test(
  "worker: every attempt is written before the target is completed",
  async () => {
    const { admin, rpcs } = stubAdmin([claimRow("facebook_page", "t-fb")]);
    await runPublishWorker(
      admin as never,
      vaultStub as never,
      fetch,
      (p) => new MockSocialAdapter(p, "success"),
    );
    const order = rpcs.map((r) => r.fn);
    const attemptAt = order.indexOf("record_attempt");
    const completeAt = order.indexOf("complete_target");
    assert(attemptAt >= 0, "an attempt was recorded");
    assert(attemptAt < completeAt, "evidence is written before the verdict");
  },
);

Deno.test("worker: an ambiguous outcome is completed with p_terminal", async () => {
  const { admin, rpcs } = stubAdmin([claimRow("facebook_page", "t-fb")]);
  await runPublishWorker(admin as never, vaultStub as never, fetch, (p) => ({
    platform: p,
    publish: () =>
      Promise.resolve({
        status: "failed" as const,
        terminal: true,
        error: "ambiguous: timed out",
        attempts: [],
      }),
  }));
  const complete = rpcs.find((r) => r.fn === "complete_target");
  assertEquals(complete?.args.p_terminal, true, "database told not to retry");
});

// --- Token refresh ----------------------------------------------------------
function refreshAdmin(due: Array<Record<string, unknown>>) {
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const admin = {
    schema() {
      return {
        rpc(fn: string, args: Record<string, unknown>) {
          rpcs.push({ fn, args });
          if (fn === "credentials_due_for_refresh") {
            return Promise.resolve({ data: due, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  return { admin, rpcs };
}

function dueRow(platform: string, over: Record<string, unknown> = {}) {
  return {
    account_id: "a-1",
    tenant_id: "tn-1",
    platform,
    display_name: "Venuewise " + platform,
    credential_ref: "vault:social_a1",
    refresh_ref: null,
    expires_at: "2026-09-20T00:00:00Z",
    days_remaining: 12,
    ...over,
  };
}

Deno.test(
  "refresh: a Meta token exchange records success and the new expiry",
  async () => {
    const { admin, rpcs } = refreshAdmin([dueRow("facebook_page")]);
    const { fetcher } = stubFetch([
      {
        status: 200,
        body: { access_token: "EAAnewtokennewtokennewtoken", expires_in: 5184000 },
      },
    ]);
    const summary = await runTokenRefresh(
      admin as never,
      vaultStub as never,
      { metaAppId: "app", metaAppSecret: "secret" },
      fetcher,
    );
    assertEquals(summary.refreshed, 1, "refreshed");
    assertEquals(summary.failed, 0, "no failures");
    const recorded = rpcs.find((r) => r.fn === "record_credential_refresh");
    assertEquals(recorded?.args.p_ok, true, "success recorded in the database");
    assert(recorded?.args.p_expires_at, "a new expiry was written");
  },
);

Deno.test(
  "refresh: LinkedIn reports manual re-auth instead of pretending",
  async () => {
    // The self-serve 'Share on LinkedIn' tier issues no refresh token. Claiming
    // a successful refresh here is exactly the silent failure this job exists to
    // prevent.
    const { admin, rpcs } = refreshAdmin([dueRow("linkedin_member")]);
    const { fetcher, calls } = stubFetch([]);
    const summary = await runTokenRefresh(
      admin as never,
      vaultStub as never,
      {},
      fetcher,
    );
    assertEquals(summary.manualReauthRequired, 1, "flagged for a human");
    assertEquals(summary.refreshed, 0, "nothing claimed as refreshed");
    assertEquals(calls.length, 0, "no pointless call to LinkedIn");
    const recorded = rpcs.find((r) => r.fn === "record_credential_refresh");
    assertEquals(recorded?.args.p_ok, false, "recorded as a failure, loudly");
    assert(
      String(recorded?.args.p_error).includes("manual_reauth_required"),
      "names what a human must do",
    );
  },
);

Deno.test(
  "refresh: a failed exchange is recorded as a failure, never skipped",
  async () => {
    const { admin, rpcs } = refreshAdmin([dueRow("facebook_page")]);
    const { fetcher } = stubFetch([
      { status: 400, body: { error: { message: "Invalid OAuth access token" } } },
    ]);
    const summary = await runTokenRefresh(
      admin as never,
      vaultStub as never,
      { metaAppId: "app", metaAppSecret: "secret" },
      fetcher,
    );
    assertEquals(summary.refreshed, 0, "nothing refreshed");
    assertEquals(summary.manualReauthRequired, 1, "400 means re-auth");
    const recorded = rpcs.find((r) => r.fn === "record_credential_refresh");
    assertEquals(recorded?.args.p_ok, false, "failure recorded");
  },
);

Deno.test("refresh: a thrown error still records a redacted failure", async () => {
  const { admin, rpcs } = refreshAdmin([dueRow("facebook_page")]);
  const exploding = (() => {
    throw new Error("boom " + TOKEN);
  }) as unknown as typeof fetch;
  const summary = await runTokenRefresh(
    admin as never,
    vaultStub as never,
    { metaAppId: "app", metaAppSecret: "secret" },
    exploding,
  );
  assertEquals(summary.failed, 1, "counted as a failure");
  const recorded = rpcs.find((r) => r.fn === "record_credential_refresh");
  assertEquals(recorded?.args.p_ok, false, "recorded, not swallowed");
  assert(
    !String(recorded?.args.p_error).includes(TOKEN),
    "and the token is redacted out of the error",
  );
});

Deno.test("refresh: nothing due means nothing recorded", async () => {
  const { admin, rpcs } = refreshAdmin([]);
  const summary = await runTokenRefresh(admin as never, vaultStub as never, {}, fetch);
  assertEquals(summary.checked, 0, "nothing checked");
  assertEquals(
    rpcs.filter((r) => r.fn === "record_credential_refresh").length,
    0,
    "nothing recorded",
  );
});

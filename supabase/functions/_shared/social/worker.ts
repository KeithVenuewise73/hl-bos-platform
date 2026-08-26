// The publish worker's logic, kept out of the edge-function entrypoint so it
// can be unit-tested offline against a stubbed database and a stubbed fetch.
// The entrypoint (supabase/functions/social-publish-worker/index.ts) is a
// nine-line Deno.serve wrapper around runPublishWorker().
//
// social-publish-worker — minute cron.
//
// Claims due targets with FOR UPDATE SKIP LOCKED (social.claim_targets), runs
// one adapter per platform, writes an attempt row on every try — success or
// failure — and completes each target independently.
//
// The independence is the point, and it is structural rather than a promise:
// each target is processed in its own try/catch and completed with its own
// call, so a platform that fails, hangs, or throws cannot prevent, delay past
// its own timeout, or roll back another platform's success. That is the
// acceptance test in the brief.
//
// Idempotency: the claim itself is the primary guard — a claimed target is
// invisible to a concurrent worker, and a completed one is never re-claimed.
// None of these four APIs offers an idempotency key on its publish endpoint,
// so the residual risk is a request that times out after being sent. The
// adapters mark that outcome terminal, and the worker ends the target rather
// than retrying it. See social.complete_target(p_terminal).
//
// Schedule (pg_cron, at deploy):
//   select cron.schedule('social-publish-worker', '* * * * *', $$ ... $$);
import type {
  MediaAsset,
  PublishTarget,
  SocialAdapter,
  SocialPlatform,
} from "./provider.ts";
import { adapterFor } from "./registry.ts";
import { redactSocial } from "./redact.ts";
import { makeVaultResolver, type VaultClient } from "./vault.ts";

const CLAIM_LIMIT = 10;
const STALE_CLAIM_GRACE_MINUTES = 15;

export interface WorkerSummary {
  claimed: number;
  published: number;
  deliveredToInbox: number;
  failed: number;
  released: number;
}

export interface AdminClient {
  schema(s: string): {
    rpc(
      fn: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { message?: string } | null }>;
  };
}

function toTarget(row: Record<string, unknown>): PublishTarget {
  return {
    targetId: String(row.target_id),
    postId: String(row.post_id),
    tenantId: String(row.tenant_id),
    platform: row.platform as SocialPlatform,
    externalAccountId: String(row.external_account_id),
    accountConfig: (row.account_config ?? {}) as Record<string, unknown>,
    credentialRef: String(row.credential_ref),
    body: String(row.body ?? ""),
    caption: String(row.caption ?? ""),
    attemptNo: Number(row.attempt_no ?? 1),
    idempotencyKey: String(row.idempotency_key),
    media: (row.media ?? []) as MediaAsset[],
  };
}

export async function runPublishWorker(
  admin: AdminClient,
  vault: VaultClient,
  fetcher: typeof fetch = fetch,
  selectAdapter: (p: SocialPlatform) => SocialAdapter = (p) => adapterFor(p, fetcher),
): Promise<WorkerSummary> {
  const summary: WorkerSummary = {
    claimed: 0,
    published: 0,
    deliveredToInbox: 0,
    failed: 0,
    released: 0,
  };

  // A worker killed mid-publish leaves a claim behind. Release those first so
  // a crash costs one cycle rather than stranding a target forever.
  const released = await admin
    .schema("social")
    .rpc("release_stale_claims", { p_grace_minutes: STALE_CLAIM_GRACE_MINUTES });
  if (!released.error) summary.released = Number(released.data ?? 0);

  const { data, error } = await admin
    .schema("social")
    .rpc("claim_targets", { p_limit: CLAIM_LIMIT });
  if (error) throw new Error(`claim failed: ${error.message}`);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  summary.claimed = rows.length;
  const resolve = makeVaultResolver(vault);

  // Sequential rather than concurrent: these are per-account rate-limited APIs
  // (LinkedIn is ~100 calls/day/member), and a minute cron has no need to
  // race. Independence comes from the per-target try/catch, not from
  // parallelism.
  for (const row of rows) {
    const target = toTarget(row);
    try {
      const adapter = selectAdapter(target.platform);
      const outcome = await adapter.publish(target, resolve);

      // Log every attempt the adapter made, in order, before deciding the
      // target's fate — so the evidence exists even if completing it fails.
      for (const a of outcome.attempts) {
        await admin.schema("social").rpc("record_attempt", {
          p_target: target.targetId,
          p_phase: a.phase,
          p_ok: a.ok,
          p_started_at: a.startedAt,
          p_http_status: a.httpStatus ?? null,
          p_request: a.request ?? null,
          p_response: a.response ?? null,
          p_error: a.error ? redactSocial(a.error) : null,
        });
      }

      await admin.schema("social").rpc("complete_target", {
        p_target: target.targetId,
        p_status: outcome.status,
        p_external_post_id: outcome.externalPostId ?? null,
        p_permalink: outcome.permalink ?? null,
        p_error: outcome.error ? redactSocial(outcome.error) : null,
        p_terminal: outcome.terminal,
      });

      if (outcome.status === "published") summary.published++;
      else if (outcome.status === "delivered_to_inbox") summary.deliveredToInbox++;
      else summary.failed++;
    } catch (e) {
      // An adapter that throws must not take the other targets down with it.
      // The target is recorded as failed with the real reason and retried on
      // the normal backoff, and the loop continues.
      const detail = redactSocial(String(e));
      try {
        await admin.schema("social").rpc("record_attempt", {
          p_target: target.targetId,
          p_phase: "worker",
          p_ok: false,
          p_started_at: new Date().toISOString(),
          p_http_status: null,
          p_request: null,
          p_response: null,
          p_error: detail,
        });
        await admin.schema("social").rpc("complete_target", {
          p_target: target.targetId,
          p_status: "failed",
          p_external_post_id: null,
          p_permalink: null,
          p_error: detail,
          p_terminal: false,
        });
      } catch {
        // Even the failure path failed. The stale-claim sweep above will pick
        // this target up on a later run; nothing is silently dropped.
      }
      summary.failed++;
    }
  }

  return summary;
}

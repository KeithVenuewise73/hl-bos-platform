// The token-refresh job's logic, kept out of the edge-function entrypoint so
// it can be unit-tested offline against a stubbed database and a stubbed
// fetch. The entrypoint (supabase/functions/social-token-refresh/index.ts) is
// a thin Deno.serve wrapper around runTokenRefresh().
//
// social-token-refresh — daily cron. BUILT FIRST, on purpose.
//
// Refreshes any social credential expiring within 14 days, and alerts loudly
// on failure. Rationale, from the build brief: Meta and LinkedIn tokens both
// run ~60 days, and the most common production failure in these integrations
// is an expired token that fails silently — nothing errors, posts just stop,
// and you find out from the client. This exists before a single publish call.
//
// Every outcome, success or failure, is recorded through
// social.record_credential_refresh(), which writes a warning-severity security
// event on failure. There is no path through this function that lets a refresh
// fail quietly.
//
// Schedule (pg_cron, at deploy):
//   select cron.schedule('social-token-refresh', '0 6 * * *', $$ ... $$);
import {
  type AppSecrets,
  type RefreshCandidate,
  refreshCredential,
} from "./refresh.ts";
import { makeVaultResolver, type VaultClient, writeVaultSecret } from "./vault.ts";
import { redactSocial } from "./redact.ts";

const REFRESH_WINDOW_DAYS = 14;

export interface RefreshSummary {
  checked: number;
  refreshed: number;
  failed: number;
  manualReauthRequired: number;
  accounts: Array<{
    account: string;
    platform: string;
    outcome: "refreshed" | "failed" | "manual_reauth_required";
    detail?: string;
  }>;
}

/**
 * The whole job, with its dependencies injected so it is testable without a
 * database or a network.
 */
export interface RefreshAdminClient {
  schema(s: string): {
    rpc(
      fn: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { message?: string } | null }>;
  };
}

export async function runTokenRefresh(
  admin: RefreshAdminClient,
  vault: VaultClient,
  secrets: AppSecrets,
  fetcher: typeof fetch = fetch,
  windowDays = REFRESH_WINDOW_DAYS,
): Promise<RefreshSummary> {
  const summary: RefreshSummary = {
    checked: 0,
    refreshed: 0,
    failed: 0,
    manualReauthRequired: 0,
    accounts: [],
  };

  const { data, error } = await admin
    .schema("social")
    .rpc("credentials_due_for_refresh", { p_within_days: windowDays });
  if (error) throw new Error(`could not list due credentials: ${error.message}`);

  const due = (data ?? []) as Array<Record<string, unknown>>;
  const resolve = makeVaultResolver(vault);

  for (const row of due) {
    const candidate: RefreshCandidate = {
      accountId: String(row.account_id),
      tenantId: String(row.tenant_id),
      platform: row.platform as RefreshCandidate["platform"],
      displayName: String(row.display_name ?? ""),
      credentialRef: String(row.credential_ref),
      refreshRef: row.refresh_ref ? String(row.refresh_ref) : null,
      expiresAt: row.expires_at ? String(row.expires_at) : null,
      daysRemaining:
        row.days_remaining === null || row.days_remaining === undefined
          ? null
          : Number(row.days_remaining),
    };
    summary.checked++;

    let result;
    try {
      result = await refreshCredential(candidate, resolve, secrets, fetcher);
    } catch (e) {
      // A thrown error is a failed refresh like any other. Swallowing it here
      // would be the exact silent failure this job exists to prevent.
      result = { ok: false, error: redactSocial(String(e)) };
    }

    if (result.ok && result.accessToken) {
      // The token goes to Vault; only the expiry reaches the database.
      try {
        await writeVaultSecret(vault, candidate.credentialRef, result.accessToken);
        if (result.refreshToken && candidate.refreshRef) {
          await writeVaultSecret(vault, candidate.refreshRef, result.refreshToken);
        }
      } catch (e) {
        await recordOutcome(admin, candidate, false, null, redactSocial(String(e)));
        summary.failed++;
        summary.accounts.push({
          account: candidate.displayName,
          platform: candidate.platform,
          outcome: "failed",
          detail: "vault write failed",
        });
        continue;
      }
      await recordOutcome(admin, candidate, true, result.expiresAt ?? null, null);
      summary.refreshed++;
      summary.accounts.push({
        account: candidate.displayName,
        platform: candidate.platform,
        outcome: "refreshed",
      });
      continue;
    }

    const detail = redactSocial(result.error ?? "refresh failed");
    await recordOutcome(admin, candidate, false, null, detail);
    if (result.manualReauthRequired) {
      summary.manualReauthRequired++;
      summary.accounts.push({
        account: candidate.displayName,
        platform: candidate.platform,
        outcome: "manual_reauth_required",
        detail,
      });
    } else {
      summary.failed++;
      summary.accounts.push({
        account: candidate.displayName,
        platform: candidate.platform,
        outcome: "failed",
        detail,
      });
    }
  }

  return summary;
}

async function recordOutcome(
  admin: RefreshAdminClient,
  candidate: RefreshCandidate,
  ok: boolean,
  expiresAt: string | null,
  error: string | null,
): Promise<void> {
  await admin.schema("social").rpc("record_credential_refresh", {
    p_account: candidate.accountId,
    p_ok: ok,
    p_expires_at: expiresAt,
    p_error: error,
  });
}

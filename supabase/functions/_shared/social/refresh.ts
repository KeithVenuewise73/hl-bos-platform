// Token refresh — the failure this whole module is built around.
//
// Meta and LinkedIn access tokens run roughly 60 days. The most common
// production failure in these integrations is an expired token that fails
// SILENTLY: nothing errors loudly, posts simply stop, and the first person to
// notice is the client. So this exists before a single publish call, it runs
// daily, and a failure is loud.
//
// What each platform actually supports — stated plainly, because the honest
// answer differs per platform and pretending otherwise is how you end up with
// a refresh job that reports success while the token dies:
//
//   Facebook / Instagram : long-lived Page and User tokens are exchanged via
//                          grant_type=fb_exchange_token. Genuinely automatic.
//
//   LinkedIn             : on the self-serve "Share on LinkedIn" tier, member
//                          tokens are 60 days and refresh tokens are NOT
//                          issued — those are a Marketing Developer Platform
//                          privilege. Without a refresh token there is no
//                          programmatic renewal: a human must re-authorise.
//                          This module therefore does NOT pretend to refresh
//                          it. It raises manual_reauth_required, which becomes
//                          a warning-severity security event with enough lead
//                          time to act on.
//
//   TikTok               : grant_type=refresh_token against the v2 OAuth
//                          endpoint. Automatic.
//
// The new token is written back to Vault by the caller. This module resolves
// and returns; it never puts a token in the database.
import {
  type Fetcher,
  GRAPH_BASE,
  safeFetch,
  type SecretResolver,
  type SocialPlatform,
} from "./provider.ts";

export interface RefreshCandidate {
  accountId: string;
  tenantId: string;
  platform: SocialPlatform;
  displayName: string;
  credentialRef: string;
  refreshRef: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
}

export interface RefreshResult {
  ok: boolean;
  /** The new access token, when one was issued. Never logged, never stored. */
  accessToken?: string;
  /** The new refresh token, when the platform rotates it. */
  refreshToken?: string;
  expiresAt?: string;
  error?: string;
  /** True when only a human can fix this (re-authorisation). */
  manualReauthRequired?: boolean;
}

/** App credentials, resolved from the environment at call time. */
export interface AppSecrets {
  metaAppId?: string;
  metaAppSecret?: string;
  tiktokClientKey?: string;
  tiktokClientSecret?: string;
}

function expiryFromSeconds(seconds: unknown): string | undefined {
  const n = typeof seconds === "number" ? seconds : Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(Date.now() + n * 1000).toISOString();
}

/**
 * Refresh one credential. Returns a result; never throws, and never records
 * an outcome itself — the caller writes it via social.record_credential_refresh
 * so success and failure take exactly the same path into the database.
 */
export async function refreshCredential(
  candidate: RefreshCandidate,
  resolve: SecretResolver,
  secrets: AppSecrets,
  fetcher: Fetcher = fetch,
): Promise<RefreshResult> {
  switch (candidate.platform) {
    case "facebook_page":
    case "instagram":
      return await refreshMeta(candidate, resolve, secrets, fetcher);
    case "linkedin_member":
      return refreshLinkedIn(candidate);
    case "tiktok_inbox":
      return await refreshTikTok(candidate, resolve, secrets, fetcher);
  }
}

async function refreshMeta(
  candidate: RefreshCandidate,
  resolve: SecretResolver,
  secrets: AppSecrets,
  fetcher: Fetcher,
): Promise<RefreshResult> {
  if (!secrets.metaAppId || !secrets.metaAppSecret) {
    return {
      ok: false,
      error: "meta app credentials are not configured (META_APP_ID / META_APP_SECRET)",
    };
  }
  const current = await resolve(candidate.credentialRef);
  const url =
    `${GRAPH_BASE}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(secrets.metaAppId)}` +
    `&client_secret=${encodeURIComponent(secrets.metaAppSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(current)}`;

  const res = await safeFetch(fetcher, url, { method: "GET" });
  if (res.kind === "ambiguous") {
    return { ok: false, error: `no response from Meta: ${res.error}` };
  }
  const body = res.body as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (res.status >= 300 || !body?.access_token) {
    return {
      ok: false,
      error: body?.error?.message ?? `http_${res.status}`,
      // An invalid current token cannot be exchanged. Only re-auth fixes it.
      manualReauthRequired: res.status === 400 || res.status === 401,
    };
  }
  return {
    ok: true,
    accessToken: body.access_token,
    // Meta omits expires_in for never-expiring Page tokens. Unknown stays
    // unknown; social.credentials_due_for_refresh treats null as due, so an
    // unknown expiry gets looked at daily rather than assumed healthy.
    expiresAt: expiryFromSeconds(body.expires_in),
  };
}

function refreshLinkedIn(candidate: RefreshCandidate): RefreshResult {
  if (!candidate.refreshRef) {
    return {
      ok: false,
      manualReauthRequired: true,
      error:
        "manual_reauth_required: the LinkedIn 'Share on LinkedIn' tier issues no refresh token, so this member token cannot be renewed programmatically. Re-authorise the profile before " +
        (candidate.expiresAt ?? "the token expires") +
        ".",
    };
  }
  // A refresh token only exists here if the app was granted the Marketing
  // Developer Platform, which Phase 1 explicitly does not pursue. Rather than
  // ship an untested code path that would first run in production against a
  // live channel, this reports honestly that it is not implemented.
  return {
    ok: false,
    manualReauthRequired: true,
    error:
      "manual_reauth_required: a LinkedIn refresh token is present but programmatic LinkedIn refresh is not implemented in Phase 1. Re-authorise the profile.",
  };
}

async function refreshTikTok(
  candidate: RefreshCandidate,
  resolve: SecretResolver,
  secrets: AppSecrets,
  fetcher: Fetcher,
): Promise<RefreshResult> {
  if (!secrets.tiktokClientKey || !secrets.tiktokClientSecret) {
    return {
      ok: false,
      error:
        "tiktok app credentials are not configured (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET)",
    };
  }
  if (!candidate.refreshRef) {
    return {
      ok: false,
      manualReauthRequired: true,
      error:
        "manual_reauth_required: no TikTok refresh token is recorded for this account",
    };
  }
  const refreshToken = await resolve(candidate.refreshRef);
  const res = await safeFetch(fetcher, "https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: secrets.tiktokClientKey,
      client_secret: secrets.tiktokClientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  if (res.kind === "ambiguous") {
    return { ok: false, error: `no response from TikTok: ${res.error}` };
  }
  const body = res.body as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (res.status >= 300 || !body?.access_token) {
    return {
      ok: false,
      error: body?.error_description ?? body?.error ?? `http_${res.status}`,
      manualReauthRequired: body?.error === "invalid_grant",
    };
  }
  return {
    ok: true,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: expiryFromSeconds(body.expires_in),
  };
}

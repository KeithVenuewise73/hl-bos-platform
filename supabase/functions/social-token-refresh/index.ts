// social-token-refresh — daily cron entrypoint.
//
// Thin on purpose: everything worth testing lives in
// ../_shared/social/token-refresh.ts, which has no remote imports and is
// exercised offline by supabase/functions/tests/social_publishing.test.ts.
//
// Schedule (pg_cron, at deploy):
//   select cron.schedule('social-token-refresh', '0 6 * * *', $$ ... $$);
import { createClient } from "jsr:@supabase/supabase-js@2";
import type { AppSecrets } from "../_shared/social/refresh.ts";
import {
  type RefreshAdminClient,
  runTokenRefresh,
} from "../_shared/social/token-refresh.ts";
import { redactSocial } from "../_shared/social/redact.ts";
import type { VaultClient } from "../_shared/social/vault.ts";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const secrets: AppSecrets = {
    metaAppId: Deno.env.get("META_APP_ID") ?? undefined,
    metaAppSecret: Deno.env.get("META_APP_SECRET") ?? undefined,
    tiktokClientKey: Deno.env.get("TIKTOK_CLIENT_KEY") ?? undefined,
    tiktokClientSecret: Deno.env.get("TIKTOK_CLIENT_SECRET") ?? undefined,
  };
  try {
    const summary = await runTokenRefresh(
      admin as unknown as RefreshAdminClient,
      admin as unknown as VaultClient,
      secrets,
    );
    // A non-200 when anything needs a human makes the cron run itself go red,
    // rather than a green run whose body nobody reads.
    const needsAttention = summary.failed + summary.manualReauthRequired > 0;
    return new Response(JSON.stringify(summary), {
      status: needsAttention ? 500 : 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: redactSocial(String(e)) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});

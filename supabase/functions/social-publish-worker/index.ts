// social-publish-worker — minute cron entrypoint.
//
// Thin on purpose: everything worth testing lives in
// ../_shared/social/worker.ts, which has no remote imports and is exercised
// offline by supabase/functions/tests/social_publishing.test.ts.
//
// Schedule (pg_cron, at deploy):
//   select cron.schedule('social-publish-worker', '* * * * *', $$ ... $$);
import { createClient } from "jsr:@supabase/supabase-js@2";
import { type AdminClient, runPublishWorker } from "../_shared/social/worker.ts";
import { redactSocial } from "../_shared/social/redact.ts";
import type { VaultClient } from "../_shared/social/vault.ts";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  try {
    const summary = await runPublishWorker(
      admin as unknown as AdminClient,
      admin as unknown as VaultClient,
    );
    return new Response(JSON.stringify(summary), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: redactSocial(String(e)) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});

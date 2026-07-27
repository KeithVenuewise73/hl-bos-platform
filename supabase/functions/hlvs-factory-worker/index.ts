// hlvs-factory-worker — inert handler for the HLVS factory interface.
//
// STATUS: STRUCTURAL SCAFFOLDING, not deployed. It reuses the CP5 SHARED
// dispatcher (events.claim_deliveries / complete_delivery) — no new queue. In a
// deployed build an `hlvs.software_creation_order.approved` delivery would drive
// prompt-package generation and development-run bookkeeping via the HLVS RPCs.
//
// It never contacts Claude or any external agent API, never modifies a
// repository, never runs a migration, never deploys, and never accesses
// secrets. Development execution stays human-controlled (external_execution:
// false).

import { createClient } from "jsr:@supabase/supabase-js@2";

const HANDLER_REF = "hlvs-factory-worker";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: claimed, error } = await admin
    .schema("events")
    .rpc("claim_deliveries", { p_handler_ref: HANDLER_REF, p_limit: 5 });
  if (error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(
    JSON.stringify({
      claimed: (claimed as unknown[])?.length ?? 0,
      processed: 0,
      external_execution: false,
      note: "inert: no agent wired; Claude never contacted; no repo/migration/deploy/secret access",
    }),
    { headers: { "content-type": "application/json" } },
  );
});

export { HANDLER_REF };

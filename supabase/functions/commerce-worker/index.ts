// commerce-worker — inert handler for the commercial + provisioning handoff.
//
// STATUS: STRUCTURAL SCAFFOLDING, not deployed. It documents the production
// wiring and reuses the CP5 SHARED dispatcher (events.claim_deliveries /
// complete_delivery) — no new queue or worker framework. In a deployed build a
// `proposal.requested` delivery would draft the proposal narrative via the
// shared AI gateway (mock locally) using ../_shared/sales/narrative.ts, and a
// separate readiness/authorization flow would use ../_shared/provisioning/*.
//
// Nothing here activates billing, provisions a tenant, enables a module, sends
// a communication, or collects a signature. Approvals and acceptances are
// human, permission-gated DB actions — this worker never performs them.

import { createClient } from "jsr:@supabase/supabase-js@2";

const HANDLER_REF = "commerce-worker";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  // Claim due deliveries for this handler via the shared dispatcher.
  const { data: claimed, error } = await admin
    .schema("events")
    .rpc("claim_deliveries", { p_handler_ref: HANDLER_REF, p_limit: 5 });
  if (error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // No AI adapter or narrative loader is wired here, so nothing is processed.
  return new Response(
    JSON.stringify({
      claimed: (claimed as unknown[])?.length ?? 0,
      processed: 0,
      note: "inert: narrative/ai not wired; no billing/provisioning/comms performed",
    }),
    { headers: { "content-type": "application/json" } },
  );
});

export { HANDLER_REF };

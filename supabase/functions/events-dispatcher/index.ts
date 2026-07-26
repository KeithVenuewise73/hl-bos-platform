// events-dispatcher — drains the transactional outbox (Stage A V0 scaffolding).
//
// In production this is invoked on a schedule (pg_cron -> pg_net -> this fn, or
// a cron-triggered edge function). It calls events.dispatch_batch(), which
// atomically claims unpublished outbox rows and writes one delivery per active
// subscription. Handler invocation for each delivery (calling the consumer
// module) is wired at deploy time; V0 delivers the durable fan-out.
//
// V0 status: STRUCTURAL SCAFFOLDING, not deployed. events.dispatch_batch() is
// fully validated by pgTAP (at-least-once, idempotent re-dispatch).
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: processed, error } = await admin
    .schema("events")
    .rpc("dispatch_batch", { p_limit: 200 });
  if (error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  // Deploy-time extension: read queued events.deliveries and invoke each
  // consumer_module handler here (idempotent; mark delivered/failed).
  return new Response(JSON.stringify({ processed }), {
    headers: { "content-type": "application/json" },
  });
});

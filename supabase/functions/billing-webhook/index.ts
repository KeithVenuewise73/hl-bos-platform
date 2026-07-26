// billing-webhook — receives a payment-provider callback, verifies it via the
// provider adapter, and maps the normalized event onto the billing.* RPCs
// (record_payment / renew_subscription). Runs with the service role so its RPC
// calls satisfy the platform-admin gate that guards invoice/payment recording.
//
// This is the ONLY path by which a payment is recorded — a tenant has no write
// access to billing.invoices/payments (anti-fabrication, Principle 10).
//
// STRUCTURAL SCAFFOLDING — not deployed, not runtime-tested in this change.

import type { NormalizedBillingEvent } from "../_shared/billing/provider.ts";

// Deno global is provided by the Supabase Edge runtime.
declare const Deno: { serve: (h: (req: Request) => Promise<Response>) => void };

async function applyEvent(_event: NormalizedBillingEvent): Promise<void> {
  // At deploy: switch on _event.kind and call the matching RPC, e.g.
  //   payment.succeeded -> billing.record_payment(invoice, 'succeeded', ...)
  //   payment.failed    -> billing.record_payment(invoice, 'failed', ...)
  //   subscription.renewed -> billing.renew_subscription(sub, periodEnd)
  // Each RPC re-checks authorization server-side; the edge function is not the
  // security boundary — the database is.
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }
  // Inert until a provider is configured and its signing secret is in Vault.
  return new Response(
    JSON.stringify({ ok: false, reason: "billing_webhook_not_configured" }),
    { status: 501, headers: { "content-type": "application/json" } },
  );
});

export { applyEvent };

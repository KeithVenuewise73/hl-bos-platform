/**
 * Billing webhook handling: verify → normalise → apply once.
 *
 * Checkout creation and the customer billing portal call Stripe's API with a
 * secret key. Neither is exercised here: no Stripe account is connected to
 * this environment, and live Stripe is not authorised. `buildCheckoutRequest`
 * produces the exact request so the metadata contract (tenant_id, plan_key)
 * is tested; sending it is the remaining integration step.
 */

import type { IsolatedDb } from "./db.ts";
import {
  normalizeStripeEvent,
  verifyStripeSignature,
  type BillingEvent,
} from "./stripe.ts";

export type WebhookOutcome =
  | { status: 400; reason: "bad signature" | "expired signature" | "invalid json" }
  | { status: 200; outcome: string; event: BillingEvent | null };

export async function handleStripeWebhook(
  db: IsolatedDb,
  serviceUser: string,
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  now?: number,
): Promise<WebhookOutcome> {
  const v = verifyStripeSignature(
    rawBody,
    signatureHeader,
    webhookSecret,
    now === undefined ? {} : { now },
  );
  if (!v.ok)
    return {
      status: 400,
      reason: v.reason === "expired" ? "expired signature" : "bad signature",
    };
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, reason: "invalid json" };
  }
  const event = normalizeStripeEvent(json);
  if (!event) return { status: 200, outcome: "ignored", event: null };
  const outcome = await db.rpc<string>(
    serviceUser,
    "select billing.apply_provider_event($1, $2, $3, $4, $5, $6, $7)",
    [
      event.provider,
      event.eventId,
      event.type,
      event.tenantId,
      event.planKey,
      event.periodEnd,
      event.subscriptionRef,
    ],
  );
  return { status: 200, outcome, event };
}

/** The Checkout Session HL-BOS would create (form-encoded body for POST /v1/checkout/sessions). */
export function buildCheckoutRequest(p: {
  tenantId: string;
  planKey: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}): URLSearchParams {
  const b = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": p.priceId,
    "line_items[0][quantity]": "1",
    success_url: p.successUrl,
    cancel_url: p.cancelUrl,
    client_reference_id: p.tenantId,
    "metadata[tenant_id]": p.tenantId,
    "metadata[plan_key]": p.planKey,
    "subscription_data[metadata][tenant_id]": p.tenantId,
    "subscription_data[metadata][plan_key]": p.planKey,
  });
  if (p.customerEmail) b.set("customer_email", p.customerEmail);
  return b;
}

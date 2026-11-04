import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@hl-bos/commercial";
import { serviceAccount } from "@/lib/billing.ts";
import { db } from "@/lib/db.ts";
import { env } from "@/lib/env.ts";

/**
 * Stripe webhook endpoint. Verifies the signature (with replay tolerance),
 * normalises the event and applies it once (billing.apply_provider_event).
 * In this isolated environment the secret is a local development value, so
 * only events this app signs itself are accepted; no Stripe account is
 * connected.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const raw = await req.text();
  const r = await handleStripeWebhook(
    db(),
    await serviceAccount(),
    raw,
    req.headers.get("stripe-signature") ?? "",
    env.stripeWebhookSecret,
  );
  return r.status === 400
    ? NextResponse.json({ error: r.reason }, { status: 400 })
    : NextResponse.json({ received: true, outcome: r.outcome });
}

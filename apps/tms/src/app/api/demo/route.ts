import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@hl-bos/commercial";
import {
  serviceAccount,
  simulatedStripeEvent,
  type SimulatedEvent,
} from "@/lib/billing.ts";
import { env } from "@/lib/env.ts";
import { db } from "@/lib/db.ts";
import { currentCtx } from "@/lib/guard.ts";

/**
 * Owner-only: simulate a Stripe test-mode billing event for THIS company.
 * It is signed with the isolated environment's secret and handed to the same
 * handler the webhook route uses, so the whole path runs: signature,
 * idempotency, subscription status, entitlement reconciliation. (Called in
 * process rather than over HTTP: behind --hostname 127.0.0.1 the request URL
 * says "localhost", which is a different address.) No money, no Stripe.
 */
const EVENTS = new Set<SimulatedEvent>([
  "checkout.session.completed",
  "invoice.payment_failed",
  "invoice.paid",
  "customer.subscription.deleted",
]);

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await currentCtx();
  if (!ctx) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (ctx.role !== "owner")
    return NextResponse.json(
      { error: "Only the company owner can change the subscription." },
      { status: 403 },
    );
  const body = (await req.json().catch(() => ({}))) as {
    event?: string;
    plan?: string;
  };
  if (!EVENTS.has(body.event as SimulatedEvent))
    return NextResponse.json({ error: "Unsupported event." }, { status: 400 });
  const plan = String(body.plan ?? "");
  const active = await db().superuser(
    async (c) =>
      (
        await c.query(
          "select 1 from billing.plans where key = $1 and is_active and product_key = 'transportation_os'",
          [plan],
        )
      ).rowCount,
  );
  if (!active)
    return NextResponse.json({ error: "That plan is not on sale." }, { status: 422 });
  const ev = simulatedStripeEvent(ctx.company.id, plan, body.event as SimulatedEvent);
  const r = await handleStripeWebhook(
    db(),
    await serviceAccount(),
    ev.body,
    ev.header,
    env.stripeWebhookSecret,
  );
  return r.status === 400
    ? NextResponse.json({ error: r.reason }, { status: 400 })
    : NextResponse.json({ outcome: r.outcome });
}

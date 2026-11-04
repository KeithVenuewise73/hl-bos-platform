import "server-only";
import { stripeSignature } from "@hl-bos/commercial";
import { db } from "./db.ts";
import { env } from "./env.ts";

/** The seeded billing service account's user id. */
export async function serviceAccount(): Promise<string> {
  return db().superuser(async (c) => {
    const r = await c.query("select id from auth.users where email = $1", [
      env.serviceAccountEmail,
    ]);
    const id = (r.rows[0] as { id: string } | undefined)?.id;
    if (!id)
      throw new Error(`Service account ${env.serviceAccountEmail} is not seeded`);
    return id;
  });
}

export type SimulatedEvent =
  | "checkout.session.completed"
  | "invoice.payment_failed"
  | "invoice.paid"
  | "customer.subscription.deleted";

/**
 * Build a Stripe-shaped event and its signature header, signed with the
 * isolated environment's own secret. Used ONLY by the owner's "simulate a
 * billing event" control; it is posted to the real webhook route, so the
 * full verify → normalise → apply path runs.
 */
export function simulatedStripeEvent(
  tenantId: string,
  planKey: string,
  type: SimulatedEvent,
  now = Date.now(),
) {
  const metadata = { tenant_id: tenantId, plan_key: planKey };
  const object =
    type === "invoice.payment_failed"
      ? { subscription: `sub_sim_${planKey}`, subscription_details: { metadata } }
      : type === "customer.subscription.deleted"
        ? { id: `sub_sim_${planKey}`, metadata }
        : { subscription: `sub_sim_${planKey}`, metadata };
  const body = JSON.stringify({
    id: `evt_sim_${now}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    livemode: false,
    data: { object },
  });
  const t = Math.floor(now / 1000);
  return {
    body,
    header: `t=${t},v1=${stripeSignature(body, env.stripeWebhookSecret, t)}`,
  };
}

/**
 * Stripe webhooks, ported from the Venuewise `stripe-webhook` edge function
 * (read from the Venuewise Platform project, 2026-11-04) and hardened:
 *
 *   - Kept: HMAC-SHA256 over `${t}.${payload}`, constant-time comparison,
 *     "never trust an unsigned event".
 *   - Added: a timestamp tolerance (the original accepted any age, so a
 *     captured event could be replayed forever), support for several `v1=`
 *     signatures during secret rotation, and event-id idempotency (applied in
 *     the database by billing.apply_provider_event).
 *   - Removed: the hard-coded fallback price id, and every write to
 *     HomeHuddle/Venuewise tables. Events become provider-NEUTRAL HL-BOS
 *     billing events.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_TOLERANCE_SECONDS = 300;

export type SignatureResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "malformed" | "mismatch" | "expired" };

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export function stripeSignature(
  payload: string,
  secret: string,
  timestamp: number,
): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

export function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  opts: { toleranceSeconds?: number; now?: number } = {},
): SignatureResult {
  const parts = header.split(",").map((p) => p.trim());
  const t = Number(parts.find((p) => p.startsWith("t="))?.slice(2));
  const sigs = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!Number.isFinite(t) || sigs.length === 0 || !secret)
    return { ok: false, reason: "malformed" };
  const expected = stripeSignature(payload, secret, t);
  if (!sigs.some((s) => /^[0-9a-f]+$/.test(s) && safeEqualHex(expected, s)))
    return { ok: false, reason: "mismatch" };
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS))
    return { ok: false, reason: "expired" };
  return { ok: true, timestamp: t };
}

/** The provider-neutral event billing.apply_provider_event accepts. */
export interface BillingEvent {
  provider: "stripe";
  eventId: string;
  type:
    | "subscription.activated"
    | "subscription.trialing"
    | "subscription.past_due"
    | "subscription.canceled"
    | "payment.succeeded"
    | "payment.failed";
  tenantId: string | null;
  planKey: string | null;
  periodEnd: string | null;
  subscriptionRef: string | null;
}

interface StripeObject {
  id?: string;
  status?: string;
  subscription?: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
  subscription_details?: { metadata?: Record<string, string> };
  lines?: { data?: { metadata?: Record<string, string>; period?: { end?: number } }[] };
}

interface StripeEvent {
  id?: string;
  type?: string;
  data?: { object?: StripeObject };
}

const SUBSCRIPTION_STATUS: Record<string, BillingEvent["type"] | undefined> = {
  active: "subscription.activated",
  trialing: "subscription.trialing",
  past_due: "subscription.past_due",
  unpaid: "subscription.past_due",
  canceled: "subscription.canceled",
  incomplete_expired: "subscription.canceled",
};

/**
 * HL-BOS stamps `tenant_id` and `plan_key` into the Checkout Session's
 * subscription metadata when it creates the session, so every later event can
 * be attributed without looking anything up. Returns null for event types we
 * do not act on.
 */
export function normalizeStripeEvent(raw: unknown): BillingEvent | null {
  const e = raw as StripeEvent;
  const o = e.data?.object;
  if (!e.id || !e.type || !o) return null;
  const md = {
    ...(o.subscription_details?.metadata ?? {}),
    ...(o.lines?.data?.[0]?.metadata ?? {}),
    ...(o.metadata ?? {}),
  };
  const base = {
    provider: "stripe" as const,
    eventId: e.id,
    tenantId: md["tenant_id"] ?? null,
    planKey: md["plan_key"] ?? null,
  };
  const end = (s?: number) => (s ? new Date(s * 1000).toISOString() : null);
  switch (e.type) {
    case "checkout.session.completed":
      return {
        ...base,
        type: "subscription.activated",
        periodEnd: null,
        subscriptionRef: o.subscription ?? null,
      };
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const type = SUBSCRIPTION_STATUS[o.status ?? ""];
      return type
        ? {
            ...base,
            type,
            periodEnd: end(o.current_period_end),
            subscriptionRef: o.id ?? null,
          }
        : null;
    }
    case "customer.subscription.deleted":
      return {
        ...base,
        type: "subscription.canceled",
        periodEnd: end(o.current_period_end),
        subscriptionRef: o.id ?? null,
      };
    case "invoice.payment_succeeded":
    case "invoice.paid":
      return {
        ...base,
        type: "payment.succeeded",
        periodEnd: end(o.lines?.data?.[0]?.period?.end),
        subscriptionRef: o.subscription ?? null,
      };
    case "invoice.payment_failed":
      return {
        ...base,
        type: "payment.failed",
        periodEnd: null,
        subscriptionRef: o.subscription ?? null,
      };
    default:
      return null;
  }
}

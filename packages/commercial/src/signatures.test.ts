import { describe, expect, it } from "vitest";
import {
  normalizeStripeEvent,
  stripeSignature,
  verifyStripeSignature,
} from "./stripe.ts";
import { buildCheckoutRequest } from "./billing.ts";
import {
  MockTransport,
  ResendTransport,
  TwilioTransport,
  normalizePhone,
  parseKeyword,
  twilioSignature,
  verifyTwilioSignature,
} from "./messaging.ts";

const SECRET = "whsec_test_only_not_a_real_secret";
const NOW = 1_800_000_000;
const body = JSON.stringify({
  id: "evt_1",
  type: "invoice.paid",
  data: { object: {} },
});
const header = (t: number, payload = body, secret = SECRET) =>
  `t=${t},v1=${stripeSignature(payload, secret, t)}`;

describe("Stripe signature", () => {
  it("accepts a correctly signed, fresh event", () => {
    expect(verifyStripeSignature(body, header(NOW), SECRET, { now: NOW + 10 })).toEqual(
      { ok: true, timestamp: NOW },
    );
  });
  it("refuses a tampered body", () => {
    expect(
      verifyStripeSignature(body.replace("evt_1", "evt_2"), header(NOW), SECRET, {
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "mismatch" });
  });
  it("refuses the wrong secret", () => {
    expect(
      verifyStripeSignature(body, header(NOW, body, "whsec_other"), SECRET, {
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: "mismatch" });
  });
  it("refuses a replay older than the tolerance (the original function accepted any age)", () => {
    expect(
      verifyStripeSignature(body, header(NOW), SECRET, { now: NOW + 301 }),
    ).toEqual({ ok: false, reason: "expired" });
  });
  it("refuses a malformed header and an empty secret", () => {
    expect(verifyStripeSignature(body, "v1=abc", SECRET)).toMatchObject({
      ok: false,
      reason: "malformed",
    });
    expect(verifyStripeSignature(body, header(NOW), "", { now: NOW })).toMatchObject({
      ok: false,
      reason: "malformed",
    });
  });
  it("accepts any one of several v1 signatures (secret rotation)", () => {
    const h = `t=${NOW},v1=${"0".repeat(64)},v1=${stripeSignature(body, SECRET, NOW)}`;
    expect(verifyStripeSignature(body, h, SECRET, { now: NOW }).ok).toBe(true);
  });
});

describe("Stripe events become provider-neutral HL-BOS events", () => {
  const md = { tenant_id: "t-1", plan_key: "tms_dvir" };
  it("maps checkout, subscription status, invoices and deletion", () => {
    expect(
      normalizeStripeEvent({
        id: "e1",
        type: "checkout.session.completed",
        data: { object: { subscription: "sub_1", metadata: md } },
      }),
    ).toMatchObject({
      type: "subscription.activated",
      tenantId: "t-1",
      planKey: "tms_dvir",
      subscriptionRef: "sub_1",
    });
    expect(
      normalizeStripeEvent({
        id: "e2",
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", status: "past_due", metadata: md } },
      })?.type,
    ).toBe("subscription.past_due");
    expect(
      normalizeStripeEvent({
        id: "e3",
        type: "invoice.payment_failed",
        data: { object: { subscription_details: { metadata: md } } },
      }),
    ).toMatchObject({ type: "payment.failed", tenantId: "t-1" });
    expect(
      normalizeStripeEvent({
        id: "e4",
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_1", metadata: md } },
      })?.type,
    ).toBe("subscription.canceled");
  });
  it("ignores events HL-BOS does not act on", () => {
    expect(
      normalizeStripeEvent({
        id: "e5",
        type: "customer.created",
        data: { object: {} },
      }),
    ).toBeNull();
    expect(
      normalizeStripeEvent({
        id: "e6",
        type: "customer.subscription.updated",
        data: { object: { status: "paused" } },
      }),
    ).toBeNull();
  });
  it("checkout stamps tenant and plan into the subscription so later events can be attributed", () => {
    const b = buildCheckoutRequest({
      tenantId: "t-1",
      planKey: "salon_full",
      priceId: "price_test",
      successUrl: "https://x/ok",
      cancelUrl: "https://x/no",
    });
    expect(b.get("subscription_data[metadata][tenant_id]")).toBe("t-1");
    expect(b.get("subscription_data[metadata][plan_key]")).toBe("salon_full");
    expect(b.get("mode")).toBe("subscription");
  });
});

describe("Twilio", () => {
  // Twilio's own documented example (Security > Validating requests).
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = {
    CallSid: "CA1234567890ABCDE",
    Caller: "+12349013030",
    Digits: "1234",
    From: "+12349013030",
    To: "+18005551212",
  };
  it("matches Twilio's published signature example", () => {
    expect(twilioSignature(url, params, "12345")).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
    expect(
      verifyTwilioSignature(url, params, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=", "12345"),
    ).toBe(true);
  });
  it("refuses a forged or missing signature", () => {
    expect(
      verifyTwilioSignature(
        url,
        { ...params, Digits: "9999" },
        "0/KCTR6DLpKmkAf8muzZqo1nDgQ=",
        "12345",
      ),
    ).toBe(false);
    expect(verifyTwilioSignature(url, params, "", "12345")).toBe(false);
  });
  it("reads STOP/START keywords and normalises numbers", () => {
    expect(parseKeyword(" stop ")).toBe("stop");
    expect(parseKeyword("Unsubscribe")).toBe("stop");
    expect(parseKeyword("START")).toBe("start");
    expect(parseKeyword("see you tuesday")).toBeNull();
    expect(normalizePhone("(716) 555-0100")).toBe("+17165550100");
  });
});

describe("live transports are switched off", () => {
  it("Twilio and Resend refuse to construct without explicit approval", () => {
    expect(
      () =>
        new TwilioTransport(
          { accountSid: "AC_x", authToken: "x", from: "+1" },
          { allowLiveSend: false },
        ),
    ).toThrow(/owner approval/);
    expect(
      () => new ResendTransport({ apiKey: "x", from: "a@b" }, { allowLiveSend: false }),
    ).toThrow(/owner approval/);
  });
  it("the mock transport records, and can be told to fail", async () => {
    const t = new MockTransport();
    t.failNext = 1;
    const m = {
      id: "1",
      tenant_id: "t",
      channel: "sms" as const,
      to_contact: "+1",
      from_identity: null,
      subject: null,
      body: "hi",
      provider_key: null,
      attempts: 0,
      message_class: "transactional" as const,
    };
    expect(await t.send(m)).toMatchObject({ ok: false, retryable: true });
    expect(await t.send(m)).toMatchObject({ ok: true });
    expect(t.sent).toHaveLength(1);
  });
});

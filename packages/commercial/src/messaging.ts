/**
 * Outbound messaging: transports, the delivery worker, and inbound STOP/START.
 *
 * Ported from the Venuewise `send-sms-outbox` and `sms-inbound` edge functions
 * (read 2026-11-04) and hardened:
 *
 *   - Kept: batch claim, attempts counter with a ceiling, re-checking opt-out
 *     at send time, gentle pacing, the STOP/START keyword lists.
 *   - Fixed: `sms-inbound` did not verify Twilio's request signature, so
 *     anyone could POST a forged STOP or START for any number. Here an inbound
 *     message is refused unless its X-Twilio-Signature verifies.
 *   - Fixed: `send-sms-outbox` enforced its shared secret only if one was
 *     configured, and compared it in non-constant time.
 *   - Moved: the ledger, consent and suppression are HL-BOS `comms`, not
 *     Venuewise tables.
 *
 * SAFETY: the Twilio account is reported inactive, and no real message may be
 * sent without approval. TwilioTransport and ResendTransport refuse to
 * construct unless `allowLiveSend: true` is passed explicitly, and nothing in
 * this repository passes it. Development and tests use MockTransport.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { IsolatedDb } from "./db.ts";

export type Channel = "sms" | "email";

export interface OutboundMessage {
  id: string;
  tenant_id: string;
  channel: Channel;
  to_contact: string;
  from_identity: string | null;
  subject: string | null;
  body: string | null;
  provider_key: string | null;
  attempts: number;
  message_class: "transactional" | "marketing";
}

export type SendResult =
  { ok: true; providerRef: string } | { ok: false; error: string; retryable: boolean };

export interface MessageTransport {
  readonly name: string;
  send(m: OutboundMessage): Promise<SendResult>;
}

/** Records every "send" in memory. Can be told to fail. Sends nothing. */
export class MockTransport implements MessageTransport {
  readonly name = "mock";
  readonly sent: OutboundMessage[] = [];
  failNext = 0;
  failPermanently = false;

  // eslint-disable-next-line @typescript-eslint/require-await -- interface is async
  async send(m: OutboundMessage): Promise<SendResult> {
    if (this.failPermanently)
      return { ok: false, error: "mock: permanent failure", retryable: false };
    if (this.failNext > 0) {
      this.failNext -= 1;
      return { ok: false, error: "mock: temporary failure", retryable: true };
    }
    this.sent.push(m);
    return { ok: true, providerRef: `mock-${this.sent.length}` };
  }
}

export interface LiveTransportOptions {
  /** Must be true, deliberately. Nothing in this repository sets it. */
  allowLiveSend: boolean;
}

function refuseUnlessLive(name: string, o: LiveTransportOptions): void {
  if (o.allowLiveSend !== true) {
    throw new Error(
      `${name} is disabled: real sends need owner approval (allowLiveSend). Use MockTransport.`,
    );
  }
}

export class TwilioTransport implements MessageTransport {
  readonly name = "twilio";
  constructor(
    private readonly cfg: { accountSid: string; authToken: string; from: string },
    o: LiveTransportOptions,
  ) {
    refuseUnlessLive("TwilioTransport", o);
  }
  async send(m: OutboundMessage): Promise<SendResult> {
    const body = new URLSearchParams({
      To: m.to_contact,
      From: m.from_identity ?? this.cfg.from,
      Body: m.body ?? "",
    });
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.cfg.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.cfg.accountSid}:${this.cfg.authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    const j = (await r.json().catch(() => ({}))) as { sid?: string; message?: string };
    return r.ok && j.sid
      ? { ok: true, providerRef: j.sid }
      : {
          ok: false,
          error: j.message ?? `twilio ${r.status}`,
          retryable: r.status >= 500 || r.status === 429,
        };
  }
}

export class ResendTransport implements MessageTransport {
  readonly name = "resend";
  constructor(
    private readonly cfg: { apiKey: string; from: string },
    o: LiveTransportOptions,
  ) {
    refuseUnlessLive("ResendTransport", o);
  }
  async send(m: OutboundMessage): Promise<SendResult> {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.cfg.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: m.from_identity ?? this.cfg.from,
        to: m.to_contact,
        subject: m.subject ?? "",
        text: m.body ?? "",
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
    return r.ok && j.id
      ? { ok: true, providerRef: j.id }
      : {
          ok: false,
          error: j.message ?? `resend ${r.status}`,
          retryable: r.status >= 500 || r.status === 429,
        };
  }
}

export interface DeliveryOptions {
  batch?: number;
  /** At most this many messages per company per run (per-tenant rate limit). */
  perTenantPerRun?: number;
  maxAttempts?: number;
  pauseMs?: number;
}

export interface DeliveryReport {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  deferred: number;
}

/**
 * One delivery run. `workerUser` must be a platform service account: the SQL
 * refuses anyone else. Claims a batch, enforces the per-company limit (the
 * excess is released for the next run, not dropped), sends, and records the
 * outcome through comms.record_delivery / comms.schedule_retry.
 */
export async function deliverBatch(
  db: IsolatedDb,
  workerUser: string,
  transports: Partial<Record<Channel, MessageTransport>>,
  o: DeliveryOptions = {},
): Promise<DeliveryReport> {
  const claimed = await db.rows<OutboundMessage>(
    workerUser,
    "select * from comms.claim_outbound($1)",
    [o.batch ?? 20],
  );
  const report: DeliveryReport = {
    claimed: claimed.length,
    sent: 0,
    retried: 0,
    failed: 0,
    deferred: 0,
  };
  const perTenant = new Map<string, number>();
  for (const m of claimed) {
    const n = (perTenant.get(m.tenant_id) ?? 0) + 1;
    perTenant.set(m.tenant_id, n);
    if (n > (o.perTenantPerRun ?? 10)) {
      // Release the claim; it goes out next run. Not an attempt.
      await db.rpc(workerUser, "select comms.release_claim($1)", [m.id]);
      report.deferred += 1;
      continue;
    }
    const t = transports[m.channel];
    const result: SendResult = t
      ? await t.send(m)
      : { ok: false, error: `no transport for ${m.channel}`, retryable: false };
    if (result.ok) {
      await db.rpc(workerUser, "select comms.record_delivery($1, 'sent', $2)", [
        m.id,
        result.providerRef,
      ]);
      report.sent += 1;
    } else {
      const max = result.retryable ? (o.maxAttempts ?? 5) : 1;
      const outcome = await db.rpc<string>(
        workerUser,
        "select comms.schedule_retry($1, $2, $3)",
        [m.id, result.error, max],
      );
      if (outcome === "failed") report.failed += 1;
      else report.retried += 1;
    }
    if (o.pauseMs) await new Promise((r) => setTimeout(r, o.pauseMs));
  }
  return report;
}

// ---- Inbound ---------------------------------------------------------------

const OPT_OUT = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
const OPT_IN = ["START", "YES", "UNSTOP"];

export function parseKeyword(body: string): "stop" | "start" | null {
  const k = body.trim().toUpperCase();
  if (OPT_OUT.includes(k)) return "stop";
  if (OPT_IN.includes(k)) return "start";
  return null;
}

/**
 * Twilio's request signature: base64(HMAC-SHA1(authToken, url + each POST
 * parameter's name and value, sorted by name)).
 */
export function twilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string,
): boolean {
  if (!signature || !authToken) return false;
  const a = Buffer.from(twilioSignature(url, params, authToken));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** E.164 for US numbers, as the Venuewise function normalised them. */
export function normalizePhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return p.startsWith("+") ? `+${d}` : p;
}

export type InboundOutcome =
  "refused: bad signature" | "suppressed" | "resubscribed" | "ignored";

/**
 * Handle one inbound SMS for one company (the receiving number identifies
 * the company; resolving it is the caller's job). Refuses unsigned requests.
 */
export async function handleInboundSms(
  db: IsolatedDb,
  workerUser: string,
  req: {
    url: string;
    params: Record<string, string>;
    signature: string;
    authToken: string;
    tenantId: string;
  },
): Promise<InboundOutcome> {
  if (!verifyTwilioSignature(req.url, req.params, req.signature, req.authToken))
    return "refused: bad signature";
  const kw = parseKeyword(req.params["Body"] ?? "");
  if (!kw) return "ignored";
  return db.rpc<InboundOutcome>(
    workerUser,
    "select comms.apply_inbound_keyword($1, 'sms', $2, $3)",
    [req.tenantId, normalizePhone(req.params["From"] ?? ""), kw],
  );
}

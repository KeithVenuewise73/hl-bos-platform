// Checkpoint 3 — comms provider adapters + storage pre-flight (Deno unit tests).
//
// The DB half (auth, tenant isolation, consent/suppression, rendering,
// idempotency, retry, delivery, human approval, audit) is covered by
// supabase/tests/20_storage.sql and 21_communications.sql. This covers the
// edge-layer units: provider adapters (mock honesty, inert Twilio/email that
// never leak a secret) and the storage path/safety pre-flight.

import { MockCommsProvider } from "../_shared/comms/mock.ts";
import { TwilioProvider } from "../_shared/comms/twilio.ts";
import { EmailProvider } from "../_shared/comms/email.ts";
import {
  assertSafeUpload,
  normalizeObjectPath,
  UnsafeUploadError,
} from "../_shared/storage/paths.ts";
import { redact } from "../_shared/ai/redact.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`assertion failed: ${msg} (got ${a}, want ${b})`);
}
async function assertThrows(
  fn: () => Promise<unknown> | unknown,
  contains: string,
  msg: string,
) {
  try {
    await fn();
  } catch (e) {
    if (!String(e).includes(contains))
      throw new Error(`${msg}: wrong error ${String(e)}`);
    return;
  }
  throw new Error(`${msg}: expected throw`);
}

const FAKE_TOKEN = "sk_twilio_supersecretvalue_123456";

// --- Mock comms provider: deterministic, honest, sends nothing --------------
Deno.test("mock comms provider is deterministic and sends nothing real", async () => {
  const p = new MockCommsProvider("sms");
  const a = await p.send({ channel: "sms", to: "+15550001111", body: "hi" });
  const b = await p.send({ channel: "sms", to: "+15550001111", body: "hi" });
  assertEquals(a.providerMessageRef, b.providerMessageRef, "deterministic ref");
  assert(a.providerMessageRef.startsWith("mock-sms-"), "ref is labelled mock");
  assertEquals(new MockCommsProvider("email").key, "mock_email", "email key");
});

// --- Twilio adapter: inert, never leaks the token ---------------------------
Deno.test("twilio adapter is inert and never leaks its token", async () => {
  const p = new TwilioProvider("vault:twilio_auth_token", () =>
    Promise.resolve(FAKE_TOKEN),
  );
  await assertThrows(
    () => p.send({ channel: "sms", to: "+1", body: "x" }),
    "twilio_not_configured",
    "twilio inert",
  );
  try {
    await p.send({ channel: "sms", to: "+1", body: "x" });
  } catch (e) {
    assert(!String(e).includes(FAKE_TOKEN), "error must not contain the token");
  }
});

// --- Email adapter: inert until a provider is chosen ------------------------
Deno.test("email adapter is inert until configured", async () => {
  const p = new EmailProvider("vault:email_api_key", () =>
    Promise.resolve("secretkey"),
  );
  await assertThrows(
    () => p.send({ channel: "email", to: "a@b.c", subject: "s", body: "x" }),
    "email_provider_not_configured",
    "email inert",
  );
});

// --- redaction reused for comms error/log strings ---------------------------
Deno.test("redact scrubs a twilio-style token from a log line", () => {
  const clean = redact(`send failed for +1555 token=${FAKE_TOKEN}`, [FAKE_TOKEN]);
  assert(!clean.includes(FAKE_TOKEN), "token masked");
  assert(clean.includes("[REDACTED]"), "mask present");
});

// --- storage path normalization: force tenant prefix, strip traversal -------
Deno.test("normalizeObjectPath forces the tenant prefix and strips traversal", () => {
  const t = "00000000-0000-4000-8000-000000000001";
  assertEquals(
    normalizeObjectPath(t, "evidence/a.png"),
    `${t}/evidence/a.png`,
    "prefix added",
  );
  assert(
    !normalizeObjectPath(t, "../../etc/passwd").includes(".."),
    "traversal stripped",
  );
  assert(
    normalizeObjectPath(t, "otherTenant/x").startsWith(`${t}/`),
    "kept under caller tenant",
  );
});

// --- storage upload safety mirrors the DB guard -----------------------------
Deno.test("assertSafeUpload rejects dangerous/oversize, accepts valid", () => {
  assertSafeUpload("logo.png", "image/png", 4096); // no throw
  let n = 0;
  for (const bad of [
    () => assertSafeUpload("evil.exe", "image/png", 10),
    () => assertSafeUpload("m.png", "application/x-msdownload", 10),
    () => assertSafeUpload("big.pdf", "application/pdf", 60000000),
    () => assertSafeUpload("z.png", "image/png", 0),
  ]) {
    try {
      bad();
    } catch (e) {
      if (e instanceof UnsafeUploadError) n++;
    }
  }
  assertEquals(n, 4, "all four unsafe cases rejected");
});

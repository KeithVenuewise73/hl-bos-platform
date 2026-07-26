// Checkpoint 2 — AI gateway edge-layer unit tests (Deno).
//
// Covers the half of the runtime that lives in the edge function, not the DB:
// provider adapters (mock determinism, Anthropic provider-failure), secret
// redaction, structured-output validation, and bounded retry. Self-contained:
// no remote imports, so it runs offline (`deno test supabase/functions/tests/`).
//
// The DB half (auth, budgets, tenant isolation, cost ledger, event dispatch,
// human-approval routing) is covered by supabase/tests/19_ai_runtime_smoke.sql.

import { MockProvider } from "../_shared/ai/mock.ts";
import { AnthropicProvider } from "../_shared/ai/anthropic.ts";
import { redact } from "../_shared/ai/redact.ts";
import {
  StructuredOutputError,
  validateStructuredOutput,
} from "../_shared/ai/structured.ts";
import { withRetry } from "../_shared/ai/retry.ts";

// --- tiny inline assertions (no std import, so no network needed) -----------
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
    const s = String(e);
    if (!s.includes(contains)) throw new Error(`${msg}: wrong error ${s}`);
    return;
  }
  throw new Error(`${msg}: expected throw`);
}

const FAKE_KEY = "sk-ant-deadbeefdeadbeefdeadbeef";

// --- MockProvider: honest, deterministic, zero cost ------------------------
Deno.test("mock provider is deterministic, labelled, and zero-cost", async () => {
  const p = new MockProvider();
  const a = await p.generate({ model: "mock-model", prompt: "hello world" });
  const b = await p.generate({ model: "mock-model", prompt: "hello world" });
  assertEquals(a.text, b.text, "deterministic");
  assert(a.text.includes("[mock:mock-model]"), "labelled with model");
  assert(a.text.includes("NOT a real model result"), "honest disclaimer present");
  assert(a.inputTokens > 0 && a.outputTokens > 0, "token estimates present");
  assertEquals(a.costUsd, 0, "mock reports zero cost");
});

// --- AnthropicProvider: provider-failure surfaces a typed, key-free error ---
Deno.test(
  "anthropic adapter throws typed error on non-ok, never leaks the key",
  async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(new Response("rate limited", { status: 429 }));
    try {
      const p = new AnthropicProvider("vault:anthropic_api_key", () =>
        Promise.resolve(FAKE_KEY),
      );
      await assertThrows(
        () => p.generate({ model: "claude-latest", prompt: "x" }),
        "anthropic_error:429",
        "provider failure typed",
      );
      // the key must never appear in a thrown error
      try {
        await p.generate({ model: "claude-latest", prompt: "x" });
      } catch (e) {
        assert(!String(e).includes(FAKE_KEY), "error must not contain the key");
      }
    } finally {
      globalThis.fetch = origFetch;
    }
  },
);

// --- AnthropicProvider: success returns provider tokens; key stays internal -
Deno.test(
  "anthropic adapter sends key as header only, returns tokens not key",
  async () => {
    const origFetch = globalThis.fetch;
    let sentKey: string | null = null;
    globalThis.fetch = (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      sentKey = headers.get("x-api-key");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            usage: { input_tokens: 11, output_tokens: 22 },
            content: [{ text: "ok" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    };
    try {
      const p = new AnthropicProvider("vault:anthropic_api_key", () =>
        Promise.resolve(FAKE_KEY),
      );
      const out = await p.generate({ model: "claude-latest", prompt: "x" });
      assertEquals(sentKey, FAKE_KEY, "key sent as x-api-key header");
      assertEquals(out.inputTokens, 11, "input tokens from provider");
      assertEquals(out.outputTokens, 22, "output tokens from provider");
      assertEquals(out.text, "ok", "text assembled");
      assert(
        !JSON.stringify(out).includes(FAKE_KEY),
        "result must not contain the key",
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  },
);

// --- redact(): known secret shapes + explicit values are masked ------------
Deno.test("redact masks known secret shapes and explicit values", () => {
  const dirty = `key=${FAKE_KEY} svc=sb_secret_abcd1234efgh auth=Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig extra=topsecretvalue`;
  const clean = redact(dirty, ["topsecretvalue"]);
  assert(!clean.includes(FAKE_KEY), "anthropic key masked");
  assert(!clean.includes("sb_secret_abcd1234efgh"), "supabase secret masked");
  assert(!clean.includes("topsecretvalue"), "explicit secret masked");
  assert(clean.includes("[REDACTED]"), "mask marker present");
  assert(clean.includes("key=") && clean.includes("svc="), "non-secret text preserved");
});

// --- structured-output validation ------------------------------------------
Deno.test("structured-output validation accepts valid JSON, rejects bad output", () => {
  const parsed = validateStructuredOutput('{"score":80,"summary":"ok"}', {
    requiredKeys: ["score", "summary"],
  }) as Record<string, unknown>;
  assertEquals(parsed.score, 80, "parsed value");

  let threw = false;
  try {
    validateStructuredOutput("this is not json");
  } catch (e) {
    threw = e instanceof StructuredOutputError && String(e).includes("not_json");
  }
  assert(threw, "invalid JSON rejected");

  let threw2 = false;
  try {
    validateStructuredOutput('{"score":80}', { requiredKeys: ["summary"] });
  } catch (e) {
    threw2 = String(e).includes("missing_key:summary");
  }
  assert(threw2, "missing required key rejected");
});

// --- retry + idempotency (no duplicate completed action) -------------------
Deno.test(
  "withRetry succeeds after transient failure without duplicating success",
  async () => {
    let calls = 0;
    const result = await withRetry(
      () => {
        calls++;
        if (calls < 2) return Promise.reject(new Error("transient"));
        return Promise.resolve("done");
      },
      { attempts: 3 },
    );
    assertEquals(result, "done", "eventual success");
    assertEquals(calls, 2, "called until first success, then stopped (no duplicate)");
  },
);

Deno.test("withRetry gives up after attempts and rethrows", async () => {
  let calls = 0;
  await assertThrows(
    () =>
      withRetry(
        () => {
          calls++;
          return Promise.reject(new Error("always"));
        },
        { attempts: 2 },
      ),
    "always",
    "exhausted retries rethrow",
  );
  assertEquals(calls, 2, "exactly `attempts` calls");
});

Deno.test("withRetry does not retry non-retryable errors", async () => {
  let calls = 0;
  await assertThrows(
    () =>
      withRetry(
        () => {
          calls++;
          return Promise.reject(new Error("fatal"));
        },
        { attempts: 5, retryable: (e) => !String(e).includes("fatal") },
      ),
    "fatal",
    "non-retryable stops immediately",
  );
  assertEquals(calls, 1, "non-retryable error not retried");
});

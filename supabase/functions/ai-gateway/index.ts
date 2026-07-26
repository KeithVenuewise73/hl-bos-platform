// ai-gateway — the single authenticated door to every model (Stage A V0 scaffolding).
//
// Flow: authenticate -> ai.begin_run (enforces ai.run.create + budget) -> select
// provider adapter by ai.providers.kind -> generate -> compute cost from
// ai.models pricing -> ai.finish_run (records real tokens+cost, accrues budget,
// emits ai.run.completed). Provider failure marks the run 'failed' — never a
// fabricated success.
//
// V0 status: STRUCTURAL SCAFFOLDING, not deployed. The DB-side lifecycle
// (begin_run/finish_run/budget) is fully validated by pgTAP; this wiring is the
// deploy-time surface. With no live key, only the mock provider is selectable.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";
import type { AiProvider } from "../_shared/ai/provider.ts";
import { MockProvider } from "../_shared/ai/mock.ts";
import { AnthropicProvider } from "../_shared/ai/anthropic.ts";
import { redact } from "../_shared/ai/redact.ts";
import { validateStructuredOutput } from "../_shared/ai/structured.ts";
import { withRetry } from "../_shared/ai/retry.ts";

function resolverFor(admin: any): (ref: string) => Promise<string> {
  // Vault resolver: reads a secret by name from Supabase Vault. Never logs it.
  return async (vaultRef: string) => {
    const name = vaultRef.replace(/^vault:/, "");
    const { data, error } = await admin
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", name)
      .single();
    if (error || !data) throw new Error(`missing_secret:${name}`);
    return data.decrypted_secret as string;
  };
}

async function pickProvider(
  admin: any,
  modelKey: string,
): Promise<{ provider: AiProvider; model: any }> {
  const { data: model } = await admin
    .schema("ai")
    .from("models")
    .select("key, provider_key, input_cost, output_cost, is_active")
    .eq("key", modelKey)
    .single();
  if (!model?.is_active) throw new Error("model_inactive");
  const { data: prov } = await admin
    .schema("ai")
    .from("providers")
    .select("kind, is_active, credential_ref")
    .eq("key", model.provider_key)
    .single();
  if (!prov?.is_active) throw new Error("provider_inactive");
  const resolve = resolverFor(admin);
  const provider: AiProvider =
    prov.kind === "mock"
      ? new MockProvider()
      : prov.kind === "anthropic"
        ? new AnthropicProvider(prov.credential_ref, resolve)
        : (() => {
            throw new Error(`provider_unsupported:${prov.kind}`);
          })();
  return { provider, model };
}

Deno.serve(async (req: Request) => {
  try {
    const jwt = req.headers.get("Authorization") ?? "";
    const {
      tenantId,
      prompt,
      promptKey,
      promptVersion,
      modelKey,
      correlationId,
      // optional runtime controls
      expectJson, // when true, provider text must be valid JSON or the run fails
      requiredKeys, // optional top-level keys the JSON must contain
      retries, // total provider attempts (default 2 = one retry)
    } = await req.json();

    // caller-scoped client (RLS + auth.uid) for the run lifecycle RPCs
    const caller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: jwt } },
      },
    );
    // admin client (service role) only for reading catalog + Vault
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // begin_run enforces ai.run.create + budget; throws otherwise
    const { data: runId, error: beErr } = await caller.schema("ai").rpc("begin_run", {
      p_tenant: tenantId,
      p_prompt: promptKey,
      p_version: promptVersion,
      p_model: modelKey,
      p_correlation: correlationId ?? null,
    });
    if (beErr)
      return new Response(JSON.stringify({ error: beErr.message }), { status: 403 });

    try {
      const { provider, model } = await pickProvider(admin, modelKey);
      // Retry ONLY the provider call, inside the single pending run. begin_run
      // already created exactly one run; finish_run below runs once. So a
      // retried-then-succeeded call is one run, one completion — no duplication.
      const out = await withRetry(
        () => provider.generate({ model: modelKey, prompt }),
        {
          attempts: typeof retries === "number" ? retries : 2,
        },
      );
      // Structured-output gate: if JSON was requested, it must parse (and carry
      // any required keys) or this is a FAILED run, not a success.
      if (expectJson) {
        validateStructuredOutput(out.text, { requiredKeys });
      }
      const cost =
        out.inputTokens * Number(model.input_cost) +
        out.outputTokens * Number(model.output_cost);
      await caller.schema("ai").rpc("finish_run", {
        p_run: runId,
        p_input_tokens: out.inputTokens,
        p_output_tokens: out.outputTokens,
        p_cost_usd: cost,
        p_status: "succeeded",
      });
      return new Response(JSON.stringify({ runId, text: out.text, costUsd: cost }), {
        headers: { "content-type": "application/json" },
      });
    } catch (genErr) {
      // provider failure OR invalid structured output: record the run as
      // failed, never a fabricated success. Error text is redacted before it
      // leaves the process, so a leaked key/token cannot ride out in the body.
      await caller.schema("ai").rpc("finish_run", {
        p_run: runId,
        p_input_tokens: 0,
        p_output_tokens: 0,
        p_cost_usd: 0,
        p_status: "failed",
      });
      return new Response(JSON.stringify({ runId, error: redact(String(genErr)) }), {
        status: 502,
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: redact(String(e)) }), { status: 400 });
  }
});

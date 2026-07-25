// Anthropic provider adapter (Stage A V0 scaffolding — INERT until a key is granted).
//
// Reads its API key only through the Vault resolver, by reference. It is not
// exercised in V0 validation (no live credential). When a key is granted at
// deploy, ai.providers row 'anthropic' is set is_active=true and this adapter
// becomes selectable by the gateway. Default model tier: latest Claude family.
import type { AiProvider, GenerateRequest, GenerateResult, SecretResolver } from "./provider.ts";

export class AnthropicProvider implements AiProvider {
  readonly kind = "anthropic" as const;
  constructor(
    private readonly credentialRef: string, // e.g. "vault:anthropic_api_key"
    private readonly resolve: SecretResolver,
  ) {}

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const apiKey = await this.resolve(this.credentialRef); // Vault only; never from a table
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: (req.params?.max_tokens as number) ?? 1024,
        messages: [{ role: "user", content: req.prompt }],
      }),
    });
    if (!resp.ok) {
      // Provider-failure handling: surface a typed error; the gateway marks the
      // ai.run 'failed' and never records a fabricated success.
      throw new Error(`anthropic_error:${resp.status}`);
    }
    const data = await resp.json();
    const usage = data.usage ?? { input_tokens: 0, output_tokens: 0 };
    const text = (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
    // cost is computed by the gateway from ai.models pricing; provider returns tokens
    return { text, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, costUsd: 0 };
  }
}

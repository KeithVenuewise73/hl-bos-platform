// HL-BOS AI provider abstraction (Stage A V0 scaffolding).
//
// One interface in front of every model provider. The ai-gateway function
// selects an adapter by ai.providers.kind and never imports a provider SDK
// directly elsewhere. Credentials are resolved from Vault by reference
// (ai.providers.credential_ref, e.g. "vault:anthropic_api_key") — never read
// from the database, never hard-coded.
//
// V0 status: STRUCTURAL SCAFFOLDING. The MockProvider is used for tests and
// requires no credentials. The AnthropicProvider is present but inert until a
// key is granted at deploy; it is not exercised in V0 validation.

export interface GenerateRequest {
  model: string;
  prompt: string;
  params?: Record<string, unknown>;
}

export interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AiProvider {
  readonly kind: "anthropic" | "openai" | "gemini" | "mock";
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

// Resolves a Vault reference ("vault:<key>") to a secret value at runtime.
// In production this reads Supabase Vault; in tests it is never called because
// the mock provider needs no credential.
export type SecretResolver = (vaultRef: string) => Promise<string>;

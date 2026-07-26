// Mock AI provider — deterministic, credential-free, for tests and V0.
//
// Honest instrumentation: the mock returns a clearly-labelled deterministic
// string and reports zero cost. It never pretends to be a real model result.
import type { AiProvider, GenerateRequest, GenerateResult } from "./provider.ts";

export class MockProvider implements AiProvider {
  readonly kind = "mock" as const;

  // deterministic token estimate so run accounting is exercised without a model
  generate(req: GenerateRequest): Promise<GenerateResult> {
    const inputTokens = Math.max(1, Math.ceil(req.prompt.length / 4));
    const text = `[mock:${req.model}] draft for prompt (${inputTokens} input tokens) — NOT a real model result`;
    const outputTokens = Math.max(1, Math.ceil(text.length / 4));
    return Promise.resolve({ text, inputTokens, outputTokens, costUsd: 0 });
  }
}

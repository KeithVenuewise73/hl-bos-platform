# 07 · AI Capability Assessment

How artificial intelligence is used, governed, and metered across the platform. The defining principle — verified in the schema and the AI Safety & Authority Matrix (`docs/architecture/61-...`) — is:

> **The deterministic engine is the authority. AI is advisory and approves, authorizes, certifies, or publishes nothing.**

This is enforced by permissions and human gates, not merely stated in a policy document.

---

## 1. The AI gateway — one governed door

All model access goes through the `ai` schema and the `ai-gateway` edge function. There is exactly one door; scattered, unmetered AI calls are prohibited.

- **Registry:** `ai.providers`, `ai.models`, `ai.prompts`, `ai.prompt_versions` — providers and prompts are catalog data, versioned.
- **Every call is a ledgered run:** `ai.begin_run` (checks the `ai.run.create` permission and the tenant budget) → provider call → cost computed from `ai.models` pricing → `ai.finish_run` records **real** tokens and cost. A failed call is recorded as `failed`; usage is **never fabricated**.
- **Budgets:** `ai.budgets` + `within_budget()` cap spend per tenant; exceeding budget raises an event rather than silently overspending.
- **Guardrails:** `ai.guardrails` exists as the hook for block/flag/gate rules (table present, RLS deny-all today — the enforcement engine is a future extension).
- **Provider reality:** the Anthropic adapter is real and complete but **keyless and inactive** — the provider row is seeded INACTIVE. The system runs today on a mock provider, which is how the wiring is proven without spending or inventing.

## 2. Where AI actually appears

AI is used narrowly and always in an advisory position:

| Use                       | Where                                         | Authority                                                                                                |
| ------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Website scan narrative    | `discovery-website-worker`                    | Optional, non-blocking; deterministic rubric is the score                                                |
| Blueprint narrative       | `discovery-blueprint-worker`                  | Optional; must cite evidence or the blueprint is `partially_generated`; AI can never approve a blueprint |
| Duplicate-risk advice     | `hlvs.duplicate_checks.ai_recommended`        | Stored, **never authoritative**; a human must approve the determination (asserted by a test)             |
| Build completion drafting | `hlvs.build_completion_reports.drafted_by_ai` | Recorded as AI-drafted; a human must accept it                                                           |
| Proposal narrative        | `commerce-worker` via the gateway             | Drafts language; activates/prices/commits nothing                                                        |

Every AI-derived field carries an **explicit advisory marker** (`ai_recommended`, `drafted_by_ai`, `origin='ai_assisted'`) so AI output is never silently mistaken for a human decision.

## 3. Safety architecture

- **Prompt-injection fencing** (`_shared/discovery/injection`) — untrusted content pulled from a scanned website is fenced before it reaches a model, so a hostile page cannot hijack the prompt.
- **SSRF-safe fetching** (`_shared/discovery/url`) — the scanner blocks private/link-local/metadata addresses so it can't be turned into a server-side request forgery tool.
- **Structured-output validation + redaction** (`_shared/ai/structured`, `redact`) — model output is validated against a schema and error output is redacted.
- **Retry with backoff** (`_shared/ai/retry`) — transient failures don't fabricate results.
- **Secrets by reference** — the provider key lives in the Vault, referenced by name; it never appears in code or reaches a browser.
- **The non-waivable list** — certain failures can never be excused by AI or by an exception: unapproved production deploy, secret exposure, unapproved tenant creation, unapproved billing activation, missing human approval, unauthorized module duplication, missing security controls.

## 4. Deterministic engines are the real intelligence

The platform's "intelligence" is mostly **deterministic math**, not model calls — which is why results are reproducible, testable, and honest:

- **Scoring** (Digital Maturity 12 dimensions, Business Health 8 dimensions, BTI's 7 executive scores) — weighted rules over evidence, with unscored dimensions returning `null`, never a guessed `0`.
- **Recommendation rules** — rules are data (`discovery.recommendation_rules`), each recommendation carries its rule key, version, and the evidence ids that produced it; priority is 5 categorical bands (no false precision).
- **Conformance & readiness** (the Factory) — deterministic pass/fail engines, mirrored in both the database and the edge layer so they must agree ("same numbers or it's a bug"). No AI substitution.

This is a deliberate and defensible stance: AI writes prose and suggests; deterministic engines decide and score.

## 5. Maturity verdict

| Aspect               | Verdict                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Governance model     | **Strong** — single metered gateway, budgets, ledger, advisory-only, human gates                                       |
| Safety               | **Strong** — injection fencing, SSRF guard, structured validation, redaction, non-waivable list                        |
| Live capability      | **Dormant** — real Anthropic adapter, no key granted, running on mock                                                  |
| Advanced AI features | **Absent / future** — no embeddings, RAG, guardrail-enforcement engine, or multi-provider (OpenAI/Gemini) adapters yet |

**Bottom line:** the AI _governance_ is more mature than the AI _usage_ — which is the right order to build in. The capability is real and safe; it simply hasn't been given a key and a workload yet. Granting the key and deploying the gateway (report 12) turns this from "designed correctly" into "working."

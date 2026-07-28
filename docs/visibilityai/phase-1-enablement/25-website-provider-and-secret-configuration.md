# Phase 1 · Deliverable 7 (CP5) — Provider & Secret Configuration Guide (Website Assessment)

**Date:** 2026-07-27 · **Checkpoint:** 5 · Names and wiring only. **No real secret is created, stored, or transmitted in this checkpoint.**

This extends the [CP3 Provider & Secret Configuration Guide](09-provider-and-secret-configuration-guide.md) with the two providers the Website Assessment Collector will use. Both are inactive. Every credential is referenced by a Vault name (`vault:<name>`), never a value; the `credential_ref` columns are CHECK-constrained to that form so a raw secret cannot land in a table even by mistake.

## 1. Providers used by the collector

| Vault secret NAME          | Used by                                     | Reference form                                                    | State in CP5                                |
| -------------------------- | ------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `anthropic_api_key`        | AI interpretation via the shared gateway    | `ai.providers.credential_ref='vault:anthropic_api_key'`           | INACTIVE — mock provider only               |
| `google_pagespeed_api_key` | Performance assessment (PageSpeed Insights) | provider config `credential_ref='vault:google_pagespeed_api_key'` | INACTIVE — mock adapter only, not yet wired |

The collector reuses the **existing** AI gateway for Anthropic — it does not create a second AI path. PageSpeed is a distinct external provider; its adapter mirrors the `_shared/ai` / `_shared/comms` provider pattern (a mock implementation plus an inert real implementation) and is not called anywhere in CP5.

## 2. Server-side environment variables (already required, not new)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — consumed by the inert `discovery-website-worker` edge function to call the lifecycle RPCs with service-role authority. These are the same server-side names the `ai-gateway` and `events-dispatcher` already use. No `NEXT_PUBLIC_*` secret exists (enforced by `scripts/check-no-public-secrets.sh`).

## 3. Exact activation sequence (future — each step is a CEO trust decision)

Presented so the sequence is known, **not** as an instruction to perform now. Each is a one-time authorization the CEO alone controls.

| Step | Action                                                                             | Unlocks                                              |
| ---- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1    | Create Vault secret `anthropic_api_key` in the canonical project                   | Live AI interpretation of website content            |
| 2    | Create Vault secret `google_pagespeed_api_key` + set the provider `credential_ref` | Real performance metrics (replaces the mock)         |
| 3    | Deploy the `discovery-website-worker` edge function and wire real DNS/HTTP egress  | Actual crawling (subject to the connect-time IP pin) |
| 4    | Enable the `pg_cron` → `pg_net` schedule that invokes the worker                   | Automatic processing of queued scan events           |

None of steps 1–4 is taken in Checkpoint 5. Until step 3's egress adapter (with the connect-time IP pin from the [SSRF report](21-ssrf-and-crawl-security.md)) exists and is reviewed, the collector must not be pointed at real targets.

## 4. Secret hygiene

- Errors and logs pass through `redact()` before storage or return; the Anthropic, Supabase, Stripe, and JWT shapes are masked, and a caller can mask a just-resolved value explicitly. Proven by the AI-runtime and discovery Deno tests (a fetch/AI error containing an `sk-ant-…` shape is redacted).
- Providers report the credential **reference**, never the value; adapters send the key only as a request header at call time.

# Deliverable 9 — Security and Access Findings

**Audit:** VisibilityAI Phase 0
**Date:** 2026-07-26
**Scope:** HL-BOS Core (`mvvtngiopdrgiedjmhfb`) — the canonical project. No secret values are shown anywhere in this document.

**Overall posture: strong.** The database was designed security-first and the live catalog bears that out: 49/49 tables have RLS **enabled and FORCED**, every SECURITY DEFINER function pins `search_path`, tenant helpers never accept a tenant id as proof, secrets are Vault references only, and the audit log is immutable even to `service_role`. Supabase security advisors return **0 ERROR-level findings.** The material risks below are about _what is not yet built or deployed_, not about broken controls.

---

## 1. Verified strengths (evidence-backed)

| Control                                   | Verified state                                                                              | Evidence                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| RLS enabled + FORCED                      | 49/49 tables                                                                                | live catalog query         |
| SECURITY DEFINER with mutable search_path | **0**                                                                                       | live catalog query         |
| Tenant id as filter, never proof          | `auth.uid()` in every helper; `p_tenant` filtered                                           | mig 0003                   |
| Core schemas not PostgREST-exposed        | `api.schemas=["public"]` only                                                               | `config.toml`              |
| Secrets as Vault refs                     | CHECK constraints enforce `vault:` form on `ai`/`billing`/`integrations` credential columns | mig 0011/0012/0015         |
| Audit immutability                        | `reject_mutation` trigger blocks UPDATE/DELETE incl. BYPASSRLS roles                        | mig 0004                   |
| service_role cannot mint platform owner   | explicit REVOKE; owner-only bootstrap                                                       | mig 0006                   |
| No-escalation on role grants              | `can_grant_role` subset check in policies                                                   | mig 0003; test 07          |
| Anti-fabrication                          | reviews, invoices, payments have no tenant write path                                       | mig 0014/0016; tests 15/17 |
| Human gate before publish/charge/refund   | `workflows.is_approved` required                                                            | mig 0013/0014/0016         |
| Secret scanning in CI                     | gitleaks + `check-no-public-secrets.sh` + migration secret scan                             | `ci.yml`, scripts          |

## 2. Findings (this project)

Severity is this audit's assessment.

### 🟡 F-1 (Medium) — Leaked-password protection disabled

Supabase Auth is not checking passwords against HaveIBeenPwned. **Evidence:** security advisor `auth_leaked_password_protection`. **Fix:** dashboard toggle, no code change. **Remediation order: before public sign-up opens.**

### 🟡 F-2 (Medium) — Denials are not audited in-database

By design (documented, migration 0006): a `RAISE` rolls back the `audit.security_events` insert, so permission denials on the provisioning/accept paths are not persisted. Successful actions audit correctly. **Evidence:** mig 0006 header; `phase-2-implementation-report.md`. **Fix:** log denials at the API layer (owner decision pending). **Remediation order: when the API layer is built (before launch).**

### 🟢 F-3 (Low/Info) — Two tables have RLS enabled but no policy

`ai.guardrails`, `integrations.webhook_events`. This **fails closed** (no policy = deny all to non-BYPASSRLS roles) and is intentional for tables written only by internal/service paths. **Evidence:** advisor INFO ×2. **Fix:** none required; add explicit deny/read policies when these tables gain a consumer, to silence the advisor.

### 🟢 F-4 (Low) — `pgtap` installed in `public` schema

Test extension in `public` (advisor WARN). No runtime exposure (core schemas aren't API-exposed), but relocate to a dedicated schema for hygiene. **Evidence:** advisor `extension_in_public`.

### 🟠 F-5 (Process, Medium) — Migrations applied out-of-band; deploy governance not yet real

17 migrations are live on HL-BOS Core, but there is **no protected apply workflow** and CI has no deploy job. The docs mandate "production apply only via a protected workflow with manual approval; never MCP/dashboard." The current live state was reached by an out-of-band path. Low live risk (greenfield, 1 user), but the governance the platform promises is **not yet enforced**. **Evidence:** `ci.yml` (no deploy job); `CONTRIBUTING.md`/`migration-plan.md` policy; live migration list. **Fix:** build the protected migration-apply workflow before real customer data lands. **This is the deployment-governance gap, not a database vulnerability.**

### 🟠 F-6 (Medium) — Canonical-project ambiguity (access/ops risk)

Docs name an empty project (`ywrzgursvdowzyhipsmt`) as production while work is live on another (`mvvtngiopdrgiedjmhfb`). An operator following the docs could apply migrations, grant keys, or point an app at the wrong project. **Evidence:** Deliverable 2 §4. **Fix:** reconcile (Decision D-1), retire the unused project, correct `environments.md`.

## 3. Risks specific to VisibilityAI (not yet built — design now)

| ID  | Risk                                     | Where it bites                                                                                                                | Recommended control                                                                                                                                       |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-1 | **Website-scan abuse / SSRF**            | The scan worker fetches arbitrary user-supplied URLs → could be pointed at internal/metadata endpoints or used as a DoS relay | URL allowlist/denylist (block RFC1918, link-local, metadata IPs), egress proxy, per-tenant rate limits, timeout/size caps, no redirects to private ranges |
| V-2 | **Unauthenticated intake abuse**         | Public prospect-intake forms (capability #4) accept anon input                                                                | CAPTCHA, rate limiting, validation; keep intake writing through a SECURITY DEFINER RPC, never a bare anon INSERT                                          |
| V-3 | **Prompt injection via scanned content** | Website/review text fed to the AI gateway could carry instructions                                                            | Fence untrusted content, use structured outputs, keep the human approval gate before any send/publish, populate `ai.guardrails`                           |
| V-4 | **AI cost blow-out**                     | Scans × prospects × models                                                                                                    | Enforce `ai.budgets` per tenant (already built); alert on `ai.run.budget_exceeded` security events                                                        |
| V-5 | **Provider key exposure**                | Deploying `ai-gateway`/Stripe requires real keys                                                                              | Keep them in Vault (refs already modeled); never in `NEXT_PUBLIC_`; server-only edge runtime                                                              |
| V-6 | **PII in prospects/assessments**         | Contact data, business intel                                                                                                  | RLS already scopes to agency tenant; add retention + consent when `communications`/`storage` land                                                         |
| V-7 | **Cross-tenant leakage in new tables**   | Every new scan/proposal/storage table                                                                                         | Enforce `verify_rls_coverage()` + a pgTAP isolation test per table (the platform's existing discipline)                                                   |

## 4. Recommended remediation order

1. **F-6 / D-1** — reconcile the canonical project and correct `environments.md` (prevents operating on the wrong DB). _Cheap, do first._
2. **F-5** — build the protected migration-apply + edge-deploy workflow before customer data. _Governance._
3. **F-1** — enable leaked-password protection before public sign-up. _One toggle._
4. **V-1 design** — SSRF/abuse controls baked into the scan worker **before** it ships. _Design-time._
5. **F-2** — API-layer denial logging when the API layer is built.
6. **V-2, V-3, V-4** — intake throttling, prompt-injection fencing, budget enforcement as those features are built.
7. **F-3, F-4** — advisor hygiene (low priority).

No finding on this project is remotely exploitable today (pre-production, 1 user, no anon reach into HL-BOS schemas). The legacy project's live SEC-1 (2,481 anon-writable rows) is real but **out of scope and unreachable** here — flagged only so it is not forgotten.

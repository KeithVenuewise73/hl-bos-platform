# Deliverable 11 — Phase 0 Decision Register

**Audit:** VisibilityAI Phase 0
**Date:** 2026-07-26

Only decisions that materially affect architecture, security, or launch. Each is Keith's to make; the engineering recommendation is stated.

---

### D-1 — Which Supabase project is canonical, and what happens to the empty one?

**Context:** Two Pro projects exist. `mvvtngiopdrgiedjmhfb` ("HL-BOS Core", us-west-2) has all 17 migrations live. `ywrzgursvdowzyhipsmt` (us-east-1) is empty but is named as production in `environments.md`. The docs and reality disagree.
**Options:** (a) **Bless `mvvtngiopdrgiedjmhfb` as canonical, retire/repurpose the empty project, fix `environments.md`** _(recommended)_; (b) migrate everything to `ywrzgursvdowzyhipsmt` and abandon the current one; (c) keep the empty one as staging.
**Recommendation:** (a). Work is already there and healthy; moving it is pure risk.
**Consequence of delay:** an operator could apply migrations, grant keys, or point the app at the wrong/empty project.
**Required before development:** **Yes.**

### D-2 — Confirm the legacy project stays out of scope.

**Context:** The 156-table legacy project (`bkfsjhhclbqrhaolvhmz`) is unreachable here and marked out of scope in `CLAUDE.md`; it holds live security findings (legacy SEC-1). VisibilityAI is greenfield on HL-BOS Core.
**Options:** (a) **Confirm out of scope; VisibilityAI does not touch it** _(recommended)_; (b) prioritize a legacy consolidation first.
**Recommendation:** (a). Consolidating legacy is a separate, later, separately-approved effort.
**Consequence of delay:** none for VisibilityAI; the legacy finding remains the legacy project's problem.
**Required before development:** No (but confirm to avoid scope creep).

### D-3 — Approve building two new shared modules (`communications`, `storage`) before VisibilityAI features that need them.

**Context:** Neither exists. Proposals need storage; delivery/notifications need communications. Building VisibilityAI features first invites ad-hoc duplication (the exact anti-pattern the brief forbids).
**Options:** (a) **Build both as shared HL-BOS modules first** _(recommended)_; (b) build VisibilityAI-local versions now, refactor later (creates duplication debt).
**Recommendation:** (a).
**Consequence of delay:** proposals/agreements and any client messaging are blocked, or get built as throwaway.
**Required before development:** Yes for the features that need them (proposals, delivery). Core assessment flow can proceed without them.

### D-4 — Does `visibility.prospects` become a shared CRM, or stay VisibilityAI-local?

**Context:** `prospects` is the only CRM-like store. A second vertical needing contacts could either reuse it or spawn a duplicate.
**Options:** (a) Keep local for now, revisit when a second vertical needs CRM _(recommended)_; (b) extract a shared `crm` module now.
**Recommendation:** (a) — don't generalize on one example (Rule of Three).
**Consequence of delay:** none now; watch for a second vertical.
**Required before development:** No.

### D-5 — Approve deploying `ai-gateway` and granting a live AI provider key (Vault).

**Context:** The AI gateway DB layer is built and tested; the edge function and Anthropic adapter are written but inert (no key). VisibilityAI analysis/recommendations need real AI.
**Options:** (a) **Deploy gateway, store an Anthropic key in Vault, activate the provider** _(recommended)_; (b) stay on the mock provider (no real analysis).
**Recommendation:** (a). This is a trust/access grant (the legitimate exception in `CLAUDE.md`) — Keith authorizes the key; the engineer does the wiring.
**Consequence of delay:** VisibilityAI can be built structurally but produces mock output until a key is granted.
**Required before development:** No to start; **Yes before real assessments run.**

### D-6 — Where are permission denials logged (in-DB vs API layer)?

**Context:** In-database denial logging is impossible without autonomous transactions (documented). The platform therefore does not persist denials today.
**Options:** (a) **Log denials at the API layer when it's built** _(recommended)_; (b) add a pg_background/pg_cron durable-queue mechanism (more moving parts); (c) accept no denial log.
**Recommendation:** (a).
**Consequence of delay:** security-event visibility of denied actions is incomplete until the API layer exists.
**Required before development:** No (before launch).

### D-7 — Defer the `reporting` module?

**Context:** No reporting layer exists; assessments already persist as the data seed for monthly reporting.
**Options:** (a) **Defer reporting; build client dashboards after first clients** _(recommended)_; (b) build reporting now.
**Recommendation:** (a).
**Consequence of delay:** client dashboards arrive after conversion, not before — acceptable.
**Required before development:** No.

### D-8 — Approve installing `pg_cron`/`pg_net` and standing up the worker pipeline.

**Context:** The outbox is built and tested; production scheduling needs `pg_cron`/`pg_net` (available, not installed) and the dispatcher deployed. This is how scans and report generation will run.
**Options:** (a) **Install both, deploy the dispatcher** _(recommended)_; (b) trigger workers another way (cron on a host — but no host exists).
**Recommendation:** (a).
**Consequence of delay:** no scheduled scans/monitoring; everything stays manual.
**Required before development:** No to start; Yes for scanning/monitoring.

### D-9 — Build the protected migration-apply + edge-deploy workflow (deploy governance).

**Context:** 17 migrations are live but were applied out-of-band; CI has no deploy job. The platform's own rules require a protected, manual-approval apply path.
**Options:** (a) **Build the protected GitHub Actions apply/deploy workflow before real customer data** _(recommended)_; (b) keep applying manually (violates the stated governance and M-2 lesson).
**Recommendation:** (a).
**Consequence of delay:** production changes remain ungoverned; drift risk returns.
**Required before development:** No to start; **Yes before customer data / GA.**

### D-10 — Where will the VisibilityAI customer-facing app be hosted?

**Context:** The only app today is local-only. No hosting (Vercel/Coolify/other) is decided anywhere.
**Options:** (a) Vercel (natural Next.js fit); (b) Coolify/self-host; (c) other. _(No engineering recommendation forced — this is a cost/ops preference.)_
**Consequence of delay:** the customer app can be built but not shipped until a host is chosen.
**Required before development:** No; **Yes before first external user.**

---

## Decision summary

| ID   | Decision                             | Required before dev?   | Recommendation              |
| ---- | ------------------------------------ | ---------------------- | --------------------------- |
| D-1  | Canonical project + retire empty     | **Yes**                | Bless HL-BOS Core, fix docs |
| D-2  | Legacy out of scope                  | Confirm                | Out of scope                |
| D-3  | Build communications + storage first | For dependent features | Yes, as shared modules      |
| D-4  | Shared CRM?                          | No                     | Keep local for now          |
| D-5  | Deploy AI gateway + key              | Before real AI         | Grant key                   |
| D-6  | Denial logging location              | Before launch          | API layer                   |
| D-7  | Defer reporting                      | No                     | Defer                       |
| D-8  | pg_cron/pg_net + workers             | For scanning           | Install                     |
| D-9  | Deploy governance workflow           | Before GA              | Build it                    |
| D-10 | App hosting                          | Before external users  | Keith's choice              |

# HLVS V2 — Program Execution Plan (two parallel workstreams)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-02 · **Plan only — no production code, no production change.**

## Where we are

The foundation is complete and in production: `vstudio` schema applied (migration 0029), V2-1 app built and merged, a dedicated first-party internal tenant provisioned (**Herman Legacy Group Internal**), governance reconciled. The app is **not yet deployed** and `vstudio` is **not yet exposed** to the API — those are the first deployment gates.

We now run two workstreams **in parallel**: **A — Deployment & Stabilization** (get you using it daily) and **B — Executive Intelligence Platform** (make it progressively smarter). They coordinate through one deployed app and one schema, and neither blocks the other.

## The one law that shapes everything

**ASSEMBLE. DO NOT REBUILD.** Every capability below maps to an HL-BOS capability that already exists. We are not building a second app, a second connector registry, a second AI gateway, or a second scoring engine. Before any capability is coded, it gets a one-page reuse map proving what it reuses and what (little) is net-new.

### What already exists that we reuse

| Need                                                                       | Reused HL-BOS capability                                                                                     | Where                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------- |
| Auth, identity, permissions, audit                                         | identity / platform spine                                                                                    | migrations 0002–0008 |
| Opportunity records, evidence, notes, evaluation, recommendation, decision | **`vstudio`**                                                                                                | 0029 (in production) |
| External data sources (GitHub, Product Hunt, grants, …)                    | **`integrations`** connector registry (Vault credential _reference_, per-tenant connection, logged sync run) | 0011                 |
| AI analysis / scoring / drafting                                           | **`ai`** gateway + `ai.runs` ledger + prompt library + budget                                                | 0012                 |
| Discovery / collectors / unified profile / scoring frameworks              | **`discovery`** engine (collectors are rows, not code)                                                       | 0020                 |
| Human review before something becomes authoritative                        | **`workflows`** gate                                                                                         | 0013                 |
| Reuse scoring, factory-fit, module registry                                | **`@hl-bos/catalog`** (`evaluateReuse`, `MODULE_REGISTRY`, `buildKnowledgeGraph`)                            | package              |
| Evidence-gated impact/ROI, grant & government intelligence                 | **`@hl-bos/transformation-intelligence`** (HL-BTI)                                                           | package              |
| Portfolio / dependency intelligence                                        | **`graph`** knowledge-graph read model (projections)                                                         | 0028                 |
| Documents                                                                  | **`storage_meta`**                                                                                           | 0018                 |
| Notifications                                                              | **`comms`**                                                                                                  | 0019                 |
| Event trail                                                                | **`events`**                                                                                                 | 0009 / 0021          |

**Net-new across the whole program is deliberately small:** a few additive `vstudio`/companion tables, per-source collector rows, edge-function collectors, and pages inside the _existing_ `apps/venture-studio`.

---

## Coordination model (how A and B stay independent)

- **One app, one schema.** Every B capability ships as an _additive_ feature inside the deployed `apps/venture-studio`. **No separate application** is ever created.
- **Build-vs-live split.** B capabilities can be **built, tested (CI), and merged to `main`** without the app being live — CI runs pgTAP + unit + build. A **redeploys** to surface them. So B never waits on A, and A never waits on B.
- **Integration contract.** A B capability is "done" when: additive migration authored (+ applied under CEO approval), reuse map proven, page(s) integrated, tests green, and it degrades to an **honest empty state** when its data/credential/exposure isn't present yet.
- **Governance is the shared spine.** Every production change — apply a migration, expose a schema, add a connector credential, deploy, DNS — is a **separate CEO-approved gate**. Nothing self-approves.
- **Branch discipline.** One capability = one branch = one PR into `main`, CI green, no merge without your approval. Migrations numbered sequentially in one lineage (0030, 0031, …) and applied in order.

### The only real cross-dependency

Exposing `vstudio` to the API (**A1**) is what turns _live data_ on for the V2-1 baseline **and** for every B capability that reads/writes `vstudio`. It's a shared prerequisite for _live behavior_ — but **not** for building or merging B. So A1 goes early; until it lands, B still merges and shows honest "not provisioned" states.

---

## Workstream A — Deployment & Stabilization

**Goal:** you log into Venture Studio at an internal Herman Legacy address and use it as your daily executive workspace.

| #      | Milestone                     | Reuses                                                                    | CEO gate            | Definition of done                                                                        |
| ------ | ----------------------------- | ------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| **A1** | Expose `vstudio` to PostgREST | existing RLS/permission model                                             | ✅ approve exposure | 6-point exposure checklist passes; anon still denied; RLS still enforced                  |
| **A2** | Coolify deployment            | proven Executive-Portal / HL-Digital Coolify pattern; verified env matrix | ✅ approve deploy   | container healthy; `/api/health` 200; `/`→307 `/login`                                    |
| **A3** | Internal domain + TLS         | Coolify domain/TLS                                                        | ✅ approve DNS      | `venturestudio.hermanlegacygroup.com` resolves, TLS valid, auth-gated, network-restricted |
| **A4** | Authentication verification   | HL-BOS SSR auth                                                           | —                   | you sign in as `platform_owner`; anon redirected; dev-bypass impossible in prod           |
| **A5** | Smoke test                    | the 16-step script                                                        | —                   | all 16 green; a DEMONSTRATION opportunity round-trips end-to-end                          |
| **A6** | Performance validation        | Supabase advisors + logs                                                  | —                   | cold-start, page TTFB, query timings within target; no error-level advisors               |
| **A7** | Stabilization loop            | events/audit + advisors                                                   | —                   | bug triage to zero blockers; you use it daily                                             |

**Workstream A DoD:** live at the internal domain, live `vstudio` data owned by the internal tenant, green smoke test, clean advisors, and you're using it every day.

---

## Workstream B — Executive Intelligence Platform

**Goal:** grow Venture Studio from "capture + evaluate + decide" into Herman Legacy's executive intelligence and opportunity platform — **incrementally**, each capability landing **inside the deployed app**.

Each increment is one PR: reuse map → additive migration (unapplied → CEO-approved apply) → logic in a package → page(s) in `apps/venture-studio` → tests → honest empty state → governance record.

| #       | Capability                                          | Reuses (assemble)                                                                     | Net-new (small)                                               | Data honesty guard                                          |
| ------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| **B1**  | **CEO Notebook**                                    | `vstudio.notes` (exists) + identity                                                   | UI + (optional) nullable-`opportunity_id` for un-scoped notes | notes are yours, never AI-fabricated                        |
| **B2**  | **Opportunity Discovery Engine + Research Queue**   | `discovery` collectors + `workflows` review gate                                      | discovery→`vstudio.opportunities` mapping; queue view         | candidates labelled non-authoritative until you promote     |
| **B3**  | **Reuse scoring + Factory recommendation** (deepen) | `@hl-bos/catalog` `evaluateReuse` + `computeFactoryReadiness` (already wired in V2-1) | portfolio-level roll-up                                       | deterministic, formula shown; preview-only (no build order) |
| **B4**  | **Portfolio intelligence + Executive dashboards**   | `graph` projections + registries + `vstudio`                                          | aggregate read views                                          | reads persisted projection; empty states explain themselves |
| **B5a** | **GitHub intelligence**                             | `integrations` connector + `ai` analysis                                              | GitHub collector (edge fn) → `vstudio.evidence`               | provenance-tagged; `ai.runs` ledgered; no invented signals  |
| **B5b** | **Product Hunt intelligence**                       | same connector framework + `ai`                                                       | Product Hunt collector                                        | same                                                        |
| **B5c** | **Grant intelligence**                              | HL-BTI government/grant intelligence + `integrations`                                 | grant collector                                               | evidence-gated; no fabricated awards                        |
| **B5d** | **Patent intelligence**                             | `integrations` + `ai`                                                                 | patent collector                                              | source-cited only                                           |
| **B5e** | **Reddit intelligence**                             | `integrations` + `ai`                                                                 | Reddit collector                                              | provenance-tagged                                           |
| **B5f** | **Acquisition intelligence**                        | `integrations` + HL-BTI valuation                                                     | acquisition collector                                         | evidence-gated                                              |
| **B5g** | **Competitive intelligence**                        | `integrations` + `ai` + `graph`                                                       | competitor mapping                                            | source-cited                                                |

**Every external source (B5x) is its own CEO-approved increment**, because adding a credential is a trust decision (see Risks). Credentials are always a **Vault reference** — never a secret pasted into a browser-exposed variable, never the service-role key.

**Workstream B DoD (per increment):** the capability is visible and usable inside the deployed Venture Studio, backed by real data or an honest empty state, with its reuse map and governance record committed.

---

## Parallelization opportunities

1. **A ∥ B.** A makes it live; B fills it with capability and merges to `main`; A redeploys. Continuous, non-blocking.
2. **Within B — internal vs. external.** B1–B4 need **no external credentials** and can proceed in parallel with each other and with A. B5x connectors are each independent of one another.
3. **Migrations authored in parallel, applied in series.** All B migrations can be written and CI-tested concurrently; they're _applied_ one at a time in lineage order under CEO approval.
4. **Fastest first value:** **B1 (CEO Notebook)** reuses an existing table and needs at most a trivial additive change — it can be your first real daily-use feature almost immediately after A deploys.

## Dependencies (explicit)

- **A1 (exposure) → live `vstudio` behavior** for baseline + all B capabilities that touch `vstudio`. (Build/merge of B does **not** depend on it.)
- **A2 (deploy) → B capabilities become visible to you.** (Build/merge does not.)
- **B5x connectors → a CEO-approved credential** (Vault) before they collect anything real; until then they show honest empty states.
- **B2 discovery → `workflows` review gate** so nothing machine-surfaced becomes authoritative without your promotion.
- **Migration ordering:** 0030, 0031, … strictly sequential; each applied only after the prior is applied and CI is green.

## Risks & mitigations

| #   | Risk                                                                                        | Mitigation                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Migration races** across parallel B branches → lineage conflict                           | Single lineage; reserve numbers sequentially; apply in order; one CEO approval each; `check-lineage` in CI                                                             |
| 2   | **Exposure delay** blocks live data                                                         | Do A1 early; honest "not provisioned" states meanwhile (already built)                                                                                                 |
| 3   | **Credential / secret exposure** (external sources)                                         | `integrations` Vault-reference model only; per-connector CEO approval; **never** service-role, **never** a secret behind `NEXT_PUBLIC_*`                               |
| 4   | **Fabricated intelligence** (Principle 10) — AI/external items masquerading as real signals | Every AI/external item provenance-tagged + non-authoritative; `ai.runs` ledger; no invented metrics; honest empty states; you promote before anything is authoritative |
| 5   | **Rebuild temptation / scope creep** (a 2nd app, bespoke connector)                         | Engineering Law #1; a reuse map is required before any capability is coded                                                                                             |
| 6   | **Bad B merge breaks the live app**                                                         | CI-green + smoke-test gate before every redeploy; feature-flag incomplete capabilities                                                                                 |
| 7   | **Performance** of intelligence/graph queries                                               | Read persisted `graph` projections; pagination; `ai` budget enforcement; measure in A6                                                                                 |
| 8   | **Single-user today, multi-member later**                                                   | RLS is already platform-permission gated; no design lock-in; decision gate stays `platform_owner`-only                                                                 |

## Estimated implementation order

1. **A1** expose `vstudio` (CEO gate) — shared unblock.
2. **A2–A5** deploy + domain + auth verify + smoke — you're live on the V2-1 baseline.
3. **B1 CEO Notebook** — first real daily-use feature (parallel with A6/A7).
4. **A6/A7** performance + stabilization (ongoing).
5. **B2** Discovery + Research Queue → **B3** reuse/factory deepening → **B4** portfolio + dashboards.
6. **B5x** external connectors, one CEO-approved increment at a time, sequenced by value/risk: **GitHub → Product Hunt → grants → patents → Reddit → acquisition → competitive.**

## Governance & cadence

- Each numbered milestone ends as **a working capability** (proven by running it) or **a merge-ready PR** (green CI, plain-English summary) — never a bare plan.
- Production actions (apply / expose / credential / deploy / DNS) are **individually CEO-approved**.
- `.hlbos/milestone.json` and the product docs are updated as each capability lands, so the record stays true.

## What this plan is not

It is not an authorization to deploy, expose, add credentials, or apply any migration. Those remain your call, one gate at a time. The two prompts that accompany this plan (`prompts/WORKSTREAM_A_STEP_1.md`, `prompts/WORKSTREAM_B_STEP_1.md`) are the **first** step of each workstream, ready for you to approve when you want them to run.

# Executive Assessment — Herman Legacy Digital

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-02 · **Methodology:** HL-BTI Business Transformation. **Documentation only.**

> **Honesty note (Law #2):** Financials, customer counts, channel performance and current-tooling specifics are **not** in the repository. Every such item is marked **[requires CEO input]** and is **not** invented. What _is_ verifiable — the built capability set — is stated plainly.

## Current State

Herman Legacy Digital is the customer-facing **AI-powered Business Transformation company** (`hermanlegacydigital.com`): a public marketing + assessment-intake site and an authenticated client portal, assembled on HL-BOS (verified in `app-registry.ts`). It is **built and validated but not deployed** — DNS and hosting await CEO authorization. Revenue, active clients, and pipeline: **[requires CEO input]**.

**HLD is also the "house" for the operating model** — its Operations Division runs the BT services business; its R&D Division is Venture Studio + HL-BOS.

## Customer Acquisition

- **Today:** [requires CEO input — current channels/volume].
- **Designed engine:** the **VisibilityAI assessment** is the lead magnet — a free/low-friction digital-maturity + business-health assessment (`discovery`, 0020) that produces a personalized transformation report, converting to a paid engagement.

## Marketing

- **Today:** [requires CEO input].
- **Assembled capability:** HLD public site content; `comms` (0019) for nurture; `ai` gateway (0012) for **advisory** content drafting (metered, never auto-published as fact). No new marketing platform.

## Sales

- **Today:** [requires CEO input — motion, ACV, cycle].
- **Assembled capability:** intake → client portal → `billing` subscriptions (0015/0016) + `entitlements` (0010) plan gating; Executive Portal pipeline views. The BT **assessment score** is the sales artifact — evidence-gated, not a pitch.

## Operations

- **Today:** [requires CEO input].
- **Assembled capability:** onboarding via canonical `platform.provision_tenant`; customer success via the client portal + `workflows` (0013) review gates; monthly recurring services via `billing.subscriptions`; every action on the `events` trail + `audit`.

## Technology

- **Strength:** HLD reuses HL-BOS end-to-end (identity, portal, BT engine, billing) — **no duplicate systems** (verified). One codebase, one governance, 100% RLS.
- **Gap (honest):** **not deployed.** The app, HL-BTI surfaces, and Executive Portal are built-undeployed. Nothing has served a real customer.

## AI Opportunities

- Advisory assessment narrative generation (via `ai` gateway; evidence-gated, non-authoritative).
- Opportunity discovery for the client (Venture Studio pipeline, once connectors are approved).
- Automated KPI/outcome summaries (real data only; "no data" when absent).

## Existing HL-BOS capabilities applicable immediately

`identity`/tenancy · `billing` + `entitlements` · **HL-BTI** (transformation intelligence) · **VisibilityAI/`discovery`** (assessment) · Executive Portal · `comms` · `workflows` · `ai` gateway · `@hl-bos/catalog` (portfolio) · `events`/`audit`. **All already built.**

## New capabilities required

- **Deployment** of the HLD app + Executive Portal (Workstream A pattern) — the single biggest gap.
- A thin **assessment→proposal→subscription** flow wiring (mostly composition of existing capability, not new schema).
- Outcome-measurement dashboard (Executive Portal view over HL-BTI results) — assemble, don't rebuild.

## 90-day improvement roadmap

| Window     | Focus                                                                                                                            | Definition of done                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Days 1–30  | **Deploy** HLD site + client portal + Executive Portal (CEO-gated infra); wire VisibilityAI assessment as the public lead magnet | Live URL; a real prospect can complete an assessment       |
| Days 31–60 | Wire assessment → proposal → `billing` subscription; onboard the **first paying client**                                         | First recurring-revenue client onboarded (real)            |
| Days 61–90 | Outcome measurement (HL-BTI evidence-gated) + first **case study** from a real result                                            | One measured client outcome; KPI dashboard shows real data |

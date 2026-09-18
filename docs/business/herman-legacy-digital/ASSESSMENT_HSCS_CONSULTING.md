# Executive Assessment — HSCS Consulting

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-02 · **Methodology:** HL-BTI Business Transformation. **Documentation only.**

> **Honesty note (Law #2):** HSCS's contracts, revenue, staffing, and pipeline are **not** in this repository. What is verifiable: a first-party production tenant **"HSCS Government"** exists (`platform.tenants`, `first_party`, `trial`), and the registry records an **HSCS Government Logistics Platform (HSCS-GLP)** application (category: government). HL-BTI ships **government-contracts intelligence**. Business specifics are **[requires CEO input]** and not invented.

## Current State

HSCS Consulting is Herman Legacy's **government-facing** business. Verifiable footprint: the HSCS Government tenant (first-party, trial) and the HSCS-GLP application on record. Active contracts, revenue, and staffing: **[requires CEO input]**. In the operating model, HSCS is the third **reference business** and the natural home for government intelligence.

## Customer Acquisition

- **Today:** [requires CEO input — likely RFP/contract-driven].
- **Applicable engine:** the **Grants.gov / SAM.gov / USPTO** connectors are **defined in the Venture Studio connector registry (stubbed)** and map to the Grant/Research Intelligence Programs — the pipeline that, once a credential is CEO-approved, surfaces government opportunities. HL-BTI **government intelligence** scores fit.

## Marketing

- **Today:** [requires CEO input].
- **Applicable capability:** government marketing is relationship/compliance-driven; `comms` + `workflows` support structured outreach and approvals. No consumer-marketing assumptions.

## Sales

- **Today:** [requires CEO input — capture/proposal motion].
- **Applicable capability:** opportunity capture in Venture Studio (Grant Intelligence Program); evidence-gated qualification via HL-BTI; CEO decision gate for pursue/no-pursue.

## Operations

- **Today:** [requires CEO input].
- **Applicable capability:** HSCS-GLP for logistics delivery; `workflows` for compliance gates; `audit` for a government-grade trail; strict tenant isolation (HSCS Government is already isolated in production).

## Technology

- **Strength:** HSCS already has a dedicated first-party tenant and a named platform (HSCS-GLP) — the tenancy/isolation foundation is real and in production.
- **Gap (honest):** the connector-driven government-opportunity pipeline is **stubbed** (no live Grants.gov/SAM.gov ingestion); HSCS-GLP deployment status: **[requires CEO input]**.

## AI Opportunities

- **Grant/RFP discovery** (Venture Studio Grant Intelligence + Grants.gov/SAM.gov connectors — CEO-gated credentials).
- **Compliance-aware summarization** of solicitations (`ai` gateway; advisory, sourced, non-authoritative).
- **Patent/prior-art scan** (USPTO / Google Patents connectors, Research Intelligence Program).

## Existing HL-BOS capabilities applicable immediately

HSCS Government tenant (live, isolated) · HL-BTI **government intelligence** · Venture Studio **Grant/Research Intelligence Programs** + connector registry · `workflows` (compliance gates) · `audit` (government-grade trail) · `ai` gateway · Executive Portal. **All already built** (connectors stubbed).

## New capabilities required

- **CEO-approved credentials** (Vault references) for Grants.gov / SAM.gov / USPTO to move those connectors from stubbed → live (this is the B3-class work, deferred by charter).
- HSCS-GLP deployment (if not already live) — assess separately.
- A compliance-review workflow binding (assemble on `workflows`, not a new engine).

## 90-day improvement roadmap

| Window     | Focus                                                                                                                                       | Definition of done                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Days 1–30  | Baseline HSCS with the BT methodology; confirm HSCS-GLP status; define the government-opportunity target list with the CEO                  | Documented current state + target solicitation types                                  |
| Days 31–60 | Stand up the **Grant Intelligence** workflow inside Venture Studio (still stubbed ingestion); manual capture proves the pipeline end-to-end | CEO can triage government opportunities in the pipeline (manual data)                 |
| Days 61–90 | On CEO approval, activate **one** government connector (Grants.gov) with a Vault-referenced credential; measure qualified-opportunity flow  | One live government source; first qualified opportunity captured with real provenance |

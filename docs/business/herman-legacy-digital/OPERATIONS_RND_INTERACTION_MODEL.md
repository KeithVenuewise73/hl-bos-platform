# Herman Legacy Digital — Operations / R&D Interaction Model

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-02 · **Documentation only.**

Two departments, one platform, one repository. This defines exactly how they hand work back and forth without becoming two businesses.

## Shared substrate (owned by neither, used by both)

HL-BOS Core is the single source of identity, tenancy, permissions, audit, events, AI, billing, workflows, catalog, and intelligence. Operations and R&D both build **on** it; neither forks it.

## The two rhythms

|                    | Operations Division                                                | R&D Division                                                          |
| ------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Goal               | Recurring revenue + delivered outcomes                             | Reusable capability + measured improvement                            |
| Cadence            | Weekly delivery / revenue                                          | Build → measure → graduate                                            |
| Primary tools      | HLD site + portal, HL-BTI, VisibilityAI, Executive Portal, billing | Venture Studio, `@hl-bos/catalog`, Software Factory, `ai` gateway     |
| Definition of done | Client outcome measured (real data)                                | Capability merged + reuse-scored + graduated to ≥1 reference business |

## Handoff artifacts (the contract between them)

| Direction | Artifact                                             | Where it lives (existing capability)                                           |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Ops → R&D | **Demand signal** (request / lost deal / pain point) | Venture Studio **Opportunity Inbox** (`vstudio.opportunities`, status `inbox`) |
| R&D → R&D | **Dedup + reuse score**                              | `@hl-bos/catalog` `analyzeReuse` + pipeline duplicate detection                |
| R&D → R&D | **Priority**                                         | Executive Priority Queue (deterministic score/tier)                            |
| R&D → Ops | **Shipped capability**                               | Merge-ready PR + plain-English adoption note                                   |
| R&D → All | **Graduation record**                                | Evaluated for HLD / Venuewise / HSCS before external sale                      |
| Ops → All | **Outcome**                                          | HL-BTI evidence-gated impact (measured/estimated/unknown)                      |

## RACI (per activity)

| Activity                            | Operations    | R&D                 | CEO           |
| ----------------------------------- | ------------- | ------------------- | ------------- |
| Generate & qualify leads            | **R/A**       | C                   | I             |
| Run a BT assessment                 | **R/A**       | C (owns the engine) | I             |
| Onboard / bill a client             | **R/A**       | C                   | A (pricing)   |
| Measure client outcome              | **R/A**       | C                   | I             |
| Capture a demand signal             | **R**         | A (triage)          | I             |
| Build a reusable capability         | C             | **R/A**             | A (prod gate) |
| Reuse-score & prioritise            | I             | **R/A**             | I             |
| Graduate capability to 3 businesses | **R** (adopt) | A (readiness)       | A             |
| Approve production change           | C             | C                   | **R/A**       |

(R = responsible, A = accountable, C = consulted, I = informed.)

## The weekly loop (60 minutes)

1. **Ops posts demand** (5 min prep, async): new requests, lost opportunities, marketing/sales data, pain points → Opportunity Inbox.
2. **R&D triages** (async): dedup, reuse-score, attach to an Intelligence Program.
3. **Meeting — decide (live):**
   - R&D presents the top of the Priority Queue + last week's shipped capabilities.
   - Ops presents outcomes (real data) + this week's highest-friction pain point.
   - Decisions: _what R&D builds next_ and _what Ops adopts this week_.
4. **Graduation check:** any capability ready to deploy is checked against **HLD, Venuewise, HSCS** before any external-sale discussion.

## Escalation & gates

- **Production / spend / data-exposure** → CEO approval (the authoritative act).
- **Reuse conflict** (R&D proposes building something that already exists) → the `@hl-bos/catalog` duplicate gate blocks it; reuse the existing asset.
- **Outcome dispute** (Ops claims a result R&D can't measure) → HL-BTI evidence gate; unmeasured = "no data," not a claimed win.

## What flows, concretely (example)

> A sales call is lost because a prospect wanted a specific integration.
> → Ops logs it as a demand signal (lost opportunity) in the Inbox.
> → R&D dedups it against existing opportunities, reuse-scores it against `integrations`, and finds the connector framework already covers 80%.
> → It rises in the Priority Queue; R&D ships the missing 20% as a reusable connector.
> → Graduation: the connector is evaluated for HLD, Venuewise, and HSCS; adopted where it fits.
> → Ops re-engages the prospect; the outcome is measured with real data.

No new system was built; the demand became reusable capability across three businesses before anyone considered selling it externally.

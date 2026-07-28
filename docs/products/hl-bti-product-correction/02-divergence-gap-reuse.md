# Divergence, Gap & Reuse Analysis (Deliverables 4, 5, 6)

## Deliverable 4 — Every divergence between the current product and the corrected product

Classified: **Already Exists · Requires Integration · Requires Minor Modification · Requires New Development.**

| #   | Corrected product needs…                                                 | Current product does…                                                                       | Classification                                                                                                  |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | One entry: name + website + industry + location → **Analyze Business**   | Pick a client → open engagement → open assessment wizard                                    | **Minor Modification** (new entry screen; reuse `register_business`/`open_engagement` underneath)               |
| 2   | **AI performs the analysis** from collected evidence                     | Consultant manually enters 43 scores                                                        | **New Development** — the **AI Business Analyst** (reuses the `ai` gateway + fence)                             |
| 3   | **Automatic discovery** on click                                         | No collection wired into HL-BTI                                                             | **Requires Integration** — connect the existing website scanner + evidence repository to the flow               |
| 4   | **Business Intelligence Profile** (understanding, not scores)            | Produces a 7-number scorecard as the headline                                               | **New Development** (the understanding narrative) + **Minor Modification** (demote scores)                      |
| 5   | **Findings**: evidence, impact, confidence, risk, opportunity            | The consulting framework already produces exactly this shape                                | **Already Exists** (structure) — but **Requires Integration** to feed it real evidence instead of manual scores |
| 6   | **Every finding → Herman Legacy solution**                               | `solutions.ts` already maps findings → services                                             | **Already Exists** — **Minor Modification** to rename the catalog to real HL products (see below)               |
| 7   | Every recommendation: why / impact / ROI / priority / difficulty / order | 12-part findings + roadmap already carry all of this (ROI evidence-gated)                   | **Already Exists**                                                                                              |
| 8   | **Executive Blueprint** (professional, exportable)                       | Blueprint assembly + narrative exist; export is browser-print only                          | **Already Exists** + **Minor Modification** (lead with understanding; real export)                              |
| 9   | **Proposal generated from the blueprint**                                | Proposal engine exists (`sales`); not auto-generated from the blueprint or surfaced in-flow | **Requires Integration**                                                                                        |
| 10  | **One seamless workflow**                                                | CEO Command Center + Executive Dashboard + Clients + a 7-tab engagement                     | **Minor Modification** (collapse to one linear flow)                                                            |
| 11  | Deployed, persistent, live                                               | Local-only; migration never applied                                                         | **Requires Integration** (deploy — the validation's Phase 0)                                                    |
| 12  | Broad evidence (app, financials, ops, social)                            | Only the website scanner exists; others are registered slots                                | **New Development (later)** — not required for the first demo                                                   |

## Deliverable 5 — Gap analysis

**The single true gap between "what's built" and "the CEO's product" is one capability: the AI Business Analyst** — the piece that reads collected evidence and produces _understanding and evidence-backed findings_ without a consultant scoring anything. Everything downstream of findings (transformation, recommendations, roadmap, blueprint, proposal) **already exists** and is tested; everything upstream (evidence store, collectors, website scanner) **already exists**. The middle — turning evidence into findings — is currently done by _manual scores + deterministic templates_, which is exactly what Rule 1 forbids.

Secondary gaps, all smaller:

- **Product face**: the app leads with scores, not understanding — a re-facing job.
- **One flow**: the app is a suite of dashboards — a navigation-collapse job.
- **Wiring**: scanner→analysis→blueprint→proposal aren't connected end to end — integration.
- **Deploy**: nothing runs live — the known prerequisite.
- **HL service catalog naming**: align to real products (below).

Nothing here is a rebuild. One new engine, several connections, one re-face.

### Herman Legacy service catalog — alignment needed (Minor Modification)

| Current label (engine)                                             | Corrected to CEO's product list                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Website Development                                                | **Herman Legacy Digital** (web/dev)                                             |
| Digital Marketing                                                  | **Marketing Services**                                                          |
| Operating Systems                                                  | **Future Vertical Operating Systems** (+ **HomeHuddle** where sports/community) |
| Managed Services                                                   | **Reputation Management** (reviews) / **Managed Services**                      |
| (add)                                                              | **HL-BOS CRM**                                                                  |
| VisibilityAI, SEO, AI Automation, Business Transformation Services | (already aligned)                                                               |

## Deliverable 6 — Reuse analysis (Reuse · Modify · Replace)

| Capability                                                                    | Verdict                     | Note                                                                                                                                 |
| ----------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Evidence repository (`discovery.evidence`)                                    | **Reuse**                   | The single source of truth already exists.                                                                                           |
| Collector registry + website scanner                                          | **Reuse**                   | Wire the scanner as the first live evidence source.                                                                                  |
| VisibilityAI (`visibility`)                                                   | **Reuse**                   | SEO/visibility/reviews evidence.                                                                                                     |
| AI gateway + injection fence (`ai`, `_shared/ai`)                             | **Reuse**                   | The AI Business Analyst is built **on** this — not a new AI stack.                                                                   |
| Consulting framework: findings / roadmap / solutions / narrative / CEO review | **Reuse**                   | The downstream product is already built.                                                                                             |
| Blueprint assembly                                                            | **Reuse**                   | Add real export.                                                                                                                     |
| Proposal engine (`sales`)                                                     | **Reuse**                   | Auto-generate from the blueprint.                                                                                                    |
| Workflows (approval), events (dispatch), lifecycle (`bti`)                    | **Reuse**                   | Validation gate + orchestration.                                                                                                     |
| Herman Legacy service catalog                                                 | **Modify**                  | Rename to real HL products.                                                                                                          |
| HL-BTI Alpha UI (entry, one-flow, review, demote scores)                      | **Modify**                  | Re-face into the single workflow; render existing engine output.                                                                     |
| **Manual 43-score assessment as the analysis input**                          | **Replace**                 | The evidence + AI Analyst become the input; scores survive only as an internal summary, never the product's face or its data source. |
| **AI Business Analyst** (evidence → understanding + findings)                 | **New (reuses AI gateway)** | The one genuinely new engine — and the thing that makes the product the CEO's vision.                                                |

**Reuse tally: ~11 reuse · 2 modify · 1 replace (the manual-scoring workflow) · 1 new (AI Analyst).** No duplicate platform service; the only new build is the AI analysis layer the vision explicitly requires.

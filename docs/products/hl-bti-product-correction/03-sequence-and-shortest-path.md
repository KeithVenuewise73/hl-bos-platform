# Prioritized Sequence & Shortest Path to a Customer Demonstration (Deliverables 7 & 8)

**Planning only. No code is written by this order.** The sequence is ordered by one criterion: _what makes the CEO Success Test pass soonest, honestly._

## Deliverable 7 — Prioritized implementation sequence

The order is driven by the product outcome, not by architecture tidiness.

1. **Deploy the platform** _(prerequisite)_ — apply the built migrations to a real project; wire HL-BTI Alpha to it. Nothing is a product until it runs and persists. _(Integration)_
2. **Wire discovery into the flow** — on **Analyze Business**, run the existing website scanner and land evidence in `discovery.evidence`. First real, automatic evidence. _(Integration)_
3. **Build the AI Business Analyst** — the one new engine: read the collected evidence through the `ai` gateway + fence and produce the **Business Intelligence Profile** and **evidence-backed findings** (each finding cites the evidence it used; no evidence → no finding). This replaces manual scoring as the analysis input. _(New, on the existing AI stack)_
4. **Connect findings → the existing consulting downstream** — feed the AI findings into the already-built transformation/roadmap/solution-mapping/blueprint engines. Rename the service catalog to real Herman Legacy products. _(Integration + Minor Modification)_
5. **Re-face the app into ONE workflow** — replace the dashboards/tabs with the single linear journey (Analyze → Discovery → Profile → Findings → Recommendations → Blueprint → Proposal); demote scores from the headline; make the consultant screen a **validate-and-approve** screen. _(Minor Modification — render existing engine output)_
6. **Auto-generate the proposal from the blueprint** and add a real export (PDF) of the blueprint + proposal. _(Integration)_
7. **Broaden evidence** _(after the demo)_ — add app/tech/social/financial-document collectors incrementally, each a collector row on the existing contract. _(New, later)_
8. **Commercial polish** _(after the demo)_ — client management, onboarding, analytics, billing activation.

Steps 1–6 make the product real. Steps 7–8 make it broad and sellable at scale.

## Deliverable 8 — The shortest path to a production-ready customer demonstration

The **thinnest slice** that lets a consultant complete the CEO Success Test with a real business and a real website. It is steps 1–6 above, scoped to the minimum:

| Move                                 | Scope for the demo                                                                                                                                                                                                                                                                    | Type                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **A. Deploy**                        | Apply migrations to one project; point Alpha at it.                                                                                                                                                                                                                                   | Integration                    |
| **B. One-click discovery**           | "Analyze Business" runs the **website scanner only** (the one live collector) + optional document upload.                                                                                                                                                                             | Integration                    |
| **C. AI Business Analyst (MVP)**     | Over the scanned evidence, the AI (fenced, evidence-cited) produces the Business Intelligence Profile + findings for the domains the website evidences (growth, technology, parts of business/CX). Dimensions with no evidence are shown as **"needs more evidence,"** never guessed. | New (small, on the AI gateway) |
| **D. Downstream reuse**              | Findings flow into the existing roadmap + solution-mapping + blueprint. Service catalog renamed to real HL products.                                                                                                                                                                  | Integration + Minor Mod        |
| **E. One-screen flow**               | The linear journey, scores demoted, consultant validates.                                                                                                                                                                                                                             | Minor Mod                      |
| **F. Blueprint + proposal + export** | Blueprint → proposal auto-generated; export to PDF.                                                                                                                                                                                                                                   | Integration                    |

### What the demo proves (the Success Test, honestly)

With A–F, a Herman Legacy consultant can sit with a real business owner, enter the name and website, click **Analyze**, and — **without manually scoring anything** — watch HL-BTI discover the website, present an understanding of the business, show evidence-backed findings, recommend Herman Legacy services with why/impact/ROI/priority/order, produce an Executive Blueprint, and generate a proposal to review and close.

### The honest boundary of the demo (say this to the customer)

- **Evidence at demo scope is website-driven.** Findings for operations, financials, and deep AI-readiness will say **"needs more evidence"** and prompt for documents or a short interview — because HL-BTI does not invent what it cannot observe. That honesty is a _feature_ in front of a CEO, not a weakness: it is precisely why the advice is credible.
- Broader automated collectors (financials, social, app analysis) come after the demo (step 7) and progressively remove the "needs more evidence" prompts.

### Effort shape (relative, not a promise of dates)

- **A. Deploy** — small, but CEO-gated (production approval + credentials).
- **B, D, E, F** — mostly wiring and re-facing existing, tested software.
- **C. AI Analyst MVP** — the only substantive new build, and it sits on the existing AI gateway + fence, feeding the existing consulting engine. This is where the effort concentrates, and it is the piece that turns HL-BTI into the CEO's product.

**Bottom line:** the shortest path to a sellable demonstration is **one new engine (the AI analyst) + deploy + wire + re-face** — everything else is reuse. That is the corrected product, and it passes the Success Test.

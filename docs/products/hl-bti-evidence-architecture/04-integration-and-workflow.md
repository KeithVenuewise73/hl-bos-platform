# Deliverables 3 & 4 — Integration Architecture + Engagement Workflow (Steps 4, 6, 7)

## Deliverable 4 — The redesigned consultant workflow (Step 4)

**Current:** the consultant enters scores (data-entry clerk).
**Required:** the platform collects evidence and proposes findings; the consultant reviews.

```
1. Evidence is collected          (collectors → discovery.evidence, per asset)
        ↓
2. HL-BTI proposes findings        (evidence→dimension map → rating-proposal engine → proposed ratings + confidence)
        ↓
3. Consultant validates            (sees proposed rating, supporting facts, confidence, missing evidence)
        ↓
4. Consultant adjusts where needed (override recorded with consultant as source — auditable)
        ↓
5. Consultant approves             (reuses workflows.request_approval / decide — the existing human gate)
        ↓
6. Consulting Framework executes   (generateConsultingReport over the approved, evidence-linked ratings)
```

The consultant becomes a **reviewer**. The assessment wizard changes from "enter 43 numbers" to "confirm or correct 43 evidence-backed proposals," each showing its facts, confidence, and gaps.

## Deliverable 6 (integration) — Consulting Framework in HL-BTI Alpha (Step 6)

Wire the **already-built** `@hl-bos/bti-engine/src/consulting/*` into HL-BTI Alpha as the **primary engagement experience**. New Alpha views (presentation only — the engine is done):

- **Evidence** — per asset/dimension: sources, supporting facts, confidence, missing evidence.
- **Executive Findings** — the 12-part findings with **FACT / INFERENCE / OPINION** tags visible.
- **Root Cause & Business Impact** per finding.
- **Transformation Roadmap** — Immediate / Short / Medium / Long.
- **Executive Narrative** — board-ready sections.
- **CEO Review** — confidence, evidence used, missing information, next questions.
- **Recommended Herman Legacy Services**.

This is a **UI wiring task** (render existing engine output); it duplicates no logic.

## Deliverable 3 — Integration Architecture (how the pieces connect, Step 7)

The complete evidence-driven flow, all on reused infrastructure:

```
Business enters HL-BTI
   │  (bti.register_business + bti.assets)
   ▼
Evidence Collection ──────────► discovery.collectors run, write discovery.evidence (per asset)
   │  (triggered via events + dispatcher; website scanner/VisibilityAI/interview/docs)
   ▼
Evidence Repository ──────────► discovery.evidence (single source of truth)
   │
   ▼
Rating Proposals ─────────────► evidence→dimension map → rating-proposal engine
   │
   ▼
Consultant Validation ────────► Alpha review UI + workflows human gate (approve)
   │
   ▼
Consulting Intelligence ──────► generateConsultingReport (findings, roadmap, narrative, CEO review)
   │
   ▼
Executive Blueprint ──────────► discovery.blueprints + bti + consulting render (branded export)
   │
   ▼
Proposal ─────────────────────► sales schema (existing)
   │
   ▼
Implementation Plan ──────────► bti.projects / milestones / tasks
   │
   ▼
Transformation Tracking ──────► bti stage machine + timeline
   │
   ▼
ROI Measurement ──────────────► bti.roi_metrics (baseline → realized)
```

### Integration mechanisms (all existing)

- **Triggering collection:** `events.emit` + the CP5 shared dispatcher — a `bti.evidence.requested` event fans out to collectors; no new bus.
- **Human approval:** `workflows.request_approval` / `decide` — the existing gate, now used for "approve proposed findings."
- **Advisory AI:** the `ai` gateway + injection fence for evidence extraction (from documents/interviews) and narrative polish — never authoring facts.
- **Runtime:** the Alpha (once wired to the live backend per the validation's V1.0 plan) calls `bti.*` RPCs; an edge function runs `generateConsultingReport`. One runtime, three engines behind it.

## The through-line

Every arrow above is either an existing object or one of the **three new bridges** from the Evidence Layer doc (evidence→dimension map, rating-proposal engine, asset model). Nothing between "Business enters" and "ROI" is a new platform service.

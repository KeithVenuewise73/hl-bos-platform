# 75 — The HLG Market-to-Client Engine

**Owner:** Keith Herman, CEO & Product Owner · **Author:** Claude (engineering) ·
**Date:** 2026-10-15 · **Status:** Architecture for review. Phase 3A built only steps
1–5 (below); every later step is a plan, not a feature.

## What it is

One pipeline that takes HLG from "a market we have not looked at" to "a client on a
managed recurring service", with a human decision at every point where money,
reputation or a third party is involved. It is assembled from parts that already exist
in this repository; nothing in it replaces the HL-BOS core.

## The ten steps, and where each one stands

| #   | Step                      | Today (2026-10-15)                                                                                                                    | Built from                                                                          |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Market discovery          | **Built.** Pasted list / CSV; Google Places once a key is added.                                                                      | `packages/presence-scanner` (`places.ts`, `import.ts`, `dedupe.ts`)                 |
| 2   | Presence scoring          | **Built.** `presence-opportunity-0.2.0`, evidence on every point; unchecked data never scored.                                        | `score.ts`, the existing discovery scanner (`supabase/functions/_shared/discovery`) |
| 3   | Lead qualification        | **Built.** Operating, vertical, contact, chain, radius; reviewer override.                                                            | `qualify.ts`, `chains.ts`                                                           |
| 4   | Website generation        | **Built.** Prospect demos (one at a time, or batches of up to 10) and internal drafts from a verified Business Profile.               | `packages/site-builder`, console `/presence/batch`, `/profiles`                     |
| 5   | Private presentation      | **Built (local only).** Sandboxed preview in the console, ZIP download. No hosting.                                                   | console `/presence/[id]/demo`, `/profiles/[id]/draft`                               |
| 6   | Outreach approval         | **Not built.** Planned: Claude drafts a message; the CEO approves each one; the console records consent. Nothing sends automatically. | HL-BOS `comms` schema (consent, suppression, templates) — in migrations, not wired  |
| 7   | Proposal                  | **Not built.** Planned: proposal from the lead's suggested services, once prices are set.                                             | HL-BOS `sales.proposals`, `sales.prices`; BTI growth map (services suggested)       |
| 8   | Agreement                 | **Not built.** Planned: signed scope; counsel-approved template.                                                                      | HL-BOS `sales.agreements`, `sales.agreement_acceptances` — in migrations, not wired |
| 9   | Production launch         | **Not built.** Planned: the launch-readiness checklist becomes the runbook; domain and hosting are CEO decisions.                     | site-builder checklist (exists); hosting (decision pending)                         |
| 10  | Managed recurring service | **Not built.** Planned: measurement, updates, Google profile care, monthly report.                                                    | Presence Scanner re-scans (exist) as the progress measure                           |

## How the parts connect

```
 (1) discovery ──► Candidate[] ──► (2) score ──► Prospect (Lead Card)
                                       │              │
                                 (3) qualify          ├─► Business Profile (HLG-owned / approved client)
                                       │              │        │ verified facts only
                                       ▼              ▼        ▼
                        (4) site-builder: prospect demo    internal draft
                                       │  (batch ≤ 10)         │
                                       ▼                       ▼
                         (5) private preview + ZIP + launch-readiness checklist
                                       │
                ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─  everything below is not built ─ ─ ─ ─
                                       ▼
                (6) outreach approval ─► (7) proposal ─► (8) agreement ─► (9) launch ─► (10) managed service
                     CEO approves         prices set       counsel          domain/hosting    re-scan = proof
                     each message                                           decisions
```

The `comms` and `sales` schemas are in `supabase/migrations` and tested by pgTAP, but
have never been applied to a live project; wiring them is part of steps 6–8.

## The rules every step keeps

1. **Evidence before claims.** A fact carries its source, date and confidence; "not
   checked" is never scored as zero; "requires manual verification" is never scored at
   all (testimonials, statistics and placeholder-looking numbers cannot be judged true
   from a web page).
2. **Verified facts only on a page.** Prospect demos use only what the scan found and
   mark everything else _Sample_; internal drafts use only verified Business Profile
   fields. Claims (experience, statistics, case studies) never appear unverified.
3. **One guard for every word.** `validate.ts` checks template, Claude and reviewer text
   alike. Verified profile items may state approved experience; nothing may state a
   price, a guarantee, an award, a credential or a testimonial.
4. **Private until approved.** No step publishes, sends, registers or purchases. Each of
   those is a CEO decision with an approval gate, added when that step is built.
5. **Never backwards.** Building a demo can move a lead forward to _Demo built_; nothing
   moves a lead back.

## How a vertical is added

Two registries, one entry each, plus tests:

| Registry                                     | What the entry defines                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/presence-scanner/src/verticals.ts` | Name, Google query and place types, keywords, conversion priorities (points, sum 20), extra website checks, subtypes                                                 |
| `packages/site-builder/src/verticals.ts`     | Sample-content packs, sections, calls to action, required facts, required profile fields, modules, checklist steps, schema type, accent, renderer, validation limits |
| `packages/presence-scanner/src/chains.ts`    | The national chains to exclude within the vertical                                                                                                                   |

The pipeline, score, Lead Board, scan form, batch builder and renderers read these
tables; none of them names a vertical. Professional services was added this way in
Phase 3A. Prospect demos for the three Phase 2 verticals are pinned byte-for-byte by
golden files (`packages/site-builder/src/__golden__`), so a registry change that alters
them fails the build.

## Scale

- **Batch building:** up to 10 qualified leads per batch, template copy only (a batch
  never calls Claude), each lead built independently, statuses Queued → Building →
  Completed / Needs information / Failed, a recorded summary. Measured: about 0.1–0.6
  seconds per demo on this machine.
- **Next limits to lift, in order:** storage (local JSON files → the proposed
  `visibility` migration, `docs/products/presence-scanner/proposed-migration.sql`, which
  needs approval), Google Places cost controls (a monthly cap), then a queue for batches
  larger than 10.

## Decisions this architecture needs from the CEO (later phases)

Hosting for private previews; who approves outreach and how consent is recorded; prices
for the suggested services; the agreement template (counsel); the domain policy for
clients. None is needed for Phase 3A.

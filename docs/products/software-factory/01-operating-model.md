# Software Factory · 01 — Herman Legacy Operating Model (Part 1)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Implemented as:** `packages/catalog/src/operating-model.ts` (+ tests). Live output below from
`hermanLegacyOperatingModel()`.

Herman Legacy becomes the **first company to operate entirely through the Software Factory** —
its own customer zero. Its internal operating system is not hand-built; it is **assembled** from
existing platform capabilities. Each of the 14 stages the brief names is resolved to the
capability implementations that already provide it, so the two real gaps are named, not assumed.

## The 14-stage internal operating system (live assembly)

| #   | Stage               | Runs on (existing capabilities)                                | Readiness       |
| --- | ------------------- | -------------------------------------------------------------- | --------------- |
| 1   | Lead Discovery      | business discovery + communications                            | assemblable     |
| 2   | VisibilityAI        | digital visibility + reputation + business discovery           | assemblable     |
| 3   | Intelligence CRM    | CRM (Venuewise) + business discovery + communications          | assemblable     |
| 4   | HL-BTI              | transformation intelligence + blueprint + scoring + dashboards | **operational** |
| 5   | Proposal Generation | commerce/provisioning + documents                              | assemblable     |
| 6   | Project Management  | workflow engine + human approval                               | **operational** |
| 7   | Customer Onboarding | identity + entitlements + workflow                             | **operational** |
| 8   | Billing             | billing + payments                                             | assemblable     |
| 9   | Customer Success    | CRM + communications + analytics + **customer success desk**   | **partial**     |
| 10  | Support             | communications + workflow + **support ticketing**              | **partial**     |
| 11  | Knowledge Capture   | documents + storage + enterprise catalog                       | assemblable     |
| 12  | Reporting           | executive dashboards + analytics                               | assemblable     |
| 13  | Executive Dashboard | executive dashboards + enterprise catalog                      | **operational** |
| 14  | CEO Dashboard       | enterprise catalog + application registry                      | **operational** |

**Summary:** 5 stages operational, 7 assemblable, 2 partial, **0 hard gaps**. **86%** of the
operating system needs no net-new engineering.

## The only two net-new pieces

Herman Legacy's entire internal OS can be assembled from what exists **except** two operational
tools that genuinely do not exist yet:

1. **Customer Success desk** (stage 9) — health/renewal tracking beyond CRM + comms.
2. **Support ticketing** (stage 10) — an inbound-issue queue beyond workflow + comms.

Both are small, horizontal, and reusable across every future product. Everything else — lead to
onboarding to billing to reporting — is assembly, not construction.

## What "operational" vs "assemblable" means (honesty)

- **operational** — every capability the stage needs is already a built HL-BOS implementation.
- **assemblable** — every capability is built, but at least one comes cross-platform (Venuewise)
  or is `partial` and must be finished/adopted; no net-new build.
- **partial** — some capabilities exist, but the stage has a named net-new piece.
- **gap** — nothing exists (there are none).

This is the deterministic verdict of the existing cross-platform assembler
(`assembleBlueprint`), not an assertion. Run `hermanLegacyOperatingModel()` to reproduce it.

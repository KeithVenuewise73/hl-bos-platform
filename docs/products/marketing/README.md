# Herman Legacy Marketing (Executive Summary)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Status: Assembled. Herman Legacy Marketing operates on existing Factory capabilities. 69/69
transformation-intelligence tests green. No new project, no production migration, reversible.**

## What you asked for

Establish **Herman Legacy Marketing** as a permanent internal business unit — assembled from
existing Software Factory capabilities, with the AI Marketing Studio as one capability inside it —
to acquire customers and drive measurable growth for Herman Legacy Group, Venuewise and HSCS.

## What was built (assembly, not rebuild)

Five in-code modules added to `@hl-bos/transformation-intelligence` — no new database, no new
Supabase project, reversible.

| Module                     | Delivers                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `marketing.ts`             | Operating model + capability reuse (14 systems) + all 5 commercialization layers                  |
| `marketing-studio.ts`      | AI Marketing Studio orchestration — 5 generation types via the AI Gateway, providers **deferred** |
| `content-manufacturing.ts` | 15 content types on one repeatable 10-stage workflow                                              |
| `campaigns.ts`             | Campaign lifecycle + 3 initial client campaigns (all draft)                                       |
| `growth-dashboard.ts`      | Growth Dashboard (measurable real, growth honest-zero) + one entry point                          |

Plus the Executive Portal **`/marketing`** view and `docs/products/marketing/`.

## The result in one screen

- **86% reuse:** 8 systems reuse HL-BOS, 4 reuse cross-platform (Venuewise media/analytics/
  scheduling/documents), only **2 net-new** (content library, campaign tracking). No duplicate
  systems.
- **AI Marketing Studio:** orchestrates 5 generation types through the existing metered AI
  Gateway; **no external provider wired — deferred until CEO approval.**
- **Content manufacturing:** 15 types (TikTok → Educational) on one gated workflow.
- **Campaigns:** 3 initial campaigns (Herman Legacy, Venuewise, HSCS), each with all 8 fields —
  **all draft, none live.**
- **Growth Dashboard:** reuse metrics real; traffic, leads, customers, revenue, ROI, CAC, LTV all
  **measured zero / no-data** — nothing fabricated.

## Deliverables

| #   | Deliverable                               | Where                                                                |
| --- | ----------------------------------------- | -------------------------------------------------------------------- |
| 1   | Operating model                           | `marketing.ts` + [00](00-operating-model-and-reuse.md)               |
| 2   | Capability reuse assessment               | `marketingCapabilityReuse()` + [00](00-operating-model-and-reuse.md) |
| 3   | AI Marketing Studio architecture          | `marketing-studio.ts` + [01](01-studio-and-content.md)               |
| 4   | Content manufacturing workflow            | `content-manufacturing.ts` + [01](01-studio-and-content.md)          |
| 5   | Campaign lifecycle                        | `campaigns.ts` + [02](02-campaigns-and-growth.md)                    |
| 6   | Growth Dashboard                          | `growth-dashboard.ts` + [02](02-campaigns-and-growth.md)             |
| 7–9 | Initial campaigns (HL / Venuewise / HSCS) | `INITIAL_CAMPAIGNS` + [02](02-campaigns-and-growth.md)               |
| 10  | 90-day execution roadmap                  | [02](02-campaigns-and-growth.md)                                     |

## Engineering constraints honored

- **ASSEMBLE, DON'T REBUILD.** CRM, VisibilityAI, workflows, communications, media, documents,
  scheduling, analytics, knowledge graph, HL-BTI and the portal are all reused.
- **No external AI providers, no public campaigns** — the Studio's generation and publishing are
  deferred until CEO approval, exactly as instructed.
- **No new Supabase project, no production migration** — pure TypeScript in an existing package.
- **Honesty (Principle 10).** Growth metrics are measured zeros, no campaign is live, no provider
  is wired, the two net-new pieces are named. Every measurable number is computed and reproducible.

## What comes next

Per the brief, work **waits for CEO approval before integrating external AI generation providers
or beginning public campaigns.** The 90-day roadmap in [02](02-campaigns-and-growth.md) sequences
that, gate by gate.

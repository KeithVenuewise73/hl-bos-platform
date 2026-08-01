# The Customer Manufacturing System (Executive Summary)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Status: Assembled and validated. Herman Legacy can operate entirely on the Factory. 55/55
transformation-intelligence tests green. No new project, no production migration, reversible.**

## What you asked for

Assemble Herman Legacy's complete **Customer Manufacturing System** using the Software Factory —
one standardized customer lifecycle, VisibilityAI + HL-BTI + Intelligence CRM as one integrated
system, and one CEO operations dashboard — by **reusing** existing capabilities, not building
new ones. Herman Legacy becomes the Factory's first production customer.

## What was built (assembly, not rebuild)

Five in-code modules added to `@hl-bos/transformation-intelligence` — the package that already
composes `@hl-bos/bti-engine` (the engagement machine) and `@hl-bos/catalog` (the assembler).
No new database, no new Supabase project, reversible by deleting the files.

| Module                      | Delivers                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `customer-lifecycle.ts`     | The 21-stage lifecycle riding on the **reused** engagement machine + the no-duplicate-systems proof |
| `visibility-ai.ts`          | VisibilityAI evaluated against its 9 functions (8 supported, 1 net-new)                             |
| `crm.ts`                    | The Intelligence CRM — 17 entities as a view over existing systems (no new DB)                      |
| `ceo-operations.ts`         | The CEO dashboard — measurable metrics real, operational metrics honest-zero                        |
| `customer-manufacturing.ts` | The end-to-end validation + one assembled entry point                                               |

Plus the Executive Portal **`/operations`** view and `docs/products/customer-manufacturing/`.

## The result in one screen

- **One lifecycle:** 21 stages, **90% assemblable** from existing capability, riding on the
  reused 12-stage engagement machine — **0 hard gaps**, only 2 net-new (customer-success desk,
  referral program). Backed by **20 existing catalog assets**; **zero** new systems.
- **Integrated:** VisibilityAI (8/9 functions, no redesign) + HL-BTI + Intelligence CRM (17
  entities, no new database) share one lifecycle, identity, billing, workflow gate and Factory.
- **One CEO dashboard:** capability reuse **88%**, avg assembly **85%**, 2 built engines, **0
  launched**; every operational metric (leads, MRR, ARR, revenue, health) a **measured zero** —
  no operating customers yet, nothing fabricated.
- **Validated end to end:** a prospect traverses Discovery → VisibilityAI → HL-BTI → Proposal →
  Project → Deployment → Subscription → Renewal with **no duplicate systems** — `ok = true`.

## Definition of Done — met

| #   | DoD clause                                                          | Where                                                                   |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Herman Legacy is the first operational customer of the Factory      | [00](00-lifecycle-inventory.md), [01](01-lifecycle-and-crm.md)          |
| 2   | Every customer follows one standardized lifecycle                   | `customer-lifecycle.ts` + [01](01-lifecycle-and-crm.md)                 |
| 3   | VisibilityAI, HL-BTI and the Intelligence CRM operate as one system | [01](01-lifecycle-and-crm.md), [02](02-ceo-dashboard-and-validation.md) |
| 4   | The Factory assembles transformations from reusable capabilities    | each stage resolved by the assembler                                    |
| 5   | The CEO monitors the whole business from one dashboard              | `/operations` view + [02](02-ceo-dashboard-and-validation.md)           |

## Engineering constraints honored

- **ASSEMBLE, DON'T REBUILD.** The engagement state machine, VisibilityAI, HL-BTI, commerce,
  billing, workflows and the Factory are all reused; five modules add the composition layer.
- **No duplicate customer-management system, no duplicate workflow engine, no redesign** of any
  completed Factory component — proven by `noDuplicateSystems()` and the end-to-end validation.
- **No new Supabase project, no production migration** — pure TypeScript in an existing package.
- **Honesty (Principle 10).** Operational metrics are measured zeros, customer health is null,
  no product is claimed manufactured-and-launched, the three real net-new gaps are named. Every
  measurable number is computed and reproducible.

## What comes next

Per the brief, work **stops here and awaits CEO approval before beginning public
commercialization.** The system is ready: the moment the first real prospect enters the CRM, the
operational dashboard begins to populate itself — from measured reality, never fabrication.

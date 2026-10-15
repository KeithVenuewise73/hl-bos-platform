# @hl-bos/site-builder

The HLG Instant Site Builder engine: a Presence Scanner lead in, a one-page
**demo** website out (or, from a verified Business Profile, a private **internal
draft** for a business HLG owns) — in the shared HLG static-site design, with facts only
from the lead, sample content marked, every word checked by a fabrication
guard, a launch checklist, and a ZIP export. It never publishes anything.

Product documentation: [`docs/products/instant-site-builder`](../../docs/products/instant-site-builder/README.md).

| File                     | Responsibility                                                          |
| ------------------------ | ----------------------------------------------------------------------- |
| `facts.ts`               | Lead → facts (name, phone links, city, directions, Google rating, gaps) |
| `validate.ts`            | The fabrication guard every word passes                                 |
| `copy-template.ts`       | Deterministic copy and category packs (always available)                |
| `copy-claude.ts`         | Claude writer (`claude-opus-5-5`) and `writeCopy`, with fallback        |
| `design.ts`              | The shared HLG design as CSS, per-vertical accents                      |
| `render.ts`              | Draft → one self-contained, noindex, script-free HTML page              |
| `checklist.ts`           | Launch checklist from the lead's findings                               |
| `builder.ts`             | Build / rebuild / edit / approve drafts, audited                        |
| `export.ts`              | ZIP (index.html, LAUNCH-CHECKLIST.md, README.txt)                       |
| `verticals.ts`           | The site vertical registry: one entry per vertical                      |
| `render-professional.ts` | The professional-services page (prospect demo or internal draft)        |
| `profile.ts`             | Business Profile: verified facts with sources, and its checks           |
| `internal.ts`            | Internal drafts from a profile; launch-readiness checklist              |
| `hlg-profiles.ts`        | Starting profiles for HLG Business Transformation and HSCS              |
| `__golden__/`            | Phase 2 prospect-demo output, pinned byte for byte                      |

```
pnpm --filter @hl-bos/site-builder test
```

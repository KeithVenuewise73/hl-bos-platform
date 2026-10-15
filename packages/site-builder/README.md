# @hl-bos/site-builder

The HLG Instant Site Builder engine: a Presence Scanner lead in, a one-page
**demo** website out — in the shared HLG static-site design, with facts only
from the lead, sample content marked, every word checked by a fabrication
guard, a launch checklist, and a ZIP export. It never publishes anything.

Product documentation: [`docs/products/instant-site-builder`](../../docs/products/instant-site-builder/README.md).

| File               | Responsibility                                                          |
| ------------------ | ----------------------------------------------------------------------- |
| `facts.ts`         | Lead → facts (name, phone links, city, directions, Google rating, gaps) |
| `validate.ts`      | The fabrication guard every word passes                                 |
| `copy-template.ts` | Deterministic copy and category packs (always available)                |
| `copy-claude.ts`   | Claude writer (`claude-opus-5-5`) and `writeCopy`, with fallback        |
| `design.ts`        | The shared HLG design as CSS, per-vertical accents                      |
| `render.ts`        | Draft → one self-contained, noindex, script-free HTML page              |
| `checklist.ts`     | Launch checklist from the lead's findings                               |
| `builder.ts`       | Build / rebuild / edit / approve drafts, audited                        |
| `export.ts`        | ZIP (index.html, LAUNCH-CHECKLIST.md, README.txt)                       |

```
pnpm --filter @hl-bos/site-builder test
```

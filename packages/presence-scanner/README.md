# @hl-bos/presence-scanner

The HLG Presence Scanner engine: find local businesses (Google Places or an
imported list), inspect each website through the **existing** HL-BOS safe
website scanner, score the opportunity with a deterministic, versioned,
evidence-backed rubric (`presence-opportunity-0.1.0`), qualify, de-duplicate,
rank and export.

No storage (it talks to `PresenceRepository`), no UI, no AI in the score.
Product documentation: [`docs/products/presence-scanner`](../../docs/products/presence-scanner/README.md).

| Entry point                       | What                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| `@hl-bos/presence-scanner`        | The engine: `runMarketScan`, `scoreOpportunity`, exports…  |
| `@hl-bos/presence-scanner/labels` | Display labels and stages only — safe for a browser bundle |
| `@hl-bos/presence-scanner/node`   | `createNodeEgress`: the real network adapter (server only) |

| File            | Responsibility                                                               |
| --------------- | ---------------------------------------------------------------------------- |
| `places.ts`     | Google Places (New) Text Search adapter, field mask, cost, 30-day retention  |
| `import.ts`     | Pasted list / CSV                                                            |
| `dedupe.ts`     | Place ID → domain → phone → name + address                                   |
| `website.ts`    | Wraps the existing `runScan`; robots.txt; social / link-in-bio recognition   |
| `detectors.ts`  | Booking, ordering, menu, pricing, directions, registration; vendor detection |
| `score.ts`      | The Opportunity Score, its config and validation                             |
| `qualify.ts`    | Operating, vertical, contact path, chain, radius                             |
| `stages.ts`     | Lead stages and their mapping onto `visibility.prospect_stage`               |
| `services.ts`   | Suggested services via `@hl-bos/bti-engine`                                  |
| `node-fetch.ts` | Redirects validated before each hop; IP checked at connect time              |

```
pnpm --filter @hl-bos/presence-scanner test
```

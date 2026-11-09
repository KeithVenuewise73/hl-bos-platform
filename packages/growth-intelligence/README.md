# @hl-bos/growth-intelligence

HLG Growth Intelligence: Herman Legacy Digital (HLD) and Herman Supply Chain Solutions
(HSCS) as two isolated business lines over the existing Presence Scanner.

Pure TypeScript. No storage (callers pass records in), no network, no AI calls.
Product documentation, audit and plan: [`docs/products/growth-intelligence`](../../docs/products/growth-intelligence/README.md).

| File                | Responsibility                                                            |
| ------------------- | ------------------------------------------------------------------------- |
| `business-lines.ts` | Offers per line (no prices) and the two funnels                           |
| `routing.ts`        | Which line owns a lead                                                    |
| `isolation.ts`      | Who may read/write each line; owner-only consolidated reporting           |
| `review.ts`         | Opportunity reviews: observed facts, assumptions, estimated opportunities |
| `proposal.ts`       | Proposals that block until priced and refuse promises                     |
| `approval.ts`       | Owner approval bound to exact content before anything leaves HLG          |
| `attribution.ts`    | Lead channel from UTM / gclid / referrer                                  |
| `google.ts`         | Google connector readiness from evidence; Business Profile eligibility    |
| `dashboard.ts`      | HLD / HSCS / consolidated metrics, each with a status                     |
| `feedback.ts`       | Evidence-gated feedback and recommendations                               |
| `from-presence.ts`  | Presence Scanner leads → routed growth events                             |

```
pnpm --filter @hl-bos/growth-intelligence test
```

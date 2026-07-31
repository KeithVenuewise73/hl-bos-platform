# HL-BTI v2 — Business Transformation Intelligence Engine

**For:** Keith Herman, CEO · **Phase VIII** · Built, tested, and **not deployed**.

---

## What this is, in plain language

We built a reusable **intelligence engine**. You give it a scored picture of a business, and for every problem it finds it tells you five things:

1. **What happened** — the problem.
2. **Why** — the likely root cause.
3. **What we should do** — the recommended action.
4. **What it's worth** — an estimated business impact (only when we have real numbers to base it on; otherwise it honestly says so).
5. **What you'd need to approve** — because the software recommends, and **you decide**.

It also tells you, for each recommendation, **which Herman Legacy product** could deliver it and **how much of that product we've already built** (the reuse %), so you can see what's assemblable now versus what needs building. And it does the same thinking for **government contract opportunities**: how likely we are to win based on capabilities we actually have, where the gaps are, the estimated profit (when a value is given), and a recommended pursue / partner / decline call — with your bid approval attached.

**The most important design choice:** we did **not** build another reporting dashboard, and we did **not** copy the intelligence we already had. This is a thin new layer that **reuses** the platform's existing scoring engine and the Software Factory. It adds only the pieces that genuinely didn't exist yet.

## What was delivered

| #   | Deliverable                                 | Where                                                                                         |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Engine architecture + decisions             | [`00-architecture.md`](00-architecture.md)                                                    |
| 2   | Modular assessment framework (15 areas)     | [`01-assessment-framework.md`](01-assessment-framework.md) + `src/framework.ts`               |
| 3   | Configurable scoring engine                 | [`02-scoring-engine.md`](02-scoring-engine.md) + `src/config.ts`                              |
| 4   | Recommendation engine (the 5 answers)       | [`03-recommendation-engine.md`](03-recommendation-engine.md) + `src/recommendations.ts`       |
| 5   | Software Factory reuse integration          | [`04-software-factory-integration.md`](04-software-factory-integration.md) + `src/factory.ts` |
| 6   | HLVS software-opportunity intelligence      | [`05-hlvs-integration.md`](05-hlvs-integration.md) + `src/hlvs.ts`                            |
| 7   | Government-contracts intelligence           | [`06-government-contracts.md`](06-government-contracts.md) + `src/government.ts`              |
| 8   | Database design (**proposed, not applied**) | [`07-database-design.md`](07-database-design.md)                                              |
| 9   | API design                                  | [`08-api-design.md`](08-api-design.md)                                                        |
| 10  | Security review                             | [`09-security-review.md`](09-security-review.md)                                              |
| 11  | Testing strategy                            | [`10-testing-strategy.md`](10-testing-strategy.md)                                            |
| 12  | Phase roadmap                               | [`11-phase-roadmap.md`](11-phase-roadmap.md)                                                  |
| 13  | This executive summary                      | this file                                                                                     |

Plus: a working **Transformation Intelligence** and **Government Contracts** section in the Executive Portal, running the real engine over a clearly-labelled sample.

## Where the code is

- **The engine:** `packages/transformation-intelligence` — a new package, `@hl-bos/transformation-intelligence`. Registered in the Enterprise Catalog (governance: register before you build).
- **The portal section:** two read-only views added to `apps/executive-portal` (Phase VII). The localhost-only Control Center is untouched.

## Verified (this build)

- **Typecheck** clean across the workspace.
- **Tests: 41 new engine tests + 22 portal tests, all passing** — including determinism (identical output across runs), honesty (null when inputs are missing, never a fabricated payback), and a proof that scoring is genuinely configurable.
- **Production build** of the Executive Portal succeeds, with the `/intelligence` and `/government` routes compiled.
- No migration was applied. No customer application was modified. Nothing was deployed.

## The honest limitations

1. **The portal runs on a labelled sample, not a live customer.** The engine is real and deterministic; the input is explicitly marked "illustrative sample". Wiring live, read-only assessment data is a later, approval-gated step.
2. **No dollar figures are invented.** Impact estimates appear only when sample financials are supplied, and are marked illustrative; payback is never shown because pricing is your decision to make.
3. **No persistence yet.** The engine works entirely in memory. A small optional database design exists as a _proposal_ only — it is not applied and needs your approval before it ever would be.

## What you decide next (nothing happens without you)

1. **Merge** the v2 engine + portal section into `main` (standard PR review).
2. Later, and separately: **approve** (or not) the optional persistence migration in `07-database-design.md`.
3. Later still: **authorize** wiring live read-only assessment data to replace the sample, and connecting a government-opportunity source.

Per the phase stop conditions: **not deployed, no migration applied, no customer application modified.** The engine is built, tested, and ready for your review.

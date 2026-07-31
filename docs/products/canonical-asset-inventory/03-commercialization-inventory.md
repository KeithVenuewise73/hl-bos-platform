# Canonical Asset Inventory · 03 — Commercialization inventory

**Reconciliation only. No new capabilities proposed — existing ones only.**

**Commercialization Law #1:** every reusable capability is evaluated across five layers:

- **L1 — Internal HL Operations** (Herman Legacy runs on it)
- **L2 — HL-BTI Transformation Engagement** (used inside a consulting engagement)
- **L3 — Standalone SaaS Subscription** (sold as a subscription product)
- **L4 — Licensed / API / White-label** (sold as an API or embedded/white-label)
- **L5 — Software Factory Assembly** (composed into future products)

✓ = supports today (built) · ◐ = supports once ignited (key/deploy/security) · — = not a fit.

## Capability × commercialization layer

| Reusable capability (existing)                                                       |     L1 Internal     | L2 BTI Engagement |       L3 SaaS       |    L4 License/API/WL     |        L5 Factory         | Primary commercial home              |
| ------------------------------------------------------------------------------------ | :-----------------: | :---------------: | :-----------------: | :----------------------: | :-----------------------: | ------------------------------------ |
| **Discovery Engine** (`discovery`)                                                   |          ✓          |         ✓         |  ◐ (VisibilityAI)   |         ◐ (API)          |             ✓             | L3 VisibilityAI + L5                 |
| **Website Analysis / SEO** (`website_scanner`)                                       |          ✓          |         ✓         |          ◐          |         ◐ (API)          |             ✓             | L3 (in VisibilityAI), L4             |
| **Reviews / Reputation** (`visibility_assessments`)                                  |          ✓          |         ✓         |   ◐ (Review Mgmt)   |            ◐             |             ✓             | L3 Review Mgmt / Reputation Recovery |
| **Scoring Engine** (`@hl-bos/bti-engine`)                                            |          ✓          |         ✓         |    ◐ (embedded)     |         ◐ (API)          |             ✓             | L2/L3 (inside BTI + verticals)       |
| **BTI / Transformation Intelligence** (`bti`, `@hl-bos/transformation-intelligence`) |          ✓          |     ✓ (core)      | ◐ (managed service) | ◐ (methodology license)  |             ✓             | **L2 HL-BTI** (the flagship)         |
| **Government-Contracts Intelligence** (`transformation-intelligence/government`)     |  ✓ (bid decisions)  |         ✓         |          —          | ◐ (API/decision-support) |             ✓             | L1 internal + L4                     |
| **AI Gateway** (`ai`)                                                                |          ✓          |         ✓         |          —          | ◐ (white-label AI door)  |             ✓             | L5 platform + L4                     |
| **Knowledge Graph** (`graph`)                                                        | ✓ (impact analysis) |         ✓         |          —          | ◐ (API decision-support) |             ✓             | L1/L2 + L5                           |
| **Identity / Tenancy** (`identity`)                                                  |          ✓          |         ✓         |      — (infra)      |            —             |             ✓             | L5 (foundation)                      |
| **Workflows / Approvals** (`workflows`)                                              |          ✓          |         ✓         |          —          |        ◐ (embed)         |             ✓             | L5 + L1                              |
| **Communications** (`comms`)                                                         |          ✓          |         ✓         |          —          |            —             |             ✓             | L5 (feature of products)             |
| **Billing / Commerce / Provisioning** (`billing`,`sales`,`provisioning`)             |          ✓          |         —         |      — (infra)      |            —             |             ✓             | L5 (enables L3 everywhere)           |
| **Entitlements** (`entitlements`)                                                    |          ✓          |         —         |          —          |            —             |             ✓             | L5 (plan tiers for L3)               |
| **Audit** (`audit`)                                                                  |          ✓          |         ✓         |          —          |            —             |             ✓             | L5 (compliance for all)              |
| **Software Factory / Catalog** (`@hl-bos/catalog`, `hlvs`)                           |    ✓ (core ops)     |         —         |          —          | ◐ (license the factory)  | ✓ (it _is_ the assembler) | **L5** + L1                          |
| **Integrations framework** (`integrations`)                                          |          ✓          |         ✓         |          —          |            ◐             |             ✓             | L5                                   |

## What the layers tell you commercially

- **Every capability supports L5 (Factory assembly)** — that is the whole reuse thesis: each is
  a building block for future products. This is already true today.
- **L1 (internal ops) is universal** — Herman Legacy can run on these now.
- **The clearest paid layers today:**
  - **L2 (BTI engagement):** BTI + Scoring + Discovery + Knowledge Graph + Gov-Contracts — the
    consultant-operated flagship. **Ready first.**
  - **L3 (SaaS):** Discovery/Website/Reviews → VisibilityAI, Review Management, Reputation
    Recovery, SalonAI. Recurring subscription — the second wave (needs ignition + a little
    assembly).
  - **L4 (License/API/White-label):** AI Gateway, Scoring, Knowledge Graph, Discovery, the
    Factory, Gov-Contracts intelligence — sellable as APIs or embedded/white-label **later**,
    once L2/L3 prove the engines in production. Marked ◐ because it is a _future_ packaging of
    existing capability, not new capability.
- **Infrastructure capabilities** (identity, billing, entitlements, audit, comms, workflows)
  are **not standalone products** (L3/L4 —) — they are the L5 substrate that makes every other
  layer possible. Correctly kept internal.

## Commercialization sequence implied (existing capabilities only)

1. **L2 now** — HL-BTI transformation engagements (BTI + scoring + discovery + graph).
2. **L3 next** — VisibilityAI, then Review Management / Reputation Recovery, then SalonAI
   (subscriptions), once the AI key + deploy + VisibilityAI security land.
3. **L4 later** — license/API/white-label the proven engines (AI gateway, scoring, discovery,
   graph, factory) after they are running in production for L2/L3.
4. **L5 always** — the Factory keeps assembling new verticals from all of the above.

No new capability is required to reach L2–L5 for the capabilities that already exist; the gates
are the same ignition decisions (key, deploy, terms) named throughout this Discovery Phase.

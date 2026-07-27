# Phase 1 · Deliverable 12 (CP6) — Known Limitations Report

**Date:** 2026-07-27 · **Checkpoint:** 6 · What the engine does not yet do, stated before anyone asks.

## 1. Hard gates (nothing live)

| Limitation                           | Consequence                                                       |
| ------------------------------------ | ----------------------------------------------------------------- |
| Live AI narrative not wired          | Narrative is proven against a mock only; no live Anthropic call.  |
| Blueprint worker inert, not deployed | `blueprint.requested` deliveries are not processed automatically. |
| No scheduler                         | No `pg_cron`/`pg_net`; nothing runs on its own.                   |
| No proposal engine                   | Only proposal-preparation flags + `ready_for_proposal` exist.     |
| No provisioning / entitlement grants | Module `entitlement_key`s are recorded, never activated.          |
| No customer communication            | Comms interfaces are event topics only; nothing is sent.          |
| No created prices                    | `pricing_ref` values are `pending-ceo:` placeholders.             |

## 2. Model maturity (first versions)

- **Rules `rules-0.1.0`** — 7 seeded rules covering the most common website/maturity gaps. Real coverage will grow; rules are data, so new ones need no code change.
- **Priority `priority-0.1.0`** — deliberately coarse and categorical. It intentionally avoids a precise numeric score; the trade-off is less granularity between items in the same band.
- **Impact `impact-0.1.0`** — without customer financial inputs, estimates are qualitative and illustrative by design. Quantified ROI requires customer data the platform does not yet collect.
- **Health framework** — the current-state section is driven by the maturity + health dimensions that were actually scored; dimensions not scored simply do not appear (honest, but a sparse assessment yields a sparse blueprint).

## 3. Provisional catalogs

Service public names, availability, pricing, module availability, default roadmap phases, and impact assumptions are all **provisional** pending CEO decisions ([CEO Decision Report](42-checkpoint6-ceo-decision-report.md)). The engine functions locally with these placeholders; it does not present them as final.

## 4. Test-environment divergence

The Deno suite ran under the Node/`tsx` shim (Deno egress proxy-blocked here); CI runs real `deno test`. The DB session runs as superuser locally, unlike production's `authenticator` role — the suite compensates by exercising RLS and permission denials directly (tenant isolation, unauthorized request, AI-cannot-approve). See `scripts/local-test/README.md`.

## 5. What is NOT a limitation

The database contract is complete and fully tested: lifecycle, versioning, human-approval gate, the single extended recommendation engine, catalog-availability exclusion, evidence-required-for-AI, dedupe, tenant isolation, events, audit. The deterministic engine (rules → recommendations → priority → roadmap → impact) is complete and proven offline, and it stands whole even when AI fails. The gap is purely the **live AI + activation + proposal/provisioning** layers, which are intentionally gated.

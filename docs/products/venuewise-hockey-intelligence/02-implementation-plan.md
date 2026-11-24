# VHI — implementation plan, acceptance criteria, risks, open questions

**Status:** PROPOSED. **The module list is provisional** — the Build Specification was not received; reconcile before Phase 1.
Every phase ends one of two ways (CLAUDE.md): a **working, demonstrated capability** or a **merge-ready PR with green checks**. All work uses **synthetic data**. No production deployment, no live billing, no existing database touched.

## 1. Phases

| # | Phase | Delivers (working) | Depends on |
| --- | --- | --- | --- |
| 0 | **Approval & setup** | Spec received & reconciled; repo + Supabase project approved/created; counsel review requested; ADR for engine/config split | CEO decisions (README §6) |
| 1 | **Foundation** | Repo, CI (lint, typecheck, test, pgTAP, "no tenant literals" gate), tenancy + RBAC + audit + `data_class` guard, local Supabase stack, console status file | 0 |
| 2 | **League structure** | Orgs, seasons, divisions, teams, rosters, venues, rule sets (versioned), guardianship/consent | 1 |
| 3 | **Game & event capture** | Scorekeeper workflow: lineup, live event entry, period/clock validation, corrections (supersede), game finalization, offline-tolerant queue | 2 |
| 4 | **Stat engine with lineage** | Versioned stat definitions; deterministic recompute; `stat_lineage`; "Not recorded" semantics; data-gap detection; game sheet + box score generated *from events* | 3 |
| 5 | **League operations** | Schedule, standings (rule-set driven tiebreakers), leaders, team/player pages, permission-correct views | 4 |
| 6 | **Intelligence layer** | Development trends, comparisons, usage/role context, each with confidence + minimum-sample rules and drill-down to events | 5 |
| 7 | **Ingestion** | CSV/official-sheet import with dry-run + reconcile; (optional) video-derived *candidate* events from `game-cut` that require human confirmation | 3–4 |
| 8 | **Licensing** | Plans, entitlements, tenant onboarding, second synthetic tenant with different rules (proves no WNYAHL coupling), export/delete, Stripe **test mode** only | 5 |
| 9 | **Pilot readiness** | Security review, load test, backup/restore drill, runbook; **real WNYAHL data only after explicit approval and privacy sign-off** | 1–8 |

## 2. Modules, tests and acceptance criteria

A module is accepted only when every criterion has been **run and its output shown**.

| Module | Acceptance criteria | Verification |
| --- | --- | --- |
| **M1 Tenancy & RBAC** | User in tenant A sees zero rows of tenant B in every table; no write across tenants incl. via child FKs; suspended tenant denied for all roles; permission checks, not role names; `anon` has no execute on any function | pgTAP matrix (every table × every role × read/insert/update/delete) auto-generated from catalog so new tables fail CI until covered |
| **M2 Audit** | Admin actions logged with actor/tenant/time; log cannot be altered by any tenant role | pgTAP + attempt-to-tamper tests |
| **M3 Rules engine** | Rule sets validate against JSON Schema; game pins version; changing a rule set never alters finalized games | Unit + property tests; fixture games under two different rule sets give different, correct results |
| **M4 League structure** | Roster uniqueness (jersey per team-entry); person identity never merged across seasons automatically | pgTAP + unit |
| **M5 Event capture** | Illegal sequences rejected (assist by non-dressed player, goal by penalized-in-box, clock outside period, events after final); correction preserves original; event log append-only even for table owner | Unit + pgTAP + UI browser tests (Playwright) of the scorekeeper flow |
| **M6 Stat engine** | Every `stat_value` has ≥1 lineage row or an `unavailable_reason`; recompute is deterministic (same events ⇒ byte-identical output); definition versions immutable; no stat is `0` where data is absent | Property tests; **golden games** with hand-computed box scores; mutation test: delete an event ⇒ affected stats change and lineage updates |
| **M7 Data-gap / honesty** | Game with no shift data shows ± and TOI as "Not recorded"; completeness % matches recorded vs expected event types | Golden fixtures incl. deliberately incomplete games |
| **M8 Standings & schedule** | Standings equal a from-scratch recomputation from finals; tiebreakers follow the rule set; forfeits handled per rule | Golden seasons; cross-check against independent calculator in test |
| **M9 Intelligence** | Every insight shows its sample size and drill-down to events; suppressed under minimum sample; no insight without lineage | Unit + UI tests; snapshot of "insufficient data" states |
| **M10 Privacy & consent** | Guardian sees dependent only; revoked consent hides on next read; public views expose consent-cleared aggregates only; export & delete work and are complete | pgTAP + e2e |
| **M11 Ingestion** | Dry-run changes nothing; re-import is idempotent; rejected rows reported in plain language; imported events carry `source_kind=import` + evidence | Fixtures with malformed/duplicate rows |
| **M12 Licensing** | Second synthetic tenant, different divisions/rules, works with **zero engine changes**; entitlement off ⇒ feature denied server-side; billing disabled by default | Cross-tenant e2e; CI grep gate for `wnyahl`/league literals in `packages/` |
| **M13 Control Center link** | Keith sees VHI build/test status and approvals in the console, in plain English; no terminal step | Console renders real status file; failure translated |

**Cross-cutting gates (every PR):** format, lint, typecheck, unit, pgTAP, RLS-coverage generator, no-literal gate, dependency audit, migration lineage check. Failure messages translated via `translate.ts` rules in the console.

## 3. Dependencies

Specification (blocker) · CEO approvals (repo, project, cost) · counsel on minors/PIPEDA/Law 25/COPPA · WNYAHL sample **rules and a blank game sheet** (not data) · hockey subject-matter confirmation of stat definitions · domain/brand clearance for "Venuewise Hockey Intelligence" · Stripe test account (Phase 8).

## 4. Technical risks

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | Scorekeepers enter partial data ⇒ stats look wrong | Completeness model + "Not recorded"; validation at entry; reconcile to official sheet |
| R2 | Plus/minus, TOI, save% require data most youth leagues do not capture | Treat as **optional tiers**; ship tier 1 (goals/assists/PIM/GP/shots if captured) first; never fabricate |
| R3 | Rule variance (USA Hockey, Hockey Canada, local) ⇒ hidden hardcoding | Rules as versioned data; second-tenant test (M12) in CI |
| R4 | Corrections after stats published | Supersede model + recompute + stat-run history; published pages show "revised" |
| R5 | RLS performance at scale | Index on `(tenant_id, …)`; stat tables precomputed; load test in Phase 9 |
| R6 | Live scoring offline in arenas | Client-side event queue with idempotency keys; conflict rules defined in Phase 3 |
| R7 | Video-derived events unreliable | Candidate-only, human-confirmed, `source_kind` separated; excluded from official stats until confirmed |
| R8 | Minors' data breach | Minimum PII, consent, region, private storage, audit; external security review before pilot |
| R9 | Separate repo drifts from HL-BOS governance | Same CI standards; status file read by Control Center; CLAUDE-style operating contract copied into the repo |
| R10 | `HockeyIQ` duplicate concept | Retire in catalog (decision #3) |
| R11 | Single maintainer/AI-built code and IP cleanliness for licensing | Own repo, license headers, dependency license audit in CI, no code copied from HL-BOS without noting provenance |

## 5. Unresolved requirements (need an answer; none are assumed)

1. **The specification itself** (not received).
2. Scope of "intelligence": descriptive analytics only, or predictive/AI (player development index, projections)? Predictive features raise validity and fairness questions for minors.
3. WNYAHL rules: divisions/age bands, period length, overtime, penalty catalog, standings points/tiebreakers, who keeps the official sheet (paper vs digital) and who is authoritative.
4. Who enters events (volunteer scorekeepers? officials? app vs paper later keyed in?) — determines Phase 3 UX.
5. Is shot, faceoff or on-ice tracking expected, or goals/assists/penalties only?
6. Public visibility: are player stats public for minors, by default or opt-in?
7. Canada: bilingual (EN/FR) required? Currency/tax? Data residency in Canada required?
8. Commercial model: per league, team, or season; trial rules; data ownership and export on exit.
9. Brand: "Venuewise" ownership and any third-party marks (e.g. USA Hockey, Hockey Canada) — no logos or marks used without license.
10. Relationship with existing `gametracker` public score pages: one-way export acceptable?

## 6. Proposed next step (after approval)

Phase 0 → Phase 1 in one session: create the repo and project **only once approved**, then deliver a working foundation: tenancy/RBAC/audit with the auto-generated RLS test matrix passing locally against a local Postgres, CI green, and a status file the Control Center reads. No production, no billing, no existing database touched.

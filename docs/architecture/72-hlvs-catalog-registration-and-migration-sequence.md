# Checkpoint 8B — HLVS Catalog Registration Proposals & Migration Sequence

**Date:** 2026-07-27 · **Checkpoint:** 8B · **Status:** PROPOSALS ONLY — nothing inserted, nothing approved, no migration written. Aligns to the CP8 `hlvs` schema vocabulary.

> **Covers required deliverables 17 (HLVS catalog registration proposals) and 18 (Exact migration sequence).** Evidence base: docs [68](68-venuewise-huddle-evidence.md), [69](69-duplicate-and-unsafe-legacy-report.md), [70](70-highlightai-broadcastai-evidence-audit.md), [71](71-media-platform-capability-map.md).

> **CP8B boundary honored:** _Do not approve catalog proposals._ Everything below is a **draft proposal for the CEO/architecture review** — expressed in the CP8 `hlvs` vocabulary so it can later be registered **through the governed factory interface** (never by hand-editing seeds). No `INSERT` is run in this checkpoint; the CP8 migration `20260727090200_hlbos_0025_hlvs_factory.sql` is **not modified**.

## 1. HLVS catalog registration proposals (deliverable 17)

These are proposed `hlvs.extraction_candidates` rows — the factory's own mechanism for recording "a capability was observed in a source system and here is its determination." Determinations use the CP8 `hlvs.determination` enum (`reuse_existing` · `configure_existing` · `extend_existing` · `create_adapter` · `create_new` · `reject_duplicate` · `requires_architecture_review`). All would enter at `extraction_status = 'candidate'` and require human review to advance — **not proposed as `approved_for_extraction`.**

| source_system  | source_repository  | observed_capability                   | Proposed determination         | Rationale (evidence)                                     |
| -------------- | ------------------ | ------------------------------------- | ------------------------------ | -------------------------------------------------------- |
| Venuewise Core | homehuddle         | Identity / auth                       | `reuse_existing`               | HL-BOS `identity` is superior (doc 69 D1)                |
| Venuewise Core | homehuddle         | Multi-tenant workspace platform       | `requires_architecture_review` | Convergence-vs-coexistence is a CEO decision (doc 68 §1) |
| Venuewise Core | homehuddle         | Admin authorization                   | `reject_duplicate`             | JWT-claim admin is unsafe (doc 69 U3)                    |
| Venuewise Core | homehuddle         | Families/athletes/coaches             | `create_new` (re-implement)    | domain model reusable, code not (doc 69 U1–U5)           |
| Venuewise Core | homehuddle         | Organizations/clubs                   | `create_new`                   | same                                                     |
| Venuewise Core | homehuddle         | Facilities & booking                  | `create_new`                   | live booking tables; re-express on spine                 |
| Venuewise Core | homehuddle         | Events / calendar                     | `create_new`                   | domain re-implementation                                 |
| Venuewise Core | homehuddle         | Media library (photos)                | `create_new`                   | `storage_meta` + media domain                            |
| Venuewise Core | homehuddle         | Media library (video = YouTube links) | `create_new`                   | links only; no processing (doc 70)                       |
| Venuewise Core | 5star-sports-media | Editorial / CMS / spotlights          | `create_new`                   | `cms-schema.sql` requirements                            |
| Venuewise Core | 5star-sports-media | Sponsors                              | `create_new`                   | commercial domain                                        |
| Venuewise Core | homehuddle         | Leads / intake                        | `create_new`                   | `discovery`/`sales` intake                               |
| Venuewise Core | homehuddle         | Analytics                             | `reuse_existing`               | `audit`/`events` (doc 69 D4)                             |
| Venuewise Core | 5star-sports-media | Academy                               | `create_new`                   | new product                                              |
| Venuewise Core | 5star-sports-media | Podcast                               | `create_new`                   | content domain                                           |
| Venuewise Core | homehuddle         | Payments (planned)                    | `reuse_existing`               | `billing` built (doc 69 D6)                              |
| Venuewise Core | homehuddle         | Messaging (planned)                   | `reuse_existing`               | `comms` built (doc 69 D6)                                |
| — (none)       | —                  | **HighlightAI (video AI)**            | `create_new`                   | **genuinely greenfield** (doc 70)                        |
| — (none)       | —                  | **BroadcastAI (live video)**          | `create_new`                   | **genuinely greenfield** (doc 70)                        |

**Also proposed as products** (draft `hlvs.products`, not inserted): `venuewise-community` (families/athletes/coaches + orgs), `facility-booking`, `sports-media-cms`, `academy`, `highlight-ai` (greenfield), `broadcast-ai` (greenfield). **No prices, no licensing, no editions** — those are CEO decisions (see doc 73 and CP8's [CEO Decision Report](64-checkpoint8-ceo-decision-report.md) #1–#12).

## 2. Exact migration sequence (deliverable 18)

The order in which a **future, separately-approved** effort would converge Venuewise onto HL-BOS. **None of these steps is executed in CP8B.** Each is gated; each is additive and reversible (matching both HL-BOS constraints and the VPS Prime Directive).

**Phase 0 — Decide (CEO).** Resolve convergence vs. coexistence (doc 73). No code moves until this is answered.

**Phase 1 — Register (governed, no data move).** Through the factory interface, register the §1 extraction candidates and draft products; run the deterministic duplicate-risk determinations; produce Product Technical Blueprints for the `create_new` capabilities. Output: an approved catalog + blueprints. Still zero production impact.

**Phase 2 — Re-implement platform adoption (Venuewise consumes HL-BOS).** Point Venuewise identity/auth, then analytics, at the HL-BOS spine behind the existing pages — one consumer at a time, verified against Venuewise's own smoke suite, each step reversible. (This is _adopting_ HL-BOS, not migrating code.)

**Phase 3 — Re-implement domain capabilities.** In dependency order, rebuild on HL-BOS with RLS+FORCE, permission-checked writes, tenant isolation: (a) community (families/athletes/coaches/orgs), (b) events/calendar, (c) facilities & booking, (d) media (photos + video links), (e) editorial/CMS/spotlights + sponsors, (f) leads/intake, (g) academy, (h) podcast. Each capability: blueprint → build → conformance → re-point the corresponding page(s) → verify → keep old path reversible until proven.

**Phase 4 — Data migration (one-time, separately approved).** Migrate live data from `urwnbskrtoplgnkkxuvl` into the HL-BOS tenant model with explicit mapping (including the LeagueApps backup). Requires production credentials the session does not hold — a CEO trust decision.

**Phase 5 — Greenfield AI products.** Build HighlightAI and BroadcastAI fresh (deterministic engines + advisory AI, never AI-authoritative). Independent of Phases 2–4.

**Phase 6 — Decommission.** Only after every page is re-pointed and verified, retire the legacy shared project. Not before.

**Ordering rules that must hold:** platform-plane before domain; identity before anything that references a user; a capability's page is re-pointed only after its HL-BOS conformance passes; the legacy path stays live and reversible until its replacement is proven; **no anon-write or no-FORCE pattern is ever carried forward** (doc 69). The controlling gates (production migration approval, tenant creation, secret access, billing) remain the CEO's per the standing constraints.

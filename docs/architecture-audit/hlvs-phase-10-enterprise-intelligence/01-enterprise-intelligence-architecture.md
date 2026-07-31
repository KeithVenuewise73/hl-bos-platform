# 1 · Enterprise Intelligence Architecture

## Purpose

Define the **Enterprise Intelligence Layer** of HL-BOS: its subsystems, their boundaries, and the single pattern every subsystem obeys. This is the layer that turns HL-BOS from a business operating system into a **unified AI Business Transformation Platform**.

## The five layers of HL-BOS

| Layer                           | Responsibility                                         | Realized by (today)                                                                                         |
| ------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **L4 Experience**               | The single human surface                               | Executive Portal (read-only, cloud); Control Center (local-only)                                            |
| **L3 Enterprise Intelligence**  | Turn data into governed executive decisions            | 4 subsystems (below)                                                                                        |
| **L2 Shared Platform Services** | Cross-cutting capabilities every subsystem reuses      | `identity`, `comms`, `workflows`, `billing`, `storage_meta`, `events`, `entitlements`, `integrations`, `ai` |
| **L1 Core Platform**            | Tenancy, identity, immutable audit, the event backbone | `platform`, `identity`, `audit`, `events`                                                                   |
| **L0 Data & Runtime**           | Postgres (RLS), edge runtime, model providers          | Supabase HL-BOS Core, edge functions, AI Gateway                                                            |

**Rule:** intelligence never re-implements a shared service. If a subsystem needs to send a message, it uses `comms`; to gate a decision, `workflows`; to call a model, the `ai` gateway. This is what prevents duplicate architectures.

## The four intelligence subsystems

### A. HLVS Intelligence — _"what should Herman Legacy build, buy, or reuse?"_

The absorbed HLVS vision. Governs the **software estate** and **opportunity pipeline**.

- **Enterprise Catalog** — single source of truth for every asset (§3).
- **Application Registry** — the operational/deployment projection (§8).
- **Capability Library** — the unified reuse backbone (§5).
- **Discovery Engine** — continuous external research → opportunities (§4).
- **Claude Build Queue** — governed path from approved opportunity → assembled software via the Software Factory (§6).

### B. HL-BTI Intelligence — _"what should a business do, and what is it worth?"_

The transformation-consulting brain. **Already built** (`@hl-bos/transformation-intelligence` + `@hl-bos/bti-engine` + `bti` schema).

- Business Assessments · Transformation Analysis · Gap Analysis · Proposal Generation · Solution Recommendation · ROI Modeling · Implementation Planning.

### C. Visibility Intelligence — _"how visible and reputable is a business?"_

Consolidates the `visibility` prototype and the growth dimensions of the BTI engine into one subsystem.

- SEO · Digital Visibility · Competitive Analysis · Reputation · Marketing Intelligence.

### D. Transportation Intelligence — _"how efficient is a fleet/logistics operation?"_ (greenfield)

A vertical intelligence subsystem for logistics operators (the HSCS-GLP problem space).

- Fleet · Dispatch · Freight · Fuel · Maintenance · Compliance Intelligence.

## The subsystem pattern (every subsystem is built the same way)

```
              ┌─────────────── one intelligence subsystem ───────────────┐
 evidence ───▶│ 1. DATA (bounded schema, RLS+FORCE, config-as-rows)       │
              │ 2. DETERMINISTIC ENGINE (a reusable @hl-bos/* package)     │──▶ scored,
 advisory ───▶│ 3. ADVISORY AI (through the ONE ai-gateway, never author.) │    evidence-
 (optional)   │ 4. HUMAN GATE (workflows human-approval before any action) │    traced
              │ 5. READ-ONLY PROJECTION (public.*_ RPC → Executive Portal) │──▶ output
              └───────────────────────────────────────────────────────────┘
```

Consequences of the pattern:

- **Determinism is the authority.** AI drafts narrative and hypotheses; it never scores, approves, or executes. (Already true of the BTI/discovery/factory engines.)
- **Nothing is fabricated.** No inputs → `null` with a reason, not a guessed number (Principle 10).
- **One approval mechanism.** Every risky action routes through `workflows`, so governance is uniform across all four subsystems.
- **One AI door.** Every model call is metered/guard-railed by the `ai` gateway; no subsystem holds its own key.

## Boundary rules (what prevents duplication)

1. **A capability lives in exactly one layer.** Cross-layer needs are satisfied by calling down, never by copying.
2. **Shared services are never forked.** New notifications/billing/storage needs extend the shared service, they don't spawn a subsystem-local one.
3. **The Capability Library is the reuse arbiter.** Before any build, the Discovery/Factory flow asks the Capability Library "does this already exist?" (the existing `hlvs.duplicate_check` pattern, generalized).
4. **The Executive Portal is the only UI.** No subsystem ships its own app; each contributes read-only views and three integration hooks: `summary()`, `approvalQueue()`, `searchIndex()` (§7).
5. **Verticals reuse the horizontals.** Transportation/Visibility/BTI all consume the same catalog, capability library, ai-gateway, workflows and comms.

## Why this satisfies the directive

- **One platform** — the layer diagram has a single root (HL-BOS); every capability is placed inside it.
- **No standalone apps** — the Experience layer is one portal; verticals are subsystems, not apps.
- **No duplicate services** — Shared Platform Services are the only home for auth/comms/workflow/etc.
- **Reuse everything** — three of four subsystems are already built; the fourth (Transportation) and the Discovery expansion reuse the shared spine wholesale.

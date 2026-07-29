# 02 · Current HLVS Architecture

How the system is actually shaped today, verified against the live database and the source. This report fixes the vocabulary first, because "HLVS" has meant three different things over the project's life, and then describes the real architecture.

---

## 1. Terminology — reading this without confusion

The term **HLVS** has drifted. Three uses appear in the repository and all are legitimate in their own time:

| Use of "HLVS"                                                | What it refers to                                                                                   | Status                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **HLVS Venture Studio** (legacy)                             | An old product live in the unreachable legacy Supabase project (`hlvs` schema there, 59 tables)     | Out of scope, preserved, not reachable from here |
| **Herman Legacy Software Ventures**                          | The business — the studio that assembles vertical AI products                                       | Organizational, not a system                     |
| **HLVS = the Software Factory / Product Intelligence Layer** | The governed `hlvs` schema in _HL-BOS Core_ (19 tables) that decides what to build and validates it | **Built, live, tested**                          |

**This assessment uses "HLVS" in the third sense** — the one your Phase II directive intends: _HLVS is evolving from an Innovation Studio into the Product Intelligence Layer._ That layer already exists as the `hlvs` factory schema. When we mean the old product, we say **"legacy HLVS Venture Studio."**

The definitive boundary document is `docs/architecture/46-hlvs-hlbos-responsibility-boundary.md`. This report is consistent with it.

## 2. The three roles, and how the code enforces them

The CEO formally split responsibility into three roles. This is not aspirational — the database schema and the (inert) service layer are built around it.

### HLVS — decides _what_ and _why_, and validates

HLVS owns the **technical blueprint, the engineering intelligence, and the software catalog**. It determines what to create, which problem it solves, which capabilities Herman Legacy already owns, which must be reused vs. extended vs. newly authorized, which modules compose a product, how the development agent (Claude) is instructed, whether the delivered work conforms to the approved blueprint, and whether the software is eligible to hand to HL-BOS. **HLVS does not run customer workloads.** It lives in the `hlvs.*` schema.

### HL-BOS — the production facility

HL-BOS receives approved packages, provides and validates the shared platform, applies production gates, provisions tenants and entitlements, deploys, operates, and reports health back to HLVS. Today only the **intake** side of that handoff exists (records and inert acknowledgements); no live deployment or provisioning is performed yet.

### Claude — a governed development agent

The AI engineer executes an **approved** Software Creation Order through defined checkpoints and returns structured evidence. It cannot authorize architecture, pricing, deployment, entitlements, or new duplicate modules on its own. In the schema it is agent-neutral and **never called automatically** (`external_execution` is always `false`). This is a deliberate safety posture, not a limitation of maturity.

### Three execution planes, never mixed

| Plane                 | Owner             | State today                                               |
| --------------------- | ----------------- | --------------------------------------------------------- |
| Catalog definition    | HLVS              | Built and governed (approvals, versioning, audit)         |
| Development execution | Claude (governed) | Modeled, human-controlled, no automatic calls             |
| Production execution  | HL-BOS            | Intake only; deployment/provisioning out of scope for now |

## 3. The layering — who sits on whom

```
        ┌─────────────────────────────────────────────────────────┐
        │  HLVS — Product Intelligence Layer (the "brain")          │
        │  hlvs.* : capabilities · modules · products · editions ·  │
        │  templates · blueprints · creation orders · conformance · │
        │  factory build packages · HL-BOS intake                   │
        └───────────────┬─────────────────────────────────────────┘
                        │ issues an approved, inert Factory Build Package
                        ▼
        ┌─────────────────────────────────────────────────────────┐
        │  HL-BOS — Business Operating System (the shared floor)    │
        │  platform · identity · audit · events · entitlements ·    │
        │  integrations · ai · workflows · billing · storage_meta · │
        │  comms · discovery · sales · provisioning                 │
        └───────────────┬─────────────────────────────────────────┘
                        │ products are assembled from these modules
                        ▼
        ┌─────────────────────────────────────────────────────────┐
        │  Products (assembled, not hand-built)                     │
        │  HL-BTI (bti.*) — the first · VisibilityAI (visibility.*) │
        │  — a partial prototype · future verticals                 │
        └─────────────────────────────────────────────────────────┘
```

**Key architectural fact:** HL-BTI, the first product, was **registrable through the HLVS factory as a product** and reuses HL-BOS's identity, tenancy, billing, discovery, blueprint, sales, and provisioning rather than duplicating any of them. The one genuinely new shared asset it introduced was a packaged scoring engine (`@hl-bos/bti-engine`). This proves the assembly model works end-to-end.

## 4. The value chain across the database

The schemas are not a random collection — they form a pipeline from "unknown business" to "provisioned, running customer," with the Factory governing what gets built to serve it:

```
Discovery            Blueprint            Commercial            Provisioning         Factory (HLVS)
─────────            ─────────            ──────────            ────────────         ──────────────
website scan   ──►   findings +     ──►   proposal +     ──►   request +      ──►   creation order ──► prompt
business       ──►   recommendations ──►  line items +   ──►   work orders +  ──►   package ──► dev run ──►
interview            roadmap +            agreements +          factory              checkpoint/completion
evidence             impact estimates     billing setup         authorization        reports ──► conformance
   │                                                                │                     │
   └── one Unified Business Profile, scored by two frameworks       └── the commercial    └── deterministic
       (Digital Maturity + Business Health)                            authorization HLVS     validation, then an
                                                                       intake compares         inert Build Package
                                                                       the build against       handed to HL-BOS
```

Concretely, the chain is wired by foreign keys: `discovery.blueprints` → `sales.proposals` → `provisioning.requests`/`work_orders` → `provisioning.factory_authorizations`, which the Factory's `hlvs.hlbos_intake` compares against before accepting a build. This is a genuine closed loop, already modeled in the schema.

## 5. Two databases, one canonical

- **HL-BOS Core** (`mvvtngiopdrgiedjmhfb`, us-west-2) — **the canonical project.** All 27 migrations applied, 124 tables, 100% RLS, 0 error-level advisories. Everything in this assessment refers to this project unless stated otherwise. (ADR-0001 records this decision.)
- **The empty project** (`ywrzgursvdowzyhipsmt`) — named in some older docs as production but verified empty; parked pending a retirement decision.
- **The legacy project** ("Herman Legacy Business Platform", `bkfsjhhclbqrhaolvhmz`) — 156 tables, the real accumulated legacy estate (HLVS Venture Studio, HSCS Government Logistics, AI Asset Recovery). **Unreachable from the current credentials and out of scope.** Its architecture and security issues are documented in `docs/architecture/current-state-audit.md`; this assessment does not re-open it.

## 6. What "shape" this system is, in one paragraph

It is a **multi-tenant, shared-schema platform** whose public surface is deliberately narrow: the application schemas are not exposed through the automatic API, and access happens through a curated set of permission-checked database functions (the "API is functions, not tables" pattern). On top of that spine sit domain engines — discovery, blueprint, commerce, provisioning — that turn a raw business into a costed transformation plan, and above them the **HLVS Factory**, a governed loop that turns an approved plan into a validated software package. The whole thing is deterministic-first (the math is the authority) and AI-advisory (AI never approves anything). That combination — a real platform, a real factory, and a real product built by it — is the architecture we are consolidating.

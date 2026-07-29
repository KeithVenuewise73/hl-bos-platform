# 10 · Duplication Analysis

The mission asks us to find unnecessary duplication and eliminate it — while preserving intellectual property. The finding is reassuring: **inside the canonical platform there is essentially no duplication.** The estate's only real duplication lives in the unreachable legacy project and is out of scope. The main risk is _forward_ duplication as new work lands, and the platform already has guardrails against it.

---

## 1. Inside HL-BOS Core — one of everything

Each foundational concept exists exactly once, and a second is explicitly prohibited:

| Concept                   | Single home                      | A second one is…                                                       |
| ------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| Tenant / organization     | `platform.tenants`               | Prohibited                                                             |
| Identity / auth           | `identity` + Supabase Auth       | Prohibited                                                             |
| Authorization check       | `identity.has_permission`        | Prohibited                                                             |
| Billing                   | `billing` schema                 | Prohibited                                                             |
| Entitlements              | `entitlements` schema            | Prohibited                                                             |
| Event bus                 | `events` schema + one dispatcher | Prohibited                                                             |
| Workflow / approval gate  | `workflows` schema               | Prohibited                                                             |
| AI access                 | `ai` gateway                     | Prohibited                                                             |
| Audit log                 | `audit.events`                   | Prohibited                                                             |
| File storage              | `storage_meta`                   | Prohibited                                                             |
| Communications            | `comms` schema                   | Prohibited                                                             |
| Environment/secret access | `@hl-bos/config`                 | Enforced by ESLint (`no-restricted-properties` bans raw `process.env`) |

**Verdict: no intra-platform consolidation is required.** This is the outcome the whole architecture was designed to produce, and it held even as the platform doubled in size.

## 2. The one thing that looks like duplication but isn't

There are **two catalogs of "modules,"** and this is deliberate, not accidental:

- `discovery.module_catalog` — the **commercial / recommend-able** catalog. What the blueprint engine can _propose_ to a customer, with availability, entitlement key, and implementation effort.
- `hlvs.modules` — the **engineering registry**. The factory's authoritative record of every module's repo, APIs, tests, maturity, and licensing.

They are **linked 1:1** via `hlvs.modules.discovery_module_key`, and they answer different questions ("what can we sell/recommend?" vs. "what have we actually built and how?"). Collapsing them would lose information, not remove duplication. **Keep both; keep the link.** The same applies to `discovery.service_catalog` — HLVS composes from it rather than adding a competing service list.

Similarly, there are two kinds of "blueprint" — the **customer transformation blueprint** (`discovery.blueprints`) and the **product technical blueprint** (`hlvs.product_blueprints`). Different artifacts for different audiences (the customer's plan vs. the software's spec). Not duplication.

## 3. Legacy ↔ Core duplication — real, but out of scope

The legacy project (unreachable) contains genuine duplicates of the platform spine — two incompatible tenancy models (`hlvs.*` single-org, `hscs_glp.*` multi-org), separate audit tables, separate notification/AI-log/document systems. This is the estate's _actual_ duplication, and it is **informational only for now**: it is out of scope, unreachable, and not a prerequisite for any current work. The rebuild already resolved it _by construction_ — the correct legacy model (`hscs_glp`'s multi-org authorization) was generalized into `identity`, and the incorrect one (`hlvs`'s single-org) was not carried forward. When/if legacy products migrate, they adopt the platform rather than bringing their duplicates with them (this is the convergence decision in report 11/12).

## 4. Forward duplication risk — where it could creep in

As Phase II proceeds, these are the places duplication would try to re-enter, and the existing guardrail for each:

| Risk                                                                 | Guardrail already in place                                                                                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A new product builds its own auth/tenancy/billing                    | The "no second X" rule + the factory's **duplicate-risk check** flags unauthorized module duplication as a **non-waivable** conformance failure |
| Ad-hoc AI calls outside the gateway                                  | All AI must route through `ai-gateway`; scattered keys prohibited                                                                               |
| A second CRM (vs. reusing `visibility.prospects` / `bti.businesses`) | Decide once whether to extract a shared CRM (Rule of Three) before a third product needs it                                                     |
| A competing catalog or event bus                                     | Explicitly prohibited; the factory conformance engine enforces it                                                                               |
| Raw `process.env` / inlined secrets                                  | ESLint rule + CI secret scanning                                                                                                                |

## 5. Recommendations

1. **Preserve the module-catalog split** (`discovery.module_catalog` ↔ `hlvs.modules`) and document it prominently so a future engineer doesn't "helpfully" merge them.
2. **Keep the factory's duplicate-risk check on the critical path** for every new module — it is the mechanical enforcement of "extend, don't recreate," which is the mission's core instruction.
3. **Watch the CRM question.** `visibility.prospects` and `bti.businesses` both model "a business we're working with." A third product touching this concept is the trigger to consider extracting a shared `crm` — not before (Rule of Three).
4. **Leave legacy duplication alone** until a CEO-approved convergence plan exists; resolving it now buys nothing and risks a live system.

**Net finding:** the platform is clean. Duplication is a _future_ risk that existing guardrails already address, and the only real duplication in the estate is safely quarantined in the out-of-scope legacy project.

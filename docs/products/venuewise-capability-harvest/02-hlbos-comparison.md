# Venuewise Capability Harvest · 02 — Comparison against HL-BOS

**Read-only analysis. No migration recommended or executed (out of scope).** The four buckets
the CEO asked for.

## The big picture

**Venuewise Core and HL-BOS are two platforms built on the _same_ philosophy** — engines-not-
products, `workspace_id`/tenant + RLS, config-over-code. They **converge on the shared plumbing
and diverge on the domain.** HL-BOS has the _business-transformation / discovery / factory_
domain; Venuewise has a _youth-sports / family-coordination_ domain. Neither has the other's.

## 1. Already exists in BOTH (overlapping plumbing)

Same capability, two implementations — the "future decision" set (see bucket 4):

| Capability                     | HL-BOS                                    | Venuewise                                            |
| ------------------------------ | ----------------------------------------- | ---------------------------------------------------- |
| Identity / tenancy / RLS       | `identity` (8 tables), Supabase Auth      | `family_access, workspace_roles`, PIN login          |
| Multi-tenant workspaces        | `platform.tenants` + entitlements         | `business_workspaces, workspace_branding` (scaffold) |
| Workflow / approvals           | `workflows` schema                        | `workflow_instances/…`                               |
| Communications / notifications | `comms` (7 tables, built-undeployed)      | `send-*` edge fns, `reminders, feeds, push`          |
| Billing                        | `billing` + Stripe adapter **(501 stub)** | **Stripe checkout + portal — working**               |
| Admin / reporting              | Executive Portal (built-undeployed)       | `venuewise-admin`, `/platform` (scaffold)            |
| AI edge layer                  | `ai-gateway` (keyless)                    | `smart-task, super-processor` (unknown)              |

## 2. Exists ONLY in Venuewise (the true harvest — no HL-BOS equivalent)

**This is the reuse prize** — capabilities HL-BOS would otherwise build from scratch for any
sports/family vertical:

- **Merged family/athlete calendar** + schedule-sync/feed (`get_merged_calendar`, `sync-schedules`). ⭐
- **Athlete development** — profiles, goals, stats, sports, videos, public recruiting profile.
- **Coaching** — coach profiles, directory, connections, spotlight/recognition.
- **Family CRM & roster** — family units, members, athlete rosters, invitations.
- **Program/clinic registration** flow (register → pay → synced schedule).
- **Facility management** (FacilityHuddle) and **organization directory** (OrganizationHuddle).
- **Dynamic forms engine** (`form_templates/sections/fields`) — HL-BOS has none.
- **A _working_ Stripe subscription flow** — which HL-BOS has only as a **501 stub**. ⭐

## 3. Exists ONLY in HL-BOS (not in Venuewise)

- **HL-BTI** transformation-intelligence engine (assess→blueprint→proposal→ROI).
- **Discovery / website analysis / SEO / reputation** (VisibilityAI).
- **Knowledge Graph** (impact/blast-radius).
- **Government-contracts intelligence.**
- **Enterprise Catalog + Software Factory + Capability Library** (the assembler itself).
- **Entitlements / plan-gating**, formal migration-lineage governance, and a canonical
  production deployment.

## 4. Overlapping implementations requiring a FUTURE DECISION

For each overlapping capability, the question is _which implementation becomes canonical_ — **a
decision, not a task, and explicitly not part of this read-only harvest:**

| Overlap                                        | Recommendation to weigh (not to execute now)                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity / tenancy / workflows / comms / admin | **HL-BOS is the more governed, deployed platform** → likely canonical; Venuewise keeps its _domain_ UX on top.                                        |
| **Billing / Stripe**                           | **Venuewise's is working; HL-BOS's is a stub** → strong candidate to **harvest Venuewise's Stripe flow (reuse-with-adapter)** to fill the HL-BOS gap. |
| AI edge functions                              | **Unknown** — needs backend access to `urwnbskrtoplgnkkxuvl` before any decision.                                                                     |
| Where the sports vertical _runs_               | Assemble the sports **domain** (bucket 2) onto the HL-BOS spine, or keep Venuewise Core as an independent sibling platform — a strategic call.        |

## Factory-classification summary

| Classification                     | Capabilities                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Reuse with adapter**             | Stripe subscription flow ⭐, SMS, web-push, lead capture, activity feeds                                                               |
| **Refactor into shared module**    | Merged calendar ⭐, athlete development, coaching, family roster, registration, forms engine, facility/org management, public profiles |
| **Retire → adopt HL-BOS instead**  | Venuewise identity/tenancy/workflows/comms/admin/backend (HL-BOS is canonical)                                                         |
| **Keep Venuewise-specific**        | PIN family-login UX, per-brand Huddle surfaces                                                                                         |
| **Investigate before classifying** | `smart-task`, `super-processor` AI functions (backend unreachable)                                                                     |
| **Not software (leave/retire)**    | `coaches-huddle-chrismazzu` demo scaffold; `5star-*`/marketing sites                                                                   |

## The one-line strategic read

**The Factory should harvest Venuewise's _sports/family/athlete domain_ (calendar, athletes,
coaching, roster, registration, forms) and its _working Stripe flow_ — and NOT re-adopt its
plumbing, because HL-BOS already has more governed versions of that plumbing.** That harvest
would give HL-BOS an entire youth-sports vertical (AthleteHuddle/CoachesHuddle/FacilityHuddle
as _real_ Factory products) without rebuilding it — and could fix HL-BOS's billing gap.

# 03 · Existing Feature Inventory

Every significant component, classified, with purpose, maturity, dependencies, reuse potential, and the platform layer it belongs to. Classifications use the eight categories from the directive: **CORE PLATFORM · SHARED SERVICE · PRODUCT MODULE · AI CAPABILITY · BUSINESS INTELLIGENCE · EXECUTIVE TOOL · UTILITY · INFRASTRUCTURE.**

**Maturity scale:** _Live_ (built + applied to canonical DB + tested) · _Built-undeployed_ (code + tests done; runtime not switched on) · _Prototype_ (partial; DB/logic only) · _Reference_ (seed/catalog data only) · _Absent_.

**Belongs in:** HL-BOS (shared) · HLVS (factory/intelligence) · HL-BTI (product) · Legacy (out of scope).

---

## A. Core platform & shared spine

| Component                              | Class          | Purpose                                                          | Maturity                              | Key dependencies       | Reuse                        | Belongs |
| -------------------------------------- | -------------- | ---------------------------------------------------------------- | ------------------------------------- | ---------------------- | ---------------------------- | ------- |
| Tenancy (`platform.tenants`)           | CORE PLATFORM  | The multi-tenant anchor; first-party vs customer; parent/child   | Live                                  | auth.users             | Reuse unchanged              | HL-BOS  |
| Identity & profiles (`identity`)       | CORE PLATFORM  | Profiles, memberships, invitations                               | Live                                  | tenants, Supabase Auth | Reuse unchanged              | HL-BOS  |
| Roles & permissions (`identity`)       | CORE PLATFORM  | 8 roles, 17 permissions, permission-based access                 | Live                                  | identity               | Reuse + extend               | HL-BOS  |
| Authorization helpers                  | CORE PLATFORM  | `is_member`, `has_permission`, `can_grant_role`, …               | Live                                  | identity graph         | Reuse unchanged              | HL-BOS  |
| Provisioning & invitations             | CORE PLATFORM  | Atomic tenant + owner creation; token-authorized invites         | Live                                  | identity, platform     | Reuse unchanged              | HL-BOS  |
| Audit log (`audit`)                    | CORE PLATFORM  | Append-only, immutable even to admins; security events           | Live                                  | all schemas (triggers) | Reuse unchanged              | HL-BOS  |
| Config loader (`@hl-bos/config`)       | UTILITY        | The only sanctioned reader of environment/secrets; Zod-validated | Live                                  | —                      | Reuse unchanged              | HL-BOS  |
| Event bus / outbox (`events`)          | SHARED SERVICE | Transactional outbox, at-least-once delivery, handler registry   | Live (DB) / Built-undeployed (runner) | —                      | Reuse + deploy               | HL-BOS  |
| Entitlements (`entitlements`)          | SHARED SERVICE | Feature catalog, plan mapping, module activation                 | Live                                  | tenants                | Reuse unchanged              | HL-BOS  |
| Integrations registry (`integrations`) | SHARED SERVICE | Connector/connection/sync/webhook framework                      | Live (framework)                      | tenants, vault         | Extend (no live connectors)  | HL-BOS  |
| Workflows / human gate (`workflows`)   | SHARED SERVICE | Reusable approval instances/tasks/approvals                      | Live                                  | identity               | Reuse unchanged              | HL-BOS  |
| Billing (`billing`)                    | SHARED SERVICE | Subscriptions, invoices, payments; entitlement reconciliation    | Live (DB)                             | entitlements           | Reuse + repair (Stripe stub) | HL-BOS  |
| Storage metadata (`storage_meta`)      | SHARED SERVICE | File registry, retention, signed-URL access boundary             | Live                                  | tenants                | Reuse unchanged              | HL-BOS  |
| Communications (`comms`)               | SHARED SERVICE | Email/SMS templates, consent, suppression, send-with-approval    | Live (DB) / Built-undeployed (runner) | tenants, vault         | Reuse + deploy               | HL-BOS  |

## B. AI capability

| Component                                              | Class                          | Purpose                                                                                                           | Maturity                       | Reuse                      | Belongs     |
| ------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------- | ----------- |
| AI gateway (`ai` schema)                               | AI CAPABILITY / SHARED SERVICE | Single metered door to every model; provider/model/prompt registry, run ledger, budgets, guardrails               | Live (DB)                      | Reuse unchanged            | HL-BOS      |
| AI gateway runtime (`ai-gateway` edge fn)              | AI CAPABILITY                  | Authenticated execution: begin run → provider (Anthropic/mock) → cost from pricing → finish run; real tokens only | Built-undeployed               | Reuse + deploy + grant key | HL-BOS      |
| Prompt-injection fence (`_shared/discovery/injection`) | AI CAPABILITY                  | Fences untrusted scanned content before it reaches a model                                                        | Built-undeployed               | Reuse                      | HL-BOS      |
| AI Safety & Authority model (doc 61)                   | AI CAPABILITY                  | Rule that AI approves/authorizes/certifies/publishes nothing; advisory only                                       | Live (enforced in permissions) | Reuse unchanged            | HL-BOS/HLVS |

## C. Business intelligence engines

| Component                                     | Class                      | Purpose                                                                                                  | Maturity                              | Belongs |
| --------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------- |
| Business Discovery Engine (`discovery`)       | BUSINESS INTELLIGENCE      | Many evidence collectors → one Unified Business Profile → scored assessment                              | Live (DB)                             | HL-BOS  |
| Digital Maturity Framework                    | BUSINESS INTELLIGENCE      | 0–100 digital capability score, 12 weighted dimensions, honest nulls                                     | Live (data-driven)                    | HL-BOS  |
| Business Health Framework                     | BUSINESS INTELLIGENCE      | 0–100 operational/commercial readiness score, 8 dimensions                                               | Live (data-driven)                    | HL-BOS  |
| Website Assessment / Scanner                  | BUSINESS INTELLIGENCE / AI | SSRF-safe deterministic evidence collection; rubric scoring; optional AI narrative                       | Live (DB) / Built-undeployed (worker) | HL-BOS  |
| Blueprint Engine                              | BUSINESS INTELLIGENCE      | Assessment → versioned, evidence-traced transformation plan (findings, roadmap, impact)                  | Live (DB) / Built-undeployed (worker) | HL-BOS  |
| Recommendation Engine (rules + priority)      | BUSINESS INTELLIGENCE      | Rules-as-data; 5 categorical priority bands; every recommendation cites evidence                         | Live                                  | HL-BOS  |
| Service Catalog (`discovery.service_catalog`) | BUSINESS INTELLIGENCE      | 25 recommend-able Herman Legacy services (pricing deferred)                                              | Live (reference)                      | HL-BOS  |
| Module Catalog (`discovery.module_catalog`)   | BUSINESS INTELLIGENCE      | 23 recommend-able commercial modules; availability/entitlement/effort                                    | Live (reference)                      | HL-BOS  |
| HL-BTI executive engines                      | BUSINESS INTELLIGENCE      | 7 executive scores, 12-stage engagement lifecycle, Executive Blueprint (17 sections), ROI, CEO dashboard | Live                                  | HL-BTI  |
| Growth Intelligence                           | BUSINESS INTELLIGENCE      | 12 growth dimensions → priority + estimated ROI + recommended service                                    | Live                                  | HL-BTI  |
| `@hl-bos/bti-engine` (package)                | BUSINESS INTELLIGENCE      | Canonical deterministic scoring, mirrored by DB and edge ("same numbers or it's a bug")                  | Live                                  | HL-BTI  |
| Reporting / analytics (as a shared service)   | BUSINESS INTELLIGENCE      | Cross-tenant reporting                                                                                   | Absent (defer; seed from assessments) | HL-BOS  |

## D. The HLVS Software Factory (Product Intelligence Layer)

| Component                                                 | Class                           | Purpose                                                                                     | Maturity                              | Belongs     |
| --------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------- | ----------- |
| Capability registry (`hlvs.capabilities`)                 | SHARED SERVICE / BI             | Business/technical abilities Herman Legacy owns (10 seeded)                                 | Live                                  | HLVS        |
| Module registry (`hlvs.modules`)                          | SHARED SERVICE                  | Engineering record of every module (repo/path, APIs, tests, maturity, licensing)            | Live                                  | HLVS        |
| Product / edition / template catalog                      | SHARED SERVICE                  | Products (7), editions, industry templates (7) composed from modules                        | Live                                  | HLVS        |
| Capability Extraction Framework (`extraction_candidates`) | BUSINESS INTELLIGENCE           | Governed record of reusable capabilities observed in existing systems (12 sources)          | Live (registry)                       | HLVS        |
| Duplicate-risk check (`hlvs.duplicate_check`)             | SHARED SERVICE                  | Deterministic reuse/extend/adapter/new determination; AI advice stored, never authoritative | Live                                  | HLVS        |
| Product Technical Blueprint                               | EXECUTIVE TOOL / factory        | Versioned technical definition; immutable once approved                                     | Live                                  | HLVS        |
| Software Creation Order                                   | EXECUTIVE TOOL / factory        | The authoritative development authorization; 13-state lifecycle                             | Live                                  | HLVS        |
| Claude Prompt-Package generator                           | AI CAPABILITY / factory         | Deterministic prompt package; refuses to include secrets                                    | Live (DB) / Built-undeployed (worker) | HLVS        |
| Development Run tracking                                  | INFRASTRUCTURE / factory        | Agent-neutral run bookkeeping; never calls an external agent                                | Live                                  | HLVS        |
| Checkpoint & Build-Completion Reports                     | EXECUTIVE TOOL / factory        | Structured evidence; append-only after acceptance                                           | Live                                  | HLVS        |
| Blueprint Conformance engine                              | BUSINESS INTELLIGENCE / factory | Deterministic pass/fail; flags unauthorized module duplication; non-waivable failure list   | Live                                  | HLVS        |
| Catalog Update Proposal                                   | SHARED SERVICE / factory        | Catalog changes from a build route through review, never silently applied                   | Live                                  | HLVS        |
| Factory Build Package                                     | EXECUTIVE TOOL / factory        | The formal, inert artifact HLVS issues to HL-BOS                                            | Live                                  | HLVS        |
| HL-BOS Intake + Feedback                                  | SHARED SERVICE / factory        | Compares build vs commercial authorization; mismatch refused; inert feedback                | Live                                  | HLVS↔HL-BOS |
| `hlvs-factory-worker` (edge fn)                           | INFRASTRUCTURE / factory        | Exercises the loop without contacting Claude; always `external_execution:false`             | Built-undeployed (inert by design)    | HLVS        |

## E. Commercial & provisioning pipeline

| Component                     | Class                    | Purpose                                                                                    | Maturity                 | Belongs |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ | ------------------------ | ------- |
| Sales pipeline (`sales`)      | SHARED SERVICE           | Proposals, line items, versioned prices (approval-gated), agreements, billing setup        | Live (DB)                | HL-BOS  |
| Provisioning (`provisioning`) | SHARED SERVICE           | Requests, work orders, entitlement plan, factory authorizations, deterministic readiness   | Live (DB)                | HL-BOS  |
| `commerce-worker` (edge fn)   | SHARED SERVICE / product | Draft proposal + provisioning readiness handoff; activates/provisions nothing autonomously | Built-undeployed (inert) | HL-BOS  |

## F. Products

| Component                                                                           | Class          | Purpose                                                                               | Maturity                                  | Belongs        |
| ----------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- | -------------- |
| HL-BTI (`bti` schema + apps)                                                        | PRODUCT MODULE | Business Transformation Intelligence: assess → blueprint → proposal → implement → ROI | Live (DB) + deployable app                | HL-BTI         |
| HL-BTI public API (`public.bti_*`)                                                  | PRODUCT MODULE | The narrow browser-reachable surface (5 SECURITY DEFINER functions)                   | Live                                      | HL-BTI         |
| VisibilityAI (`visibility` schema)                                                  | PRODUCT MODULE | Prospect capture → 16-category assessment → Business Growth Score → recommendations   | Prototype (DB + workflow; no UI/scanning) | HL-BOS product |
| Legacy products (HLVS Venture Studio, HSCS Government Logistics, AI Asset Recovery) | PRODUCT MODULE | Live legacy products                                                                  | Legacy (out of scope, unreachable)        | Legacy         |
| Planned verticals (SalonAI, LandscapeAI, FleetHuddle, CoachAI, Venuewise)           | PRODUCT MODULE | Named future verticals                                                                | Absent ("no code yet", per registry)      | HL-BOS product |

## G. Applications & executive tools

| Component                                              | Class          | Purpose                                                                                               | Maturity                    | Belongs |
| ------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------- | --------------------------- | ------- |
| CEO Development Control Center (`apps/control-center`) | EXECUTIVE TOOL | Localhost-only console: build/test/merge/approve, plain-English failure translation, honest portfolio | Live (local-only by design) | HL-BOS  |
| HL-BTI app (`apps/hl-bti`)                             | PRODUCT MODULE | Authenticated, cloud-persistent BTI app; reuses Auth + `bti_*` RPCs                                   | Built (deployable)          | HL-BTI  |
| HL-BTI Alpha (`apps/hl-bti-alpha`)                     | PRODUCT MODULE | Offline localStorage demo of the same engine (EO-001 demonstration)                                   | Built (demo)                | HL-BTI  |

## H. Infrastructure

| Component                         | Class                 | Purpose                                                                                                                                         | Maturity                                               | Belongs |
| --------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------- |
| Shared edge libraries (`_shared`) | INFRASTRUCTURE        | Provider abstractions (ai/billing/comms/discovery/blueprint/bti/hlvs/provisioning/sales/storage), outbox dispatcher pattern, vault-by-reference | Built-undeployed                                       | HL-BOS  |
| `events-dispatcher` (edge fn)     | INFRASTRUCTURE / CORE | Drains the outbox into per-subscription deliveries                                                                                              | Built-undeployed                                       | HL-BOS  |
| pgTAP / Deno / vitest test suites | INFRASTRUCTURE        | ~700+ assertions guarding tenancy, permissions, anti-fabrication, human gates                                                                   | Live (run in CI)                                       | HL-BOS  |
| CI (GitHub Actions)               | INFRASTRUCTURE        | format/lint/typecheck/test on every PR; secret scanning                                                                                         | Live                                                   | HL-BOS  |
| Deploy pipeline (migrations/edge) | INFRASTRUCTURE        | Governed apply/deploy path                                                                                                                      | Absent (migrations applied out-of-band; no deploy job) | HL-BOS  |
| Scheduler (`pg_cron`/`pg_net`)    | INFRASTRUCTURE        | Drives background workers on a timer                                                                                                            | Absent (available, not installed)                      | HL-BOS  |

---

**Reading of the inventory:** the platform is overwhelmingly **Live at the database and logic layer** and **Built-undeployed at the runtime layer**. Almost nothing is genuinely absent that isn't a deliberate deferral (reporting) or an ignition step (deploy pipeline, scheduler, live keys). The intellectual property is real and present; what's missing is switching it on and putting interfaces on it.

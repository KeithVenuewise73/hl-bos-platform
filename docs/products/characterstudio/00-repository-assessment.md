# CharacterStudio — repository assessment (spec §37)

**Status: assessment only. No application code was written, per §37 of the brief.**
Nothing in this document has been executed, deployed or applied. Every factual claim
about the existing platform below was read out of the repository at commit `dd7bc03`.

Four decisions in §H are Keith's, not mine, and two of them can invalidate the whole
build. They are at the end because they need the assessment first — but they gate
Step 1, not Step 15.

---

## A. Existing architecture

Two repositories are in this session. Only one is a candidate.

### `homehuddle` — not a candidate

Static HTML/vanilla-JS site (`index.html` is 227 KB), evolving into "Venuewise Core"
per `ARCHITECTURE.md`. No build system, no package manager at the root, no framework;
tests are a Playwright smoke suite under `tests/`. Its prime directive is that
HomeHuddle production never regresses. Putting an adult product in this tree would
violate that directive and share a domain and service worker with a youth-sports
product. **Ruled out.**

### `hl-bos-platform` — the real platform

| Concern           | What is actually there                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework         | Next.js `16.2.10`, React `19.2.7`, App Router. 7 apps in `apps/*`, ports 4000–4600                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Package manager   | pnpm `10.34.5` workspaces + Turborepo `2.10.5`. Versions pinned exactly in the `catalog:` block of `pnpm-workspace.yaml` — no `^`, no `~`, no `latest`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Language          | TypeScript **pinned at 6.0.3** (`docs/architecture/dependency-policy.md` explains why; do not bump). `tsconfig.base.json` is maximally strict — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`                                                                                                                                                                                                                                                                                                                                                               |
| Styling           | **No Tailwind anywhere in the repo.** Apps ship hand-written CSS tokens in `src/app/globals.css` plus a local `components/ui.tsx`. This conflicts with brief §23 — see §B.7                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Validation        | zod `4.4.3`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Auth              | Supabase Auth. `identity.profiles` PK **is** `auth.users.id` — "no second user table, no second password system". `identity.memberships` binds a user to a tenant; `identity.roles` / `permissions` / `role_permissions` drive every RLS check                                                                                                                                                                                                                                                                                                                                                 |
| Database          | PostgreSQL 17 via Supabase. 45 migrations (`supabase/migrations`, `hlbos_0001`–`0045`), 17+ schemas: `platform`, `identity`, `audit`, `events`, `entitlements`, `ai`, `billing`, `storage_meta`, `discovery`, `bti`, `vstudio`, … RLS is `enable` **and** `force` on every tenant table; tenant write paths go through `SECURITY DEFINER` RPCs, not direct grants                                                                                                                                                                                                                              |
| DB tests          | pgTAP suites in `supabase/tests` (77+ tests), run in CI against a from-scratch `supabase db reset`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Storage           | `storage_meta.files` over Supabase Storage. Private bucket `tenant-private`; `object_path` is **structurally** forced under `<tenant_id>/` by a CHECK constraint; 50 MiB cap; extension/MIME safety in `storage_meta.assert_safe`; `register_upload` / `confirm_upload` / `soft_delete_file` / `can_access` RPCs; no public bucket; no INSERT/UPDATE/DELETE grant to tenants                                                                                                                                                                                                                   |
| Payments          | Full provider-agnostic billing schema — `billing.providers/products/plans/plan_prices/subscriptions/invoices/payments/payment_methods` with `start_subscription`, `renew_subscription`, `cancel_subscription`, `record_invoice`, `record_payment`, `request_refund`, `apply_refund`, and `billing.reconcile_entitlements`. A `PaymentProvider` adapter interface exists (`supabase/functions/_shared/billing/provider.ts`) and `supabase/functions/billing-webhook` is wired to it. **Both are explicitly inert scaffolding. There is no Stripe adapter and no Stripe dependency in the tree** |
| AI                | `ai` schema — `providers`, `models`, `prompts`, `prompt_versions`, `runs`, `budgets`, `guardrails` — with `ai.begin_run` / `ai.finish_run` recording real tokens and `cost_usd` per call, and `ai.within_budget`. `supabase/functions/ai-gateway` selects an adapter via the `AiProvider` interface (`mock`, `anthropic`), resolves credentials from **Supabase Vault by reference**, and marks failed runs `failed` rather than fabricating success. The interface is text-only (`prompt → text`); there is no image path                                                                     |
| Deployment        | GitHub Actions. `ci.yml` = TS-pin check, `format:check`, `lint`, `typecheck`, `test`, `build`, gitleaks, a `NEXT_PUBLIC_` secret guard, and the pgTAP suite. `db-migrate.yml` validates migrations from scratch and applies to the canonical project **only behind a manual approval gate**, with a drift check. `deploy.yml` ships Edge Functions behind the same gate. `apps/hl-bti` additionally has a Dockerfile/nginx for Coolify                                                                                                                                                         |
| Reusable code     | `packages/catalog` (Enterprise Catalog — the asset registry of record), `packages/config` (the only sanctioned reader of `process.env`, with a classification system that makes `browser-safe` vs `server-only` enforceable), plus six domain packages (`bti-*`, `venture-studio`, `transformation-intelligence`, `bte-pipeline`)                                                                                                                                                                                                                                                              |
| CEO surface       | `apps/control-center` (localhost-only, drives git/GitHub/Supabase so Keith never opens a terminal), `apps/executive-portal` (read-only, cloud). Portfolio truth in `apps/control-center/src/lib/registry.ts`; live progress in `.hlbos/milestone.json`                                                                                                                                                                                                                                                                                                                                         |
| Migration hygiene | `scripts/check-migrations.sh` enforces `<14-digit-timestamp>_hlbos_<NNNN>_<desc>.sql`, a mandatory `-- rollback:` block, and no credentials. `.hlbos/migration-lineage.json` records the sha256 of every migration; ordinals run to **0045**, so CharacterStudio starts at **0046**                                                                                                                                                                                                                                                                                                            |

**The single most important finding:** every existing app is internal or B2B
multi-tenant. There is **no self-serve consumer signup anywhere in this repository** —
`platform.provision_tenant` and `identity.accept_invitation` assume an operator
creates the tenant and invites the user. CharacterStudio is B2C. That gap is real work,
and it is described in §B.2.

**Second finding:** the brief's schema (§21) proposes a `users` table. This platform
will not accept one — `identity.profiles` already is that table, keyed to `auth.users`.
I will map the brief onto the platform rather than duplicating identity.

---

## B. Proposed architecture

CharacterStudio is assembled on HL-BOS, not built beside it. Concretely:

**1. Isolation.** Adult content shares a repository and CI with HSCS Government
Logistics and Herman Legacy Digital's consulting clients. Code-level isolation
(`apps/character-studio` + a `studio` schema) is easy; the isolation that matters is
commercial — **a separate Supabase project and a separate payment-processor account**,
so a processor dispute over this product cannot freeze the group's other revenue. This
is decision H-1 and I am not choosing it unilaterally.

**2. Consumer identity, reusing the platform spine.** At signup, one personal tenant is
auto-provisioned per user and the user gets an `owner` membership on it. This is the
keystone decision: it means RLS, permissions, audit, entitlements, storage paths and
billing all work **unchanged**, with `tenant_id = the user's personal workspace`.
The alternative — a parallel consumer identity model — means re-deriving every
guarantee in the platform and is rejected. New: a public signup route and an
`studio.signup_consumer` RPC wrapping `platform.provision_tenant`.

**3. A `studio` schema (migrations 0046+).** Characters, scenes, generations,
favourites, the credit ledger, moderation events and age/terms acceptance. Same
conventions as every other schema: forced RLS, no direct write grants, `SECURITY
DEFINER` RPCs, audit triggers, pgTAP coverage, a `-- rollback:` block.

**4. Credits as an append-only ledger.** No editable balance column, ever. Balance is
`sum(credits)` over `studio.credit_transactions`, and a generation moves
`reserved → spent | refunded` through RPCs that are idempotent on a request key.
Brief §15's rule — never charge for a failed generation — is enforced by the database,
not by remembering to call a refund function. Reservation happens **before** the
provider call; settlement happens after the output passes safety review.

**5. Provider abstraction, extending the pattern already here.** Two new interfaces
alongside the existing `AiProvider` / `PaymentProvider`:
`ImageGenerationProvider` (`generate(...) → {url, provider, model, seed, latencyMs, costUsd, moderation, metadata}`)
and `ModerationProvider` (`classify(text | image) → {decision, categories, provider}`).
Credentials resolve from Vault by reference, exactly as `ai-gateway` does. New edge
functions: `studio-generate` (the orchestrator of brief §15's 15 steps) and
`studio-moderate`. Every generation writes an `ai.runs`-style cost row so §27's
gross-margin metric is computed from real numbers, not estimates.

**6. Safety enforced in the schema.** `declared_age integer not null check (declared_age >= 18)`
— a character under 18 is not a policy violation, it is a constraint violation.
Moderation runs at prompt submit, before credit reservation, and again on output before
the asset is stored; every decision writes a `studio.moderation_events` row with the
classification and provider. **V1 accepts no user-uploaded photographs at all** — the
brief prohibits real-person sexualization (§4) and the cheapest way to guarantee that
is to have no upload path to prohibit. Identity conditioning uses only the
system-generated reference portrait. No public URLs, no share links: images are served
through short-lived signed URLs from the private bucket.

**7. Styling — a deliberate deviation from the brief.** Brief §23 asks for Tailwind.
This repository has no Tailwind and six apps' worth of hand-written CSS-token
convention. Adding Tailwind for one app means a new catalog pin, a new build step and
two styling idioms in one monorepo. **I propose matching house style** (dark premium
tokens in `globals.css` + a local `ui.tsx`), which reaches the same visual target.
Say the word if you want Tailwind instead — it is a 30-minute change now and a painful
one later.

**8. Registration in the truth surfaces.** `packages/catalog/src/registry.ts` gets a
`prod.characterstudio` entry, and `apps/control-center/src/lib/registry.ts` gets a
portfolio row. It stays `not-started` until it has code — that rule is not bent for a
new product.

---

## C. File plan

Created:

```
apps/character-studio/                     Next.js app (port 4700)
  src/app/                                 landing, signup, age-gate, dashboard,
                                           characters/*, studio/*, library/*, credits/*,
                                           account/*, admin/*, api/*
  src/app/globals.css                      dark premium tokens
  src/components/ui.tsx                    local primitives (house pattern)
  src/lib/{supabase,session,authz,signed-urls}.ts
  src/middleware.ts                        auth gate + nonce CSP (pattern from
                                           apps/venture-studio/src/middleware.ts)
  package.json, tsconfig.json, next.config.ts, README.md

packages/character-studio/                 pure domain logic, no I/O, unit-tested
  src/prompt-composer.ts                   brief §14 — the only place a prompt is built
  src/character.ts, src/scene.ts           option vocabularies + validation
  src/credits.ts                           ledger arithmetic, reserve/settle/refund rules
  src/safety.ts                            deterministic pre-moderation rules (age,
                                           prohibited-term classes, real-person names)
  src/*.test.ts

supabase/migrations/                       0046–0051 (see §D)
supabase/tests/                            46–51_*.sql pgTAP suites
supabase/functions/studio-generate/        orchestrator
supabase/functions/studio-moderate/
supabase/functions/_shared/studio/         provider.ts, moderation.ts, mock.ts
supabase/functions/_shared/billing/stripe.ts   first real PaymentProvider adapter

docs/products/characterstudio/             this file + build reports
```

Modified: `pnpm-workspace.yaml` (catalog pins), `.env.example` + `packages/config/src/env.ts`
(new variables, correctly classified), `packages/catalog/src/registry.ts`,
`apps/control-center/src/lib/registry.ts`, `.hlbos/migration-lineage.json`,
`.hlbos/milestone.json`, `supabase/functions/billing-webhook/index.ts` (activate the
Stripe adapter).

---

## D. Database plan

Six migrations, ordinals continuing from 0045. Each carries a `-- rollback:` block and
a pgTAP suite; none is applied to any project without explicit approval.

| Migration                        | Contents                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0046_studio_foundation`         | `studio` schema; `studio.accounts` (age-verified-at, terms version + timestamp, content-policy acceptance, account status); `studio.signup_consumer` RPC (personal tenant + owner membership); studio permission keys + role seeds                                                                         |
| `0047_studio_characters`         | `studio.characters` — `declared_age` with the `>= 18` CHECK, appearance/style/personality JSONB, base + negative prompt, reference file id (FK to `storage_meta.files`), identity + provider metadata, status. Forced RLS, definer write RPCs                                                              |
| `0048_studio_scenes_generations` | `studio.scenes` (reusable templates, character-independent per brief §18); `studio.generations` (provider, model, prompt, seed, output/thumbnail file ids, status, safety_status, `generation_cost`, `credits_charged`, `latency_ms`); `studio.favorites`                                                  |
| `0049_studio_credits`            | `studio.credit_transactions` (append-only; the 7 types from brief §20), `studio.balance(tenant)`, `studio.reserve_credits`, `studio.settle_generation`, `studio.refund_generation`. Idempotency key unique per request. A negative resulting balance raises                                                |
| `0050_studio_moderation`         | `studio.moderation_events` (input type, source text hash + text, classification, reason, provider, metadata); `studio.block_reasons` reference data; trigger enforcing that a `succeeded` generation has a passing output-review row — a generation cannot be marked successful without its safety verdict |
| `0051_studio_billing_plans`      | Seeds `billing.products` / `plans` / `plan_prices` for Starter / Creator / Pro / credit packs, and `entitlements.features` for per-plan limits, so pricing and credit costs are **data, not code** (brief §19). Extends `billing.reconcile_entitlements` to allocate monthly credits on renewal            |

---

## E. External dependencies

| Dependency                | Why                                                                                | Status                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `stripe` (server SDK)     | Webhook signature verification + Checkout. Only inside the adapter and the edge fn | **Blocked on H-1** — see the risk list before we write a line against it                               |
| Image generation provider | The product. Must support identity conditioning (IP-Adapter / InstantID class)     | **Blocked on H-2.** Candidate set is small and most mainstream APIs prohibit this content in their AUP |
| Moderation provider       | Prompt, upload and output classification                                           | **Blocked on H-2** for the same reason — most vendors' AUP forbids the traffic being classified        |
| (none for UI)             | House-style CSS, no component library, no Tailwind                                 | Nothing added                                                                                          |

Nothing else. No new UI dependency, no ORM, no state library — the platform pattern is
server components plus definer RPCs, and it does not need them.

---

## F. Risk list

Engineering risks first, then the four that can end the project. I am an engineer, not
your lawyer — the legal items are flagged for counsel, not opinions.

**Generation-provider dependency (high).** Identity-preserving generation is the
product. If the chosen provider changes its policy, we lose the product overnight — the
same class of event that the `ImageGenerationProvider` abstraction exists to survive.
Mitigation: two adapters live from day one, and the reference portrait, seed and
conditioning metadata stored per character so a character can be re-derived on a second
provider.

**Character consistency (high, and it is a product risk, not a bug).** Reference-image
conditioning gives _recognisable_, not _identical_. Brief §38 requires "visually
recognizable character consistency" — that is a judgement call, and we should agree what
passes before we build it. I propose a fixed 20-character × 5-scene evaluation set,
scored by you, as the acceptance gate for Step 10.

**Inference and storage cost (medium).** Every generation costs real money and every
image is stored privately and forever. Mitigation: cost recorded per generation from the
provider response (never estimated), margin computed per §27, retention class on every
stored object, and a hard per-tenant budget check reusing the `ai.budgets` pattern.

**Moderation false-negative risk (high).** A conservative classifier still fails. The
architecture's answer is defence in depth — deterministic rules, provider classification,
output review, and a constraint that a generation cannot be marked succeeded without a
recorded verdict — plus a takedown and audit path from day one.

**Contamination of the group (high, non-technical).** Shared repo, shared CI, shared
Supabase project or shared processor account all mean this product's problems become
HSCS's and HLD's problems. Isolation is the mitigation, and it is decision H-1.

**Payment processing (project-ending if wrong).** Stripe's restricted-business list names
adult content. This is not a "build it and find out" item: an account terminated after
launch takes the subscriber base with it, and if it is the group's account it takes the
other businesses' revenue too. **This needs written confirmation from a processor before
Step 15, and I would not build the billing integration against an unconfirmed processor.**

**Generation-provider AUP (project-ending if wrong).** Most hosted inference APIs
prohibit sexual content in their acceptable-use policies. The providers that permit it
are smaller and concentrate key-man risk. Confirm permission in writing before Step 7.

**Age verification (legally material).** A self-declared "I am 18+" checkbox is what the
brief specifies (§8), and it is likely insufficient in several jurisdictions: a growing
number of US states now require actual age verification for sites with substantial adult
material (Texas's law was upheld in _Free Speech Coalition v. Paxton_, June 2025), and
the UK Online Safety Act's age-assurance duties took effect in July 2025. Architectural
consequence: the age gate must be an **interface** with a swappable provider, not a
checkbox hard-coded into signup — otherwise retrofitting verification means touching
every route. I will build the interface either way; whether we ship a verification
provider at launch is a business/legal call.

**NCII / takedown obligations (legally material).** The federal TAKE IT DOWN Act's
notice-and-removal duties for covered platforms are in force. Even with no public
gallery, we need a reachable reporting contact and a logged removal path with a
defensible clock. Cheap to build now, expensive to retrofit. Counsel should also confirm
the 18 U.S.C. §2257 position for purely synthetic imagery.

---

## G. MVP build sequence

The brief's 20 steps, ordered against this repository's actual dependencies. Steps 0
and 0a are additions — they are the gates, and everything after them assumes they cleared.

| #      | Step                                                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0**  | **Decisions H-1..H-4 resolved.** Processor and inference-provider permission confirmed in writing                                                                |
| **0a** | Isolation set up per H-1: target Supabase project, secrets in Vault, CI target                                                                                   |
| 1      | App shell — `apps/character-studio`, catalog pins, `.env.example` + `env.ts`, landing page (brief §7), CI green                                                  |
| 2      | Migrations 0046–0048 + pgTAP: schema, characters, scenes, generations. Validated from scratch, applied nowhere                                                   |
| 3      | Consumer signup, age gate, terms acceptance (recorded, versioned), personal-tenant provisioning                                                                  |
| 4      | Dashboard (brief §9) — honest empty states, no invented metrics                                                                                                  |
| 5      | Character Builder UI + the Prompt Composer in `packages/character-studio` (pure, unit-tested)                                                                    |
| 6      | `ImageGenerationProvider` + `ModerationProvider` interfaces and a **mock adapter**; the whole flow works end-to-end on the mock before any vendor money is spent |
| 7      | First real provider adapter; reference-portrait generation (4-image grid, brief §11)                                                                             |
| 8      | Character save + reproducibility metadata; private storage via `storage_meta` and signed URLs                                                                    |
| 9      | **Consistency workflow + the 20×5 evaluation gate.** This is the go/no-go on the product thesis, and it comes before Scene Studio deliberately                   |
| 10     | Scene Studio (brief §13) + saved scene templates (§18)                                                                                                           |
| 11     | Results screen, private library, delete, favourites                                                                                                              |
| 12     | Migration 0049 + credit ledger wired into the generation orchestrator; failure-refund proven by test, not by claim                                               |
| 13     | Migration 0050 + full moderation pipeline at all three points                                                                                                    |
| 14     | Migration 0051 + Stripe adapter, checkout, webhook, entitlement reconciliation                                                                                   |
| 15     | Admin panel (brief §25) reusing the executive-portal read-only pattern                                                                                           |
| 16     | Analytics events (§26) on the existing `events` outbox; MVP metrics (§27) computed from real rows                                                                |
| 17     | Account deletion, content deletion, takedown path                                                                                                                |
| 18     | Mobile QA                                                                                                                                                        |
| 19     | Production deployment behind the existing approval gates                                                                                                         |

---

## H. What I need from you

Four decisions. The first two are blocking; the second two only need answering by the
step that uses them.

**H-1 — Isolation.** Do we launch this on its own Supabase project and its own payment
account, kept away from HSCS and HLD? _My recommendation: yes, and a standalone
repository too. The code reuse we want is at the package level and survives the split;
the risk we are avoiding is a processor freezing the group's revenue over one product._

**H-2 — Vendor permission.** Before Step 7, we need written confirmation from an
inference provider and a payment processor that they permit this content. I can prepare
both enquiries; I cannot sign them.

**H-3 — Styling.** House CSS (my recommendation) or add Tailwind to the monorepo?

**H-4 — Consistency bar.** Do you accept the 20-character × 5-scene evaluation set,
scored by you, as the definition of "recognisably the same character"? If the bar is
different, I need it before Step 9, not after.

---

_Per brief §37, I stopped here and wrote no application code. This document is the
deliverable of that instruction, not a substitute for shipping — note that it sits in
tension with `CLAUDE.md`'s "never end a session with a plan". The brief was explicit, so
the brief won; say go and Step 1 is a working, CI-green app shell._

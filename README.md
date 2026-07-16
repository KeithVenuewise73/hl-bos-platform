# hl-bos-platform

**HL-BOS** — the Herman Legacy Business Operating System. The reusable, multi-tenant AI business platform that Herman Legacy Software Ventures' vertical products are assembled from.

> **Status: Core v1, Phase 1 (repository and tooling foundation).**
> There is no database schema, no application and no deployed platform code yet. Phase 2 is blocked on an owner decision — see [Current state](#current-state).

---

## What this is

HL-BOS exists so that Salon AI, Landscape AI, Plumber AI, FleetHuddle, the HSCS Government Logistics Platform and future verticals do not each rebuild authentication, tenancy, billing, communications, AI integration, workflows, reputation management, audit and administration.

Shared capability is built **once**, in `packages/`. Verticals are **assembled** from module activation, feature entitlements and configuration — not copied.

## Current state

**Read [`docs/architecture/current-state-audit.md`](docs/architecture/current-state-audit.md) before doing anything.** The short version:

The production Supabase project is **not greenfield**. It already carries 52 applied migrations, 156 tables across four schemas (`hlvs`, `hscs_glp`, `public`, `dpi`), 9 deployed Edge Functions and **two incompatible multi-tenancy models** — none of which are in this repository. HL-BOS is therefore a **brownfield consolidation**, not a clean build.

Two decisions gate further work:

| Decision                                       | Blocks  | Status   |
| ---------------------------------------------- | ------- | -------- |
| Where HL-BOS lives (additive / new / refactor) | Phase 2 | **Open** |
| Whether to remediate SEC-1 and SEC-2 first     | Phase 2 | **Open** |

The audit also records two live security findings in the existing production database. They are pre-existing and outside Core v1 scope, but SEC-1 is remotely exploitable today.

## Repository layout

```
apps/        Next.js applications (admin, portal, verticals)   -- none yet
packages/    Shared platform capability
  config/    Validated + classified environment configuration   <- the only package so far
supabase/    config.toml, migrations, functions, seed.sql
docs/        architecture, security, modules, operations, decisions
scripts/     CI guard scripts
.github/     CI workflows
```

**Packages are added by the phase that gives them a real responsibility.** The target structure names 14 packages; creating them empty now would make the tree look complete while carrying nothing. Only `@hl-bos/config` exists today because only it has a job today.

## Quick start

Requires **Node >= 22** and **pnpm >= 10** (`corepack enable` will provide pnpm).

```bash
pnpm install
pnpm check      # format:check + lint + typecheck + test
```

Individually:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Documentation

| Doc                                                             | Purpose                                                        |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| [Current state audit](docs/architecture/current-state-audit.md) | What is actually deployed today, and what is wrong with it     |
| [Target architecture](docs/architecture/target-architecture.md) | Where we are going, impact report, migration and security plan |
| [Dependency policy](docs/architecture/dependency-policy.md)     | Why the versions are pinned where they are                     |
| [CONTRIBUTING](CONTRIBUTING.md)                                 | Branching, commits, review standards                           |
| [SECURITY](SECURITY.md)                                         | Security model and reporting                                   |

## Non-negotiables

1. **Multi-tenant by design.** Every tenant-owned record carries an enforceable `tenant_id`.
2. **Secure by default.** RLS on every tenant table. Access denied unless explicitly granted. Service-role credentials never reach a browser.
3. **Version-controlled infrastructure.** Schema, policies, functions and Edge Functions ship as reviewed migrations in this repo. Ad-hoc SQL is never the source of truth.
4. **Human approval for sensitive actions.** AI does not autonomously send high-risk messages, change billing, publish public responses or submit bids.
5. **Ethical reputation management.** No fabricated reviews, no suppressed criticism, no review-gating by predicted sentiment. Enforced in the schema, not just in policy prose.
6. **Honest instrumentation.** Never record a run, message, payment or metric that did not happen.

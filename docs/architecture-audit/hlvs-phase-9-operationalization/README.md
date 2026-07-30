# Phase IX — Executive Portal Operationalization, Enterprise Asset Recovery & Application Registry

**For:** Keith Herman, CEO · **Date:** 2026-07-30 · **Branch:** `claude/hlvs-architectural-assessment-ltqs1b`
**Status:** Built, tested, **not deployed, not merged** — awaiting CEO approval.

---

## Executive summary

Phase IX turned the Executive Portal into the **CEO's daily operating system** and put **every Herman Legacy software asset under governance** — reusing the existing engines, authentication, authorization, catalog and UI, with **no new intelligence engine and no duplicated logic**.

What now exists (read-only, on this branch):

- A **new CEO Home dashboard** as the default landing page: platform health, active development, pending approvals, Software Factory status, application health, transformation & government summaries (role-gated), enterprise alerts, an AI recommendation summary, and an honest revenue placeholder.
- A **CEO Task Center** — one queue aggregating approvals, PRs, deployment requests, government bid reviews, transformation reviews, Software Factory recommendations and platform alerts, each labelled with its provenance (live / sample / not-connected).
- A **Global Search** across applications, catalog assets, modules, government opportunities and transformation recommendations (role-aware).
- A **Platform Status** page for every named system, with honest deployment/health/version/dependencies (systems that don't exist yet say so).
- An **Enterprise Application Registry** — every application, governed, in `@hl-bos/catalog`; a test proves no workspace app exists outside it.
- **Navigation reorganized** around executive workflow: Command · Intelligence · Factory & Catalog · Governance · Platform.

Everything is **read-only**, keeps the **same 5-role security model**, exposes **no command surface**, and **fabricates nothing** — unverifiable facts are shown as unknown.

**Quality gates:** format ✅ · lint ✅ · typecheck ✅ · **185 tests ✅** · production build ✅ (22 routes).

---

## Task 0 headline (see [01-enterprise-asset-recovery-report.md](01-enterprise-asset-recovery-report.md))

- **12 repositories**, **2 reachable Supabase projects**, **9 GitHub Pages sites + 1 Vercel app**.
- **The original HLVS Venture Studio was NOT found** as an accessible repo or reachable Supabase project — recorded honestly as legacy/unreachable.
- **Zero production deployments** from the monorepo (the `Deploy` workflow has never run).
- **HSCS-GLP** (private) is the real Government Logistics platform — a convergence candidate.

### Recovered production URLs (verified)

| Application                    | Production URL                               |
| ------------------------------ | -------------------------------------------- |
| Herman Legacy Group            | https://hermanlegacygroup.com                |
| Herman Legacy Foundation       | https://hermanlegacyfoundation.org           |
| DDH Home Services              | https://ddhhomeservices.com                  |
| HomeHuddle                     | https://venuewise.net                        |
| 5 Star Sports Media            | https://5starsportsmedia.com                 |
| 5 Star Community Events        | https://5starcommunityevents.com             |
| Laurie & Lew Community Network | https://laurieandlewcommunitynetwork.org     |
| CoachesHuddle (Chris Mazzu)    | https://coaches-huddle-chrismazzu.vercel.app |
| 5 Star Growth Solutions        | GitHub Pages — domain unverified (⚠)         |
| Herman Supply Chain            | GitHub Pages — domain unverified (⚠)         |

### Recovered staging URLs

**None.** No staging environment exists for any asset.

### Recovered local development URLs

| App              | Local URL                                                |
| ---------------- | -------------------------------------------------------- |
| Executive Portal | http://localhost:4300                                    |
| HL-BTI           | http://localhost:4200                                    |
| HL-BTI Alpha     | http://localhost:4100                                    |
| Control Center   | `scripts\control-center.bat` (localhost only, by design) |

---

## Deliverables index

| #   | Deliverable                                 | Where                                                                                                    |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Executive Summary                           | this file                                                                                                |
| 2   | Enterprise Asset Recovery Report            | [01-enterprise-asset-recovery-report.md](01-enterprise-asset-recovery-report.md)                         |
| 3   | Recovered Application Inventory             | [01](01-enterprise-asset-recovery-report.md) §3–5 + the Application Registry                             |
| 4   | Application Registry                        | `packages/catalog/src/app-registry.ts` + [02](02-application-registry-and-architecture.md)               |
| 5   | Architecture Summary                        | [02-application-registry-and-architecture.md](02-application-registry-and-architecture.md)               |
| 6   | Updated Navigation Diagram                  | [02](02-application-registry-and-architecture.md) §Navigation                                            |
| 7   | Security Review                             | [03-security-testing-quality.md](03-security-testing-quality.md)                                         |
| 8   | Testing Summary                             | [03](03-security-testing-quality.md)                                                                     |
| 9   | Quality Gate Results                        | [03](03-security-testing-quality.md)                                                                     |
| 10  | Deployment Readiness Assessment             | [04-deployment-readiness-and-ceo-recommendations.md](04-deployment-readiness-and-ceo-recommendations.md) |
| 11  | CEO Recommendations                         | [04](04-deployment-readiness-and-ceo-recommendations.md)                                                 |
| 12  | Recovered production / staging / local URLs | this file (above) + [01](01-enterprise-asset-recovery-report.md) §4                                      |

**Stop conditions honored:** no production deployment, no database migration, no DNS change, no authentication change, no business-logic change, no customer-data change. **Not merged.** Awaiting CEO approval.

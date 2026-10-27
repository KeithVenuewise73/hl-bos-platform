# Herman Legacy Digital — Agency Launch Package (DRAFT)

**For:** Keith Herman, CEO · **Author:** Claude (engineering) · **Date:** 2026-10-27
**Branch:** `claude/hld-agency-launch-package` (staging, not merged)

Herman Legacy Group is the parent; Herman Legacy Digital is HLG's own operating digital agency.
This package assembles the agency from assets that already exist. It is documentation only:
no code, schema, deployment, DNS or price was changed, and nothing was published or sent.

| #   | Document                                                                   | What it holds                                                                                                                 |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 01  | [Agency Readiness Report](01-agency-readiness-report.md)                   | Inventory of 14 repositories plus deployments; sections A–G (assets, fastest path, reuse, gaps, risks, 7-day plan, decisions) |
| 02  | [Service Catalog and Website Care](02-service-catalog-and-website-care.md) | Service descriptions with **DRAFT** prices; defined website-care scope; monthly report template                               |
| 03  | [Sales Kit](03-sales-kit.md)                                               | Inquiry questions, 8-stage lead pipeline, proposal outline                                                                    |
| 04  | [Onboarding and Launch Checklists](04-onboarding-and-launch-checklists.md) | Client onboarding checklist; agency launch checklist with Keith/engineering owners                                            |

**Every price is a draft.** None is entered in `sales.prices`; catalog rows remain `pending-ceo`.

**Merging this folder to `main` redeploys hermanlegacydigital.com.** Coolify rebuilds the site on
every `main` commit. The site content would not change, because these are docs only, but the
redeploy also clears its log-only leads (see the readiness report, finding 3).

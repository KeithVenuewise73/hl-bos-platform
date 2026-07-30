# Application Registry & Architecture Summary — Phase IX

## The Enterprise Application Registry

**Location:** `packages/catalog/src/app-registry.ts` (governed by the Enterprise Catalog; surfaced read-only at `/applications`).

**Rule enforced:** _no application exists outside this registry._ The test `reconcileWorkspaceApps` fails if any `apps/*` directory has no record.

Each record carries every field the CEO asked for: **Application Name, Description, Repository, Owner, Executive Owner, Current Branch, Environment, Development Status, Deployment Status, Production URL, Staging URL, Local URL, Supabase Project, Version, Health, Dependencies, Reusable Modules, Software Factory Integration.**

### Registered applications (16)

| Application                    | Category          | Repo / Branch                                         | Deployment                 | Production URL                           |
| ------------------------------ | ----------------- | ----------------------------------------------------- | -------------------------- | ---------------------------------------- |
| HL-BOS (platform)              | platform          | hl-bos-platform / main                                | DB live                    | —                                        |
| Executive Portal               | executive_tooling | hl-bos-platform / feat/herman-legacy-executive-portal | **not deployed**           | —                                        |
| Control Center                 | executive_tooling | hl-bos-platform / main                                | localhost only (by design) | —                                        |
| HL-BTI App                     | vertical_product  | hl-bos-platform / main                                | not deployed               | —                                        |
| HL-BTI Alpha                   | vertical_product  | hl-bos-platform / main                                | not deployed               | —                                        |
| HSCS-GLP (Gov Logistics)       | government        | HSCS-GLP (private) / main                             | unknown                    | —                                        |
| Herman Legacy Group            | web_property      | hermanlegacygroup / main                              | GitHub Pages               | https://hermanlegacygroup.com            |
| Herman Legacy Foundation       | web_property      | hermanlegacyfoundation / main                         | GitHub Pages               | https://hermanlegacyfoundation.org       |
| DDH Home Services              | web_property      | ddhhomeservices.com / main                            | GitHub Pages               | https://ddhhomeservices.com              |
| HomeHuddle                     | web_property      | homehuddle / main                                     | GitHub Pages               | https://venuewise.net                    |
| 5 Star Sports Media            | web_property      | 5star-sports-media / main                             | GitHub Pages               | https://5starsportsmedia.com             |
| 5 Star Community Events        | web_property      | 5starcommunityevents / main                           | GitHub Pages               | https://5starcommunityevents.com         |
| Laurie & Lew Community Network | web_property      | laurieandlewcommunitynetwork / main                   | GitHub Pages               | https://laurieandlewcommunitynetwork.org |
| 5 Star Growth Solutions        | web_property      | 5stargrowthsolutions / main                           | GitHub Pages               | ⚠ domain unverified                      |
| Herman Supply Chain            | web_property      | herman-supply-chain / main                            | GitHub Pages               | ⚠ domain unverified                      |
| HLVS Venture Studio (legacy)   | legacy            | not found                                             | unknown                    | — (unreachable)                          |

Honesty: `health` is `unknown` wherever it was not probed; production URLs are verified from repo CNAMEs/homepages or left blank.

---

## Architecture summary

Phase IX added **no new engine**. It is a thin, read-only operational layer that composes what already exists:

```
apps/executive-portal (read-only, Supabase-Auth, 5 roles, no command surface)
   ├─ src/lib/authz.ts ............ pure role×view matrix + nav groups (Phase IX: +5 views, +groups)
   ├─ src/lib/session.ts .......... server-only viewer (fail-closed, publishable key only)
   ├─ src/lib/portal-data.ts ...... re-exports @hl-bos/catalog (incl. NEW app-registry)
   ├─ src/lib/operations-data.ts .. NEW: honest aggregation (approvals, alerts, systems)
   ├─ src/lib/intelligence-data.ts  Phase VIII: @hl-bos/transformation-intelligence over SAMPLE input
   └─ src/app/* ................... CEO Home (/), Task Center, Global Search, Platform Status,
                                     Application Registry, + Phase VII/VIII views
        │
        ├── @hl-bos/catalog ........ Enterprise Catalog + Software Factory + Application Registry
        └── @hl-bos/transformation-intelligence
                 └── @hl-bos/bti-engine (scoring, consulting, government)
```

**Reuse ledger (what Phase IX reused, not rebuilt):**

- **Authentication / authorization:** the existing `session.ts` + pure `authz.ts` matrix (extended, not replaced).
- **UI:** the existing `components/ui.tsx` (Card/Tile/Row/Bar/Dot/Grid/Empty) — no new component library.
- **Software Factory / Catalog:** `@hl-bos/catalog` (`executiveReadiness`, `assembleAll`, `search`).
- **Intelligence:** `@hl-bos/transformation-intelligence` (Phase VIII), over a labelled sample.
- **Governance:** the Enterprise Catalog `completeness` model, mirrored by the new app-registry reconciliation.

**New, non-duplicative code:** `app-registry.ts` (data + reconciliation), `operations-data.ts` (aggregation), and five read-only pages. No business logic, no writes, no command surface.

---

## Navigation (updated)

Reorganized from a flat developer list into **five executive workflow groups** (`NAV_GROUPS` in `authz.ts`; rendered grouped by `PortalShell`):

```
Command         │ CEO Home · Task Center · Global Search
Intelligence    │ Transformation Intelligence · Government Contracts
Factory & Catalog│ Software Factory · Enterprise Catalog · Module Registry ·
                │ Product Compositions · Product Readiness · Product Portfolio
Governance      │ Application Registry · Commercial Readiness · CEO Decisions · Deployment Status
Platform        │ Platform Status · Platform Health · Asset Relationships · Enterprise Overview
```

Each group only shows the views the viewer's role may see (owner sees all five groups; a read-only auditor sees Command/Factory/Platform non-sensitive views only). The old flat "Executive Dashboard" became **Enterprise Overview** under Platform; **CEO Home** is the new default landing at `/`.

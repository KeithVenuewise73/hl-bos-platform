# XI-2E · Estate inventory & deployment-ownership map

**Read-only.** Every remote fact was gathered with `list_projects`, `list_branches`,
`list_migrations`, and read-only catalog/stat `select`s. No system was modified.
Confidence tags: **[V]** verified · **[SI]** strongly inferred · **[U]** unverified · **[C]** contradicted-prior-claim.

## 1. Supabase estate

Organization: **Herman Legacy Software Ventures** (`ihtsbcxtvkbfkkpmforp`). **[V]**

| Project / branch                | Ref                    | Region    | Migrations                                   | Role                                                                                                                          | Confidence                             |
| ------------------------------- | ---------------------- | --------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **HL-BOS Core** (production)    | `mvvtngiopdrgiedjmhfb` | us-west-2 | **27** (this repo's lineage, 0001–0027)      | **Canonical production.** Runs the platform lineage.                                                                          | **[V]**                                |
| ↳ branch `main`                 | `mvvtngiopdrgiedjmhfb` | —         | (default branch)                             | Default branch of production.                                                                                                 | **[V]**                                |
| ↳ branch `hlbos-m1-portfolio`   | `moftgnrbnsixeddcwdpz` | —         | **29** (portfolio/govcon lineage, 0001–0029) | **Abandoned stale artifact** of a superseded early milestone. `with_data=false`, `persistent=false`.                          | **[V]** lineage · **[SI]** "abandoned" |
| keith@venuewise.net's Project   | `ywrzgursvdowzyhipsmt` | us-east-1 | **0** (empty)                                | Parked/empty. ADR-0001: not canonical, do not delete, do not develop on.                                                      | **[V]**                                |
| Legacy "Herman Legacy Platform" | `bkfsjhhclbqrhaolvhmz` | —         | unreachable                                  | Legacy monolith (hlvs/hscs_glp/dpi/public, ~156 tables). Not in the accessible org; open security findings. **Out of scope.** | **[SI]** from repo docs; not reachable |

Only **two** projects are reachable (`mvvtngiopdrgiedjmhfb`, `ywrzgursvdowzyhipsmt`). The
legacy ref is referenced only in repo docs and is unreachable from this session.

## 2. Repository estate (GitHub `KeithVenuewise73`, 12 repos)

| Repo                                                                                                   | Vis     | Lang    | What it is                                                                                                         | Relevance                                                                                                            | Conf                        |
| ------------------------------------------------------------------------------------------------------ | ------- | ------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **hl-bos-platform**                                                                                    | private | PLpgSQL | "Core AI Business Operating System powering Herman Legacy Software Ventures and all vertical AI applications."     | **The canonical platform repo** (this repo). Produces production `mvvtngiopdrgiedjmhfb`.                             | **[V]**                     |
| **HSCS-GLP**                                                                                           | private | TS      | "AI-powered Government Logistics Intelligence and Contract Management Platform for Herman Supply Chain Solutions." | **Likely origin of the govcon lineage** on the stale branch. Out of this session's GitHub scope — **not inspected**. | **[SI]**                    |
| herman-supply-chain                                                                                    | public  | HTML    | Supply-chain marketing site                                                                                        | Vertical/marketing                                                                                                   | **[V]**                     |
| coaches-huddle-chrismazzu                                                                              | public  | TS      | Venuewise vertical; **live on Vercel** (`coaches-huddle-chrismazzu.vercel.app`)                                    | The one genuinely-live app URL in the estate                                                                         | **[V]** (per repo registry) |
| homehuddle, ddhhomeservices.com, hermanlegacygroup, hermanlegacyfoundation, laurieandlew…, 5star… (×3) | public  | HTML    | Venuewise-powered marketing/vertical sites                                                                         | Not platform backends                                                                                                | **[V]**                     |

**GitHub scope note:** this session is scoped to `keithvenuewise73/hl-bos-platform`. A
read attempt on `HSCS-GLP` was denied (out of scope); I did not add it, per read-only
discipline. Its role as the govcon origin is therefore **[SI]**, not **[V]**.

## 3. Deployment-ownership map

| Layer                 | Owner / target                                                                                                              | Status                                                                    | Evidence                                              | Conf    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------- | ------- |
| Canonical DB          | `mvvtngiopdrgiedjmhfb` (HL-BOS Core)                                                                                        | **Schema live** (27 migrations)                                           | ADR-0001; `app-registry.ts:71` `CORE=…`; direct query | **[V]** |
| Canonical repo        | `KeithVenuewise73/hl-bos-platform` (branch `main`, protected)                                                               | Active                                                                    | `registry.ts` (`"canonical"`); ADR-0001               | **[V]** |
| Remote migration path | `.github/workflows/db-migrate.yml` (manual, `production` env-gated)                                                         | **Inert** until CEO arms `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` | workflow header                                       | **[V]** |
| Edge-function deploy  | `.github/workflows/deploy.yml` (manual) → `ai-gateway, events-dispatcher, billing-webhook`                                  | **Inert / 0 deployed**                                                    | workflow; `registry.ts` "0 deployed"                  | **[V]** |
| App hosting           | Coolify Dockerfiles for `hl-bti` (→ `bti.hermanlegacygroup.com`) and `executive-portal` (→ `control.hermanlegacygroup.com`) | **Not deployed**; `bti.hermanlegacygroup.com` does not resolve            | Dockerfiles; `hl-bti/DEPLOYMENT.md`; IAT-001          | **[V]** |
| CI                    | `.github/workflows/ci.yml`                                                                                                  | Local-stack tests only; **no remote write**                               | workflow                                              | **[V]** |
| Config exposure       | `supabase/config.toml` exposes only `schemas=["public"]`                                                                    | Core schemas not HTTP-exposed                                             | config.toml                                           | **[V]** |

**Operational-data reading of production** (planner stats + exact small counts, no data
content): `auth.users = 1`, `identity.memberships = 1`, `identity.platform_admins = 1`,
`identity.permissions ≈ 52`, `identity.role_permissions ≈ 280`; **all 124 module tables
estimate ≈ 0 rows.** **[V]** → production carries a **single bootstrap owner + seeded
reference/permission data and no customer operational data.** (Estimates are planner
statistics, not guaranteed exact for the module tables; the identity/auth counts are exact.)

## 4. What is actually deployed (whole estate)

- **Deployed & live:** only `coaches-huddle-chrismazzu` (Vercel, a Venuewise vertical). **[V]**
- **Schema-live, no runtime, ~no data:** HL-BOS Core production DB. **[V]**
- **Built, not deployed:** executive-portal, hl-bti, hl-bti-alpha (Dockerfiles exist; 0 deploy runs). **[V]**
- **Local-only by design:** control-center. **[V]**
- **Unreachable/out of scope:** legacy `bkfsjhhclbqrhaolvhmz`; `HSCS-GLP` runtime. **[SI]**

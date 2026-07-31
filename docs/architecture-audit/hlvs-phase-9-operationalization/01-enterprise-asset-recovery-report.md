# Enterprise Asset Recovery Report — Phase IX

**For:** Keith Herman, CEO · **Date:** 2026-07-30 · **Mode:** Inventory only — no deployment modified, nothing redeployed.

## How this inventory was produced (and its limits)

This report is built **only from sources this session can actually reach and verify**:

- **GitHub** (authenticated as `KeithVenuewise73`) — repository list, branches, Actions workflows and run history, and public file contents (CNAMEs).
- **Supabase** (org `Herman Legacy Software Ventures`) — the project list and database hosts.
- **The local monorepo** — apps, packages, deployment config.

**What could NOT be verified from here — and is therefore NOT invented:**

- **DNS registrar records, Coolify, Netlify** — no connected access. Not reported as fact.
- **Environment-variable values / secrets** — never read or printed.
- **Live health of external sites** — not probed; reported as `unknown`.
- **Private repo internals** (`HSCS-GLP`) — not in this session's scope; only public metadata is reported.

Where a value is unknown, it is stated as unknown. **No production URL, DNS record, or deployment was fabricated.**

---

## 1. HLVS (Original Venture Studio) — recovery result

**Not found as an accessible software asset.**

- **Repository:** none. No repo named `hlvs`, `venture-studio`, `visibility`, or similar exists under `KeithVenuewise73` (all 12 repos enumerated below).
- **Hosting / Production / Staging / Local URLs:** none found.
- **Deployment history / DNS / env vars / GitHub Pages / Coolify / Vercel / Netlify:** none found.
- **Supabase:** the legacy project ref `bkfsjhhclbqrhaolvhmz` (from prior audits) is **not** listed under the accessible Supabase org — it is unreachable from current credentials.
- **What survives:** the _patterns_ of the original Venture Studio were generalized into HL-BOS as the live `hlvs` schema (Software Factory, migration 0025). The legacy estate itself is **out of scope with open security findings — do not touch without an approved plan.**

> Conclusion: the original HLVS Venture Studio is a **legacy, unreachable** asset. It has been recorded as such in the Application Registry (`hlvs-venture-studio`, category `legacy`) rather than left as a rumor.

---

## 2. Supabase projects (verified)

Organization: **Herman Legacy Software Ventures** (`ihtsbcxtvkbfkkpmforp`).

| Project                       | Ref                    | Region    | Status                       | Notes                                                  |
| ----------------------------- | ---------------------- | --------- | ---------------------------- | ------------------------------------------------------ |
| **HL-BOS Core**               | `mvvtngiopdrgiedjmhfb` | us-west-2 | ACTIVE_HEALTHY (PG17)        | The canonical platform DB — 27 migrations, 17 schemas. |
| keith@venuewise.net's Project | `ywrzgursvdowzyhipsmt` | us-east-1 | ACTIVE_HEALTHY (PG17)        | Second project; no HL-BOS migrations applied here.     |
| _Legacy project_              | `bkfsjhhclbqrhaolvhmz` | —         | **NOT listed / unreachable** | Out of scope; open security findings.                  |

---

## 3. Repositories (verified — 12 total under `KeithVenuewise73`)

| Repo                         | Visibility | Pages | Homepage (GitHub)                    | Last push  | Role                                               |
| ---------------------------- | ---------- | ----- | ------------------------------------ | ---------- | -------------------------------------------------- |
| **hl-bos-platform**          | private    | no    | —                                    | 2026-07-30 | The core monorepo (this repo).                     |
| **HSCS-GLP**                 | private    | no    | —                                    | 2026-07-24 | Gov Logistics Intelligence & Contract Mgmt (HSCS). |
| coaches-huddle-chrismazzu    | public     | no    | coaches-huddle-chrismazzu.vercel.app | 2026-05-28 | CoachesHuddle (Venuewise) — **Vercel**.            |
| hermanlegacygroup            | public     | yes   | —                                    | 2026-06-26 | Group corporate site.                              |
| hermanlegacyfoundation       | public     | yes   | —                                    | 2026-06-26 | Foundation site.                                   |
| ddhhomeservices.com          | public     | yes   | —                                    | 2026-06-26 | DDH Home Services site.                            |
| homehuddle                   | public     | yes   | —                                    | 2026-07-04 | HomeHuddle (Venuewise).                            |
| herman-supply-chain          | public     | yes   | —                                    | 2026-06-18 | Herman Supply Chain site.                          |
| 5star-sports-media           | public     | yes   | —                                    | 2026-06-26 | 5 Star Sports Media site.                          |
| 5starcommunityevents         | public     | yes   | —                                    | 2026-06-26 | 5 Star Community Events site.                      |
| 5stargrowthsolutions         | public     | yes   | —                                    | 2026-06-26 | 5 Star Growth Solutions site.                      |
| laurieandlewcommunitynetwork | public     | yes   | —                                    | 2026-06-26 | Laurie & Lew Community Network.                    |

---

## 4. Production URLs (verified from repo CNAMEs / homepages)

| Application                    | Production URL                               | Source                       | Verified        |
| ------------------------------ | -------------------------------------------- | ---------------------------- | --------------- |
| CoachesHuddle (Chris Mazzu)    | https://coaches-huddle-chrismazzu.vercel.app | GitHub homepage              | ✅              |
| Herman Legacy Group            | https://hermanlegacygroup.com                | repo CNAME                   | ✅              |
| Herman Legacy Foundation       | https://hermanlegacyfoundation.org           | repo CNAME                   | ✅              |
| DDH Home Services              | https://ddhhomeservices.com                  | repo CNAME                   | ✅              |
| HomeHuddle                     | https://venuewise.net                        | repo CNAME (→ venuewise.net) | ✅              |
| 5 Star Sports Media            | https://5starsportsmedia.com                 | repo CNAME                   | ✅              |
| 5 Star Community Events        | https://5starcommunityevents.com             | repo CNAME                   | ✅              |
| Laurie & Lew Community Network | https://laurieandlewcommunitynetwork.org     | repo CNAME                   | ✅              |
| 5 Star Growth Solutions        | _Pages enabled; CNAME not captured_          | GitHub Pages flag            | ⚠ verify domain |
| Herman Supply Chain            | _Pages enabled; CNAME not captured_          | GitHub Pages flag            | ⚠ verify domain |

**Staging URLs:** none found for any asset. **Local development URLs:** only the monorepo apps run locally (Executive Portal `:4300`, HL-BTI `:4200`, HL-BTI Alpha `:4100`, Control Center via `control-center.bat`).

---

## 5. Deployment history & hosting (verified)

- **hl-bos-platform Actions:** 4 workflows — `CI`, `DB migrate (protected)`, `Deploy (protected)`, `Dependabot`.
  - **`Deploy (protected)` run history: 0 runs.** Nothing in the monorepo has ever been deployed to production.
  - `main` default branch; 18 branches total (feature + dependabot + prior `claude/*` sessions).
- **Hosting map:** GitHub Pages (9 static sites) · Vercel (1: CoachesHuddle) · Supabase (HL-BOS Core DB) · **Coolify/Netlify: none connected/verified.** The Executive Portal has a _Coolify config authored_ (Phase VII) but is **not deployed** (0 deploy runs).

---

## 6. Honest gaps (what the CEO must connect to complete this inventory)

1. **DNS registrar** — to confirm nameservers/records for each custom domain.
2. **Coolify / Netlify accounts** — to confirm there are no deployments outside GitHub Pages/Vercel.
3. **`HSCS-GLP` + `hl-bos-platform` private-repo scope** for the two unread CNAMEs and the government platform's hosting.
4. **Live site health** — a monitoring connection to report green/red instead of `unknown`.

Until connected, these remain honestly blank in the Application Registry rather than guessed.

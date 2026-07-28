# Checkpoint 8B — Legacy Asset Discovery: Reuse & Evidence Analysis

**Date:** 2026-07-27 · **Checkpoint:** 8B · **Method:** read-only inspection of the Herman Legacy GitHub estate + Supabase project enumeration. No migration, no production code, no changes to any legacy asset.

> **Covers required deliverables 1 (Legacy estate access report), 2 (Repository & branch inventory), 3 (GitHub Pages & static-site inventory), and 19 (Manual access requirements).** The full deliverable-to-file map is in the [Completion Report](74-checkpoint8b-completion-report.md) and the [architecture README](README.md).

## 0. Why this checkpoint exists

Checkpoint 8's "greenfield confirmed" applied **only** to the `hl-bos-platform` repository and the isolated DB objects inspected there. It must **not** be read as "Herman Legacy has no existing software estate." This checkpoint inspected the broader estate and found a **substantial, live legacy estate** — not greenfield.

## 1. Access report — what was reachable

| Channel                           | Result                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub account                    | `KeithVenuewise73` (id 286515266), 10 public + 2 private repos accessible this session                                                                                                          |
| GitHub MCP (scoped)               | Session GitHub scope was `hl-bos-platform` only; other repos brought in read-only via `add_repo` + shallow clone                                                                                |
| Supabase MCP token                | Enumerates **2** projects (org `ihtsbcxtvkbfkkpmforp`): `ywrzgursvdowzyhipsmt` (empty), `mvvtngiopdrgiedjmhfb` (HL-BOS Core). The Venuewise ecosystem backend is **not** in this token's scope. |
| Deep-cloned + inspected           | `5star-sports-media`, `homehuddle` (both public, static sites)                                                                                                                                  |
| Enumerated only (not deep-cloned) | 10 other repos (see §2)                                                                                                                                                                         |

## 2. Repository & branch inventory (evidence: `list_repos`, `git clone`)

| Repo                           | Vis.    | Last push  | Nature (verified where cloned)                                                                   |
| ------------------------------ | ------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `hl-bos-platform`              | private | 2026-07-27 | The new HL-BOS platform (this repo)                                                              |
| `HSCS-GLP`                     | private | 2026-07-24 | HSCS / Government Legacy Platform — **not cloned; deep inspection recommended**                  |
| `homehuddle`                   | public  | 2026-07-04 | **venuewise.net** — Venuewise Core / Huddle ecosystem hub (cloned, HEAD `c92f003`)               |
| `5star-sports-media`           | public  | 2026-06-26 | **5starsportsmedia.com** — sports-media static site + Academy + podcast (cloned, HEAD `1bd9bbf`) |
| `coaches-huddle-chrismazzu`    | public  | 2026-05-28 | A CoachesHuddle variant — **not cloned; recommend inspection**                                   |
| `hermanlegacygroup`            | public  | 2026-06-26 | HLG corporate site — not cloned                                                                  |
| `hermanlegacyfoundation`       | public  | 2026-06-26 | HLG foundation site — not cloned                                                                 |
| `laurieandlewcommunitynetwork` | public  | 2026-06-26 | Community site — not cloned                                                                      |
| `5starcommunityevents`         | public  | 2026-06-26 | Events site — not cloned                                                                         |
| `5stargrowthsolutions`         | public  | 2026-06-26 | Growth-solutions site — not cloned                                                               |
| `ddhhomeservices.com`          | public  | 2026-06-26 | DDH Home Services site — not cloned                                                              |
| `herman-supply-chain`          | public  | 2026-06-18 | Supply-chain site — not cloned                                                                   |

**Branches:** only the two cloned repos' default branches were fetched (shallow, `--depth 1`). Branch enumeration for the other repos, and non-default branches (`live`, `gh-pages`, archived) for **all** repos, remain **unverified** — see §6.

**Systems NOT found as a repository under this account:** `highlightai`, `highlighthuddle`, `broadcastai`, `venuewise` (as its own repo — it lives inside `homehuddle`), `athletehuddle` (a hosted path + `athletes` table, not its own repo), `coachai`, `tournamenthuddle`, `organizationhuddle`/`facilityhuddle` (subfolders of `homehuddle`, not standalone repos), `5-star-sports-media-academy` (a subfolder of `5star-sports-media`), `DDH Athlete Development`.

## 3. GitHub Pages & static-site inventory (evidence: CNAME files)

| Repo                 | CNAME (deployed domain) | Static site?                                                                                                                                                                                                             |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `homehuddle`         | `venuewise.net`         | **Yes** — 62 HTML files; subfolders `/homehuddle` (26), `/coacheshuddle` (11), `/organizationhuddle` (8), `/facilityhuddle` (2), `/venuewise-admin` (1), `/account` (1); `/platform` + `/workspaces` are empty scaffolds |
| `5star-sports-media` | `5starsportsmedia.com`  | **Yes** — ~35 HTML pages + `academy/`, `podcast/`, `shared/`, `assets/`                                                                                                                                                  |

Both are **GitHub-Pages static sites** with a **shared Supabase REST backend** (project ref `urwnbskrtoplgnkkxuvl`), accessed from browser JS via a hardcoded **anon** key (public key, not a secret). No build step; no SPA framework; `homehuddle` additionally ships a `sw.js` service worker + PWA icons.

## 4. Supabase / schema evidence

- **Reachable projects:** `ywrzgursvdowzyhipsmt` (empty), `mvvtngiopdrgiedjmhfb` (HL-BOS Core). Consistent with the Phase-0 audit.
- **Venuewise ecosystem backend `urwnbskrtoplgnkkxuvl`:** referenced in committed `shared/config.js` + hardcoded anon keys across HTML. **Not reachable** via the Supabase MCP token — its _live_ state (applied tables, live RLS, data) is **unverified**. Its _intended_ schema is known from committed SQL in `5star-sports-media/shared/sql/` (7 files, ~36 tables). See the [Venuewise & Huddle Evidence Report](68-venuewise-huddle-evidence.md).
- **Legacy project `bkfsjhhclbqrhaolvhmz`** (per Phase-0): unreachable, out of scope.

## 5. Edge Functions / storage buckets / documentation-only assets

- **Edge Functions:** none observed in the cloned static repos (browser-JS-only, REST against Supabase). Whether the Venuewise Supabase project has Edge Functions is **unverified** (project unreachable).
- **Storage buckets:** the sites reference Supabase Storage for photo/video uploads (`photo-upload.html`), but bucket configuration lives in the unreachable project — **unverified**.
- **Documentation-only assets:** `homehuddle/docs/` contains a "Venuewise Platform Specification (VPS) v1.0" and runbooks (present, not exhaustively read); `homehuddle/ARCHITECTURE.md` describes "Venuewise Core" as an evolving multi-tenant platform.

## 6. Evidence limitations (stated plainly)

1. **Non-default branches unverified** — only shallow default-branch clones were taken; `live`/`gh-pages`/archived branches for all repos are unchecked. A static site absent from a `main` snapshot is **not** proof it doesn't exist on another branch.
2. **10 repos enumerated but not cloned** — including the private `HSCS-GLP` and `coaches-huddle-chrismazzu`.
3. **Venuewise Supabase project unreachable** — live tables/RLS/data/Edge/Storage unverified; only committed intended schema is known.
4. **HighlightAI / BroadcastAI absent from the accessible estate** — this is "not found here," not "proven nonexistent." They may exist on another account/org, a non-default branch, the `venuewise.net` domain behind auth, or be concept-only.

## 7. Reuse / classification posture (summary; detail in later deliverables)

The legacy estate implements the **same capability domains** HL-BOS re-implements properly (identity, tenancy, events, media, analytics, payments, messaging). But the legacy implementations are **static-site + single shared Supabase project + anon-key access + no FORCE RLS + no tenant isolation**. Therefore: **do not copy legacy code into HL-BOS.** Capabilities are candidates to **re-implement on the HL-BOS spine** (`adapt_before_migration` / `migrate_to_hlbos`), and `Venuewise Core` is a **parallel platform effort** whose convergence-vs-coexistence is a CEO decision. Full classification: [Huddle Capability Extraction Matrix](68-venuewise-huddle-evidence.md) + [Duplicate & Unsafe Report](69-duplicate-and-unsafe-legacy-report.md).

## 8. Boundary honored

No legacy data migrated, no legacy repo/Pages/branch altered, no production migration applied, no tenant created, nothing deployed. This checkpoint is **evidence discovery, classification, and migration planning only.**

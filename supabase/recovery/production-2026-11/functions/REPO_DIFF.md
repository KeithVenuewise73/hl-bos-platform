# HL-BOS Core edge functions — deployed source vs the repository

10 functions deployed on `mvvtngiopdrgiedjmhfb`, recovered 2026-11-04 via the platform's function API. The export was run twice (Phase 3 and Phase 4); the re-fetched `hlvs`, `discovery-run`, `hlvs-probe` and `site` entrypoints are byte-identical to the first fetch. Per-file SHA-256: `SHA256SUMS.original` (as deployed), `SHA256SUMS` (as committed). Two committed files are redacted (credential literals, see `REDACTIONS.md`); the other files are byte-identical to the deployed source.

| Function | Deployed | `verify_jwt` | Last updated | In repo? |
| --- | --- | --- | --- | --- |
| site | v3 | false | see DEPLOYED.json | `claude/shop-transformation-barber-os-ntwb2n` only (not `main`) — **differs**, see below |
| hlvs | v6 | false | 2026-08-18 | **no branch** |
| hlvs-probe | v2 | false | — | **no branch** |
| discovery-run | v5 | false | — | **no branch** |
| jobscout-discover v7, -score v9, -describe v4, -ingest v3 | | true | — | **no branch** |
| jobscout-dashboard v3, -tailor v3 | | false (token header `x-jobscout-token`, database-minted) | 2026-08-26 | **no branch** |

Undeployed but present on `main`: `ai-gateway`, `billing-webhook`, `events-dispatcher`, `commerce-worker`, `discovery-blueprint-worker`, `discovery-website-worker`, `hlvs-factory-worker`, `social-publish-worker`, `social-token-refresh`, `team-gallery`. Deployed-without-repo (9) and repo-without-deployment (10) are two disjoint sets.

## `site` vs branch A (`claude/shop-transformation-barber-os-ntwb2n`)

| File | Result |
| --- | --- |
| `_shared/barberos/site_server.ts` | byte-identical |
| `_shared/barberos/site_source_rest.ts` | byte-identical |
| `site/index.ts` | comment-only difference (branch A lacks a note that the gateway strips `/functions/v1`) |
| `_shared/barberos/site_render.ts` | **differs materially**: branch A (commit `010e081`, 2026-09-11, "rebuild the page as a designed page") renders styling via `site_themes.ts` and a `theme` field; the deployed copy has the older single inline `CSS` block and no theme support |

So production serves the pre-`010e081` page renderer; branch A is ahead of production by that change. `_shared/barberos/site_themes.ts` is not deployed. Do not "recover" over branch A with the deployed `site_render.ts`.

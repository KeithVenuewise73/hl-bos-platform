# HLVS V2 — Executive Intelligence Roadmap (permanent programs)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-02 · **Architecture — the permanent structure future work plugs into.**

## The organising principle

Intelligence is organised into **six permanent programs**, not a pile of disconnected connectors. **Every future connector must belong to exactly one program.** This is declared in code (`@hl-bos/venture-studio` → `INTELLIGENCE_PROGRAMS`) and surfaced in the CEO Notebook, so the structure is real, not just a diagram.

Programs are marked **honestly**: `active` only where a real capability exists today; `planned` where nothing is wired yet (a placeholder, clearly labelled).

## The six programs

| #   | Program                      | Status  | What exists today                                                                                 | Future connectors (belong here)                                 |
| --- | ---------------------------- | ------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | **Opportunity Intelligence** | active  | Manual capture, evidence, evaluation, reuse, CEO decision, factory preview (V2-1, live)           | GitHub, Product Hunt, Reddit, market signals                    |
| 2   | **Acquisition Intelligence** | planned | Placeholder — no connector yet                                                                    | Acquisition marketplaces, valuation intelligence (HL-BTI)       |
| 3   | **Research Intelligence**    | active  | Research requests & AI-analysis requests captured as notebook intents (executed by a human today) | arXiv/papers, web research, AI-gateway automation               |
| 4   | **Grant Intelligence**       | planned | Placeholder — no connector yet                                                                    | Grants.gov, SAM.gov, government intelligence (HL-BTI)           |
| 5   | **Competitive Intelligence** | planned | Placeholder — no connector yet                                                                    | Competitor monitoring, positioning intelligence                 |
| 6   | **Portfolio Intelligence**   | active  | Deterministic reuse over the HL-BOS catalog + the Knowledge Graph read model                      | Cross-portfolio rollups, dependency / blast-radius intelligence |

## How a future connector plugs in (the contract)

Every connector, when its turn comes, is one CEO-approved increment that:

1. **Belongs to one program** (above) — no orphan connectors.
2. **Reuses the `integrations` connector registry** (migration 0011): a catalog entry + a per-tenant connection whose credential is a **Vault reference** (never a secret value, never the service-role key, never behind `NEXT_PUBLIC_*`).
3. **Reuses the `ai` gateway** (migration 0012) for any analysis — every model call is a real `ai.runs` ledger row; no run without a call.
4. **Writes into the existing `vstudio` tables** (evidence/opportunities), **provenance-tagged and non-authoritative** — you promote before anything becomes authoritative.
5. **Degrades to an honest empty state** until its credential + exposure exist.

## Sequencing (value/risk order, each separately CEO-approved)

Within the active programs first, then connectors: **GitHub → Product Hunt → grants → patents → Reddit → acquisition → competitive.** Each is its own PR and its own credential/trust decision.

## Where this lives

- Code: `packages/venture-studio/src/notebook.ts` (`INTELLIGENCE_PROGRAMS`, `programFor`).
- Surfaced: the CEO Notebook (`/notebook`) shows the six programs and each entry's program.
- This roadmap is the architecture future connectors are measured against.

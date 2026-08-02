# Workstream B · Step 3 — Activate the first real connector (GitHub) — B3

**Copy-paste this to start B3. It turns the first stubbed connector into a live, credentialed ingestion path — one source, end-to-end — reusing `integrations` + `discovery` + `ai`. No new app, no new connector system.**

---

## MISSION

Make **GitHub** the first live Opportunity connector: ingest candidate opportunities into the Inbox with real provenance and a non-authoritative AI summary. Prove the whole pipeline end-to-end on one source, so the remaining ten are just registry entries + collectors.

## AUTHORIZATION REQUIRED (CEO gates)

1. **Apply migrations 0030 + 0031** to production (if not already), in order.
2. **A GitHub credential as a Vault reference** (a read-only token) registered through the `integrations` connector — never a raw secret in env, never behind `NEXT_PUBLIC_*`, never the service-role key.

Do nothing irreversible before the matching approval.

## STEP 0 — Reuse map (required)

Prove GitHub ingestion reuses: `integrations` (catalog entry + per-tenant connection w/ Vault credential ref + sync run), `discovery` (a `github` collector row + edge-function collector), `ai` gateway (summary via `ai.runs`), `@hl-bos/catalog` (reuse), `vstudio.opportunities` (Inbox) + 0031 (`source_connector`/`external_ref` dedup, `opportunity_summaries`). Net-new should be one collector + wiring.

## BUILD

- **Integrations connection:** register a `github` connector + a per-tenant connection whose credential is a **Vault reference**. No secret value in code.
- **Collector (edge function):** a `discovery` collector that queries GitHub (e.g. trending/awesome/issues per a saved query), maps each result to a candidate via `assembleDiscovery`, and writes an **Inbox opportunity** (`source_connector='github'`, `external_ref=<repo id>`, `is_demonstration=false`, honest provenance) — **idempotent** on `external_ref` (no duplicates). No fabricated fields.
- **AI summary:** call the `ai` gateway to produce a **non-authoritative** `opportunity_summaries` row (advisory recommendation + honest estimates), with `ai_run_id` provenance. No run without a real call.
- **Pipeline UI:** surface ingested items in the Inbox + Priority Queue (already built); show the connector as **active** (not stubbed) once a connection exists.
- **Rate/robots/ToS:** respect GitHub API limits and terms; back off on 403/429.

## VERIFY (run it, paste real output)

- `pnpm check` + `pnpm build` green; pgTAP for any new RPC/collector logic (CI).
- A dry-run of the collector against a fixture (no live call in CI) that maps a sample payload → a candidate → an Inbox row, idempotent on re-run.
- Confirm anon cannot read; RLS holds; the summary is non-authoritative; no duplicate on re-ingest.

## GOVERNANCE

- Branch `claude/hlvs-v2-b3-github-connector` off `main` (after B1/B2 merge) or stacked; one PR; **do not merge**.
- Migrations stay UNAPPLIED until CEO-approved; credential is a separate CEO trust decision.
- Reuse map + capability record under `docs/products/hlvs-v2/`.

## GUARDRAILS

- No new app; everything in `apps/venture-studio` + edge functions.
- Never store a raw credential; Vault reference only; never service-role; never `NEXT_PUBLIC_*` for secrets.
- Principle 10: only real, sourced discoveries enter the Inbox; estimates carry measured/estimated/unknown.

## DELIVERABLE (CEO report)

Reuse map · what was built (connector, collector, AI summary) · verification output (real) · the PR link · the exact credential/approval you need · **next single approval**.

## STOP CONDITION

Stop after building, testing, opening the PR, and reporting. Do **not** merge, apply migrations, deploy, or register a live credential without explicit approval. Do not begin the next connector until GitHub is reviewed.

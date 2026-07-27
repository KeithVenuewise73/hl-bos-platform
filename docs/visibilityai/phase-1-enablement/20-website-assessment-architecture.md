# Phase 1 · Deliverable 2 (CP5) — Website Assessment Architecture Report

**Date:** 2026-07-27 · **Checkpoint:** 5 · Local development stack only. No remote migration, no edge deploy, no provider activation, no scheduled scanning.

The Website Assessment Collector is **Discovery Module 1** inside the Checkpoint-4 Business Discovery Engine. It reuses the unified profile, evidence, scoring, assessment, storage, events, AI, workflow and tenancy spine unchanged. It adds exactly two new durable objects (a shared event handler-invocation mechanism, and a website-scan lifecycle table) plus a deterministic, SSRF-safe scan core in the edge/TS layer.

## 1. Where each concern lives

| Concern                         | Layer            | Component                                                                     |
| ------------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| Network safety (SSRF/redirects) | Edge / TS        | `supabase/functions/_shared/discovery/url.ts`                                 |
| Deterministic evidence          | Edge / TS        | `supabase/functions/_shared/discovery/extract.ts`                             |
| Data-driven scoring rubric      | Edge / TS        | `supabase/functions/_shared/discovery/rubric.ts`                              |
| Prompt-injection defense        | Edge / TS        | `supabase/functions/_shared/discovery/injection.ts`                           |
| Scan orchestration              | Edge / TS        | `supabase/functions/_shared/discovery/scan.ts`                                |
| Worker plumbing (inert)         | Edge / TS        | `supabase/functions/discovery-website-worker/index.ts`                        |
| Delivery → handler invocation   | DB (`events`)    | migration `0021` — `events.handlers`, `claim_deliveries`, `complete_delivery` |
| Scan lifecycle + counters       | DB (`discovery`) | migration `0022` — `discovery.website_scans` + RPCs                           |
| Canonical evidence              | DB (`discovery`) | `discovery.evidence` via `discovery.record_evidence` (reused, unchanged)      |
| Scoring composite               | DB (`discovery`) | `discovery.score_dimension` → `discovery.profile_scores` (reused, unchanged)  |
| Human review gate               | DB (`workflows`) | `discovery.submit_assessment_for_review` (reused, unchanged)                  |

**Why the split.** The authoritative network validation (scheme, port, IP class, DNS resolution, redirect hops, byte/size caps) cannot run in SQL — it must sit next to the socket. The database is the durable, tenant-scoped, audited system of record: it owns the scan's state, its counters, and the canonical evidence and scores. Neither layer duplicates the other.

## 2. Scan lifecycle

```
request_website_scan(profile, url, normalized)         [permission: discovery.evidence.create]
  → discovery.start_collection(profile,'website_assessment')   (reused)
  → INSERT discovery.website_scans (status 'requested')
  → events.emit('discovery.website_scan.requested', …)          (transactional outbox)
        │
        ▼  events.dispatch_batch()  → one events.deliveries row for the
           'discovery_website_worker' subscription
        │
        ▼  worker: events.claim_deliveries('discovery-website-worker', N)   (FOR UPDATE SKIP LOCKED)
              runScan(url)   → validate → resolve → fetch → validate hops → extract → score → (opt) AI
              update_scan_progress(scan,'fetching')
              record_scan_finding(scan, …)  × N   → discovery.evidence   (canonical)
              update_scan_progress(scan,'analyzing', counters)
              start_assessment / set_scan_assessment / score_dimension × D → profile_scores
              complete_scan(scan, completed | partially_completed | failed)
                 → events.emit('discovery.website_scan.completed' | '.failed')
              events.complete_delivery(delivery, success)   → 'delivered'
```

The `scan_status` enum carries the full lifecycle (`requested`, `validating`, `queued`, `running`, `fetching`, `analyzing`, `awaiting_review`, `completed`, `partially_completed`, `failed`, `cancelled`). `complete_scan` accepts only the three terminal states; `cancel_scan` sets `cancelled`.

## 3. Idempotency & re-runs

`request_website_scan` reuses an existing **in-flight** scan for the same `(profile, normalized_url)` (partial index `website_scans_inflight_idx`), so a double click does not create two crawls. A completed/failed/cancelled scan does **not** block a fresh run — re-running creates a new scan and a new collection while all prior evidence is preserved (proven by `t_rerun`, `t_prior_scan_preserved`).

## 4. What is deliberately absent in Checkpoint 5

- No real DNS or HTTP egress. `runScan` takes injected `resolve`/`fetchPage`; production wires real adapters at a later, CEO-gated deployment step.
- No scheduler. The `discovery-website-worker` edge function is inert scaffolding — no `pg_cron`/`pg_net`, no deploy.
- No live AI. `analyze` is optional and, when supplied locally, is the mock gateway. AI failure never invalidates deterministic findings.
- No PageSpeed. Performance is a mock adapter interface only.
- No customer-facing scan submission, no public pages, no communications send.

## 5. Reuse guarantee

The collector introduces **no** second assessment, evidence, scoring, storage, event, AI, workflow, or tenancy system. Migration `0021` extends the existing `events` schema; migration `0022` adds one lifecycle table and activates the already-seeded collector. Every finding is a `discovery.evidence` row; every score flows through `discovery.score_dimension`. See [Deliverable 1 — Reuse Analysis](19-checkpoint5-reuse-analysis.md).

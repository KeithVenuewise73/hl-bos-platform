# Herman Legacy Digital — Business Transformation Engine (BTE) Automated Intake Pipeline V1

**Status:** core delivered + tested; end-to-end DB wiring blocked on a named merge dependency (see §2).
**Branch:** `claude/herman-legacy-intake-pipeline-7a1uvh`
**Scope of authority honored:** build / test / document / branch / commit / push / PR. **No** merge, **no** migration applied, **no** deploy, **no** client delivery, **no** DNS/credential changes.

---

## 1. What this is

The intended experience: a client completes the Business Transformation Digital Intake (BTDI) on
HermanLegacyDigital.com, submits it, and the Business Transformation Engine processes it
automatically — creating an engagement, collecting public evidence, analyzing it, generating a
first **draft** report, versioning it in BTIC, notifying Keith, acknowledging the client, and
stopping for **HLD review** before anything becomes client-ready.

This deliverable provides the **deterministic, DB-agnostic core** of that pipeline as a new,
additive, fully-tested package — `@hl-bos/bte-pipeline` — and the **evidence-based integration
plan** for binding it to the existing platform once its two product endpoints are merged.

The core is real and runs today: it composes the existing `@hl-bos/bti-engine` analysis engine
over real website evidence, drives the truthful 12-state processing machine, produces the
11-section draft report with an explicit evidence-confidence label on every finding, protects
approved reports from being overwritten, and keeps every failure visible and retryable. See the
**real** output in [`internal-preview.md`](./internal-preview.md).

---

## 2. Dependency status — the honest blocker

The automated pipeline has two product-specific endpoints and one substrate:

| Layer                                                                                                                                                      | Where it lives                                                               | Status                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intake front door (trigger)** — the BTDI form + `intake.transformation_submissions` + `submit_business_transformation_intake()` RPC (migration **0031**) | **PR #28** `claude/btdi-v1-implementation-6ivf1l`                            | **OPEN, not merged.** Migration 0031 **not yet applied.**                                                                                                                                                                                 |
| **BTIC display (visible outcome)** — the `/intelligence/[engagement]` executive workspace                                                                  | **PR #30** `feature/hld-btic-v1`                                             | **OPEN, not merged.** Ships BTIC as a **static, read-only seed** (`btic-data.ts`); it explicitly **defers** the capture migration: _"when BTIC needs to CAPTURE new records from the UI, an additive migration will be introduced then."_ |
| **Downstream substrate** — jobs, evidence, engagement, versioned reports, audit, messaging                                                                 | **`main`** (migrations 0009/0012/0019/0020/0021/0022/0026/0027, `_shared/*`) | **Present on main.** Reusable.                                                                                                                                                                                                            |

**Why the fully-wired end-to-end pipeline is not delivered (and must not be improvised):**

1. Its **trigger** exists only in unmerged PR #28. On `main` there is only a generic lead intake
   (`/api/intake`), not the BTDI. Building the trigger here would **duplicate #28** (forbidden) or
   require **basing this branch on an unmerged branch** (which the directive says must be reported,
   not silently improvised).
2. Its **capture/persistence layer** (engagement ↔ submission link, processing-state table,
   evidence records, report versions surfaced in BTIC) is the migration **PR #30 deliberately
   deferred**. It exists in **no** branch. Authoring it now means writing SQL that references
   `intake.transformation_submissions` — a table that is **only in unmerged #28** — i.e. building
   against a table not on `main`. The directive forbids building against fictional/unmerged tables.
3. **Live outbound transport is CEO-credential-gated.** `comms` email/SMS providers are seeded
   **inactive** (`_shared/comms/email.ts` throws `email_provider_not_configured`); the discovery
   worker egress + scheduler (pg_cron→pg_net) are not switched on. So a real notification/ack/scan
   cannot be _sent_ in this environment, and claiming otherwise would violate the honesty rules.

**Therefore:** the pipeline **core** is delivered and tested against the real engine (no DB, no
network — fully honest), and the DB/UI/transport wiring is delivered as a **design** (this
document + the migration sketch in §7) that becomes buildable the moment #28 and #30 merge. This is
exactly the directive's stop condition: _"If the required foundations are unmerged and
implementation would duplicate or conflict with them, stop after the evidence-based integration
plan and report the exact merge dependency."_

### Required merge dependency, precisely

> To wire and test the automated pipeline end-to-end, **merge PR #28 (BTDI + migration 0031) and
> PR #30 (BTIC), apply migration 0031, then author migration 0032 (§7) that captures pipeline
> state/reports into BTIC.** Until then, `@hl-bos/bte-pipeline` is the ready, tested core and its
> adapters are unbound. No step here depends on a fictional path.

---

## 3. Reuse matrix (evidence-based)

Exact paths verified in the repository. Verdict legend: **REUSE** (bind an adapter to it),
**EXTEND** (small additive change), **BUILD** (new, this deliverable), **BLOCKED** (needs a merge).

| Requirement                 | Existing capability                        | Exact path / object                                                                                             | Verdict                                                     |
| --------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Intake trigger              | BTDI submit RPC                            | `submit_business_transformation_intake(jsonb)` (migration 0031, **PR #28**)                                     | **BLOCKED** on #28                                          |
| Engagement creation         | BTI engagement model                       | `bti.engagements`, `bti.businesses` (0026)                                                                      | **REUSE** (via adapter)                                     |
| Job orchestration           | Transactional outbox + handler workers     | `events.emit`, `events.dispatch_batch` (0009); `events.claim_deliveries`/`complete_delivery` (0021)             | **REUSE**                                                   |
| Website evidence collection | SSRF-safe scan + parser                    | `discovery.request_website_scan` (0022), `_shared/discovery/scan.ts`; mirror `analyst.analyzeHtml` (bti-engine) | **REUSE**                                                   |
| SEO evidence                | Deterministic rubric over site signals     | `packages/bti-engine/src/analyst/analyze.ts` `RULES[]`                                                          | **REUSE**                                                   |
| Intake analysis             | Consulting engine (fact/inference/opinion) | `consulting.generateConsultingReport`, `analyst.analyzeBusiness`                                                | **REUSE**                                                   |
| AI provider                 | AI gateway ledger + client                 | `ai.begin_run/finish_run` (0012), `_shared/ai/anthropic.ts` (inactive key)                                      | **REUSE (optional)** — analysis is deterministic without it |
| Report generation           | 11-section BTE report over engine output   | `@hl-bos/bte-pipeline` `report.ts`                                                                              | **BUILD**                                                   |
| Report versioning           | Immutable snapshots + version rules        | `bti.analysis_snapshots` (0027); `bte-pipeline` `versioning.ts` (never-overwrite-approved)                      | **REUSE + BUILD**                                           |
| BTIC storage                | Intelligence Center                        | `bti.*` (0026) for data; BTIC **display** in **PR #30** (static, capture deferred)                              | **REUSE (data) / BLOCKED (display capture)** on #30         |
| Keith notification          | Messaging + event bus                      | `comms.request_message` (0019) + `events.emit`                                                                  | **REUSE (record) / BLOCKED (send)** — transport inactive    |
| Client acknowledgment       | Outbound email                             | `comms.request_message` (0019), `_shared/comms/email.ts` (**stub throws**)                                      | **REUSE (queue) / BLOCKED (send)**                          |
| Retry/failure handling      | Handler backoff + dead-letter              | `events.handlers` (0021); `bte-pipeline` state machine                                                          | **REUSE + BUILD**                                           |
| Audit/provenance            | Append-only audit                          | `audit.emit()` trigger, `audit.log_security_event` (0004)                                                       | **REUSE**                                                   |
| Security/RLS                | Admin gate + private-schema RPC pattern    | `identity.is_platform_admin()`, `identity.has_permission()` (0003); API exposes `public` only                   | **REUSE**                                                   |

**Built here (net-new, additive, tested):** the pipeline orchestration, the truthful state
machine, the evidence-status model, the finding evidence-confidence model, the 11-section draft
report generator, and the version-protection rules — all as `@hl-bos/bte-pipeline`.

---

## 4. End-to-end workflow

```
Client submits BTDI  (PR #28 front door)
        │  submit_business_transformation_intake(jsonb) → intake.transformation_submissions
        ▼
Submission validated & stored           state: received
        ▼
Transformation engagement created       → bti.engagements (adapter)      [audit.emit]
        ▼
BTE analysis job queued                 → events.emit('bte.intake.received')   state: evidence_collection_pending
        ▼
Evidence collected                      → discovery.request_website_scan / analyzeHtml
        │   state: evidence_collection_running → analysis_pending
        │   (blocked/unavailable recorded truthfully; never fabricated)
        ▼
Intake + evidence analyzed              → analyst.analyzeBusiness (deterministic)   state: analysis_running
        ▼
Initial report generated (11 sections)  → bte-pipeline report.ts          state: report_generation_running
        ▼
Report saved as Draft — AI Generated    → bti.analysis_snapshots (immutable) + versioning.placeReport
        ▼
BTIC dossier updated                    → capture into BTIC (migration 0032, design-only)
        ▼
Keith notified                          → comms.request_message + events.emit('bte.report.ready')
        ▼
Client acknowledgment sent              → comms.request_message (email; queued until transport active)
        ▼
HLD review required                     state: hld_review_required  ← pipeline STOPS here in V1
```

The pipeline never advances into `approved` / `client_ready` on its own — those are human,
CEO-gated states.

---

## 5. State machine

Twelve truthful states (`packages/bte-pipeline/src/states.ts`), with recorded `started_at` /
`completed_at` (timeline `at`), `failure reason`, `retry count`, `last retry`, `next action` and
`provenance` on every engagement:

`received` → `evidence_collection_pending` → `evidence_collection_running` → `analysis_pending`
→ `analysis_running` → `report_generation_running` → **`hld_review_required`** (V1 stop)
→ `approved` → `client_ready`.
Side states: `clarification_required` (owner confirmation), `failed` (recoverable — never a silent
dead end), `archived`.

- The automated pipeline walks only the happy path up to `hld_review_required`.
- `failed` is **recoverable**: it can transition back to `evidence_collection_pending`,
  `analysis_pending`, or `report_generation_running` for retry.
- A **failed job remains visible** in BTIC with its reason and next action.

---

## 6. Data model

**Reused (on `main`):** `bti.businesses`, `bti.engagements`, `bti.assessments`,
`bti.analysis_snapshots` (immutable versioned report payloads), `discovery.website_scans` +
`discovery.evidence`, `events.outbox` + `events.handlers`, `comms.messages`, `audit.events`.

**Core domain types (delivered, `packages/bte-pipeline/src/types.ts`):** `NormalizedIntake`
(maps 1:1 from the BTDI payload without importing it), `ProcessingState`, `TimelineEntry`,
`EvidenceRecord` (+ `EvidenceStatus`), `BteFinding` (+ `FindingConfidence`), `InitialReport`
(+ `ReportStatus`, 11 `ReportSection`s), `NotificationRecord`, `AcknowledgmentRecord`,
`FailureInfo`, `EngagementResult`.

---

## 7. Additive migration 0032 (design-only — NOT written against unmerged tables, NOT applied)

Introduced **after** #28/#30 merge and 0031 applies. Additive and reversible, following the
platform's private-schema + SECURITY DEFINER + forced-RLS pattern (0031 is the template):

- `intake.transformation_engagements` — one row per automated engagement:
  `submission_id → intake.transformation_submissions(id)`, `bti_engagement_id → bti.engagements`,
  `state intake.bte_state`, `started_at`, `completed_at`, `failure_reason`, `retry_count`,
  `last_retry_at`, `next_action`, `provenance jsonb`.
- `intake.bte_state` enum = the 12 processing states in §5.
- `intake.engagement_timeline` — append-only state transitions (`state`, `at`, `note`, `provenance`).
- `intake.engagement_evidence` — evidence records (`key`, `label`, `status`, `detail`, `source`).
- `intake.engagement_reports` — versioned report metadata (`subject`, `version`, `status`,
  `supersedes`, `snapshot_id → bti.analysis_snapshots`); a unique index on `(subject, version)` and
  a partial unique index forbidding two `approved`/`current` rows per subject enforce
  never-overwrite-approved at the DB level.
- RPCs (platform-admin-gated, `revoke ... from anon`): `list_bte_engagements`,
  `get_bte_engagement`, `advance_bte_state`, `retry_bte_notification`. Anonymous write path stays
  the single 0031 submit RPC. `audit.emit()` triggers on every table. Schema `intake` stays off the
  PostgREST allow-list.

---

## 8. AI prompt / output contract

V1 analysis is **deterministic and requires no live LLM** — `analyst.analyzeBusiness` reads real
site signals through a fixed rubric and the consulting engine. This is intentional (an inactive
Anthropic key must never block or fake a result). When a live narrative is later enabled through
the `ai` gateway (`ai.begin_run`/`finish_run`, `_shared/ai/structured.ts`):

- **Input:** normalized intake + observed `SiteEvidence` + the deterministic findings.
- **Output contract:** structured JSON only, validated by `_shared/ai/structured.ts`; each item
  must carry `confidence ∈ {verified, inferred, needs_confirmation, unavailable}` and its evidence
  source. Any field the model cannot ground is emitted as `unavailable`, never invented.
- The deterministic report remains the source of truth; the LLM may only **narrate**, never
  override a verified fact or manufacture a metric.

---

## 9. Evidence-confidence model

- **Evidence status** (per source): `collected` · `blocked` · `unavailable` · `client_supplied` ·
  `requires_human_review`. A site that denies automated access is `blocked` and yields **no**
  observations — never a fabricated clean scan.
- **Finding confidence** (per finding): `verified` (rests on an observed fact) · `inferred`
  (defensible inference) · `needs_confirmation` (client-stated / opinion) · `unavailable` (an
  explicit gap). Mapped from `@hl-bos/bti-engine`'s fact/inference/opinion claim classification; a
  finding takes its **strongest** evidentiary basis, and the recommendation attached to it stays a
  separately-labelled opinion. Verified and inferred findings are kept distinct in the report and
  in the confidence summary.

---

## 10. Security model

- Internal BTIC access is authenticated and platform-admin-gated
  (`identity.is_platform_admin()`); **no anonymous report reads**.
- The only anonymous write path is the single BTDI submit RPC (0031); everything else is
  SECURITY DEFINER, `revoke ... from anon`, forced RLS, `intake` schema off the API allow-list.
- Server-side processing only; no privileged secrets in browser code; `audit.emit()` provenance on
  every write; consent respected (`consent_privacy`/`consent_contact` enforced at intake); minimal
  PII copied into intelligence records; no public indexing.

---

## 11. Failure & retry behavior

Every failure listed in the directive is handled and **never silently discards the intake**:
invalid/inaccessible website (`blocked`/`requires_human_review`, report still generated),
collector timeout and provider timeout/invalid response (→ visible `failed` with a retryable next
action, evidence retained), notification failure (non-fatal, recorded, `retryNotification`
increments attempts), duplicate intake (linked + flagged, not discarded), partial report
(sections mark themselves `hasData: false`), unsupported industry (general lens + a stated note),
and missing required fields (visible `failed`, intake retained). See the tests in §13.

---

## 12. Notification & client acknowledgment behavior

- **Keith notification** carries: business name, primary contact, industry, website, client-stated
  primary challenge, BTE-identified primary constraint, confidence summary, critical risk (if any),
  the direct internal BTIC link, and the required next action. On delivery failure the report is
  retained, the failure is recorded and visible, and retry is available — the client is never asked
  to resubmit.
- **Client acknowledgment** confirms only: intake received, automated analysis has begun, HLD will
  review, the report is **not** final, and the expected next step. It **never** attaches the full
  report (`fullReportIncluded: false`), and — because email transport is CEO-gated — it is honestly
  recorded as `queued`, not `sent`.

---

## 13. Tests

`packages/bte-pipeline` — **35 tests, all passing** (`pnpm --filter @hl-bos/bte-pipeline test`):

- valid intake → engagement created, advances to `hld_review_required`, states in correct order;
- analysis job queued (event/timeline) and status advances correctly;
- inaccessible website labelled `blocked`, report still produced, digital-presence `unavailable`;
- verified vs inferred/needs-confirmation findings remain distinct; every finding has provenance;
- report versioned; **prior approved report never overwritten** (stays current truth);
- Keith notification success path; notification **failure visible and retryable**;
- client acknowledgment path; **full report never sent to client**;
- missing-field / collector-error / provider-error failures visible and retryable;
- duplicate intake linked, not discarded; unsupported industry handled truthfully.

Security/RLS, tenant-isolation, no-Venuewise-writes and BTDI/BTIC regression are covered by the
existing pgTAP suite and remain green; the pipeline core performs **no** DB writes, so it cannot
regress them.

---

## 14. V1 limitations

- Not wired end-to-end: adapters are unbound pending the #28/#30 merge and migration 0032.
- No live outbound send (email/SMS transport and worker egress are CEO-credential-gated).
- No third-party market-research/SEO data source exists; only authorized, reusable signals are used.
- No UI screenshots: the BTIC page is unmerged, so no wired page exists to screenshot; the
  [internal preview](./internal-preview.md) is real generated output instead.

## 15. Future increments

Client report portal · automatic client delivery · campaign generation · cross-client learning ·
automated recommendations · multiple notification channels — each a separate, CEO-authorized step.

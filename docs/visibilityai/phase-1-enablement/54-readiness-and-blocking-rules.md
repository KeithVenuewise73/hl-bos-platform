# Phase 1 · Deliverable 11 (CP7) — Readiness and Blocking Rules Report

**Date:** 2026-07-27 · **Checkpoint:** 7 · Deterministic. AI may summarize; it can never decide.

## 1. Two mirrored engines

- **Authority (DB):** `provisioning.evaluate_readiness(request)` — a pure SQL function that reads the live state and returns the blocking reason codes. `build_factory_authorization` turns that into `ready` (no reasons) or `blocked`.
- **Edge mirror (TS):** `_shared/provisioning/readiness.ts` (`readiness-0.1.0`) — the same rule set over a plain state object, returning `ready` / `not_ready` / `blocked` + structured reasons, for use in the edge layer and unit tests.

Both are deterministic and take **no AI input**. AI may draft a plain-language summary of the reasons for a human, but there is no parameter through which it could change the verdict or mark readiness passed (`t_readiness_engine_no_ai` / `readiness: the engine takes no AI input`).

## 2. Rules checked

`blueprint_not_approved`, `proposal_not_internally_approved`, `proposal_not_accepted`, `proposal_superseded`, `proposal_version_stale`, `price_not_approved`, `agreement_missing`, `agreement_unreviewed_legal`, `selection_not_finalized`, `billing_setup_not_approved`, `provisioning_not_approved`, `service_inactive`, `module_inactive`, `dependency_unresolved`, `entitlement_invalid`, `credential_missing`, `content_missing`, `work_order_missing`, `human_approval_incomplete`.

Result: **Ready** (no reasons), **Not Ready** (prerequisites not yet built — incomplete), or **Blocked** (a hard rule fails), always with the structured reason codes.

## 3. Exceptions — controlled, audited, bounded

`provisioning.grant_readiness_exception(authorization, rule, reason, scope, expires)` records an approved exception (requires `provisioning.request.manage`, a non-empty reason, and writes `provisioning.readiness_exception` to `audit.security_events`). An active, non-expired exception clears its reason on the next evaluation.

**Prohibited exceptions can never be granted:** `proposal_not_accepted`, `agreement_missing`, `agreement_unreviewed_legal` — i.e. no exception for missing customer acceptance or missing legal authorization. The RPC rejects them (`t_prohibited_exception_rejected`, `t_prohibited_agreement_exception_rejected`) and the engine ignores them even if forced. Every exception carries reason + approver + scope + expiration + audit event, so no control is ever silently bypassed.

## 4. Coverage

The edge tests exercise each reason code, the exception-clears path, the prohibited-exception rejection, the incomplete→not_ready case, and determinism; the DB tests exercise the ready path, a blocked path with a structured reason, exception-clears + audit, prohibited rejection, and the manage-only gate. See the [Test Coverage report](58-checkpoint7-test-coverage.md).

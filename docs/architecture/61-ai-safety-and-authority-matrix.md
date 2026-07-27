# CP8 · Deliverable 17 — AI Safety and Authority Matrix

**Date:** 2026-07-27 · **Checkpoint:** 8 · All AI output is **advisory**. AI approves, authorizes, certifies, and publishes **nothing**.

## AI may (advisory)

Summarize opportunities; suggest relevant capabilities; suggest reuse candidates; draft blueprint narratives; draft Software Creation Orders; draft Claude prompts; summarize checkpoint reports; suggest conformance concerns; draft catalog update proposals.

## AI may not

Approve blueprints; authorize new modules; approve duplicate creation; approve Software Creation Orders; submit work to Claude; certify tests; certify security; accept checkpoint reports; grant conformance exceptions; publish catalog changes; issue a Factory Build Package; authorize production.

## How the prohibitions are enforced (not merely stated)

| Guarantee                              | Mechanism                                                                                                                                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI cannot approve/authorize/publish    | Every approving RPC requires a **platform permission** via `hlvs._require(...)` resolved from `auth.uid()`; an AI run holds none. Proven by `t_non_platform_cannot_manage`, `t_non_platform_cannot_approve_blueprint`. |
| AI recommendation is not authoritative | `duplicate_check` stores `ai_recommended` separately from the **deterministic** `determination` (`t_ai_recommendation_not_authoritative`).                                                                             |
| AI cannot replace conformance          | `run_conformance` is deterministic SQL; there is no AI input to it (edge mirror also takes no AI input).                                                                                                               |
| AI cannot grant an exception           | `grant_conformance_exception` requires `hlvs.conformance.manage` + a reason + audit; non-exceptionable rules are rejected.                                                                                             |
| AI cannot certify a completion report  | `drafted_by_ai` is recorded, but acceptance requires a human (`accept_build_completion_report`).                                                                                                                       |
| AI cannot submit to Claude             | No automatic Claude call exists; the inert adapter reports `external_execution: false`.                                                                                                                                |

## Labeling

Any AI-derived field is stored with an explicit advisory marker (`ai_recommended`, `drafted_by_ai`) so its non-authoritative status is visible in the record itself. The deterministic engine result is always the authority.

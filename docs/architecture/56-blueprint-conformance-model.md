# CP8 · Deliverable 12 — Blueprint-Conformance Model

**Date:** 2026-07-27 · **Checkpoint:** 8 · `hlvs.run_conformance` (DB authority) + `_shared/hlvs/conformance.ts` (edge mirror)

A **deterministic** engine compares the approved Product Technical Blueprint, the Software Creation Order, the submitted checkpoint reports, the Build Completion Report, and the proposed Factory Build Package.

## Checks (at minimum)

Every required module accounted for; every required capability accounted for; no unapproved module created; no prohibited duplicate introduced; every migration reported; required tests passed; required documentation supplied; required security checks passed; repository + branch match; no production action reported; unresolved architecture deviations; unresolved CEO decisions; unresolved security findings.

The implementation checks the order's `build_scope.required_modules` against the union of the checkpoint reports' `modules_created` + `modules_reused`, flags any created module not in `required_modules ∪ new_modules_authorized` as **unauthorized duplication**, flags any reported `production_action` / `secret_exposure`, and requires a Build Completion Report.

## Verdict

`conformant` · `conformant_with_approved_exceptions` · `nonconformant` · `incomplete` (`hlvs.conformance_verdict`). `hlvs.run_conformance(run)` stores the verdict + structured `blocking` + `non_exceptionable` and emits `hlvs.blueprint_conformance.completed`. Proven by `27_hlvs_factory.sql :: t_conformant`, `t_nonconformant`, `t_blocking_reason_structured`.

## No AI substitution; exceptions require humans

**No AI-generated conformance result may replace the deterministic authority.** Exceptions require human approval via `hlvs.grant_conformance_exception` (`hlvs.conformance.manage`, non-empty reason, audited). An approved, non-prohibited exception flips a `nonconformant` verdict to `conformant_with_approved_exceptions` (`t_verdict_flips_with_exception`).

## Non-exceptionable failures

These can **never** be excepted (`hlvs.non_exceptionable_rules()`): unapproved production deployment, secret exposure, unapproved tenant creation, unapproved billing activation, missing human approval, unauthorized module duplication, missing required security controls. `grant_conformance_exception` rejects them (`t_non_exceptionable_rejected`), and they surface in the result's `non_exceptionable` list (`t_unauthorized_duplication_detected`).

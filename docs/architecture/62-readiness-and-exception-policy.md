# CP8 · Deliverable 18 — Readiness and Exception Policy

**Date:** 2026-07-27 · **Checkpoint:** 8 · `hlvs.evaluate_package_readiness` (DB authority) + `_shared/hlvs/readiness.ts` (edge mirror)

A deterministic readiness engine decides whether a Factory Build Package may issue. It takes **no AI input**.

## Blocking conditions (minimum)

blueprint not approved; Software Creation Order not approved; required checkpoint incomplete; checkpoint report rejected; Build Completion Report missing; conformance not passed; unresolved prohibited deviation; catalog update not reviewed; required test evidence missing; security evidence missing; architecture approval missing; source reference missing; module version missing; production-ineligible dependency; secret-exposure finding; reported unauthorized production action.

## Output

`ready` · `blocked` · `needs_review` (`hlvs.readiness`), with **structured reason codes** and evidence references. `hlvs.build_factory_package` stores the result; `hlvs.approve_factory_package` refuses anything not `ready`. Proven by `27_hlvs_factory.sql :: t_package_ready`, `t_package_blocked_when_nonconformant`, `t_package_prohibited_deviation`, `t_cannot_approve_blocked_package`.

## Exception policy

Conformance exceptions (the only sanctioned bypass) are bounded: reason + approver + scope + expiration + audit event (`hlvs.grant_conformance_exception`). **Non-exceptionable failures** — unapproved production deployment, secret exposure, unapproved tenant creation, unapproved billing activation, missing human approval, unauthorized module duplication, missing required security controls — can **never** be excepted, and a package carrying any of them surfaces `prohibited_deviation` and stays blocked. AI may summarize blocking reasons but may not override them.

## Two mirrored engines

The DB function is the authority (used by `build_factory_package`); the TS mirror (`hlvs-readiness-0.1.0`) is for the edge layer and unit tests. Kept in lockstep by convention; both are deterministic.

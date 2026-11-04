# Proposed migrations — written, tested in isolation, NOT applied

Files here are additive SQL for the commercial products (TransportationOS,
SalonOS) and the shared services they use. **Nothing applies them**: not CI,
not `supabase db reset`, not the Control Center, and not production.

## Why they are not in `supabase/migrations/`

The repository's lineage check (`scripts/check-lineage.mjs`) requires
ordinals 1..N with no gaps. The next ordinal here would be 0055, but
production already has **two different** migrations numbered 0055
(`hlbos_0055_proposal`, `hlbos_0055_barberos_audit_public_api`), and
production's ordinals 0048–0058 mean different things from this repository's.
Taking any number now would create exactly the conflicting history the Phase 4
governance forbids. These files receive real ordinals when the lineage is
reconciled (an owner decision).

## How they are tested

```bash
bash scripts/local-test/isolated-db.sh            # shim + all 54 migrations + every file here
HLBOS_PG_DB=hlbos_isolated pnpm --filter @hl-bos/commercial test
```

| File                                        | What it adds                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P001_commercial_modules_billing_comms.sql` | Module registry (22 modules: T1–T12, S1–S10) and billing packages; `entitlements.module_licensed` / `require_module` (the server-side gate); idempotent provider events (`billing.apply_provider_event`); delivery-worker support in `comms` (claim, retry with backoff, release, STOP/START). |

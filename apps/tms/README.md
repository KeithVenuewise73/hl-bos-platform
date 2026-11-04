# HLG TMS — Release 1 local prototype

The Herman Supply Chain Solutions Transportation Management System:
one platform whose modules a company can license separately.

> **What this is:** a prototype that runs on this computer over **synthetic
> data held in memory**. Restarting it resets everything. It is not
> connected to any HL-BOS database and must not be put on a network: sign-in
> is a "pick a person" demo with no password.

## Start it

There is no Control Center button yet (see "Not yet"). For the engineer:

```bash
pnpm install
pnpm --filter @hl-bos/tms-app build && pnpm --filter @hl-bos/tms-app start   # http://127.0.0.1:4610
```

## What works

| Screen                   | Module                      | Who                  |
| ------------------------ | --------------------------- | -------------------- |
| `/driver` inspect        | Digital DVIR                | everyone, phone-size |
| `/defects` repair queue  | Digital DVIR or Maintenance | owner/manager/shop   |
| `/inspections/[id]`      | Digital DVIR (print / JSON) | everyone it concerns |
| `/dashboard` status      | Fleet Management            | owner/manager/shop   |
| `/fleet`, `/fleet/[id]`  | Fleet Management            | owner/manager/shop   |
| `/drivers`, `[id]`       | Driver Management           | owner/manager        |
| `/maintenance`           | Maintenance Management      | owner/manager/shop   |
| `/setup` vehicles+people | included with any module    | owner/manager        |
| `/modules` licensing     | included with any module    | owner                |

Every page and every `/api/fleet` call checks the licence and the role **on
the server** (`src/lib/guard.ts`, `src/app/api/fleet/route.ts`). The backend
then enforces production's own role rules, because `MemoryFleetBackend`
(`packages/tms`) is a port of production `fleet.api` that is tested for
parity against the recovered SQL.

## Proof

```bash
node scripts/local-test/verify-tms.cjs   # 40 browser checks: Workflows A–D + refusals
bash scripts/local-test/tms-fleet-db.sh && TMS_PG_DB=tms_fleet pnpm --filter @hl-bos/tms test
```

## Not yet

- Not connected to Supabase. The switch is a `SupabaseFleetBackend` calling
  `rpc('hlg_fleet_rpc')` with the user's HL-BOS session; see the Phase 5
  report, "Deployment preparation".
- No Control Center start button yet.
- Photos are JPEG only. Signatures are typed names with consent, which is how
  production stores them; there is no drawn signature. "PDF" means the
  browser's print-to-PDF.
- No notifications of any kind are sent.

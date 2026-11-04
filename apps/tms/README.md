# HSCS TransportationOS — Release 1

One transportation platform whose modules a company licenses separately.

> **What this is:** a working Release 1 that runs on this computer against an
> **isolated local PostgreSQL**. That database holds every HL-BOS migration,
> the production fleet backend recovered byte-for-byte, and the proposed
> licence gate (`supabase/proposed/P001`, `P002`). Records persist there. All
> data is synthetic. It is **not** connected to production and must not be
> put on a network.

## Start it

```bash
bash scripts/local-test/tms-fleet-db.sh                       # builds database tms_fleet
psql -h /tmp/tmspg -p 5434 -U postgres -d tms_fleet -f scripts/local-test/seed-transportationos.sql
pnpm --filter @hl-bos/tms-app build && pnpm --filter @hl-bos/tms-app start   # http://127.0.0.1:4610
```

Sign in with a synthetic account (`morgan@lakeshore.example.test` — manager,
`dana@lakeshore.example.test` — driver, `max@…` — maintenance,
`sam@twotrucks.example.test` — owner of a DVIR-only company). The shared
development password is `tms-demo-2026`; it exists only in the local isolated
database and is not a secret.

## How a request is decided

1. **Who:** a signed session cookie; the password was checked against
   `auth.users` with `crypt()` (how Supabase stores it).
2. **Which company and role:** `fleet.api('workspaces')`, as that user.
3. **What is licensed:** `entitlements.my_modules`, which follows HL-BOS
   billing subscriptions.
4. **Every operation:** `public.hlg_fleet_rpc` as that user, the door
   Supabase clients use. The database enforces the role (production
   `fleet.api`) and the licence (P002), whatever the app does.

## Proof

```bash
node scripts/local-test/verify-transportationos.cjs   # 49 browser checks: T-1..T-4, H-1, cross-company, restart
TMS_PG_DB=tms_fleet pnpm --filter @hl-bos/tms test     # 54 database tests incl. the gate
```

## Not yet

- Supabase Auth and the hosted project: the switch is a session from
  Supabase Auth plus the same RPC through supabase-js. No query changes.
- No notifications are sent for TransportationOS events.
- Dispatch, routes, KPIs, profitability, executive dashboard and customer
  portal are not built; their modules cannot be licensed.
- Signatures are typed names with consent (production's model); "PDF" is the
  browser's print-to-PDF. No offline mode.

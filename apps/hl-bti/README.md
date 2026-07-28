# @hl-bos/hl-bti — the deployable HL-BTI application

The production Herman Legacy Business Transformation app: an **authenticated,
persistent** executive workspace, deployed to the Herman Legacy Cloud (Coolify)
and connected to the HL-BOS Supabase Pro project. It is the counterpart to
`hl-bti-alpha` (the offline local demo): same engine, but with sign-in, tenancy,
and cloud-saved businesses and analyses.

## What it does

Sign in → resolve your Herman Legacy workspace → create a business (name,
website, industry, location, primary contact, email, phone, goals) → run the
analysis (the real `@hl-bos/bti-engine`) → review evidence-backed findings and
Herman Legacy recommendations → generate an Executive Blueprint and a Proposal →
**save to the Herman Legacy cloud** and reopen on any device.

## How it reuses HL-BOS (no new platform services)

- **Auth** — Supabase Auth (`auth.users`); accounts are granted by invitation.
- **Tenancy & permissions** — `identity.memberships` + `identity.has_permission`.
- **Data + API** — the `public.bti_*` functions (migration `0027`) over the `bti`
  schema (migration `0026`); the browser uses only the publishable key + the
  user's JWT, and RLS enforces everything. The service-role key is never used.

## Build & run

```bash
# Local dev (needs the two NEXT_PUBLIC_SUPABASE_* vars in the environment)
pnpm --filter @hl-bos/hl-bti dev      # http://localhost:4200

# Production build (static export → apps/hl-bti/out)
pnpm --filter @hl-bos/hl-bti build
```

Deployment (Coolify config, env vars, DNS, and the gated setup steps) is in
[`DEPLOYMENT.md`](./DEPLOYMENT.md). The container build is `Dockerfile` +
`nginx.conf`.

## Configuration

| Variable                               | Purpose                                         |
| -------------------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | HL-BOS Supabase project URL (build-time)        |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key (build-time; browser-safe) |

Nothing else — no runtime secrets, no service-role key.

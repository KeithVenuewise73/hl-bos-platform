# Herman Legacy Venture Studio (HLVS V2)

Internal, authenticated **executive opportunity-intelligence** app, assembled on
HL-BOS. Capture an opportunity → attach evidence → evaluate → measure HL-BOS
reuse → advisory recommendation → **authoritative CEO decision** → read-only
Factory readiness.

- **Run locally:** `pnpm --filter @hl-bos/venture-studio-app dev` (port 4500).
  For a local role without live auth: `VSTUDIO_DEV_ROLE=platform_owner` (impossible in production).
- **Reuses:** `@hl-bos/catalog` (deterministic reuse engine), `@hl-bos/venture-studio`
  (pure domain logic), HL-BOS identity (Supabase Auth), the `vstudio` schema, and
  the Executive Portal deployment pattern. No new identity/CRM/workflow systems.
- **Honesty:** real data or an explicit no-data / not-provisioned state. AI
  recommendations are advisory (`authoritative` fixed false); the CEO decision is
  the only authoritative act. No fabricated opportunities, scores, or ARR.
- **V2-1 scope:** no external connectors, no autonomous Factory work. The
  `vstudio` migration (0029) is written but **unapplied** pending CEO approval.

See `docs/products/hlvs-v2/` for the architecture, reuse matrix, and V2-1 reports.

# HL-BTI v2 — Security Review

Confirmation of the security posture of the `@hl-bos/transformation-intelligence` package and its Executive Portal section, with evidence.

## Threat surface — deliberately minimal

The engine is **pure functions over in-memory data**. It has no network, no filesystem writes, no shell, no database writes, and no secrets. That eliminates most of the surface a report engine would normally carry.

| Concern                                        | Status  | Evidence                                                                |
| ---------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| Command execution (`child_process`, git, pnpm) | ✅ none | Package imports none; grep-clean                                        |
| Filesystem mutation                            | ✅ none | No `fs` writes; `buildCatalog()` reads the in-memory registry, not disk |
| Database writes                                | ✅ none | The package performs no DB access at all                                |
| Secrets / keys                                 | ✅ none | No `process.env`, no keys; nothing to leak                              |
| Network calls                                  | ✅ none | No `fetch`/HTTP; fully offline/deterministic                            |
| Server Actions                                 | ✅ none | The portal pages are read-only server components                        |

## Data-safety (Principle 10)

- **No fabricated data.** Monetary outputs are `number | null`; missing inputs return `null` with a stated reason. Payback is always `null` (pricing is a pending CEO decision). Government profit is `null` unless a contract value is supplied. Verified by `impact.test.ts`, `government.test.ts`, `pipeline.test.ts`.
- **Sample, not customer.** The portal demonstrates the engine on input explicitly flagged `sample: true` and labelled "illustrative". No real customer data is present or invented.
- **Advisory only.** The engine authorises nothing; every actionable recommendation and every bid decision carries a required human approval (`approval.ts`, `government.ts`).

## Authorization (Executive Portal section)

The two new views reuse the portal's existing, unit-tested server-side authorization:

- **`intelligence`** (Transformation Intelligence) — `platform_owner`, `executive`, `administrator`. Marked **sensitive** (shows illustrative revenue impact).
- **`government`** (Government Contracts) — `platform_owner`, `executive` only. Marked **sensitive** (shows profit and bid decisions).
- Both are enforced by the pure `canView(role, view)` matrix in `src/lib/authz.ts`, checked server-side in `PortalShell` on every request; an unauthenticated viewer (null role) sees nothing; a disallowed role gets a logged 403.
- New boundary tests added to `authz.test.ts`: intelligence is owner/executive/administrator only; government is owner/executive only. Portal test suite: **22 passing**.

## Build-boundary integrity

- The portal now transpiles `@hl-bos/transformation-intelligence` and its transitive `@hl-bos/bti-engine`/`@hl-bos/catalog` sources; `allowImportingTsExtensions` added to the portal tsconfig to consume the engine's `.ts` source (matching `apps/hl-bti`). No runtime code path was widened — the imports are pure logic.
- The portal's CSP/HSTS/security headers and `productionBrowserSourceMaps: false` are unchanged and still apply to the new routes.

## Residual / deploy-time items (unchanged from Phase VII)

- The new views ship inside the **read-only** Executive Portal, which is **not deployed** in this phase. All Phase VII deploy gates (Coolify authorization, publishable key only, role provisioning, staging acceptance, CEO production sign-off) still apply and are unchanged.
- When live assessment/opportunity data is later wired (a separate, approval-gated step), reads must go through RLS-scoped, permission-checked `public.bti_*` RPCs (publishable/anon key only) — never the service-role key. See `08-api-design.md`.

## Verdict

The v2 engine **adds intelligence without adding attack surface**: no command execution, no writes, no secrets, no network, no fabricated data, and server-side authorization on both new sensitive views. It is safe to merge and safe to run inside the read-only portal.

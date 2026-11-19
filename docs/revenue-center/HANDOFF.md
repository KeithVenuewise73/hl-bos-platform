# HLG Revenue Center - session handoff

Single source of state so Claude and ChatGPT can resume. Update at the end of every step.

## Current state (2026-11-19)

| Item | Value |
| --- | --- |
| Repo | KeithVenuewise73/hl-bos-platform (existing, private) |
| Branch | `claude/hlg-revenue-center-supabase-jeq433` |
| Base commit | `4593202` (main at session start) |
| Step completed | 1 - verify source and destination (read-only) |
| Migrations added | none |
| Remote changes made | none (no Supabase writes, no deploys) |

## Step 1 findings

### Source: HLG-Revenue-Center-Claude-Handoff.zip (snapshot 2026-11-17)
- `service-source.zip` (BTI, v11, cde22c67): editable Worker (`worker/api.js` 47 lines, `index.js` 119, `offers.js` 33, `reviews.js` 35), schema (`db/schema.ts`, 19 lines), `drizzle/0000-0003`, offer builder (`frontend/service-offer-builder/`), compiled Next.js frontend, `scripts/test-discovery.mjs`.
- Exports: 850 prospects (`service-pool.json`), 4 CRM files, 5 reviews, 13 ingest records, 0 offers.
- Sports (105 seed entries) and Hockey (27 records, 7 comparison rows) are separate workspaces for later.
- `integration/source-files.json` = 13-file patch for `apps/hl-bti-alpha` (browser-local Revenue Center UI, base 7b67610). 7 files are new, 6 modify existing files. `apps/hl-bti-alpha` has no changes between 7b67610 and HEAD, so the patch applies on the same base. Not yet applied. It has no Supabase writes.
- Optional `HLG-BTI-Revenue-Center.zip` was NOT supplied.

### Tests actually run
- `node scripts/test-discovery.mjs` on the BTI source: PASS (seed, atomic removal/backfill, exclusion suppression, domain dedupe, manual vacancy fill, idempotent replay, URL validation, removal validation, cross-origin rejection, restore, 50-slot cap).
- No other suites exist in the snapshot.

### Destination
- Supabase org: "Herman Legacy Software Ventures" (`ihtsbcxtvkbfkkpmforp`). Projects: HL-BOS Core `mvvtngiopdrgiedjmhfb`, Venuewise Platform `urwnbskrtoplgnkkxuvl`, Herman Legacy Business Platform `bkfsjhhclbqrhaolvhmz`, HSCS Driver Recruitment `mgtvqsxxgqkdppfymznw`.
- HL-BOS Core public schema: empty (verified, read-only). The repo's 59 platform migrations (`supabase/migrations`, 0001-0059) target HL-BOS Core's non-public schemas. Which of them are applied remotely is UNVERIFIED.
- Local tooling: docker and psql present; Supabase CLI not installed.

### Conflicts and gaps
1. Destination unresolved: brief proposes a dedicated project; HL-BOS Core already holds the platform. A new project may add cost.
2. Earlier brief mentioned agency, text-back and review-recovery modules and `drizzle/0004-0006`. They are not in the snapshot and are out of scope for this brief. Proposals and follow-ups are built new here.
3. Handoff doc notes BTI has no shared proposal, follow-up, invoice or revenue tables. Legacy browser-local BTI data needs a workspace backup export.

## Outstanding decisions (owner: Keith)
1. Supabase destination: new dedicated project, or a dedicated schema in HL-BOS Core.
2. Hosting target for dashboard and worker (not chosen).
3. Provide the browser backup export for legacy BTI workspace data, and fresh D1 export before cutover.

## Next action (owner: Claude)
Step 2, local only: scaffold `revenue/` Postgres migrations, RLS and tests against local Postgres. No remote changes until decisions 1-2 are answered.

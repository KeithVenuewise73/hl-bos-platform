# HLG Revenue Center - session handoff

Single source of state so Claude and ChatGPT can resume. Update at the end of every step.

## Current state (2026-11-19)

| Item | Value |
| --- | --- |
| Repo | KeithVenuewise73/hl-bos-platform (existing, private) |
| Branch | `claude/hlg-revenue-center-supabase-jeq433` |
| Base commit | `4593202` (main at session start) |
| Step completed | 1 - verify source and destination (read-only); 2a - core Postgres schema, RLS and schema tests (local only) |
| Migrations added | `revenue-center/supabase/migrations/20261119000001_revenue_0001_core.sql` (NOT applied anywhere) |
| Remote changes made | none (no Supabase writes, no deploys) |

## Step 2a result (local only)
- Kept in `revenue-center/` (not `supabase/migrations/`) so the platform's gated `db-migrate.yml` can never pick it up.
- Schema `revenue`: organizations, organization_members, discovery_prospects, discovery_runs, crm_businesses, crm_review_jobs, catalog_items, service_offers, proposals, follow_ups. RLS on all 10 tables; anon has no grants.
- Kept: legacy text IDs, partial open-review index, per-sector unique identity, composite FKs (cross-organization links are impossible). New: failed/blocked jobs must carry an error; proposals cannot be Sent/Accepted/Declined without an approver and timestamps; catalog prices seed as `pending_approval`.
- Review jobs and discovery runs are written by the server worker only (service role); members can read them.
- Tests run: `bash revenue-center/tests/schema-tests.sh` against a throwaway local Postgres 16: **42 passed, 0 failed** (structure, anonymous, cross-organization isolation, roles, integrity, proposal approval gate). Two of my own first-draft tests were wrong and were fixed; the schema was not changed.
- UNVERIFIED: Supabase security/performance advisors (need a real project), behaviour under real Supabase Auth/PostgREST (local test uses a stand-in `auth.uid()`), generated database types, the review_findings table (findings still live inside `report` jsonb as in the original).

## Step 1 findings

### Source: HLG-Revenue-Center-Claude-Handoff.zip (snapshot 2026-11-17)
- `service-source.zip` (BTI, v11, cde22c67): editable Worker (`worker/api.js` 47 lines, `index.js` 119, `offers.js` 33, `reviews.js` 35), schema (`db/schema.ts`, 19 lines), `drizzle/0000-0003`, offer builder (`frontend/service-offer-builder/`), compiled Next.js frontend, `scripts/test-discovery.mjs`.
- Exports: 850 prospects (`service-pool.json`), 4 CRM files, 5 reviews, 13 ingest records, 0 offers.
- Sports (105 seed entries) and Hockey (27 records, 7 comparison rows) are separate workspaces for later.
- `integration/source-files.json` = 13-file patch for `apps/hl-bti-alpha` (browser-local Revenue Center UI, base 7b67610). 7 files are new, 6 modify existing files. `apps/hl-bti-alpha` has no changes between 7b67610 and HEAD, so the patch applies on the same base. Not yet applied. It has no Supabase writes.
- Optional `HLG-BTI-Revenue-Center.zip` was supplied later and inspected: its 13 `apps/hl-bti-alpha` + docs files are byte-identical to `integration/source-files.json` in the Nov 17 archive, and `HLG-BTI-Revenue-Center.patch` passes `git apply --check` on this branch (13 files, +8607/-13). NOT applied yet (browser-local UI; applying is a separate step). Its `discovery-server/` is an OLDER copy of the BTI server: no `service_offers` table (`drizzle/0003`), no offer builder, no `worker/offers.js`/`index.js`, older `api.js`/`reviews.js`. The Nov 17 `service-source.zip` is the newer superset, so port from that and ignore the old `discovery-server/`.

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
Step 2b, local only: add atomic enqueue + claim/lease/complete functions (port of enrollReview/claim/complete), normalized review findings, then port `test-discovery.mjs` assertions to Postgres. No remote changes until decision 1 is answered.

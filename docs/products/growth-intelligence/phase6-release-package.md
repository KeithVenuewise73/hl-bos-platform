# Revenue Center — Phase 6 release package

**Date:** 2026-11-05 · **Branch:** `claude/hlg-growth-intelligence-phase5` · **PR:** #115
**Status:** ready for a controlled production release **decision**. Nothing has been
applied to production, merged, connected, sent or paid for.

Labels: **VERIFIED** (run or read by me today) · **DOCUMENTED** · **NOT VERIFIED** · **ASSUMPTION**.

## 1. Architecture

```
 Website forms (HLD, HSCS)        Discovery (mock today; Places when approved)     Referrals
   site server, service account     backfillCampaign(campaign from DB)               other business
          │ buildInquiry (validate,        │ begin_discovery_run (spend caps)            │
          │  spam, route, attribute)        │ identity keys → register_prospect           │
          ▼                                 ▼                                             ▼
   revenue.ingest_inquiry ─────────► visibility.prospects + revenue.prospect_profiles ◄── revenue.decide_referral
          │ needs_review ─► owner decides      (tenant = business line; RLS isolates)
          ▼
   Send to Review ─► revenue.send_to_review (one transaction; evidence by kind; idempotent)
          ▼
   revenue.draft_proposal ─► revenue.submit_proposal (DB refuses unpriced)
          ▼
   revenue.approve_commercial (designated owner; exact-version fingerprint)
          ▼
   revenue.queue_outreach (approved + unchanged proposal; comms enforces consent & suppression)
          ▼
   revenue.approve_commercial (message) ─► revenue.release_outreach ─► provider (mock only)
          ▼
   revenue.record_response ─► stage / suppression        Dashboards: revenue.industry_summary,
                                                         loadEvents → growthDashboard (synthetic labelled)
```

Code: `packages/growth-intelligence` (workflow, industries, identity, inquiry, discovery,
Supabase adapter). SQL: `supabase/proposed/revenue-center/revenue_center_controls.sql`
(proposed; not in `supabase/migrations`). Console: `apps/control-center/src/app/revenue`.

## 2. Production-equivalent validation (VERIFIED)

- Rebuilt HL-BOS Core from PR #113's archive: **111/111 migrations replayed** in production's
  order (`scripts/local-test/build-prod-equivalent.sh`). The 9 stamp-only ledger rows were
  replaced from the commits they name (`625c0f3`, `45c3418`). All 9 are byte-identical to `main`.
- Compared every application object with production (read-only fingerprints,
  `scripts/local-test/schema-fingerprint.sql`): **4,281 of 4,303 identical by definition hash
  (99.49%)**. Of the remaining 22:
  - 10 functions differ only in comments (identical once comments and whitespace are removed).
  - 11 objects exist in production but in no migration: schema `hlbos_stage`, with two tables
    and their keys, indexes, RLS flags and grants. They were created by hand.
  - 1 function (`disco._perftest_page`) is created by a migration but no longer exists in
    production. It was dropped by hand.
  - 1 constraint (`vstudio.pain_signals_source_url_present`) differs between **PostgreSQL 16 and
    17**: `E'\v'` is stored as a vertical tab on 17 and as the letter `v` on 16.
- **Replay needs production's `search_path` (`"$user", public, extensions`).** Without it, 39
  `citext` CHECK constraints become case-sensitive instead of case-insensitive. The build script
  sets it.
- Never replay as-is:
  - `dma_0002_seed` needs a production user id; a placeholder is used locally.
  - `jobscout_0006_schedule` schedules cron jobs that call live functions; stubbed locally.
  - `jobscout_0002a` uses `pg_net`; stubbed locally.
  - `temp_perftest_page_twin` creates an object production later dropped.
  - The 9 stamp rows contain no SQL.
- **NOT VERIFIED:** PostgreSQL 17 itself. Only PostgreSQL 16 is installed here, and
  downloading a 17 binary was refused by this session's policy.

## 3. Migration impact (proposed migration, verified on the production-equivalent copy)

| Change                                                                                                                                                                     | Kind                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| New schema `revenue`: 17 tables, 3 views (all `security_invoker`), 30+ functions                                                                                           | additive                                                           |
| `workflows.decide`                                                                                                                                                         | **narrowed**: refuses commercial approvals                         |
| `comms.record_delivery`                                                                                                                                                    | **narrowed**: no `sent`/`delivered` without approval               |
| `comms.has_consent`, `comms.request_message`                                                                                                                               | contact comparison made case-insensitive (fixes an opt-out bypass) |
| Triggers on `visibility.content_assets`, `comms.messages`, `comms.consent`, `comms.suppression`                                                                            | added (void approval on edit; lower-case contacts)                 |
| Permissions `revenue.commercial_approval.manage` (tenant_owner only), `revenue.approver.assign` (platform_owner), `revenue.inquiry.create` (service_account, owner, admin) | additive                                                           |
| Template `inquiry_received`                                                                                                                                                | additive                                                           |

Fingerprint diff on the production-equivalent copy: **+268 objects, 4 changed, 0 removed**.
**Rollback** (`revenue_center_rollback.sql`) restores the fingerprint exactly: **4,294 → 4,294, 0 differences**.
Existing database tests on the pgTAP stand-in give the same result with and without the
migration: **744 pass, 0 fail**. That includes the workflows, communications, visibility,
entitlements, events and tenant-isolation suites. Real pgTAP runs in CI only once the file
moves into `supabase/migrations`.

**Ordinal:** not assigned. Production uses 0055 twice already, and PR #114 proposes 0055–0059.
Assign the next free number when #113 and #114 are settled.

## 4. Authorization matrix (enforced in the database; tested)

| Action                                            | tenant_owner (designated)                 | tenant_owner (not designated) | manager | staff / viewer | website service account | other business | anon |
| ------------------------------------------------- | ----------------------------------------- | ----------------------------- | ------- | -------------- | ----------------------- | -------------- | ---- |
| Read own business's prospects, reviews, inquiries | ✓                                         | ✓                             | ✓       | read           | ✗                       | ✗              | ✗    |
| Register / review / draft proposal                | ✓                                         | ✓                             | ✓       | ✗              | ✗                       | ✗              | ✗    |
| Approve proposal or outreach                      | ✓ (exact version)                         | ✗                             | ✗       | ✗              | ✗                       | ✗              | ✗    |
| Approve campaign / set paid discovery             | ✓                                         | ✗                             | ✗       | ✗              | ✗                       | ✗              | ✗    |
| Submit website inquiry                            | ✓                                         | ✓                             | ✗       | ✗              | ✓ (own business only)   | ✗              | ✗    |
| Decide an uncertain inquiry                       | needs access to both businesses           |                               |         |                |                         |                |      |
| Accept a referral                                 | receiving business's manager or owner     |                               |         |                |                         |                |      |
| Mock delivery                                     | platform worker only, mock providers only |                               |         |                |                         |                |      |
| Assign business lines / designate approver        | platform owner only                       |                               |         |                |                         |                |      |

The Supabase adapter (`supabase-rpc.ts`) also limits calls to a fixed allow-list of `revenue.*`
functions and `revenue`/`visibility` reads. `comms`, `workflows` and `identity` stay unexposed.

## 5. External integrations — prepared, not active

| Integration               | State                                                                      | Needs                                                              |
| ------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Google Places (discovery) | `placesDiscovery` built, **off**; database cap defaults to 0 paid requests | API key (owner); a monthly cap set by the owner                    |
| Google Business Profile   | readiness model only                                                       | Google API approval; HLG-owned profiles only (not for prospecting) |
| Search Console, GA4       | readiness model; attribution parser                                        | owner sign-in; GA4 tag + consent banner on both sites              |
| Google Ads                | readiness model only                                                       | account and developer token; spend is the owner's decision         |
| Email delivery            | mock provider only; real providers seeded inactive                         | provider choice, sender domain (SPF/DKIM), owner switch-on         |
| AI narrative              | not built; deterministic reviews only                                      | Anthropic key; text must pass the same validators and approval     |

## 6. Release procedure (each step needs its own owner approval)

1. Merge #113 (archive only).
2. Settle #114's numbering. Merge or hold it.
3. Move this migration into `supabase/migrations` with the next ordinal; let CI run real pgTAP.
4. Snapshot production (Supabase backup), then **apply the migration**.
5. `revenue.set_business_line`: HLD = the existing `herman-legacy-digital` tenant. HSCS =
   **a new tenant, or `hscs-government`? (owner decision)**.
6. `revenue.designate_approver`: the owner, for both businesses.
7. Activate `visibility` and `visibility.content` for both tenants.
8. Adopt the 50 existing barbershop prospects (`revenue.adopt_prospect`, `is_synthetic = false`,
   identity keys from `transform_audit.shop_profiles`).
9. Expose the `revenue` schema to the API, then confirm `anon` has no access
   (the grant-posture test, run against production read-only).
10. Console: switch to `supabaseRpc` with the owner's session.
11. Prices, consent wording, email provider and discovery cap, as each is approved.

**Rollback:** run `revenue_center_rollback.sql` (export `revenue.*` first, because it deletes
it), or restore the snapshot from step 4.

## 7. Commercial configuration required (owner)

- Prices for 7 HLD and 7 HSCS offers (none are set; proposals cannot be approved without them).
- Consent wording (version string), and separate marketing opt-in wording for both forms.
- The notification address for new inquiries.
- Campaigns: markets, radius and target for each of the 8 industries (default target 50).
- The monthly paid-discovery allowance (default 0).

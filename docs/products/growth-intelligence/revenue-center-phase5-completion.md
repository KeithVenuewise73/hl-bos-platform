# Revenue Center — Phase 5 completion (development)

**Date:** 2026-11-05 · **Branch:** `claude/hlg-growth-intelligence-phase5` · **PR:** #115
**Status:** built and proven on an isolated local database. Nothing applied to
production, nothing merged, no connector activated, nothing sent.

## 1. Interface and behaviour comparison with the original

The original (`hlg-revenue-center.kherman7373.chatgpt.site`) **could not be opened** —
this environment's network policy denies the host. Its source has **not** been recovered.
The left column is what the cross-review DOCUMENTED; nothing in it was observed by me.

| Original (documented, not observed)       | HL-BOS Revenue Center (built, `/revenue` in the Control Center)                               | Match                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------- |
| 400-prospect dashboard, 8 industries × 50 | Industries table: target 50 open per industry, open count, backfill needed                    | 7 industries grounded; **8th unknown** |
| Automated discovery + backfill            | `backfillIndustry` over a `LeadSource`; mock source in development; Presence Scanner for real | Behaviour yes; live source not run     |
| One-click Send to Review                  | **Send to Review** button → `revenue.send_to_review` (one transaction, idempotent)            | Yes                                    |
| CRM record + review history               | `visibility.prospects` + `revenue.prospect_profiles`; every review kept; audit trail          | Yes                                    |
| Automated assessments                     | Presence Scanner evidence → scored categories, evidence by kind                               | Yes (rules, not AI)                    |
| Findings, recommendations, opportunities  | Recommendations column; weaknesses (observed) and services (estimated) stored separately      | Yes                                    |
| HLD and HSCS acquisition workflows        | One tenant per line; funnels as specified; HSCS on its own tenant                             | Yes                                    |
| Browser-local storage                     | Replaced by the database                                                                      | Deliberately different                 |
| (not documented)                          | Owner approval queue showing the exact version; outreach held until approved and consented    | Added                                  |

**Not reproduced, because unknown:** the original's layout, wording, colours, the exact 8
industries, its scoring rubric, any fields beyond those listed above.

### What to export from the original so it can be reconciled

1. The **source code** (ChatGPT's code/export download, or the files from the editor).
2. The **list of the 8 industries** and the search terms each used.
3. One **browser-storage export** of its data (`localStorage` JSON), only if you want its
   prospects brought in. They would be imported as `discovery_source = 'import'`, and each
   would be checked again before it counts as a lead.
4. **Screenshots** of each screen, if the source export is not available.

Alternatively, allow the host in this environment's network settings and I will inspect it.

## 2. Migrations — what exists, what is proposed

| Set                       | Where                                                          | State                                                                                                      |
| ------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `main` (54)               | `supabase/migrations`                                          | 0 real content differences from production on shared versions (verified)                                   |
| PR #113 (111, recovery)   | `supabase/recovery/production-2026-11/`                        | Matches production 111/111 (verified). Archive only — kept apart from executable migrations                |
| PR #112 (7, recovery)     | `supabase/recovered/production-2026-10-17/`                    | Archive of the fleet migrations already in production; no overlap with this work                           |
| PR #114 (5, executable)   | `supabase/migrations` 0055–0059                                | Overlaps `comms` (adds `enqueue_internal`, `dev_dispatch_mock`); no clash with the functions replaced here |
| **This PR (1, proposed)** | `supabase/proposed/revenue-center/revenue_center_controls.sql` | **Not executable by CI or `supabase db reset`.** Applied only to the isolated test database                |

**No migration was renumbered.** The proposed file takes the next free ordinal on the day
it is approved. If #114 merges first, that is 0060. Production already uses 0055 for two
different migrations (`hlbos_0055_proposal`, `hlbos_0055_barberos_audit_public_api`) under
different timestamps. Supabase keys its ledger by timestamp, so these do not clash in the
database. They do clash for people reading the numbers.

**#114 interaction to check at merge time:** its `comms.dev_dispatch_mock` marks
`queued` messages `sent` directly, without `comms.record_delivery`. It never touches
`pending` (unapproved) messages, so it does not bypass the approval gate. It does skip the
new delivery guard. Recommendation: route it through `revenue.mock_deliver`.

## 3. Deployment checklist (each line is its own approval)

1. Merge PR #113 (archive; applies nothing).
2. Decide #114's numbering; merge or hold it.
3. Assign this migration its ordinal; move it into `supabase/migrations`; CI runs it with pgTAP.
4. **Apply the migration to HL-BOS Core** (your approval; production holds 0 comms rows, 0 proposals).
5. Provision two first-party tenants, **HLD** and **HSCS**, through `platform.provision_tenant`.
6. **Designate the commercial approver** (`revenue.designate_approver`, platform owner): you, for both.
7. Activate the `visibility` module and `visibility.content` entitlement for both tenants.
8. Expose the `revenue` schema to the Supabase API (Project settings → API → schemas). `comms` and `workflows` stay unexposed.
9. Console: replace the development data source with a signed-in Supabase session (no service key).
10. Set prices for every HLD and HSCS offer.
11. Choose and connect an email provider. It stays inactive until you switch it on; outreach waits for your approval regardless.
12. Review the consent wording on both website forms, and decide where consent records come from.
13. First live discovery: a Google Places key (cost shown per scan) or an imported list.

## 4. Owner approvals required (exactly)

| #   | Decision                                                | Unlocks                                     |
| --- | ------------------------------------------------------- | ------------------------------------------- |
| 1   | Merge PR #113                                           | Clean migration history                     |
| 2   | Apply the Revenue Center migration to production        | Everything below                            |
| 3   | Create the HLD and HSCS tenants                         | Separate records per business               |
| 4   | Designate yourself as commercial approver (per tenant)  | Proposal and outreach approval              |
| 5   | Prices for each offer                                   | Proposals that can leave draft              |
| 6   | Email provider and sender address                       | Any outreach at all (after your approval)   |
| 7   | Consent wording and consent sources                     | Marketing outreach                          |
| 8   | Google Places key, or an approved import list           | Live discovery                              |
| 9   | Export or network access to the original Revenue Center | Reconciling the 8 industries and the layout |
| 10  | Merge PR #115                                           | This code on `main`                         |

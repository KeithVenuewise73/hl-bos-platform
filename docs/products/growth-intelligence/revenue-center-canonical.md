# One canonical HLG Revenue Center inside HL-BOS

**Date:** 2026-11-05 · **Status:** design, plus the first end-to-end workflow built and
tested on a local database. Nothing deployed, migrated or sent.

Labels: **VERIFIED** (I ran it or read it today) · **DOCUMENTED** (stated by someone else,
not checked by me) · **NOT VERIFIED** · **ASSUMPTION**.

## 1. The hosted Revenue Center (hlg-revenue-center.kherman7373.chatgpt.site)

- **NOT VERIFIED — could not be opened.** This session's network policy denies that host
  (HTTP 403 at the proxy; the fetch tool cannot resolve it). Nothing about its screens,
  code or data has been inspected. No source-code recovery path was found: it is not in
  any of the 14 repositories this account can reach (by name — GitHub code search does not
  work from here).
- **DOCUMENTED (by the ChatGPT cross-review, not checked):** a 400-prospect dashboard, 8
  categories × 50; automated discovery and backfill; one-click Send to Review; CRM record
  creation with review history; automated assessments; findings, recommendations and
  commercial opportunities; HLD and HSCS acquisition workflows; browser-local storage;
  live backend unverified.
- **To proceed:** allow the host in this environment's network settings, or export its
  source/build (ChatGPT's own export, if it offers one) and add it to a repository.

## 2. The canonical model — one system, mapped onto what HL-BOS already has

| Revenue Center concept (as described) | Canonical home in HL-BOS                                                                                           | Status                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 8 categories × 50 prospects           | Presence Scanner verticals (6 today) + scan `maxResults`                                                           | Partial. 2 categories missing; which 8 is NOT VERIFIED                                   |
| Automated discovery + backfill        | Presence Scanner (Places / list import), dedupe and rescan                                                         | Built, local only; Places never called live                                              |
| Prospect records                      | `visibility.prospects` via `visibility.create_prospect`                                                            | **Wired and tested (local DB)**                                                          |
| Send to Review                        | `RevenueCenter.sendToReview` → `visibility.start_assessment`                                                       | **Wired and tested.** Refuses a second open review                                       |
| Automated assessment                  | Presence Scanner score → `visibility.score_category` (only checked parts)                                          | **Wired and tested.** Deterministic                                                      |
| Findings, recommendations             | `visibility.add_recommendation` — `weakness` (observed, with source/date/confidence), `service` (estimated, cited) | **Wired and tested**                                                                     |
| Review history / CRM history          | `visibility.assessments` (one row per review) + `audit.events` (who/when)                                          | **Tested:** 2 reviews, both kept, audit attributed                                       |
| HLD vs HSCS pipelines                 | One tenant per line; routing decides the tenant; RLS isolates                                                      | **Tested:** HLD user cannot see or write HSCS                                            |
| Proposal draft                        | `visibility.draft_content(kind 'proposal')`, body = PR #115's proposal                                             | **Wired and tested**                                                                     |
| Owner approval                        | `visibility.submit_content_for_approval` → `workflows.decide`                                                      | **Wired and tested** — but see the known gap below                                       |
| Authorised outreach queued            | `comms.request_message(marketing, require_approval)` → `workflows.decide` → `comms.approve_message`                | **Wired and tested.** Database refuses without consent; ends at `approved`, never `sent` |
| Browser-local storage                 | Replaced by the above                                                                                              | —                                                                                        |

## 3. AI vs deterministic rules

| Function                                          | Needs AI?              | Why                                                                                   |
| ------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| Discovery, dedupe, backfill                       | No                     | Search APIs + matching rules; must be repeatable                                      |
| Routing to HLD / HSCS                             | No                     | Campaign → website → industry; a person decides conflicts                             |
| Website and visibility checks, scoring            | No                     | Observed facts must be reproducible and auditable                                     |
| Choosing services from findings                   | No                     | BTI growth map; same input, same answer                                               |
| Pricing                                           | No — and not automated | The owner's price book                                                                |
| Honesty checks (promises, private data, evidence) | No                     | Rules are testable; a model can be talked out of them                                 |
| Writing the narrative of a review or proposal     | **Yes, optional**      | Wording only, over the facts above; held to the same validator; Anthropic key not set |
| Drafting a personalised outreach message          | **Yes, optional**      | Wording only; owner approves the exact text                                           |
| Reading unstructured HSCS intake (customer docs)  | **Yes, later**         | Extracting figures the customer supplied; marked `customer_provided`                  |
| Feedback summaries ("why we lose deals")          | Optional               | Counting is rules; summarising free-text reasons can use AI                           |

## 4. Migration version identities (verified 2026-11-05, read-only)

- **PR #113's manifest matches production exactly:** 111 of 111 versions, names and
  statement MD5s, recomputed by me in the production database.
- **`main` vs production, same version number (28):** 19 identical once comments and
  whitespace are ignored (production stores migrations with comments stripped); 9
  production rows are one-line stamps (`-- applied from git …`) whose content cannot be
  compared from the ledger. **0 real content differences.**
- **`main` files under a version production never recorded (26):**
  - 14 are in production under a different version with the **same content** (e.g. 0029,
    0031, 0033, 0036–0038, 0040–0043, 0047, 0048 ats_resume_optimizer, 0051 hype_video).
  - 5 are in production under a different version with **different content**: 0032,
    0034, 0035, 0039 (production ran 0034 → r01 → r02 → 0039 step by step; `main` has a
    consolidated form), and 0046 social_publishing.
  - 9 are **not in production at all**: 0030 ceo_notebook, 0044, 0045 (production has
    0044a/0044b and 0045_…_honestly instead), 0049 highlightai_football, 0050 sceneflow,
    0052 jersey_sort, 0053, 0054.
- **Production versions with no file on `main`: 83.**
- **Number collisions:** production already uses 0048, 0049, 0051, 0055 for different
  things than `main`; PR #114 proposes 0055–0059. **Recommendation:** merge #113 as the
  archive it is (it applies nothing), then give new migrations numbers from **0060** up,
  and renumber #114 before it merges. No renumbering is done here.

## 5. Known gaps found by testing (not fixed — each needs a migration and your approval)

1. **Owner-only approval is not enforced by the database.** The `manager` role, which a line
   lead needs in order to work prospects, also holds `workflows.approval.manage`. A test pins
   this; it will fail the day the gap is closed.
2. **Send to Review is several database calls, not one transaction.** A network failure
   mid-way would leave an open review that blocks the next one. Fix: one SQL function.
3. **No column for assumptions or "not checked" items** on `visibility.assessments`; today
   they live only inside the proposal draft.
4. **`comms` is not exposed through PostgREST** (by design), so the console needs a
   server-side route to queue outreach in production.
5. **Two of the eight categories are missing** from the scanner, plus a transportation
   category for HSCS.

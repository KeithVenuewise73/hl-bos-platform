# HLG Growth Intelligence — Phase 5

**For:** Keith Herman, CEO · **Author:** Claude (engineering) · **Date:** 2026-11-05
**Status:** Audit done. First development slice built and tested on branch
`claude/hlg-growth-intelligence-phase5`. Nothing deployed, migrated, sent, published or
paid for. Production was read only (row counts and schema), never changed.

Labels used throughout: **VERIFIED** (I ran it or read it myself today), **DOCUMENTED**
(a doc in this repo says so; I did not re-check), **NOT VERIFIED** (could not check),
**ASSUMPTION** (my inference).

---

## A. Audit — what exists today

### There is no system called "Revenue Center"

**VERIFIED** for `hl-bos-platform` (full-text search of the checkout) and for the HL-BOS
Core database (no such schema or table). **NOT VERIFIED** for the other 13 repositories
this account can reach: GitHub code search returned zero results even for terms that
certainly exist, so it is not working from here and proves nothing. None of those
repository names suggests a revenue center (`HSCS-GLP`, `homehuddle`,
`herman-supply-chain`, websites) — ASSUMPTION. The capabilities the brief attributes to
it exist in this repository under other names, listed below. Growth Intelligence is
built into those, not beside them.

| Brief's name             | What it actually is                                                                                                                                                                                | State                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Discovery engine         | `packages/presence-scanner` (Places or pasted list → website scan → evidence-backed score → qualification → dedupe) and the console's **Presence Scanner** page                                    | **Partially operational** — VERIFIED tests pass; runs locally; Google Places never called live (no key — DOCUMENTED)              |
| Replacement / backfill   | Presence Scanner de-duplication + rescan (update instead of duplicate)                                                                                                                             | **Partially operational** — local only                                                                                            |
| AI Business Review       | Presence Scanner score + BTI growth map (`packages/bti-engine`), and `transform_audit.*` in production (40 runs over 50 barbershops)                                                               | **Partially operational.** Rules-based, not AI: no Anthropic key is set (DOCUMENTED). The 40 production runs are VERIFIED present |
| Recommendation engine    | BTI `analyzeGrowth` → suggested services                                                                                                                                                           | **Operational in code**, local                                                                                                    |
| CRM                      | Console lead board (file store on your PC) with stages + audit trail; `visibility.prospects` in HL-BOS Core (50 rows, VERIFIED); `packages/transformation-intelligence/src/crm.ts` is a model only | **Partially operational.** No CRM writes to a database from any app                                                               |
| Dashboard                | `transformation-intelligence/growth-dashboard.ts` — a static model, every growth figure fixed at zero                                                                                              | **Not operational** for real data. Replaced in practice by the new page below                                                     |
| Proposals / agreements   | `sales.proposals` (0 rows), `sales.agreements` (5 rows), `sales.prices` (0 rows) in production                                                                                                     | **Schema only.** VERIFIED no proposals and no prices exist                                                                        |
| Email / consent          | `comms.*` in production: 4 providers, 2 templates, 0 consent records, 0 messages                                                                                                                   | **Schema only.** Nothing has ever been sent                                                                                       |
| Billing                  | `billing.*`: 2 plans, 4 prices, 0 subscriptions, 0 payments; Stripe seeded inactive (DOCUMENTED in table comment)                                                                                  | **Not operational**                                                                                                               |
| Lead capture (HLD site)  | `apps/herman-legacy-digital` intake forms; deliver to `HLD_INTAKE_WEBHOOK_URL`, which is not configured, so leads are logged only (DOCUMENTED in code). PR #103 (draft) fixes the visitor message  | **Not operational** — no inquiry reaches any CRM                                                                                  |
| Lead capture (HSCS site) | `apps/hscs-website` request-an-assessment page; production table `public.hscs_assessment_requests` in the _Herman Legacy Business Platform_ project has **0 rows** (VERIFIED)                      | **NOT VERIFIED** end to end                                                                                                       |
| Google Business Profile  | Connector row `google_business` seeded in `integrations.connectors`; `integrations.connections` has **0 rows**                                                                                     | **Missing.** Never connected (VERIFIED)                                                                                           |
| Google Search Console    | Connector row seeded; 0 connections                                                                                                                                                                | **Missing** (VERIFIED)                                                                                                            |
| Google Analytics 4       | No connector row; no GA4 tag in any app (code search, VERIFIED). HLD site has its own `/api/event` sink that only logs                                                                             | **Missing**                                                                                                                       |
| Google Ads               | Nothing                                                                                                                                                                                            | **Missing**                                                                                                                       |
| Tenancy / roles / audit  | `identity.*` (8 roles, 133 permissions, 4 memberships), `audit.*`, RLS on every table listed (VERIFIED)                                                                                            | **Operational** schema; 77+ pgTAP tests (DOCUMENTED)                                                                              |
| AI gateway               | `ai.*`: 2 providers, Anthropic inactive, 0 runs (VERIFIED)                                                                                                                                         | **Not operational** (no key)                                                                                                      |
| Marketing model          | `dma.*` (28 tables): HLD and HSCS exist as clients; 0 leads, 0 campaigns (VERIFIED)                                                                                                                | Reference data only                                                                                                               |

### Repository and branch state that constrains this work

- **VERIFIED.** Production (HL-BOS Core) has applied **111 migrations; 65 have no file on
  `main`**, and numbers 0044/0045/0049 collide (PR #113, open, unmerged). Draft PR #114
  claims migration numbers 0055–0059. **Any new schema now would collide.** So this slice
  adds **no migration**.
- **VERIFIED.** Open PRs that overlap: #113 (recovery — must merge first), #114 (SalonOS,
  commercial modules + comms enqueue), #112 (HSCS fleet backend), #103 (HLD inquiry
  delivery), #93 (premium HLD/HSCS sites). None of them is touched here.
- **VERIFIED.** Three Supabase projects: HL-BOS Core (platform), Herman Legacy Business
  Platform (public website forms, KPI data), Venuewise Platform (legacy — out of scope per
  the operating contract; not opened).

---

## B. Architecture

```
   Discovery (existing)            Inbound (existing sites)        Referrals
   Presence Scanner ──┐            HLD site / HSCS site ──┐         (entered by a person)
                      ▼                                    ▼                │
              ┌───────────────────── routeLead ─────────────────────────────┘
              │  campaign → inbound website → industry; disagreement → you decide
              ▼
     ┌──────── HLD line ────────┐          ┌──────── HSCS line ────────┐
     │ AI Digital Review        │          │ Transportation Review      │   buildReview:
     │ observed / assumed /     │          │ public indicators only;    │   facts, assumptions and
     │ estimated, kept apart    │          │ private figures only from  │   estimates in separate
     └───────────┬──────────────┘          │ the customer               │   fields; validator
                 ▼                         └───────────┬────────────────┘   refuses mixing
          buildProposal  ◄── price book (yours) ──►  buildProposal
                 │   blocked until priced; no savings or ranking promises
                 ▼
          approval gate (approve / execute): owner only, tied to exact content,
          outreach needs a consent record — the only path to send/publish/spend
                 ▼
   events ──► dashboards (HLD · HSCS · both)  ──► feedback loop (min. sample 5)
              demo excluded · unknown ≠ zero · CAC/LTV only when the data supports it
                 ▲
   Google connectors (GBP, Search Console, GA4, Ads, PageSpeed): "connected" only after
   a saved credential answers a test call; credentials in Vault / .env.local, never git
```

Isolation: each line will be its **own HL-BOS tenant**, so the existing row-level security
keeps HLD and HSCS records apart in the database. Until records move there,
`LineScopedStore` enforces the same rule in code (a line lead sees only their line;
consolidated is owner-only; another line's record reads as absent).

Funnels map onto the existing `visibility.prospect_stage` enum and onto Google Analytics'
own lead events (`generate_lead`, `qualify_lead`, `working_lead`, `close_convert_lead`), so
no second workflow and no custom analytics vocabulary.

---

## C. Implementation plan — minimum changes, in order

| #   | Change                                                                                                                                                                                                                  | Where                                                                | Depends on          | Your decision?                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------- | ------------------------------- |
| 1   | **Done (this PR).** Growth Intelligence engine + read-only console page                                                                                                                                                 | `packages/growth-intelligence`, `apps/control-center/src/app/growth` | —                   | Merge approval                  |
| 2   | Merge recovery PR #113, then renumber #114                                                                                                                                                                              | repo                                                                 | —                   | Merge approval                  |
| 3   | Two tenants: HLD and HSCS (rows, via the existing `provisioning` functions)                                                                                                                                             | HL-BOS Core                                                          | 2                   | Approval to run                 |
| 4   | **One migration:** `growth.events`, `growth.campaigns`, `growth.expenses`, `growth.reviews` (tenant-scoped, RLS, insert via functions only, `is_demo` NOT NULL); seed `google_analytics_4`, `google_ads` connector rows | `supabase/migrations` (next free number after #113/#114)             | 2                   | Migration approval              |
| 5   | Database-backed repository behind the same interfaces; console page reads it                                                                                                                                            | `apps/control-center/src/lib`                                        | 4                   | —                               |
| 6   | HLD site intake → HL-BOS (finish #103's delivery path into `growth.events` + `comms.consent`)                                                                                                                           | `apps/herman-legacy-digital`                                         | 4, #103             | —                               |
| 7   | HSCS assessment form → HL-BOS (same path)                                                                                                                                                                               | `apps/hscs-website`                                                  | 4                   | —                               |
| 8   | Campaign key on a Presence Scanner scan, plus a transportation vertical, so HSCS discovery routes by campaign (today scanned leads route by vertical, which is HLD)                                                     | `packages/presence-scanner`                                          | —                   | —                               |
| 9   | Google sign-in on the console's Connections page (Search Console, GA4 read-only; Business Profile after Google approves API access); test call recorded as evidence                                                     | `apps/control-center/connect`                                        | your Google sign-in | **Yes — grant access**          |
| 10  | GA4 tag + Consent Mode on both sites; UTM tag on each Business Profile website link                                                                                                                                     | both site apps                                                       | GA4 properties      | Approval to publish site change |
| 11  | Proposal screen: review → proposal → approve → send (uses `comms` + `sales.proposals`)                                                                                                                                  | console                                                              | 4, prices           | **Yes — set prices**            |

**Estimated operating costs** (list prices as of my training; re-check before relying):
Search Console, GA4 standard, Business Profile API — no charge. PageSpeed — no charge
within quota. Google Places (discovery) — the scanner already shows an estimate per scan
(DOCUMENTED in `places.ts`). Google Ads — only what you choose to spend. Claude for AI
reviews — per-token; the AI gateway records real cost per run once a key is added. Supabase
— the existing project; small tables. **No new paid service is required by steps 1–8.**

---

## D. What was built (this PR)

`packages/growth-intelligence` — pure TypeScript, no storage, network or AI calls:

| File                | Does                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `business-lines.ts` | 7 HLD and 7 HSCS offers (no prices), both funnels as specified, mapped to the HL-BOS stage enum and GA4 lead events                          |
| `routing.ts`        | campaign → inbound site → industry; disagreement or no match → `needs_review`                                                                |
| `isolation.ts`      | owner / line lead / line viewer; line-scoped store; records cannot be moved between lines                                                    |
| `review.ts`         | review from a Presence Scanner lead; observed vs assumed vs estimated; private HSCS figures refused unless customer-provided; promise filter |
| `proposal.ts`       | all required sections; blocked until priced; cheaper alternatives always listed; always `requiresApproval`                                   |
| `approval.ts`       | owner-only approval bound to a content hash; outreach needs a consent reference                                                              |
| `attribution.ts`    | UTM / gclid / referrer → channel; first and last-non-direct touch                                                                            |
| `google.ts`         | connector catalogue (narrowest scopes), readiness from evidence, Business Profile creation eligibility gate                                  |
| `dashboard.ts`      | HLD, HSCS and consolidated metrics with a status on every figure                                                                             |
| `feedback.ts`       | conversion by industry / channel / offer, frequent problems, lost reasons, requested capabilities; recommendations only at sample ≥ 5        |
| `from-presence.ts`  | Presence Scanner leads → routed events, from the audit trail only                                                                            |

Console: **Growth Intelligence** link on the home page → `/growth`. Screenshot:
[`console-growth-page.png`](console-growth-page.png) (the real state: no leads saved, so
every figure says why it is empty).

---

## E. Pilot readiness — what stands between HLD/HSCS and real, measured leads

| Needed                                                                 | Who           | Status        |
| ---------------------------------------------------------------------- | ------------- | ------------- |
| Approve merging PR #113 (recovery)                                     | You           | Waiting       |
| Approve one Growth migration (step 4) after #113                       | You           | Not written   |
| HLD and HSCS prices for each offer                                     | You           | Not set       |
| Google sign-in for Search Console and GA4 (read-only)                  | You           | Not connected |
| Apply for Business Profile API access; confirm which profiles HLG owns | You           | Not started   |
| Inquiry delivery from both sites into HL-BOS (steps 6–7)               | Me            | Not built     |
| Campaign key + transportation vertical in the scanner (step 8)         | Me            | Not built     |
| Consent wording on both forms reviewed                                 | You / counsel | Not reviewed  |
| Anthropic key, if reviews should be AI-written rather than rules-based | You           | Not set       |

Until those are done, the dashboard will truthfully show discovery figures from your own
computer and "not connected" for everything else.

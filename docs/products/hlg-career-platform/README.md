# HLG Career Platform — product record

|               |                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Code**      | `apps/ats-resume-optimizer` (interface), `packages/ats-resume` (engine; career journey in `src/career/`)         |
| **Schema**    | `supabase/migrations/…_hlbos_0053_career_platform.sql` — **written, verified locally, UNAPPLIED**                |
| **Status**    | Built and proven end to end on a local production build. **Not deployed. Not for sale.**                         |
| **Audience**  | Launch marketing: transportation, logistics, warehouse and operations. The product itself is occupation-neutral. |
| **Principle** | Optimize aggressively. Fabricate nothing.                                                                        |

## 1. Current-state assessment (evidence, 2026-10-31)

| Area                                 | Finding                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ATS app                              | Real and tested: resume parsing, evidence matching, claim validation, DOCX/PDF export, cover letters, interview prep, tracker. Used as the shell.                                                                                                                                                                                                                                                  |
| Auth and isolation                   | Supabase Auth with the publishable key only; fail-closed deployment guard (refuses to serve when deployed without sign-in). One store per account locally; forced RLS on every `ats` table.                                                                                                                                                                                                        |
| Database                             | 0048 file header says "APPLIED TO PRODUCTION 2026-09-16"; the app README, DEPLOYMENT.md and the console registry say UNAPPLIED. **Could not be checked:** the Supabase connector in this session sees only two unrelated projects, not `mvvtngiopdrgiedjmhfb`. Treat as unknown until checked.                                                                                                     |
| Billing, entitlements, notifications | `billing.*` and `entitlements.*` exist, but are **tenant (organisation)** scoped. Individual subscribers are not tenants, so they are not reused yet. No payment provider is connected. No notification sender is wired to this app.                                                                                                                                                               |
| AI                                   | Optional Claude provider for two steps. No key is configured, so everything runs on the deterministic rules engine.                                                                                                                                                                                                                                                                                |
| JobScout (`hl-jobscout`)             | Default branch still `claude/new-session-6h6i8n`. Deno + Supabase edge functions, single-user, Buffalo/WNY geography and a 71-employer seed list. 6 adapters (Greenhouse, Lever, Ashby, SmartRecruiters, Workday, ADP); iCIMS, Paylocity, Paycom, UKG, Taleo and SuccessFactors are detected but not ingested. Its README says migration 0009 (publish schedule) is not applied. **Not modified.** |
| Known gaps from the brief            | All three confirmed in code, all three fixed: a regenerated cover letter replaced the previous one; a new resume re-pointed an already-submitted application; status and dates had no server-side validation.                                                                                                                                                                                      |

## 2. What was built

Every step of the subscriber journey, as complete slices:

1. **Intake** (`/intake`): employment situation and search activity captured separately; confidentiality, start date / notice, titles, keywords, industries, goals, locations, commute, arrangement, relocation, travel, shifts, employment type, salary range with currency and period. Every criterion can be ticked as a **must-have**; everything else is a preference. Validation is server-side and returns every error at once, keeping what was typed. Employment situation is excluded from scoring **by type** (`SearchCriteria` omits it) and by test.
2. **Experience bank and base resume** (`/experience`): PDF/DOCX upload (validated by content, 5 MB max) or paste; every fact shows its source; correct or remove any fact; targeted questions (scope, metrics, systems, credentials, examples, transferable experience); **inferred skills wait for confirmation** before they count; a versioned base resume built only from bank facts; invented figures block approval; approved versions are never edited.
3. **Discovery** (`/jobs`): Greenhouse, Lever, Ashby and SmartRecruiters feeds (ported from JobScout, behind a fixed-host fetcher with timeout and size cap); manual import for everything else; duplicates caught (including previously-applied roles); expiry decided only from a successful read; source failures shown in plain English; the description snapshot and retrieval date kept. Coverage limits are written on screen: **LinkedIn and Indeed are not searched.**
4. **Application package** (`/opportunities/[id]`): Pursue → tailored resume, cover letter and recruiter note from the approved base resume plus verified facts. Unmet requirements listed honestly. Stage becomes **Documents Ready, never Applied.**
5. **Dashboard and archive** (`/pipeline`): all 13 stages, a transition table enforced on the server, found-via and submitted-via tracked separately. **Applied** is reachable only by confirming the submission with a date. The chosen documents are deep-copied, frozen and SHA-256 fingerprinted, and the files are re-verified before every download. Totals, follow-ups due, upcoming interviews and outcomes by source, counted from records.
6. **Interview practice** (`/opportunities/[id]/practice`): briefing, questions to ask, and questions built from the **submitted** resume; a working text loop with STAR-structure feedback that flags figures not in the bank. Multiple rounds, notes, thank-you drafts, follow-up reminders. No voice, so no recording.
7. **LinkedIn** (`/linkedin`): headline, About, experience and skills suggestions from verified facts (no "open to work" signal for a confidential search), post drafts in the subscriber's own words, and a content calendar. No publishing integration exists, so it is copy-and-post-yourself, and the page says so.
8. **Account** (`/account`): plan and monthly usage with server-side limits, estimated AI cost, data export (JSON), deletion of all data, support contact (`CAREER_SUPPORT_EMAIL`).

Stage mapping to the original `ats.application_status` enum is in `LEGACY_STATUS` (`packages/ats-resume/src/career/pipeline.ts`). The original enum is unchanged.

## 3. Verification — run, not asserted

| Check                                                                    | Result                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Engine unit tests (`packages/ats-resume`)                                | 112 pass (76 existing + 36 new)                                                                                                                                                                                                                              |
| App unit tests (`apps/ats-resume-optimizer`)                             | 46 pass (2 new, for career-record storage planning)                                                                                                                                                                                                          |
| Whole repository `pnpm test`                                             | 2,302 pass, 2 skipped, 0 failing                                                                                                                                                                                                                             |
| Typecheck (30 packages), format, lint, migration checks, lineage         | all pass. Lint needed `NODE_OPTIONS=--max-old-space-size=8192` locally; see blockers                                                                                                                                                                         |
| Migration 0053 against local PostgreSQL 16 (with 0048 and the auth shim) | 16 of 16 assertions: cross-account isolation, immutable submissions, usage records that cannot be deleted to reset a limit, erasure scoped to the caller, no anon access. Same file at `supabase/tests/53_career_platform.sql` for CI's real Supabase stack. |
| **End-to-end, real browser, production build, fictional candidate**      | **60 of 60.** Register is the only step not exercised: local mode has no sign-in, and sign-in needs the Supabase project.                                                                                                                                    |

The end-to-end run: intake (an invalid form is refused, the typed values survive) → upload (a fake PDF is refused; the DOCX is read into 18 facts) → confirm an inferred skill → answer a question → base resume (an invented "$40M budget / 900 drivers" line is flagged and blocks approval; the line is left out but stays in the bank) → approve → a job board fails (blocked network), and the failure is reported in plain English → manual import with location and salary → re-import caught as a duplicate → Pursue → Documents Ready with honest gaps → submission refused without the confirmation box and with a future date → confirmed → draft edited afterwards, **submitted resume byte-identical** → new browser session, open the exact submitted Word file, letter and posting → practice (feedback 1/5 → 5/5; an invented "47%" flagged) → interview, thank-you note, follow-up, Rejected with an outcome → dashboard counts → LinkedIn → no horizontal scroll at 390 px on three screens → export → deletion → empty export.

**Defects found by running it, all fixed with regression tests:**

1. An **associate degree was scored a strong match for a bachelor's requirement** (existing matcher). Degree levels are now compared; a shortfall caps the match at partial and says why.
2. A salary line ("Salary range: $82,000 – $95,000") was treated as a requirement and shown as a **missing qualification**, both as its own line and mid-paragraph.
3. A submission row with **no fingerprint passed its database CHECK**, because a NULL check passes. Fixed with `coalesce`.
4. Place names with commas ("Columbus, OH") were split into two locations.
5. The status menu could pre-select **Withdrawn** after a page update. It now defaults to "Choose…", and an empty choice is refused.

## 4. Pilot scope versus later

**Pilot (built):** everything in section 2, with the rules engine, local or single-project storage, manual import plus the four employer feeds, text practice, copy-and-paste LinkedIn.

**Later (backlog — not built):**

- Sign-up flow and subscriber onboarding emails (needs the auth project and a notification sender)
- Payment provider, checkout, cancellation and subscriber-level entitlements (the existing billing is tenant-scoped)
- Scheduled discovery runs and new-match alerts; Workday/ADP adapters (JobScout has them, but they need per-tenant tuning); iCIMS/Paylocity adapters; distance-based commute checks
- Claude-assisted phrasing for the career flow, with measured cost
- Voice interview practice, with explicit recording consent
- Authorised LinkedIn publishing (needs LinkedIn's API approval)
- Deleting the sign-in account itself (needs a service-side function; records are already erasable)
- Uploaded original files in private Storage (today only the extracted text is kept)

## 5. Operating-cost estimate (pilot)

| Item                             | Estimate                                                                                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting                          | Existing Coolify server: no new spend for a pilot of tens of users.                                                                                                                                                          |
| Database                         | Existing HL-BOS Supabase project. One row per career record; the pilot volume is trivial.                                                                                                                                    |
| AI                               | **$0 today.** Every career feature runs on the deterministic engine. The per-action Claude figures in `plans.ts` are placeholders that must be **measured** before Claude is switched on for this flow; they are not quotes. |
| Job-board reads                  | Public JSON feeds: no fee.                                                                                                                                                                                                   |
| **Marginal cost per pilot user** | **≈ $0/month** in infrastructure, until AI generation is enabled.                                                                                                                                                            |

## 6. Pricing recommendation (not approved, not live)

- **Pilot:** free and invite-only. Collect the real usage figures from the Account page meter.
- **Essentials, $19/month:** base resume, tracking, 15 tailored packages a month.
- **Pro, $39/month:** 60 packages, practice within fair use, LinkedIn calendar.

**Why.** For an hourly or salaried operations worker, a cancel-anytime, sub-$40 price is the realistic ceiling while they are job hunting. The product's cost to serve is near zero until AI is enabled, so these prices hold margin even at heavy usage. Validate them against current competitor pricing, and against pilot conversion, before enabling checkout. The plans are configurable in `PLANS`, and `checkoutEnabled` is `false` by type.

## 7. Backups and recovery

- **Local / single-server JSON store:** written atomically (write-then-rename), so a crash never leaves a half-written file. On Coolify the `/data` volume **must** be persistent and backed up with the server's volume backups. Recovery means restoring `workspace-<user>.json`.
- **PostgreSQL (after 0053 is applied):** Supabase's managed backups apply. The plan's retention and point-in-time recovery were **not verified** from here. Rollback of 0053 is in the migration header.
- **Subscriber self-service:** Account → Download my data gives a complete JSON copy at any time.

## 8. Launch blockers

1. **Approval to apply migrations 0048 (if not already applied — conflicting records) and 0053** to the HL-BOS project.
2. **Database access for this engineer**: the Supabase connector here cannot see `mvvtngiopdrgiedjmhfb`, so the applied state and a preview cannot be verified.
3. **A signed-in preview deployment** on Coolify (`HL_BOS_ENV=preview`, `ATS_SEED_DEMO=false`, `CAREER_SUPPORT_EMAIL`, a persistent `/data` volume until 0053 is live).
4. **One live crawl** of the four employer feeds from the deployed server. The sandbox's network blocks the job boards, so adapter field mapping is unit-tested only.
5. Billing provider plus approved prices, before any paid checkout.
6. A support address.
7. Repository lint needs more than about 2 GB of heap on a full run. Watch CI's lint job; if it runs out of memory, raise `NODE_OPTIONS` in the workflow.

# ATS Resume Optimizer — product record

|               |                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Code**      | `apps/ats-resume-optimizer` (interface), `packages/ats-resume` (engine)                                             |
| **Schema**    | `supabase/migrations/20260916120000_hlbos_0048_ats_resume_optimizer.sql` — **written, verified locally, UNAPPLIED** |
| **Status**    | Built and proven by running it. Not deployed. No database connected.                                                |
| **Principle** | Optimize aggressively. Fabricate nothing.                                                                           |

## What it does

A job seeker keeps one master resume. For each posting they paste in, the product:

1. reads the posting into classified requirements (critical / important / preferred / informational),
2. matches every requirement against their own career facts, producing an evidence matrix,
3. names the gaps rather than filling them,
4. offers terminology rewrites where they have done the work but word it differently,
5. scores the fit, and projects a second score that counts only supported revisions,
6. generates a tailored, single-column, ATS-safe resume,
7. exports DOCX and PDF,
8. tracks the application, the cover letter and interview preparation.

## Why it is trustworthy

Every generated sentence carries the facts it came from, the requirement it answers, and the reason for its wording — visible in the UI, per sentence. A sentence that cannot be traced is flagged, and a flagged sentence is dropped at the point the file is written, with a header reporting the count.

The tool will not:

- invent a job title, employer, date, degree, certification, metric, team size, budget, P&L, system or industry;
- turn budget ownership into P&L ownership, or process improvement into a Six Sigma certification;
- insert a keyword the candidate cannot evidence, however heavily the posting weights it;
- write enthusiasm, company knowledge or a personal connection into a cover letter.

## Verification

Run, not asserted:

- **76 unit tests** in the engine, including the guardrail suite and DOCX/PDF round trips.
- **End-to-end against the running app**: analyzed a fresh posting (a new company, correctly reporting SAP and PMP as not evidenced while matching a B.S. to a bachelor's requirement), generated a tailored resume, edited a bullet to an invented _"$250M P&L across 14 countries and 900 drivers"_, watched the validator name all three fabricated figures, and confirmed the export dropped the line (`X-Claims-Dropped: 1`, 11 of 12 bullets written) — then confirmed the line as true and watched it become a user-confirmed career fact and appear in the export.
- **Migration 0048 against a local PostgreSQL 16**: 17 tables, RLS enabled and forced on all 17, 68 policies, zero `anon` grants, cross-user isolation proven with two users, and all four anti-fabrication `CHECK` constraints exercised.

## Defects found by running it

Four, none of which reading the code had surfaced:

1. Posting metadata (`Employment type: Full-time`, the company name) was being scored as an unmet requirement.
2. A terminology rewrite turned an $18M operating budget into "P&L ownership". A P&L carries a revenue line; budget adjacency is now reported as a partial match with the difference spelled out.
3. The splice-based rewrite produced broken English on real bullets ("Cut warehouse and distribution operations, including dock dwell time by 27%"). Replaced with a label form that is correct for every verb.
4. An in-memory store cache served a stale document after an edit — the export route returned the _previous_ resume and a header claiming nothing had been dropped. Now keyed on the file's modification time.

## Not built

- Supabase Auth and the PostgreSQL-backed store (schema is ready; applying it is a separate decision).
- URL ingestion of job postings (job boards block it; the UI says so instead of offering a button that fails).
- Deployment of any kind.
